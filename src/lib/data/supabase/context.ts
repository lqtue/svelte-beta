import { getContext, setContext } from 'svelte';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * What the browser is given, which is deliberately not a `Session`.
 *
 * `supabase.auth.getSession()` returns a session read straight out of the
 * cookie, and reading its `.user` is what logs "could be insecure" — the
 * value has not been checked against the Auth server. `hooks.server.ts`
 * already validates with `getUser()`, so the root layout hands down *that*
 * user and only the expiry the auth listener needs to compare against.
 *
 * No access or refresh token crosses the wire either: the browser client
 * manages its own cookies, and nothing in the app ever read them.
 */
export interface ClientSession {
  expires_at?: number;
  user: User;
}

const SUPABASE_CONTEXT_KEY = 'supabase-context';

export interface SupabaseContext {
  supabase: SupabaseClient<Database>;
  session: ClientSession | null;
}

export function setSupabaseContext(ctx: SupabaseContext) {
  setContext(SUPABASE_CONTEXT_KEY, ctx);
}

export function getSupabaseContext(): SupabaseContext {
  return getContext<SupabaseContext>(SUPABASE_CONTEXT_KEY);
}
