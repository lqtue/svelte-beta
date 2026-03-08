/**
 * POST /api/admin/pipeline/ia-upload
 * Body: { sheetId?: string }  — if omitted, picks the next pending sheet
 *
 * Downloads the map image from VVA Texas Tech, streams it to Internet Archive S3.
 * Marks sheet ia_status = 'done' on success or 'error' on failure.
 */
import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY, IA_S3_ACCESS_KEY, IA_S3_SECRET_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import { iaUrls } from '$lib/pipeline/pipelineUtils';

async function getAdminClient(locals: App.Locals) {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');
    const db = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: p } = await db.from('profiles').select('role').eq('id', user.id).single();
    if (p?.role !== 'admin') throw error(403, 'Forbidden');
    return db;
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
            .eq('ia_status', 'pending')
            .order('grid_row', { ascending: true })
            .order('grid_col', { ascending: true })
            .limit(1)
            .single();
        sheet = data;
    }

    if (!sheet) return json({ done: true, message: 'No pending sheets for IA upload' });

    // Mark as uploading
    await db.from('pipeline_sheets').update({ ia_status: 'uploading', updated_at: new Date().toISOString() }).eq('id', sheet.id);

    const { s3Put, identifier, filename, iiifBase } = iaUrls(sheet.sheet_number);
    const sourceUrl = sheet.source_url;

    try {
        // Fetch image from VVA
        const imgRes = await fetch(sourceUrl, {
            headers: {
                'User-Agent': 'VMA-Research-Pipeline/1.0 (educational; contact: admin@vma)',
                Referer: 'https://vva.vietnam.ttu.edu/',
            },
        });
        if (!imgRes.ok) throw new Error(`VVA fetch failed: ${imgRes.status} ${imgRes.statusText}`);

        const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';
        const imageBuffer = await imgRes.arrayBuffer();

        // Upload to Internet Archive S3
        const iaRes = await fetch(s3Put, {
            method: 'PUT',
            headers: {
                Authorization: `LOW ${IA_S3_ACCESS_KEY}:${IA_S3_SECRET_KEY}`,
                'x-amz-auto-make-bucket': '1',
                'x-archive-meta-title': sheet.sheet_name || sheet.sheet_number,
                'x-archive-meta-mediatype': 'image',
                'x-archive-meta-collection': 'opensource_image',
                'x-archive-meta-subject': 'Vietnam; topo map; AMS; L7014; military; historical',
                'Content-Type': contentType,
                'Content-Length': String(imageBuffer.byteLength),
            },
            body: imageBuffer,
        });

        if (!iaRes.ok) {
            const errText = await iaRes.text().catch(() => String(iaRes.status));
            throw new Error(`IA upload failed (${iaRes.status}): ${errText}`);
        }

        await db.from('pipeline_sheets').update({
            ia_status: 'done',
            ia_identifier: identifier,
            ia_iiif_base: iiifBase,
            ia_done_at: new Date().toISOString(),
            ia_error: null,
            updated_at: new Date().toISOString(),
        }).eq('id', sheet.id);

        return json({ success: true, sheetNumber: sheet.sheet_number, identifier, iiifBase });

    } catch (e: any) {
        await db.from('pipeline_sheets').update({
            ia_status: 'error',
            ia_error: e.message,
            updated_at: new Date().toISOString(),
        }).eq('id', sheet.id);
        return json({ success: false, sheetNumber: sheet.sheet_number, error: e.message }, { status: 200 });
    }
};
