import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import type { MapListItem } from '$lib/viewer/types';

type SupabaseMap = Database['public']['Tables']['maps']['Row'];

function toMapListItem(row: SupabaseMap): MapListItem {
  return {
    id: row.allmaps_id,
    name: row.name,
    type: row.type || '',
    summary: row.summary || undefined,
    description: row.description || undefined,
    thumbnail: row.thumbnail || undefined,
    isFeatured: row.is_featured,
    year: row.year || undefined
  };
}

export async function fetchMaps(supabase: SupabaseClient<Database>): Promise<MapListItem[]> {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .order('name');

  if (error) {
    console.error('Failed to fetch maps:', error);
    return [];
  }

  return (data as unknown as SupabaseMap[]).map(toMapListItem);
}

export async function fetchFeaturedMaps(supabase: SupabaseClient<Database>): Promise<MapListItem[]> {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .eq('is_featured', true)
    .order('name');

  if (error) {
    console.error('Failed to fetch featured maps:', error);
    return [];
  }

  return (data as unknown as SupabaseMap[]).map(toMapListItem);
}

export async function fetchMapsByType(supabase: SupabaseClient<Database>, type: string): Promise<MapListItem[]> {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .eq('type', type)
    .order('name');

  if (error) {
    console.error('Failed to fetch maps by type:', error);
    return [];
  }

  return (data as unknown as SupabaseMap[]).map(toMapListItem);
}
