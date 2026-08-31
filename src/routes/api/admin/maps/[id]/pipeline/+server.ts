/**
 * GET  /api/admin/maps/[id]/pipeline — current pipeline stage + timestamps
 * PATCH /api/admin/maps/[id]/pipeline — record a human stage (body: { stage })
 *
 * Since migration 056 `map_pipeline_status` is a view: the machine stages
 * (ocr_queued/ocr_done/seg_queued/seg_done) are derived from `pipeline_jobs`
 * and cannot be set by hand. Only the three a person asserts — reviewed,
 * seg_reviewed, exported — are writable, plus `idle` to clear them.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/auth';
import { adminClient } from '$lib/server/supabaseAdmin';
import { assertUuid, dbError } from '$lib/server/http';

/** Stages a person can assert. The rest follow from the job queue. */
const HUMAN_STAGES = ['idle', 'reviewed', 'seg_reviewed', 'exported'] as const;

export const GET: RequestHandler = async ({ locals, params }) => {
  await requireRole(locals);
  const mapId = assertUuid(params.id, 'map id');

  const { data, error: err } = await adminClient()
    .from('map_pipeline_status')
    .select('*')
    .eq('map_id', mapId)
    .maybeSingle();

  if (err) dbError(err, 'Could not read pipeline status');

  return json(data ?? { map_id: mapId, stage: 'idle' });
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const { user } = await requireRole(locals);
  const mapId = assertUuid(params.id, 'map id');

  const body = await request.json().catch(() => ({}));
  const stage = body.stage as string;

  if (!HUMAN_STAGES.includes(stage as (typeof HUMAN_STAGES)[number])) {
    throw error(
      400,
      `Stage ${stage} is derived from pipeline_jobs — settable stages are ${HUMAN_STAGES.join(', ')}`
    );
  }

  const { error: markErr } = await adminClient().rpc('set_review_mark', {
    p_map_id: mapId,
    p_stage: stage,
    p_user: user.id,
  });
  if (markErr) dbError(markErr, 'Could not update pipeline status');

  // Answer with the composed row, not the mark: callers show the stage.
  const { data, error: err } = await adminClient()
    .from('map_pipeline_status')
    .select('*')
    .eq('map_id', mapId)
    .maybeSingle();
  if (err) dbError(err, 'Could not read pipeline status');

  return json(data ?? { map_id: mapId, stage: 'idle' });
};
