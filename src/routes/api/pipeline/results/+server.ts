/**
 * POST /api/pipeline/results — everything a worker writes back.
 *
 * Body (all parts optional, applied in this order):
 *   extractions:     ocr_extractions rows to upsert (max 500 per request)
 *   pipeline_status: { map_id, stage, ... } upserted into map_pipeline_status
 *   job_id + status: closes the job out via finish_job (done | failed | running)
 *
 * Bundling them means a worker can report "rows written, stage advanced, job
 * done" in one round trip. The worker holds a `worker_keys` token, so this is
 * the only surface it can write through — it never sees the service key.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireWorker } from '$lib/server/workerAuth';
import { adminClient } from '$lib/server/supabaseAdmin';
import { assertUuid, dbError } from '$lib/server/http';
import type { Database } from '$lib/data/supabase/types';

const MAX_ROWS = 500;
const JOB_STATUSES = ['running', 'done', 'failed'];

/** Columns a worker may set on map_pipeline_status. Anything else is dropped. */
const STATUS_FIELDS = [
  'stage',
  'ocr_run_id',
  'seg_run_id',
  'ocr_started_at',
  'ocr_finished_at',
  'seg_started_at',
  'seg_finished_at',
] as const;

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
    const { error: err, count } = await supabase
      .from('ocr_extractions')
      .upsert(rows, { onConflict: 'map_id,run_id,tile_x,tile_y,text', count: 'exact' });
    if (err) dbError(err, 'Could not write extractions');
    applied.extractions = count ?? rows.length;
  }

  if (body.pipeline_status && typeof body.pipeline_status === 'object') {
    const incoming = body.pipeline_status as Record<string, unknown>;
    const mapId = assertUuid(incoming.map_id as string, 'pipeline_status map_id');
    // One cast, after the whitelist: the fields are checked above, but
    // Object.fromEntries cannot carry that through to the generated Insert type.
    const row = {
      map_id: mapId,
      ...Object.fromEntries(
        STATUS_FIELDS.filter((f) => incoming[f] !== undefined).map((f) => [f, incoming[f]])
      ),
    } as Database['public']['Tables']['map_pipeline_status']['Insert'];
    const { error: err } = await supabase
      .from('map_pipeline_status')
      .upsert(row, { onConflict: 'map_id' });
    if (err) dbError(err, 'Could not update the pipeline status');
    applied.pipeline_status = row.stage ?? true;
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
