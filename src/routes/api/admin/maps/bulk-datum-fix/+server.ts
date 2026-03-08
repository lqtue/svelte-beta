import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';
import { DATUM_PRESETS, applyDatumToAnnotation } from '$lib/datumCorrection';

async function getAdminClient(locals: App.Locals) {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');
    const adminSupabase = createClient<Database>(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: profile } = await adminSupabase
        .from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') throw error(403, 'Forbidden');
    return adminSupabase;
}

async function uploadAnnotation(url: string, json: string): Promise<void> {
    const cleanUrl = url.split('?')[0];
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
        body: json,
    });
    if (!res.ok) {
        const msg = await res.text().catch(() => String(res.status));
        throw new Error(`Storage ${res.status}: ${msg}`);
    }
}

/**
 * POST /api/admin/maps/bulk-datum-fix
 * Body: { datumIdx: number, mapIds?: string[] }
 *   datumIdx  — index into DATUM_PRESETS
 *   mapIds    — optional subset; omit to process ALL self-hosted maps
 * Returns: { processed, skipped, errors: [{id,name,error}] }
 */
export const POST: RequestHandler = async ({ locals, request }) => {
    const adminSupabase = await getAdminClient(locals);

    const body = await request.json();
    const datumIdx: number = body.datumIdx ?? 0;
    const preset = DATUM_PRESETS[datumIdx];
    if (!preset) throw error(400, `Invalid datumIdx: ${datumIdx}`);

    const mapIds: string[] | undefined = body.mapIds;

    // Fetch maps
    let query = adminSupabase.from('maps').select('id, name, allmaps_id');
    if (mapIds?.length) {
        query = query.in('id', mapIds);
    }
    const { data: maps, error: dbErr } = await query;
    if (dbErr) throw error(500, dbErr.message);

    // Filter to self-hosted only
    const targets = (maps ?? []).filter((m) => m.allmaps_id?.startsWith('http'));

    let processed = 0;
    let skipped = 0;
    const errors: { id: string; name: string; error: string }[] = [];

    for (const map of targets) {
        try {
            const bustUrl =
                map.allmaps_id +
                (map.allmaps_id.includes('?') ? '&' : '?') +
                '_t=' + Date.now();
            const fetchRes = await fetch(bustUrl, { cache: 'no-store' });
            if (!fetchRes.ok) {
                errors.push({ id: map.id, name: map.name, error: `Fetch failed: ${fetchRes.status}` });
                continue;
            }
            const annotation = await fetchRes.json();
            const gcpCount = applyDatumToAnnotation(annotation, preset);
            if (gcpCount === 0) {
                skipped++;
                continue;
            }
            await uploadAnnotation(map.allmaps_id, JSON.stringify(annotation, null, 2));
            processed++;
        } catch (e: any) {
            errors.push({ id: map.id, name: map.name, error: e.message });
        }
    }

    return json({ processed, skipped, errors, total: targets.length });
};
