import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/auth';
import { adminClient } from '$lib/server/supabaseAdmin';
import { assertUuid, dbError } from '$lib/server/http';

/** GET /api/admin/footprints?map_id=&status= */
export const GET: RequestHandler = async ({ locals, url }) => {
  await requireRole(locals);

  const mapId = assertUuid(url.searchParams.get('map_id') ?? undefined, 'map_id');
  const status = url.searchParams.get('status') ?? 'needs_review';

  const { data, error: err } = await adminClient()
    .from('footprint_submissions')
    .select(
      'id, map_id, iiif_canvas, pixel_polygon, feature_type, name, category, confidence, status, created_at'
    )
    .eq('map_id', mapId)
    .eq('status', status)
    .order('confidence', { ascending: false });

  if (err) dbError(err, 'Could not list footprints');
  return json(data);
};

/**
 * PATCH /api/admin/footprints  { id, status: 'submitted' | 'rejected' }
 *
 * The transition (and the `sam-corrected` marking that comes with an edited
 * polygon) lives in the `set_footprint_status` RPC — migration 054.
 */
export const PATCH: RequestHandler = async ({ locals, request }) => {
  const { user } = await requireRole(locals);

  const body = await request.json();
  const { id, status, pixel_polygon, feature_type, name, category } = body as {
    id: string;
    status: string;
    pixel_polygon?: [number, number][];
    feature_type?: string;
    name?: string;
    category?: string;
  };

  if (!id || !status) throw error(400, 'id and status are required');
  if (!['submitted', 'rejected'].includes(status)) {
    throw error(400, 'status must be submitted or rejected');
  }

  const { data, error: err } = await adminClient().rpc('set_footprint_status', {
    p_id: assertUuid(id, 'footprint id'),
    p_status: status,
    p_user: user.id,
    p_pixel_polygon: pixel_polygon ?? undefined,
    p_feature_type: feature_type ?? undefined,
    p_name: name ?? undefined,
    p_category: category ?? undefined,
  });

  if (err) dbError(err, 'Could not update footprint');
  // The RPC only moves rows out of needs_review, and returns nothing otherwise.
  if (!data || !(data as { id: string | null }).id) {
    throw error(409, 'That footprint is not awaiting review');
  }
  return json({ ok: true });
};
