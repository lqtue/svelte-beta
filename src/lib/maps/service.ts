// ---- Maps module — Supabase service ----
// Public-facing read functions for the catalog and map selector.
// Admin write operations live in adminApi.ts (server-side only).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/types';
import type { MapListItem, MapSourceType, MapStatus } from './types';

export type DbRow = Database['public']['Tables']['maps']['Row'];

function toMapListItem(row: DbRow): MapListItem {
  return {
    id: row.id,
    allmaps_id: row.allmaps_id ?? undefined,
    annotation_url: row.annotation_url ?? undefined,
    name: row.name,
    location: row.location ?? undefined,
    map_type: row.map_type ?? undefined,
    dc_description: row.dc_description ?? undefined,
    thumbnail: row.thumbnail ?? undefined,
    isFeatured: row.is_featured ?? false,
    year: row.year ?? undefined,
    year_label: row.year_label ?? undefined,
    collection: row.collection ?? undefined,
    source_type: (row.source_type ?? undefined) as MapSourceType | undefined,
    status: (row.status ?? 'draft') as MapStatus,
    bbox: (row.bbox ?? undefined) as [number, number, number, number] | undefined,
    iiif_image: row.iiif_image ?? undefined,
  };
}

/** All maps (published). For catalog page. */
export async function fetchMaps(supabase: SupabaseClient<Database>): Promise<MapListItem[]> {
  const { data, error } = await supabase.from('maps').select('*').order('name');

  if (error) {
    console.error('fetchMaps:', error);
    return [];
  }
  return (data as unknown as DbRow[]).map(toMapListItem);
}

/** Featured maps only, sorted by year. For home page hero. */
export async function fetchFeaturedMaps(
  supabase: SupabaseClient<Database>
): Promise<MapListItem[]> {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .eq('is_featured', true)
    .order('year', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('fetchFeaturedMaps:', error);
    return [];
  }
  return (data as unknown as DbRow[]).map(toMapListItem);
}

/** Maps that have been georeferenced (have allmaps_id OR annotation_url). For view/overlay mode. */
export async function fetchGeoreferencedMaps(
  supabase: SupabaseClient<Database>
): Promise<MapListItem[]> {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .or('allmaps_id.not.is.null,annotation_url.not.is.null')
    .order('year', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('fetchGeoreferencedMaps:', error);
    return [];
  }
  return (data as unknown as DbRow[]).map(toMapListItem);
}

/**
 * One full `maps` row by id. Used where the list-item projection isn't enough
 * (the admin editor writes back columns the search result never carried).
 */
export async function fetchMapRow(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<DbRow | null> {
  const { data, error } = await supabase.from('maps').select('*').eq('id', id).single();
  if (error || !data) {
    console.error('fetchMapRow:', error);
    return null;
  }
  return data as DbRow;
}
