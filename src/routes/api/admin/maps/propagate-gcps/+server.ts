import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';

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
    const bustUrl = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
    const res = await fetch(bustUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${url}`);
    return res.json();
}

async function uploadAnnotation(annotationUrl: string, body: string): Promise<void> {
    const cleanUrl = annotationUrl.split('?')[0];
    const marker = '/object/public/';
    const idx = cleanUrl.indexOf(marker);
    if (idx === -1) throw new Error('Cannot parse storage path from URL');
    const rest = cleanUrl.slice(idx + marker.length);
    const sep = rest.indexOf('/');
    if (sep === -1) throw new Error('Cannot parse bucket from URL');
    const bucket = rest.slice(0, sep);
    const filePath = rest.slice(sep + 1);

    const storageUrl = `${PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`;
    const res = await fetch(storageUrl, {
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

function extractGeoCoords(annotation: any): [number, number][] {
    return (annotation.items?.[0]?.body?.features ?? []).map(
        (f: any) => f.geometry?.coordinates as [number, number],
    );
}

/**
 * POST /api/admin/maps/propagate-gcps
 *
 * Two modes:
 *
 * Mode 1 — empirical offset from a reference map:
 *   { mode: 'offset', refMapId: string, mapIds?: string[] }
 *   The reference map must already have CORRECT WGS84 GCPs (manually fixed).
 *   We compare its current GCPs with an "original" annotation fetched at the
 *   same URL to detect the offset already applied. Since we don't have a
 *   separate "original", the caller supplies the original coords directly:
 *   { mode: 'offset', dLon: number, dLat: number, mapIds?: string[] }
 *
 * Mode 2 — copy GCPs from one map to another (shared-edge propagation):
 *   { mode: 'copy', sourceMapId: string, targetMapId: string,
 *     corners: ('NW'|'NE'|'SE'|'SW')[] }
 *   Copies the specified corner GCPs from source annotation to target annotation.
 *
 * Mode 3 — apply a fixed geographic offset to all GCPs:
 *   { mode: 'offset', dLon: number, dLat: number, mapIds?: string[] }
 */
export const POST: RequestHandler = async ({ locals, request }) => {
    const adminSupabase = await getAdminClient(locals);
    const body = await request.json();
    const mode: string = body.mode;

    // ── Mode: fixed offset ────────────────────────────────────────────────────
    if (mode === 'offset') {
        const dLon: number = body.dLon;
        const dLat: number = body.dLat;
        const mapIds: string[] | undefined = body.mapIds;

        if (typeof dLon !== 'number' || typeof dLat !== 'number') {
            throw error(400, 'dLon and dLat required for offset mode');
        }

        let query = adminSupabase.from('maps').select('id, name, allmaps_id');
        if (mapIds?.length) query = query.in('id', mapIds);
        const { data: maps, error: dbErr } = await query;
        if (dbErr) throw error(500, dbErr.message);

        const targets = (maps ?? []).filter((m) => m.allmaps_id?.startsWith('http'));
        let processed = 0;
        const errors: { id: string; name: string; error: string }[] = [];

        for (const map of targets) {
            try {
                const annotation = await fetchAnnotation(map.allmaps_id);
                let changed = false;
                for (const item of annotation.items ?? []) {
                    for (const feature of item.body?.features ?? []) {
                        const c = feature.geometry?.coordinates;
                        if (!c) continue;
                        c[0] = +((c[0] as number) + dLon).toFixed(8);
                        c[1] = +((c[1] as number) + dLat).toFixed(8);
                        changed = true;
                    }
                }
                if (!changed) continue;
                await uploadAnnotation(map.allmaps_id, JSON.stringify(annotation, null, 2));
                processed++;
            } catch (e: any) {
                errors.push({ id: map.id, name: map.name, error: e.message });
            }
        }

        return json({ processed, errors, total: targets.length });
    }

    // ── Mode: copy corners from source to target ──────────────────────────────
    if (mode === 'copy') {
        const { sourceMapId, targetMapId, corners } = body as {
            sourceMapId: string;
            targetMapId: string;
            corners: string[]; // e.g. ['NW','NE']
        };

        const CORNER_ORDER = ['NW', 'NE', 'SE', 'SW'];
        const copyIndices = corners.map((c) => CORNER_ORDER.indexOf(c)).filter((i) => i !== -1);
        if (!copyIndices.length) throw error(400, 'No valid corners specified');

        // Fetch both maps
        const { data: rows } = await adminSupabase
            .from('maps')
            .select('id, name, allmaps_id')
            .in('id', [sourceMapId, targetMapId]);

        const src = rows?.find((r) => r.id === sourceMapId);
        const tgt = rows?.find((r) => r.id === targetMapId);
        if (!src?.allmaps_id?.startsWith('http')) throw error(404, 'Source map not found or not self-hosted');
        if (!tgt?.allmaps_id?.startsWith('http')) throw error(404, 'Target map not found or not self-hosted');

        const [srcAnn, tgtAnn] = await Promise.all([
            fetchAnnotation(src.allmaps_id),
            fetchAnnotation(tgt.allmaps_id),
        ]);

        const srcCoords = extractGeoCoords(srcAnn);
        const tgtFeatures = tgtAnn.items?.[0]?.body?.features ?? [];

        for (const idx of copyIndices) {
            if (srcCoords[idx] && tgtFeatures[idx]) {
                tgtFeatures[idx].geometry.coordinates = [...srcCoords[idx]];
            }
        }

        await uploadAnnotation(tgt.allmaps_id, JSON.stringify(tgtAnn, null, 2));

        return json({ success: true, copiedCorners: corners });
    }

    throw error(400, `Unknown mode: ${mode}`);
};
