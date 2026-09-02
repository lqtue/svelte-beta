/**
 * POST /api/pipeline/results — everything a worker writes back.
 *
 * Body (all parts optional, applied in this order):
 *   extractions:     ocr_extractions rows to upsert (max 500 per request)
 *   job_id + status: closes the job out via finish_job (done | failed | running)
 *
 * Bundling them means a worker can report "rows written, job done" in one round
 * trip. The worker holds a `worker_keys` token, so this is the only surface it
 * can write through — it never sees the service key.
 *
 * There is deliberately no stage field: since migration 056 the pipeline stage
 * is a view over `pipeline_jobs`, so closing the job *is* advancing the stage.
 *
 * Extractions are warped into the place-time index on the way in (migration
 * 066): the bbox centre becomes `geom`, stamped with the georeference it used.
 * A map with no usable annotation writes a null `geom`, which is a legitimate
 * state — the `warp` job fills it in once the map is georeferenced.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireWorker } from '$lib/server/workerAuth';
import { adminClient } from '$lib/server/supabaseAdmin';
import { assertUuid, dbError } from '$lib/server/http';
import { bboxCentre, pointEwkt, resolveMapWarp, type MapWarp } from '$lib/server/warp';

const MAX_ROWS = 500;
const JOB_STATUSES = ['running', 'done', 'failed'];

export const POST: RequestHandler = async ({ request }) => {
  await requireWorker(request);
  const body = await request.json().catch(() => ({}));
  const supabase = adminClient();
  const applied: Record<string, unknown> = {};

  if (Array.isArray(body.extractions) && body.extractions.length) {
    const rows = body.extractions;
    if (rows.length > MAX_ROWS) throw error(413, `At most ${MAX_ROWS} extractions per request`);
    for (const row of rows) {
      assertUuid(row.map_id, 'extraction map_id');
      if (!row.run_id) throw error(400, 'Every extraction needs a run_id');
    }
    // Warp per map, not per row: a batch is normally one map's tiles, and
    // resolving the annotation is a network fetch.
    const warps = new Map<string, MapWarp | null>();
    for (const row of rows) {
      if (warps.has(row.map_id)) continue;
      const { data: map } = await supabase
        .from('maps')
        .select('allmaps_id, annotation_url')
        .eq('id', row.map_id)
        .single();
      warps.set(row.map_id, map ? await resolveMapWarp(map.allmaps_id, map.annotation_url) : null);
    }
    for (const row of rows) {
      const warp = warps.get(row.map_id);
      const centre = warp ? bboxCentre(row) : null;
      const geom = warp && centre ? pointEwkt(warp, centre) : null;
      row.geom = geom;
      row.geom_src = geom ? warp!.src : null;
      row.geom_rmse = geom ? warp!.rmse : null;
    }

    const { error: err, count } = await supabase
      .from('ocr_extractions')
      .upsert(rows, { onConflict: 'map_id,run_id,tile_x,tile_y,text', count: 'exact' });
    if (err) dbError(err, 'Could not write extractions');
    applied.extractions = count ?? rows.length;
  }

  if (body.job_id) {
    const jobId = assertUuid(body.job_id, 'job_id');
    if (!JOB_STATUSES.includes(body.status)) {
      throw error(400, `status must be one of ${JOB_STATUSES.join(', ')}`);
    }
    const { data, error: err } = await supabase.rpc('finish_job', {
      p_id: jobId,
      p_status: body.status,
      p_result: body.result ?? {},
      p_error: body.error ?? null,
    });
    if (err) dbError(err, 'Could not update the job');
    if (!data || !(data as { id: string | null }).id) throw error(404, 'No such job');
    applied.job = (data as { status: string }).status;
  }

  return json({ ok: true, applied });
};
