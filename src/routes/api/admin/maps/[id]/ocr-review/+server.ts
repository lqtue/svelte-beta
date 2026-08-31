import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/auth';
import { adminClient } from '$lib/server/supabaseAdmin';
import { assertUuid, dbError } from '$lib/server/http';
import { bulkSetStatus, isOcrReviewStatus } from '$lib/server/ocrReview';
import type { Database } from '$lib/data/supabase/types';

/** GET /api/admin/maps/[id]/ocr-review
 *  Query params: run_id (optional), status (optional), limit (default 200), offset (default 0)
 *  Returns extractions for the map ordered by category, confidence desc.
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
  await requireRole(locals);
  const mapId = assertUuid(params.id, 'map id');
  const supabase = adminClient();
  const runId = url.searchParams.get('run_id');
  const status = url.searchParams.get('status');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '200'), 2000);
  const offset = parseInt(url.searchParams.get('offset') ?? '0');

  let q = supabase
    .from('ocr_extractions')
    .select(
      'id, run_id, tile_x, tile_y, tile_w, tile_h, global_x, global_y, global_w, global_h, category, text, text_validated, category_validated, confidence, rotation_deg, notes, status, validated_at, model, prompt'
    )
    .eq('map_id', mapId)
    .order('category', { ascending: true })
    .order('confidence', { ascending: false })
    .range(offset, offset + limit - 1);

  if (runId) q = q.eq('run_id', runId);
  if (status) q = q.eq('status', status);

  const { data, error: err, count } = await q;
  if (err) dbError(err, 'Could not read OCR extractions');

  // Status counts + distinct run_ids for the map
  const [{ data: counts }, { data: runRows }] = await Promise.all([
    supabase.from('ocr_extractions').select('status').eq('map_id', mapId),
    supabase.from('ocr_extractions').select('run_id').eq('map_id', mapId),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const row of counts ?? []) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
  }

  const runIds: string[] = runRows ? [...new Set(runRows.map((r) => r.run_id))].sort() : [];

  return json({ extractions: data ?? [], total: count ?? 0, statusCounts, runIds });
};

/** POST /api/admin/maps/[id]/ocr-review
 *  Body: { run_id, global_x, global_y, global_w, global_h, category?, text?, tile_x?, tile_y?, tile_w?, tile_h? }
 *  Creates a new blank extraction row with status=pending.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  await requireRole(locals);
  const mapId = assertUuid(params.id, 'map id');
  const body = await request.json();

  const { run_id, global_x, global_y, global_w, global_h } = body;
  if (!run_id) throw error(400, 'Missing run_id');
  if (global_x == null || global_y == null || global_w == null || global_h == null) {
    throw error(400, 'Missing bbox coords');
  }

  // The unique key is (map_id, run_id, tile_x, tile_y, text). Manual boxes
  // usually have empty text, so keying tile_x/y off the drawn location keeps
  // two blank boxes from colliding on (…,0,0,''). Two boxes at the exact same
  // pixel with the same text still collapse — same-spot dup, acceptable.
  const row = {
    map_id: mapId,
    run_id,
    tile_x: body.tile_x ?? Math.round(global_x),
    tile_y: body.tile_y ?? Math.round(global_y),
    tile_w: body.tile_w ?? 0,
    tile_h: body.tile_h ?? 0,
    global_x,
    global_y,
    global_w,
    global_h,
    category: body.category ?? 'other',
    text: body.text ?? '',
    confidence: 1.0,
    status: 'pending',
    model: 'manual',
    prompt: 'manual',
  };

  const { data, error: err } = await adminClient()
    .from('ocr_extractions')
    .insert(row)
    .select('id')
    .single();

  if (err) dbError(err, 'Could not create extraction');
  return json({ ok: true, id: data!.id });
};

/** PATCH /api/admin/maps/[id]/ocr-review
 *  Body: { id: string, text?: string, category?: string, notes?: string, status: 'validated'|'rejected'|'pending' }
 *  Updates the extraction and records who validated it.
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const { user } = await requireRole(locals);
  const mapId = assertUuid(params.id, 'map id');
  const body = await request.json();

  const {
    id: extractionId,
    text,
    category,
    notes,
    status,
    global_x,
    global_y,
    global_w,
    global_h,
  } = body;
  if (!extractionId) throw error(400, 'Missing extraction id');
  if (status !== undefined && !isOcrReviewStatus(status)) {
    throw error(400, 'status must be validated, rejected, or pending');
  }

  // Corrections are plain column writes; the status transition is not, because
  // it carries the validated_at/validated_by stamp — that lives in the RPC.
  const update: Database['public']['Tables']['ocr_extractions']['Update'] = {};
  if (text !== undefined) update.text_validated = text;
  if (category !== undefined) update.category_validated = category;
  if (notes !== undefined) update.notes = notes;
  if (global_x !== undefined) update.global_x = global_x;
  if (global_y !== undefined) update.global_y = global_y;
  if (global_w !== undefined) update.global_w = global_w;
  if (global_h !== undefined) update.global_h = global_h;
  if (!Object.keys(update).length && status === undefined) {
    throw error(400, 'No fields to update');
  }

  if (Object.keys(update).length) {
    const { error: err } = await adminClient()
      .from('ocr_extractions')
      .update(update)
      .eq('id', extractionId)
      .eq('map_id', mapId);
    if (err) dbError(err, 'Could not update extraction');
  }

  if (status !== undefined) {
    const { error: err } = await bulkSetStatus({
      mapId,
      status,
      userId: user.id,
      ids: [extractionId],
    });
    if (err) dbError(err, 'Could not update extraction status');
  }

  return json({ ok: true });
};

/** PUT /api/admin/maps/[id]/ocr-review  (batch)
 *  Body: { ids: string[], status: 'validated'|'rejected'|'pending' }
 *  Bulk-update status for multiple extractions (e.g. validate all confirmed-tier items).
 */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const { user } = await requireRole(locals);
  const mapId = assertUuid(params.id, 'map id');
  const { ids, status, run_id } = await request.json();

  if (!isOcrReviewStatus(status)) {
    throw error(400, 'status must be validated, rejected, or pending');
  }
  if (!ids?.length && !run_id) throw error(400, 'Provide ids[] or run_id');

  const { error: err, data: count } = await bulkSetStatus({
    mapId,
    status,
    userId: user.id,
    ids,
    runId: run_id,
  });

  if (err) dbError(err, 'Could not update extractions');
  return json({ ok: true, count });
};
