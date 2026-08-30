/**
 * Role gate for `src/routes/api/**`.
 *
 * Replaces the 19 hand-rolled `getAdminClient` / `assertAdmin` copies. The
 * policy each route had before is preserved by its `roles` argument:
 * scout + search allow `admin | mod`, everything else is admin-only.
 */

import { error } from '@sveltejs/kit';
import type { User } from '@supabase/supabase-js';
import { adminClient } from './supabaseAdmin';

export type Role = 'admin' | 'mod' | 'user';

/**
 * Resolve the signed-in user and their profile role.
 * Returns null when there is no valid session.
 */
async function resolve(locals: App.Locals): Promise<{ user: User; role: Role } | null> {
  const { session, user } = await locals.safeGetSession();
  if (!session || !user) return null;

  const { data: profile } = await adminClient()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const raw = profile?.role;
  const role: Role = raw === 'admin' || raw === 'mod' ? raw : 'user';
  return { user, role };
}

/**
 * Gate a request on role. Throws 401 without a session, 403 when the role is
 * not in `roles`. Defaults to admin-only.
 */
export async function requireRole(
  locals: App.Locals,
  roles: Role[] = ['admin']
): Promise<{ user: User; role: Role }> {
  const resolved = await resolve(locals);
  if (!resolved) throw error(401, 'Unauthorized');
  if (!roles.includes(resolved.role)) throw error(403, 'Forbidden');
  return resolved;
}

/**
 * Non-throwing role lookup for routes that degrade instead of rejecting
 * (`/api/search` falls back to the public map set). Returns null when there is
 * no session, or when the lookup itself fails.
 */
export async function getRole(locals: App.Locals): Promise<Role | null> {
  try {
    const resolved = await resolve(locals);
    return resolved?.role ?? null;
  } catch {
    return null;
  }
}
