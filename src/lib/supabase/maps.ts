import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import type { MapListItem } from '$lib/map/types';

type SupabaseMap = Database['public']['Tables']['maps']['Row'];

function toMapListItem(row: SupabaseMap): MapListItem {
  return {
    id: row.id,
    allmaps_id: row.allmaps_id || undefined,
    name: row.name,
    location: row.location || undefined,
    map_type: row.map_type || undefined,
    dc_description: row.dc_description || undefined,
    thumbnail: row.thumbnail || undefined,
    isFeatured: row.is_featured ?? undefined,
    year: row.year || undefined,
    year_label: row.year_label || undefined,
    collection: row.collection || undefined,
    source_type: row.source_type || undefined,
    extra_metadata: (row.extra_metadata as Record<string, string>) || undefined,
    iiif_image: (row as any).iiif_image || undefined,
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
    .order('year', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('Failed to fetch featured maps:', error);
    return [];
  }

  return (data as unknown as SupabaseMap[]).map(toMapListItem);
}

export async function fetchMapsByLocation(supabase: SupabaseClient<Database>, location: string): Promise<MapListItem[]> {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .eq('location', location)
    .order('name');

  if (error) {
    console.error('Failed to fetch maps by type:', error);
    return [];
  }

  return (data as unknown as SupabaseMap[]).map(toMapListItem);
}
