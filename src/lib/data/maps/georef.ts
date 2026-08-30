// ---- /contribute/georef data + Allmaps Editor links ----

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/data/supabase/types';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

export interface GeorefMapItem {
  id: string;
  name: string;
  allmaps_id: string | null;
  iiif_image: string | null;
  iiif_manifest: string | null;
  georef_done: boolean;
  year: number | null;
}

/** The georeferencing queue: non-public maps, highest priority first. */
export async function fetchGeorefQueue(
  supabase: SupabaseClient<Database>
): Promise<GeorefMapItem[]> {
  const { data, error } = await supabase
    .from('maps')
    .select('id, name, allmaps_id, iiif_image, iiif_manifest, georef_done, year')
    .eq('is_public', false)
    .order('priority', { ascending: false })
    .order('name');

  if (error) {
    console.error('fetchGeorefQueue:', error);
    return [];
  }
  return (data ?? []) as GeorefMapItem[];
}

function withInfoJson(url: string): string {
  return /\.json($|\?)/.test(url) ? url : `${url.replace(/\/$/, '')}/info.json`;
}

/** Where a mirrored annotation lives once an admin has run mirror-r2. */
export function annotationStorageUrl(allmapsId: string): string {
  if (allmapsId.startsWith('http')) return allmapsId;
  return `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/annotations/${allmapsId}.json`;
}

/**
 * Deep-link into the Allmaps Editor. Prefers the manifest (multi-image
 * collections), then the image service, then an existing annotation.
 */
export function allmapsEditorUrl(map: GeorefMapItem): string {
  const base = 'https://editor.allmaps.org/#/collection?url=';
  if (map.iiif_manifest) return base + encodeURIComponent(map.iiif_manifest);
  if (map.iiif_image) return base + encodeURIComponent(withInfoJson(map.iiif_image));
  if (map.allmaps_id) return base + encodeURIComponent(annotationStorageUrl(map.allmaps_id));
  return 'https://editor.allmaps.org/';
}
