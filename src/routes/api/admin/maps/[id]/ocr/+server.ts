/**
 * POST /api/admin/maps/[id]/ocr — enqueue a batch OCR run.
 *
 * The request writes a `pipeline_jobs` row and returns; a worker
 * (`work/worker/vma_worker.py`, running wherever the GPU/venv lives) claims it
 * and runs `work/ocr/scripts/ocr.py batch`. This works identically in local dev
 * and on Cloudflare — there is no `child_process` path any more, and no
 * copy-paste CLI fallback.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/auth';
import { adminClient } from '$lib/server/supabaseAdmin';
import { assertUuid, dbError } from '$lib/server/http';

export const POST: RequestHandler = async ({ locals, params, request }) => {
  await requireRole(locals);
  const mapId = assertUuid(params.id, 'map id');

  const body = await request.json().catch(() => ({}));
  const runId: string = body.run_id ?? new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);

  const payload = {
    run_id: runId,
    tile_size: body.tile_size ?? 2400,
    overlap: body.overlap ?? 600,
    concurrency: body.concurrency ?? 3,
    min_confidence: body.min_confidence ?? 0.5,
    // Fully automated chain (default on): scout the neatline unless one was
    // drawn, then extract the legend. Stops at ocr_done for human review.
    auto: body.auto !== false,
    ...(Array.isArray(body.neatline) && body.neatline.length === 4
      ? { neatline: body.neatline }
      : {}),
    ...(body.target_calls ? { target_calls: Number(body.target_calls) } : {}),
    ...(body.prior_run ? { prior_run: body.prior_run } : {}),
    ...(body.tile_overrides && typeof body.tile_overrides === 'object'
      ? { tile_overrides: body.tile_overrides }
      : {}),
  };

  const supabase = adminClient();
  const { data: map } = await supabase
    .from('maps')
    .select('id, iiif_image')
    .eq('id', mapId)
    .single();

  if (!map) throw error(404, 'Map not found');
  if (!map.iiif_image) throw error(400, 'Map has no iiif_image — cannot run OCR');

  const { data: job, error: err } = await supabase
    .from('pipeline_jobs')
    .insert({ kind: 'ocr', map_id: mapId, payload })
    .select('id, status')
    .single();

  // idx_pipeline_jobs_one_live: this map already has an OCR job in flight.
  if (err?.code === '23505') {
    const { data: existing } = await supabase
      .from('pipeline_jobs')
      .select('id, status, created_at, payload')
      .eq('kind', 'ocr')
      .eq('map_id', mapId)
      .in('status', ['queued', 'claimed', 'running'])
      .single();
    throw error(409, `An OCR job for this map is already ${existing?.status ?? 'in flight'}`);
  }
  if (err) dbError(err, 'Could not enqueue the OCR job');

  return json(
    { job_id: job!.id, run_id: runId, map_id: mapId, status: job!.status },
    { status: 202 }
  );
};

/** GET — extraction counts per run, plus any unfinished job for this map. */
export const GET: RequestHandler = async ({ locals, params, url }) => {
  await requireRole(locals);
  const mapId = assertUuid(params.id, 'map id');
  const runId = url.searchParams.get('run_id');

  const supabase = adminClient();
  let query = supabase
    .from('ocr_extractions')
    .select('run_id, category, confidence', { count: 'exact' })
    .eq('map_id', mapId);

  if (runId) query = query.eq('run_id', runId);

  const { data, count, error: err } = await query;
  if (err) dbError(err, 'Could not read OCR extractions');

  // Summarise by run_id
  const runs: Record<string, { n: number; categories: Record<string, number> }> = {};
  for (const row of data ?? []) {
    if (!runs[row.run_id]) runs[row.run_id] = { n: 0, categories: {} };
    runs[row.run_id].n++;
    runs[row.run_id].categories[row.category] =
      (runs[row.run_id].categories[row.category] ?? 0) + 1;
  }

  const { data: job } = await supabase
    .from('pipeline_jobs')
    .select('id, status, worker, error, created_at')
    .eq('kind', 'ocr')
    .eq('map_id', mapId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return json({ map_id: mapId, total: count ?? 0, runs, job: job ?? null });
};
