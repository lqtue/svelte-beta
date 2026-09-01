/**
 * POST /api/contribute/footprints — submit a hand-traced polygon.
 *
 * Decision 4 in docs/architecture-target.md: shared writes go through /api, not
 * straight from the browser. That is what makes a rate limit and a
 * server-stamped `user_id` possible; RLS alone can enforce neither.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser, assertUnderRateLimit } from '$lib/server/auth';
import { adminClient } from '$lib/server/supabaseAdmin';
import { assertUuid, dbError } from '$lib/server/http';

/** Generous enough for a good tracing session, low enough to stop a script. */
const MAX_PER_HOUR = 300;

const FEATURE_TYPES = ['building', 'land_plot', 'road', 'waterway', 'block', 'other'];

export const POST: RequestHandler = async ({ locals, request }) => {
  const { user } = await requireUser(locals);
  const body = await request.json().catch(() => ({}));

  const mapId = assertUuid(body.map_id, 'map_id');
  const polygon = body.pixel_polygon;
  if (!Array.isArray(polygon) || polygon.length < 2) {
    throw error(400, 'pixel_polygon must have at least two points');
  }
  if (body.feature_type && !FEATURE_TYPES.includes(body.feature_type)) {
    throw error(400, `feature_type must be one of ${FEATURE_TYPES.join(', ')}`);
  }

  await assertUnderRateLimit('footprint_submissions', user.id, MAX_PER_HOUR);

  const { data, error: err } = await adminClient()
    .from('footprint_submissions')
    .insert({
      map_id: mapId,
      user_id: user.id, // from the session, never from the body
      pixel_polygon: polygon,
      name: body.name ?? null,
      category: body.category ?? null,
      feature_type: body.feature_type ?? 'building',
      status: 'submitted',
      source: 'volunteer',
    })
    .select('id')
    .single();

  if (err) dbError(err, 'Could not save the footprint');
  return json({ id: data!.id }, { status: 201 });
};
