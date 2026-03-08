/**
 * POST /api/admin/pipeline/annotate
 * Body: { sheetId?: string }  — if omitted, picks the next ia_status=done + annotation_status=pending
 *
 * 1. Fetches IIIF info.json from IA (retries if not yet processed)
 * 2. Builds Allmaps annotation from sheet Indian-1960 bounds → WGS84 + image dimensions
 * 3. Uploads annotation JSON to Supabase Storage
 * 4. Creates or updates a maps row
 * 5. Updates pipeline_sheets
 */
import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import { buildAnnotation, fetchIiifInfo, ind60ToWGS84 } from '$lib/pipeline/pipelineUtils';
import type { CornerCoords } from '$lib/georefUtils';

const ANNOTATION_BUCKET = 'annotations';

async function getAdminClient(locals: App.Locals) {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');
    const db = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: p } = await db.from('profiles').select('role').eq('id', user.id).single();
    if (p?.role !== 'admin') throw error(403, 'Forbidden');
    return db;
}

async function uploadAnnotationJson(annotationUrl: string | null, filePath: string, content: string): Promise<string> {
    // If annotationUrl exists and is in Supabase Storage, update it; otherwise create new
    const storageRes = await fetch(
        `${PUBLIC_SUPABASE_URL}/storage/v1/object/${ANNOTATION_BUCKET}/${filePath}`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json',
                'x-upsert': 'true',
                'Cache-Control': 'no-cache',
            },
            body: content,
        },
    );
    if (!storageRes.ok) {
        const msg = await storageRes.text().catch(() => String(storageRes.status));
        throw new Error(`Storage upload failed (${storageRes.status}): ${msg}`);
    }
    return `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${ANNOTATION_BUCKET}/${filePath}`;
}

export const POST: RequestHandler = async ({ locals, request }) => {
    const db = await getAdminClient(locals);
    const body = await request.json().catch(() => ({}));

    // Pick sheet
    let sheet: any;
    if (body.sheetId) {
        const { data } = await db.from('pipeline_sheets').select('*').eq('id', body.sheetId).single();
        sheet = data;
    } else {
        const { data } = await db
            .from('pipeline_sheets')
            .select('*')
            .eq('ia_status', 'done')
            .in('annotation_status', ['pending', 'iiif_wait'])
            .order('grid_row').order('grid_col').limit(1).single();
        sheet = data;
    }

    if (!sheet) return json({ done: true, message: 'No sheets ready for annotation' });

    const iiifBase: string = sheet.ia_iiif_base;
    if (!iiifBase) {
        await db.from('pipeline_sheets').update({ annotation_status: 'error', annotation_error: 'No IIIF base URL', updated_at: new Date().toISOString() }).eq('id', sheet.id);
        return json({ success: false, error: 'No IIIF base URL' });
    }

    // Fetch IIIF info.json (IA may take minutes to process the image)
    const iiif = await fetchIiifInfo(iiifBase, 3, 5000);
    if (!iiif) {
        // Mark as waiting — will be retried next run
        await db.from('pipeline_sheets').update({ annotation_status: 'iiif_wait', updated_at: new Date().toISOString() }).eq('id', sheet.id);
        return json({ success: false, waiting: true, message: 'IIIF not yet available — will retry' });
    }

    // Build WGS84 corners from Indian 1960 bounds
    let wgs84Corners: CornerCoords;
    if (sheet.ind60_sw_lat != null && sheet.ind60_ne_lat != null) {
        const [swLon, swLat] = ind60ToWGS84(sheet.ind60_sw_lon, sheet.ind60_sw_lat);
        const [neLon, neLat] = ind60ToWGS84(sheet.ind60_ne_lon, sheet.ind60_ne_lat);
        wgs84Corners = {
            NW: [swLon, neLat],
            NE: [neLon, neLat],
            SE: [neLon, swLat],
            SW: [swLon, swLat],
        };
    } else {
        // No bounds available — use placeholder corners at 0,0 (user must fix via GCPs editor)
        wgs84Corners = { NW: [0, 0], NE: [0, 0], SE: [0, 0], SW: [0, 0] };
    }

    const annotation = buildAnnotation({
        iiifBase,
        width: iiif.width,
        height: iiif.height,
        wgs84Corners,
        sheetName: sheet.sheet_name,
        neatlinePixels: sheet.neatline_pixels ?? null,
    });
    const annotationJson = JSON.stringify(annotation, null, 2);
    const filePath = `pipeline/${sheet.series}/${sheet.sheet_number}.json`;

    try {
        const annotationUrl = await uploadAnnotationJson(sheet.annotation_url, filePath, annotationJson);

        // Create or update the maps row
        let mapId = sheet.map_id;
        if (!mapId) {
            const { data: mapRow } = await db.from('maps').insert({
                name: sheet.sheet_name || sheet.sheet_number,
                allmaps_id: annotationUrl,
                type: 'Vietnam',
                year: 1970,
            }).select('id').single();
            mapId = mapRow?.id ?? null;
        } else {
            await db.from('maps').update({ allmaps_id: annotationUrl }).eq('id', mapId);
        }

        await db.from('pipeline_sheets').update({
            annotation_status: 'done',
            annotation_url: annotationUrl,
            annotation_error: null,
            map_id: mapId,
            updated_at: new Date().toISOString(),
        }).eq('id', sheet.id);

        return json({ success: true, sheetNumber: sheet.sheet_number, annotationUrl, mapId });

    } catch (e: any) {
        await db.from('pipeline_sheets').update({
            annotation_status: 'error',
            annotation_error: e.message,
            updated_at: new Date().toISOString(),
        }).eq('id', sheet.id);
        return json({ success: false, error: e.message });
    }
};
