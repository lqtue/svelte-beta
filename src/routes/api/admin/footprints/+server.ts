import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/auth';
import { adminClient } from '$lib/server/supabaseAdmin';
import { assertUuid, dbError } from '$lib/server/http';
import type { Database } from '$lib/data/supabase/types';

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

/** PATCH /api/admin/footprints  { id, status: 'submitted' | 'rejected' } */
export const PATCH: RequestHandler = async ({ locals, request }) => {
  await requireRole(locals);

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

  const update: Database['public']['Tables']['footprint_submissions']['Update'] = { status };
  if (pixel_polygon) {
    update.pixel_polygon = pixel_polygon;
    update.source = 'sam-corrected';
  }
  if (feature_type) {
    update.feature_type = feature_type;
    update.source = 'sam-corrected';
  }
  if (name !== undefined) update.name = name;
  if (category !== undefined) update.category = category;

  const { error: err } = await adminClient()
    .from('footprint_submissions')
    .update(update)
    .eq('id', id)
    .eq('status', 'needs_review'); // only transition from needs_review

  if (err) dbError(err, 'Could not update footprint');
  return json({ ok: true });
};
