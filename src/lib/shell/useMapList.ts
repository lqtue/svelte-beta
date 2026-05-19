/**
 * useMapList.ts — fetches the map catalogue + backfills bounds in the background.
 *
 * Returns a Svelte-friendly object whose `subscribe`-style stores can be read.
 * Pattern: caller awaits `loadMaps(supabase)` once, then reads `$maps` reactively.
 *
 * Centralises a fetch flow that was duplicated across ViewMode/CreateMode/AnnotateMode.
 */
import { writable, type Readable, type Writable } from 'svelte/store';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MapListItem } from '$lib/map/types';
import { fetchMaps } from '$lib/maps/service';
import { fetchMultipleBounds } from '$lib/geo/mapBounds';

export interface MapListController {
  /** Current list of maps. Reactive. */
  maps: Readable<MapListItem[]>;
  /** Fetch maps from Supabase, then backfill bounds asynchronously. Safe to call multiple times. */
  loadMaps: (supabase: SupabaseClient) => Promise<MapListItem[]>;
  /** Direct setter for callers that want to inject a custom list (e.g. tests, URL-param flows). */
  setMaps: (next: MapListItem[]) => void;
}

export function createMapList(): MapListController {
  const store: Writable<MapListItem[]> = writable([]);

  async function loadMaps(supabase: SupabaseClient): Promise<MapListItem[]> {
    const maps = await fetchMaps(supabase);
    store.set(maps);
    // Background: fetch and merge bounds for georeferenced maps
    const allmapsIds = maps.filter((m) => m.allmaps_id).map((m) => m.allmaps_id!);
    if (allmapsIds.length > 0) {
      fetchMultipleBounds(allmapsIds).then((boundsMap) => {
        store.update((cur) =>
          cur.map((m) => {
            const b = m.allmaps_id ? boundsMap.get(m.allmaps_id) : undefined;
            return b ? { ...m, bounds: b } : m;
          }),
        );
      });
    }
    return maps;
  }

  return {
    maps: { subscribe: store.subscribe },
    loadMaps,
    setMaps: store.set,
  };
}
