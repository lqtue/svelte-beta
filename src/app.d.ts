import type { SupabaseClient, Session, User } from '@supabase/supabase-js';
import type { Database } from '$lib/data/supabase/types';
import type { ClientSession } from '$lib/data/supabase/context';

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      supabase: SupabaseClient<Database>;
      /** Validates with getUser() before returning; see hooks.server.ts. */
      safeGetSession: () => Promise<{
        session: Session | null;
        user: User | null;
      }>;
    }
    interface PageData {
      /** Narrowed on purpose — see ClientSession. */
      session: ClientSession | null;
      user: User | null;
    }
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
