/**
 * The one service-role Supabase client for `src/routes/api/**`.
 *
 * Server-only: lives under `src/lib/server/` so SvelteKit refuses to bundle it
 * into client code, and it is the only place `SUPABASE_SERVICE_KEY` is read
 * for database access. Memoised at module scope — a Cloudflare isolate (or a
 * dev Node process) builds one client and reuses it across requests instead of
 * paying for a fresh HTTP client + auth machinery per handler.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import type { Database } from '$lib/data/supabase/types';

let cached: SupabaseClient<Database> | null = null;

/** Memoised service-role client. Bypasses RLS — never expose it to a browser. */
export function adminClient(): SupabaseClient<Database> {
  if (!cached) {
    cached = createClient<Database>(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
      // No user session is ever attached to this client; keeping the auth
      // machinery inert avoids cross-request state in a shared isolate.
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
