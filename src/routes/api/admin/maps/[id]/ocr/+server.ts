/**
 * POST /api/admin/maps/[id]/ocr
 *
 * Triggers the Python OCR batch pipeline for a map.
 * Spawns: python work/ocr/scripts/ocr.py batch --map-id <id> --db
 *
 * NOTE: Uses child_process — only works in local dev (npm run dev).
 * Not available in Cloudflare Workers (production). Use the CLI directly
 * for production runs:
 *   python work/ocr/scripts/ocr.py batch --map-id <id> --db
 */

import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

async function getAdminClient(locals: App.Locals) {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');

    const adminSupabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: profile } = await (adminSupabase as any)
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if ((profile as any)?.role !== 'admin') throw error(403, 'Forbidden');

    return adminSupabase;
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
    const adminSupabase = await getAdminClient(locals);
    const mapId = params.id;

    const body = await request.json().catch(() => ({}));
    const runId: string = body.run_id ?? new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    const tileSize: number = body.tile_size ?? 2400;
    const overlap: number = body.overlap ?? 600;
    const concurrency: number = body.concurrency ?? 3;
    const minConfidence: number = body.min_confidence ?? 0.5;

    // Verify map exists and has an IIIF image
    const { data: map } = await (adminSupabase as any)
        .from('maps')
        .select('id, name, iiif_image')
        .eq('id', mapId)
        .single();

    if (!map) throw error(404, 'Map not found');
    if (!(map as any).iiif_image) throw error(400, 'Map has no iiif_image — cannot run OCR');

    // child_process only available in Node.js (local dev), not Cloudflare Workers
    let spawn: typeof import('child_process').spawn;
    try {
        ({ spawn } = await import('child_process'));
    } catch {
        throw error(501, 'OCR batch requires local dev environment (child_process unavailable)');
    }

    const { resolve } = await import('path');
    const repoRoot = resolve('.');
    const pythonBin = resolve(repoRoot, '.venv/bin/python');
    const script = resolve(repoRoot, 'work/ocr/scripts/ocr.py');

    const args = [
        script,
        'batch',
        '--map-id', mapId,
        '--tile-size', String(tileSize),
        '--overlap', String(overlap),
        '--render-size', '1024',
        '--concurrency', String(concurrency),
        '--min-confidence', String(minConfidence),
        '--run-id', runId,
        '--db',
    ];

    // Detached so the process outlives the HTTP request
    const child = spawn(pythonBin, args, {
        cwd: repoRoot,
        detached: true,
        stdio: 'ignore',
    });
    child.unref();

    console.log(`[OCR] started PID ${child.pid} run_id=${runId} map=${mapId}`);

    return json({ run_id: runId, map_id: mapId, status: 'started' }, { status: 202 });
};

/** GET — return existing OCR extractions count for this map */
export const GET: RequestHandler = async ({ locals, params, url }) => {
    const adminSupabase = await getAdminClient(locals);
    const mapId = params.id;
    const runId = url.searchParams.get('run_id');

    let query = (adminSupabase as any)
        .from('ocr_extractions')
        .select('run_id, category, confidence', { count: 'exact' })
        .eq('map_id', mapId);

    if (runId) query = query.eq('run_id', runId);

    const { data, count, error: dbError } = await query;
    if (dbError) throw error(500, dbError.message);

    // Summarise by run_id
    const runs: Record<string, { n: number; categories: Record<string, number> }> = {};
    for (const row of (data ?? []) as any[]) {
        if (!runs[row.run_id]) runs[row.run_id] = { n: 0, categories: {} };
        runs[row.run_id].n++;
        runs[row.run_id].categories[row.category] = (runs[row.run_id].categories[row.category] ?? 0) + 1;
    }

    return json({ map_id: mapId, total: count ?? 0, runs });
};
