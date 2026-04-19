import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

async function getAdminClient(locals: App.Locals) {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');

    const adminSupabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: profile } = await adminSupabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
    if ((profile as any)?.role !== 'admin') throw error(403, 'Forbidden');

    return { adminSupabase, userId: user.id };
}

/** GET /api/admin/maps/[id]/ocr-review
 *  Query params: run_id (optional), status (optional), limit (default 200), offset (default 0)
 *  Returns extractions for the map ordered by category, confidence desc.
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
    const { adminSupabase } = await getAdminClient(locals);
    const mapId = params.id;
    const runId = url.searchParams.get('run_id');
    const status = url.searchParams.get('status');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '200'), 500);
    const offset = parseInt(url.searchParams.get('offset') ?? '0');

    let q = (adminSupabase as any)
        .from('ocr_extractions')
        .select('id, run_id, tile_x, tile_y, tile_w, tile_h, global_x, global_y, global_w, global_h, category, text, text_validated, category_validated, confidence, rotation_deg, notes, status, validated_at, model, prompt')
        .eq('map_id', mapId)
        .order('category', { ascending: true })
        .order('confidence', { ascending: false })
        .range(offset, offset + limit - 1);

    if (runId) q = q.eq('run_id', runId);
    if (status) q = q.eq('status', status);

    const { data, error: err, count } = await q;
    if (err) throw error(500, err.message);

    // Status counts + distinct run_ids for the map (optionally scoped to run)
    const [{ data: counts }, { data: runRows }] = await Promise.all([
        (adminSupabase as any)
            .from('ocr_extractions')
            .select('status')
            .eq('map_id', mapId)
            .then((r: any) => r),
        (adminSupabase as any)
            .from('ocr_extractions')
            .select('run_id')
            .eq('map_id', mapId)
            .then((r: any) => r),
    ]);

    const statusCounts: Record<string, number> = {};
    if (counts) {
        for (const row of counts) {
            statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
        }
    }

    const runIds: string[] = runRows
        ? [...new Set((runRows as any[]).map((r: any) => r.run_id as string))].sort()
        : [];

    return json({ extractions: data ?? [], total: count ?? 0, statusCounts, runIds });
};

/** POST /api/admin/maps/[id]/ocr-review
 *  Body: { run_id, global_x, global_y, global_w, global_h, category?, text?, tile_x?, tile_y?, tile_w?, tile_h? }
 *  Creates a new blank extraction row with status=pending.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
    const { adminSupabase } = await getAdminClient(locals);
    const mapId = params.id;
    const body = await request.json();

    const { run_id, global_x, global_y, global_w, global_h } = body;
    if (!run_id) throw error(400, 'Missing run_id');
    if (global_x == null || global_y == null || global_w == null || global_h == null) {
        throw error(400, 'Missing bbox coords');
    }

    const row = {
        map_id: mapId,
        run_id,
        tile_x: body.tile_x ?? 0,
        tile_y: body.tile_y ?? 0,
        tile_w: body.tile_w ?? 0,
        tile_h: body.tile_h ?? 0,
        global_x, global_y, global_w, global_h,
        category: body.category ?? 'other',
        text: body.text ?? '',
        confidence: 1.0,
        status: 'pending',
        model: 'manual',
        prompt: 'manual',
    };

    const { data, error: err } = await (adminSupabase as any)
        .from('ocr_extractions')
        .insert(row)
        .select('id')
        .single();

    if (err) throw error(500, err.message);
    return json({ ok: true, id: (data as any).id });
};

/** PATCH /api/admin/maps/[id]/ocr-review
 *  Body: { id: string, text?: string, category?: string, notes?: string, status: 'validated'|'rejected'|'pending' }
 *  Updates the extraction and records who validated it.
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    const { adminSupabase, userId } = await getAdminClient(locals);
    const mapId = params.id;
    const body = await request.json();

    const { id: extractionId, text, category, notes, status, global_x, global_y, global_w, global_h } = body;
    if (!extractionId) throw error(400, 'Missing extraction id');
    if (status !== undefined && !['validated', 'rejected', 'pending'].includes(status)) {
        throw error(400, 'status must be validated, rejected, or pending');
    }

    const update: Record<string, any> = {};
    if (status !== undefined)   update['status'] = status;
    if (text !== undefined)     update['text_validated'] = text;
    if (category !== undefined) update['category_validated'] = category;
    if (notes !== undefined)    update['notes'] = notes;
    if (global_x !== undefined) update['global_x'] = global_x;
    if (global_y !== undefined) update['global_y'] = global_y;
    if (global_w !== undefined) update['global_w'] = global_w;
    if (global_h !== undefined) update['global_h'] = global_h;
    if (!Object.keys(update).length) throw error(400, 'No fields to update');

    if (status === 'validated') {
        update['validated_at'] = new Date().toISOString();
        update['validated_by'] = userId;
    } else if (status === 'rejected' || status === 'pending') {
        update['validated_at'] = null;
        update['validated_by'] = null;
    }

    const { error: err } = await (adminSupabase as any)
        .from('ocr_extractions')
        .update(update)
        .eq('id', extractionId)
        .eq('map_id', mapId);

    if (err) throw error(500, err.message);
    return json({ ok: true });
};

/** PATCH /api/admin/maps/[id]/ocr-review  (batch)
 *  Body: { ids: string[], status: 'validated'|'rejected'|'pending' }
 *  Bulk-update status for multiple extractions (e.g. validate all confirmed-tier items).
 */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
    const { adminSupabase, userId } = await getAdminClient(locals);
    const mapId = params.id;
    const { ids, status, run_id } = await request.json();

    if (!['validated', 'rejected', 'pending'].includes(status)) {
        throw error(400, 'status must be validated, rejected, or pending');
    }

    const update: Record<string, any> = { status };
    if (status === 'validated') {
        update['validated_at'] = new Date().toISOString();
        update['validated_by'] = userId;
    } else {
        update['validated_at'] = null;
        update['validated_by'] = null;
    }

    let q = (adminSupabase as any)
        .from('ocr_extractions')
        .update(update)
        .eq('map_id', mapId);

    if (ids?.length) q = q.in('id', ids);
    else if (run_id) q = q.eq('run_id', run_id);
    else throw error(400, 'Provide ids[] or run_id');

    const { error: err, count } = await q;
    if (err) throw error(500, err.message);
    return json({ ok: true, count });
};
