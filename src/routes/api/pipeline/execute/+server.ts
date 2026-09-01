/**
 * POST /api/pipeline/execute — run a job whose work belongs on the server.
 *
 * Body: { job_id }
 *
 * `mirror_annotation` and `sync_allmaps` are fetch-rewrite-store: no GPU, no
 * venv, and they need the service key, which a worker deliberately does not
 * have. So the worker claims them like any other job and then asks us to do the
 * work. Kinds with real compute behind them (ocr, seg, tile_to_r2) run on the
 * worker itself and report through /api/pipeline/results instead.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireWorker } from '$lib/server/workerAuth';
import { adminClient } from '$lib/server/supabaseAdmin';
import { assertUuid, dbError } from '$lib/server/http';
import { mirrorAnnotation } from '$lib/server/annotationMirror';

const SERVER_KINDS = ['mirror_annotation', 'sync_allmaps'] as const;

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const jobId = assertUuid(body.job_id, 'job_id');

  const supabase = adminClient();
  const { data: job, error: err } = await supabase
    .from('pipeline_jobs')
    .select('id, kind, map_id, status')
    .eq('id', jobId)
    .maybeSingle();
  if (err) dbError(err, 'Could not read the job');
  if (!job) throw error(404, 'No such job');

  await requireWorker(request, job.kind);

  if (!SERVER_KINDS.includes(job.kind as (typeof SERVER_KINDS)[number])) {
    throw error(
      400,
      `${job.kind} runs on the worker, not here — report it to /api/pipeline/results`
    );
  }
  if (!job.map_id) throw error(400, `${job.kind} job has no map_id`);

  await supabase.rpc('finish_job', { p_id: job.id, p_status: 'running', p_result: {} });

  try {
    const result = await mirrorAnnotation(job.map_id, {
      fromAllmaps: job.kind === 'sync_allmaps',
    });
    await supabase.rpc('finish_job', {
      p_id: job.id,
      p_status: 'done',
      p_result: { annotation_url: result.annotation_url, history_url: result.history_url },
    });
    return json({ ok: true, job_id: job.id, result });
  } catch (e) {
    // A failed mirror is usually a 502 from upstream; let finish_job decide
    // whether that is a retry or the end of the road.
    const message = e instanceof Error ? e.message : String(e);
    await supabase.rpc('finish_job', {
      p_id: job.id,
      p_status: 'failed',
      p_result: {},
      p_error: message.slice(0, 2000),
    });
    throw error(502, `Job failed: ${message}`);
  }
};
