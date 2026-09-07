import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Mirror of /profile's guard: a signed-in visitor has no use for the login
 * page. This was a `$: if (session) goto('/')` in the component, which could
 * not work — `session` is destructured from context once, so the statement
 * never re-ran, and it fired during SSR component init, where `goto` has no
 * navigation to perform.
 */
export const load: PageServerLoad = async ({ locals }) => {
  const { session } = await locals.safeGetSession();
  if (session) {
    throw redirect(303, '/');
  }
  return {};
};
