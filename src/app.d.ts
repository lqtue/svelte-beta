import type { SupabaseClient, Session, User } from '@supabase/supabase-js';
import type { Database } from '$lib/data/supabase/types';
import type { ClientSession } from '$lib/data/supabase/context';
import type { Locale } from '$lib/core/i18n';

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      supabase: SupabaseClient<Database>;
      /** From the vma-lang cookie; 'en' when unset. */
      locale: Locale;
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
      locale: Locale;
    }
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
