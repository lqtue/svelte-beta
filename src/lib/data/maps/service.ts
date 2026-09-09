// ---- Maps module — Supabase service ----
// Public-facing read functions for the catalog and map selector.
// Admin write operations live in adminApi.ts (server-side only).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/data/supabase/types';
import type { MapListItem, MapSourceType, MapStatus } from './types';

export type DbRow = Database['public']['Tables']['maps']['Row'];

/**
 * Exactly the columns `toMapListItem` reads. `select('*')` sent 120 KB of row
 * for the catalog (37 KB over the wire), most of it `extra_metadata` and the
 * long source fields no list ever renders; this is 9 KB. `fetchMapRow` still
 * takes the whole row — the admin editor writes back columns no list carries.
 */
const LIST_COLUMNS =
  'id,allmaps_id,annotation_url,name,location,map_type,dc_description,thumbnail,status,year,year_label,collection,holding_institution,source_url,source_type,bbox,iiif_image,georef_done';

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
    isFeatured: row.status === 'featured',
    year: row.year ?? undefined,
    year_label: row.year_label ?? undefined,
    collection: row.collection ?? undefined,
    holding_institution: row.holding_institution ?? undefined,
    source_url: row.source_url ?? undefined,
    source_type: (row.source_type ?? undefined) as MapSourceType | undefined,
    status: (row.status ?? 'draft') as MapStatus,
    bbox: (row.bbox ?? undefined) as [number, number, number, number] | undefined,
    iiif_image: row.iiif_image ?? undefined,
    georef_done: row.georef_done ?? false,
  };
}

/** All maps (published). For catalog page. */
export async function fetchMaps(supabase: SupabaseClient<Database>): Promise<MapListItem[]> {
  const { data, error } = await supabase.from('maps').select(LIST_COLUMNS).order('name');

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
    .select(LIST_COLUMNS)
    .eq('status', 'featured')
    .order('year', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('fetchFeaturedMaps:', error);
    return [];
  }
  return (data as unknown as DbRow[]).map(toMapListItem);
}

/**
 * How many maps a reader can actually see. `head: true` asks for the count and
 * no rows at all — the front page quoted this number by fetching the whole
 * catalog and reading `.length`.
 */
export async function fetchPublishedMapCount(supabase: SupabaseClient<Database>): Promise<number> {
  const { count, error } = await supabase
    .from('maps')
    .select('id', { count: 'exact', head: true })
    .in('status', ['public', 'featured']);

  if (error) {
    console.error('fetchPublishedMapCount:', error);
    return 0;
  }
  return count ?? 0;
}

/** The named maps, in one query. For a list of ids you already hold — favorites. */
export async function fetchMapsByIds(
  supabase: SupabaseClient<Database>,
  ids: string[]
): Promise<MapListItem[]> {
  if (!ids.length) return [];

  const { data, error } = await supabase.from('maps').select(LIST_COLUMNS).in('id', ids);

  if (error) {
    console.error('fetchMapsByIds:', error);
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
    .select(LIST_COLUMNS)
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
