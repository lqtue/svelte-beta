import { getContext, setContext } from 'svelte';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_CONTEXT_KEY = 'supabase-context';

export interface SupabaseContext {
  supabase: SupabaseClient<Database>;
  session: Session | null;
}

export function setSupabaseContext(ctx: SupabaseContext) {
  setContext(SUPABASE_CONTEXT_KEY, ctx);
}

export function getSupabaseContext(): SupabaseContext {
  return getContext<SupabaseContext>(SUPABASE_CONTEXT_KEY);
}
