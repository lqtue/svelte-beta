// /api/admin/scout/[id] — approve, reject, or update a single candidate
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/auth';
import { adminClient } from '$lib/server/supabaseAdmin';
import { assertUuid, dbError } from '$lib/server/http';
import type { Database } from '$lib/data/supabase/types';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const { user } = await requireRole(locals, ['admin', 'mod']);
  const candidateId = assertUuid(params.id, 'candidate id');
  const body = await request.json();
  const allowed = [
    'status',
    'category',
    'thumbnail',
    'title',
    'creator',
    'year',
    'language',
    'rights',
  ] as const;
  const patch: Database['public']['Tables']['scout_candidates']['Update'] = {};
  for (const k of allowed) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (patch.status && !['pending', 'approved', 'rejected'].includes(patch.status)) {
    throw error(400, 'invalid status (use ingest endpoint to mark ingested)');
  }
  if (patch.status) {
    patch.reviewer_id = user.id;
    patch.reviewed_at = new Date().toISOString();
  }
  const { data, error: err } = await adminClient()
    .from('scout_candidates')
    .update(patch)
    .eq('id', candidateId)
    .select()
    .single();
  if (err) dbError(err, 'Could not update scout candidate');
  return json(data);
};
