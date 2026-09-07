import type { LayoutServerLoad } from './$types';
import type { ClientSession } from '$lib/data/supabase/context';

/**
 * The session the browser gets is built field by field, never spread.
 *
 * `safeGetSession()` validates the cookie against the Auth server with
 * `getUser()`, but the `session` object it returns is still the raw one from
 * `getSession()` — and *reading* its `.user`, including the read a spread or a
 * serialisation does, is what logs "Using the user object as returned from
 * supabase.auth.getSession() could be insecure". So `user` here is the
 * validated one, and `session.user` is never touched.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
  const { session, user } = await locals.safeGetSession();
  if (!session || !user) return { session: null, user: null };
  const client: ClientSession = { expires_at: session.expires_at, user };
  return { session: client, user };
};
