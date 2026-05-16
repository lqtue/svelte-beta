// /api/admin/scout/[id] — approve, reject, or update a single candidate
import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';

async function assertAdmin(locals: App.Locals) {
  const { session, user } = await locals.safeGetSession();
  if (!session || !user) throw error(401, 'Unauthorized');
  const supabase = createClient<Database>(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== 'admin' && role !== 'mod') throw error(403, 'Forbidden');
  return { user, supabase };
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const { user, supabase } = await assertAdmin(locals);
  const body = await request.json();
  const allowed = ['status', 'category', 'thumbnail', 'title', 'creator', 'year', 'language', 'rights'] as const;
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (patch.status && !['pending', 'approved', 'rejected'].includes(patch.status as string)) {
    throw error(400, 'invalid status (use ingest endpoint to mark ingested)');
  }
  if (patch.status) {
    patch.reviewer_id = user.id;
    patch.reviewed_at = new Date().toISOString();
  }
  const { data, error: dbErr } = await (supabase as any)
    .from('scout_candidates')
    .update(patch).eq('id', params.id).select().single();
  if (dbErr) throw error(500, dbErr.message);
  return json(data);
};
