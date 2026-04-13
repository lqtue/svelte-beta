// ---- Maps module — Supabase service ----
// Public-facing read functions for the catalog and map selector.
// Admin write operations live in adminApi.ts (server-side only).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/types';
import type { MapListItem, MapRecord, MapStatus } from './types';

type DbRow = Database['public']['Tables']['maps']['Row'];

function toMapListItem(row: DbRow): MapListItem {
  return {
    id: row.id,
    allmaps_id: row.allmaps_id ?? undefined,
    name: row.name,
    location: (row as unknown as MapRecord).location ?? undefined,
    map_type: (row as unknown as MapRecord).map_type ?? undefined,
    dc_description: (row as unknown as MapRecord).dc_description ?? undefined,
    thumbnail: row.thumbnail ?? undefined,
    isFeatured: row.is_featured ?? false,
    year: row.year ?? undefined,
    year_label: (row as unknown as MapRecord).year_label ?? undefined,
    collection: (row as unknown as MapRecord).collection ?? undefined,
    source_type: (row as unknown as MapRecord).source_type ?? undefined,
    status: ((row as unknown as MapRecord).status ?? 'published') as MapStatus,
    bbox: (row as unknown as MapRecord).bbox as [number, number, number, number] | undefined,
    iiif_image: (row as unknown as MapRecord).iiif_image ?? undefined,
  };
}

/** All maps (published). For catalog page. */
export async function fetchMaps(supabase: SupabaseClient<Database>): Promise<MapListItem[]> {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .order('name');

  if (error) { console.error('fetchMaps:', error); return []; }
  return (data as unknown as DbRow[]).map(toMapListItem);
}

/** Featured maps only, sorted by year. For home page hero. */
export async function fetchFeaturedMaps(supabase: SupabaseClient<Database>): Promise<MapListItem[]> {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .eq('is_featured', true)
    .order('year', { ascending: true, nullsFirst: false });

  if (error) { console.error('fetchFeaturedMaps:', error); return []; }
  return (data as unknown as DbRow[]).map(toMapListItem);
}

/** Maps that have been georeferenced (have allmaps_id). For view/overlay mode. */
export async function fetchGeoreferencedMaps(supabase: SupabaseClient<Database>): Promise<MapListItem[]> {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .not('allmaps_id', 'is', null)
    .order('year', { ascending: true, nullsFirst: false });

  if (error) { console.error('fetchGeoreferencedMaps:', error); return []; }
  return (data as unknown as DbRow[]).map(toMapListItem);
}

/** Maps by location (city / region). */
export async function fetchMapsByLocation(supabase: SupabaseClient<Database>, location: string): Promise<MapListItem[]> {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .eq('location', location)
    .order('name');

  if (error) { console.error('fetchMapsByType:', error); return []; }
  return (data as unknown as DbRow[]).map(toMapListItem);
}

/** Fetch a single map by its uuid (maps.id). */
export async function fetchMapById(supabase: SupabaseClient<Database>, id: string): Promise<MapListItem | null> {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .eq('id', id)
    .single();

  if (error) { console.error('fetchMapById:', error); return null; }
  return data ? toMapListItem(data as unknown as DbRow) : null;
}
