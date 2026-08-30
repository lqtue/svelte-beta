/**
 * GET  /api/admin/maps/[id]/pipeline — current pipeline stage + timestamps
 * PATCH /api/admin/maps/[id]/pipeline — advance stage (body: { stage })
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/auth';
import { adminClient } from '$lib/server/supabaseAdmin';
import { assertUuid, dbError } from '$lib/server/http';

const VALID_STAGES = [
  'idle',
  'ocr_queued',
  'ocr_done',
  'reviewed',
  'seg_queued',
  'seg_done',
  'seg_reviewed',
  'exported',
] as const;

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
  await requireRole(locals);
  const mapId = assertUuid(params.id, 'map id');

  const body = await request.json().catch(() => ({}));
  const stage = body.stage as string;

  if (!VALID_STAGES.includes(stage as (typeof VALID_STAGES)[number])) {
    throw error(400, `Invalid stage: ${stage}`);
  }

  const extra: Record<string, string> = {};
  if (stage === 'reviewed') extra.reviewed_at = new Date().toISOString();

  const { data, error: err } = await adminClient()
    .from('map_pipeline_status')
    .upsert({ map_id: mapId, stage, ...extra }, { onConflict: 'map_id' })
    .select()
    .single();

  if (err) dbError(err, 'Could not update pipeline status');

  return json(data);
};
