import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';
import {
    computeCornerCoords,
    propagateCorners,
    buildCornerAnnotation,
    type Direction,
} from '$lib/georefUtils';

async function getAdminClient(locals: App.Locals) {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');
    const adminSupabase = createClient<Database>(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: profile } = await adminSupabase
        .from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') throw error(403, 'Forbidden');
    return adminSupabase;
}

async function fetchAnnotation(url: string): Promise<any> {
    const bust = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
    const res = await fetch(bust, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${url}`);
    return res.json();
}

async function uploadAnnotation(annotationUrl: string, body: string): Promise<void> {
    const clean = annotationUrl.split('?')[0];
    const marker = '/object/public/';
    const idx = clean.indexOf(marker);
    if (idx === -1) throw new Error('Not a Supabase Storage URL');
    const rest = clean.slice(idx + marker.length);
    const sep = rest.indexOf('/');
    const bucket = rest.slice(0, sep);
    const filePath = rest.slice(sep + 1);

    const res = await fetch(`${PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'x-upsert': 'true',
            'Cache-Control': 'no-cache',
        },
        body,
    });
    if (!res.ok) {
        const msg = await res.text().catch(() => String(res.status));
        throw new Error(`Storage ${res.status}: ${msg}`);
    }
}

/**
 * GET  ?refMapId=<id>
 *   Returns the computed WGS84 corner coords of the reference map (preview).
 *
 * POST { refMapId, targetMapId, direction: 'N'|'S'|'E'|'W' }
 *   Computes target GCPs from reference corners and saves the annotation.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
    await getAdminClient(locals);
    const refMapId = url.searchParams.get('refMapId');
    if (!refMapId) throw error(400, 'refMapId required');

    // We accept both Allmaps IDs and self-hosted URLs
    // The caller passes the allmaps_id value; we resolve it to an annotation URL.
    const annotationUrl = refMapId.startsWith('http')
        ? refMapId
        : `https://annotations.allmaps.org/images/${refMapId}`;

    const annotation = await fetchAnnotation(annotationUrl);
    const corners = computeCornerCoords(annotation);
    if (!corners) throw error(422, 'Could not compute corners — not enough GCPs or missing selector');

    return json({ corners });
};

export const POST: RequestHandler = async ({ locals, request }) => {
    const adminSupabase = await getAdminClient(locals);

    const body = await request.json();
    const { refMapId, targetMapId, direction } = body as {
        refMapId: string;
        targetMapId: string;
        direction: Direction;
    };

    if (!refMapId || !targetMapId || !direction) {
        throw error(400, 'refMapId, targetMapId and direction are required');
    }
    if (!['N', 'S', 'E', 'W'].includes(direction)) {
        throw error(400, 'direction must be N, S, E or W');
    }

    // Fetch both map rows
    const { data: maps } = await adminSupabase
        .from('maps')
        .select('id, name, allmaps_id')
        .in('id', [refMapId, targetMapId]);

    const ref = maps?.find((m) => m.id === refMapId);
    const tgt = maps?.find((m) => m.id === targetMapId);
    if (!ref) throw error(404, 'Reference map not found');
    if (!tgt) throw error(404, 'Target map not found');
    if (!tgt.allmaps_id?.startsWith('http')) {
        throw error(400, 'Target map must use a self-hosted annotation URL');
    }

    // Resolve reference annotation URL (handles both Allmaps IDs and http URLs)
    const refUrl = ref.allmaps_id?.startsWith('http')
        ? ref.allmaps_id
        : `https://annotations.allmaps.org/images/${ref.allmaps_id}`;

    const [refAnnotation, tgtAnnotation] = await Promise.all([
        fetchAnnotation(refUrl),
        fetchAnnotation(tgt.allmaps_id),
    ]);

    const refCorners = computeCornerCoords(refAnnotation);
    if (!refCorners) throw error(422, 'Reference map: could not compute corners from GCPs');

    const targetCorners = propagateCorners(refCorners, direction);
    const updatedAnnotation = buildCornerAnnotation(tgtAnnotation, targetCorners);

    await uploadAnnotation(tgt.allmaps_id, JSON.stringify(updatedAnnotation, null, 2));

    return json({ success: true, targetCorners });
};
