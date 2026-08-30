import type { SupabaseClient } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'mod' | 'user';

/** Client-side role lookup (profiles.role). Returns null when signed out or on error. */
export async function fetchUserRole(
  supabase: SupabaseClient<any>,
  userId: string | null | undefined
): Promise<UserRole | null> {
  if (!userId) return null;
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).single();
  return ((data as { role?: string } | null)?.role as UserRole) ?? null;
}
