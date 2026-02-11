import { createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  /**
   * Track whether the response has been resolved to prevent
   * Supabase from setting cookies after the response is sent.
   */
  let responseResolved = false;

  event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => event.cookies.getAll(),
      setAll: (cookiesToSet) => {
        // Only set cookies if the response hasn't been resolved yet
        if (responseResolved) {
          return;
        }
        cookiesToSet.forEach(({ name, value, options }) => {
          event.cookies.set(name, value, { ...options, path: '/' });
        });
      }
    }
  });

  /**
   * Safe session retrieval that validates with the Supabase Auth server.
   * 
   * getSession() only checks if session cookies exist (unverified).
   * getUser() validates the session with Supabase's server (verified).
   * 
   * We use both: getSession() for quick existence check, getUser() for security.
   */
  event.locals.safeGetSession = async () => {
    // Quick check: does a session cookie exist?
    const { data: { session } } = await event.locals.supabase.auth.getSession();
    if (!session) {
      return { session: null, user: null };
    }

    // Security check: validate the session with Supabase Auth server
    const { data: { user }, error } = await event.locals.supabase.auth.getUser();
    if (error) {
      // Session was invalid/tampered - reject it
      return { session: null, user: null };
    }

    return { session, user };
  };

  const response = await resolve(event, {
    filterSerializedResponseHeaders(name) {
      return name === 'content-range' || name === 'x-supabase-api-version';
    }
  });

  // Mark response as resolved to prevent late cookie setting
  responseResolved = true;

  return response;
};
