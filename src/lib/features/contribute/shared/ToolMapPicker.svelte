<!--
  ToolMapPicker.svelte — the map picker shared by the contribute IIIF-canvas
  tools, rendered inline in `ScanLeftRail`.

  Owns the map list: loads it via fetchLabelMaps() and adapts LabelMapInfo to
  the MapListItem shape the list expects, so callers need neither a loadMaps()
  copy nor an `as any` cast.

  It used to render `MapSearchBar` — a trigger floating over the canvas that
  opened the whole search panel — so "which sheet am I on?" sat on top of the
  sheet and cost two clicks. It now renders that panel's own maps tab straight
  into the rail, which is the same list without the overlay.

  Dispatches:
    loaded { maps }        — after the list arrives
    select { map }         — the LabelMapInfo the user picked
    error  { message }     — the list could not be loaded
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import SearchMapsTab from '$lib/features/shared/search/SearchMapsTab.svelte';
  // The list's styles ship with the panel that used to own it.
  import '$styles/components/search-panel.css';
  import { getSupabaseContext } from '$lib/data/supabase/context';
  import { triageState } from '$lib/data/maps/triageTypes';
  import { fetchLabelMaps } from '$lib/data/supabase/footprints';
  import type { LabelMapInfo } from '$lib/data/supabase/footprints';
  import type { MapListItem } from '$lib/data/maps/types';

  /** Currently selected map id, for the search bar's active state. */
  export let selectedMapId: string | null = null;

  const dispatch = createEventDispatcher<{
    loaded: { maps: LabelMapInfo[] };
    select: { map: LabelMapInfo };
    error: { message: string };
  }>();

  const { supabase } = getSupabaseContext();

  let maps: LabelMapInfo[] = [];

  // LabelMapInfo → the MapListItem fields MapSearchBar actually reads.
  // `year`, `location` and `dc_description` are what SearchMapsTab filters and
  // badges on; leaving them out (as this did until 2026-09-04) made the
  // "Filter by title, city, or year" box silently unable to match two of the
  // three, and meant no badge ever drew.
  $: listItems = maps.map((m): MapListItem => ({
    id: m.id,
    name: m.name,
    allmaps_id: m.allmapsId,
    iiif_image: m.iiifImage,
    year: m.year,
    location: m.location,
    dc_description: m.description,
    // A proposal nobody has accepted is not triaged — that is the whole point
    // of `validated_at`, and `triageState` is the one place the rule lives.
    _triaged: triageState(m.triage) === 'ready',
    _ocrd: m.hasOcr,
  }));

  function handleSelect(e: CustomEvent<{ map: MapListItem }>) {
    const picked = maps.find((m) => m.id === e.detail.map.id);
    if (picked) dispatch('select', { map: picked });
  }

  onMount(async () => {
    try {
      maps = await fetchLabelMaps(supabase);
      dispatch('loaded', { maps });
    } catch (err: any) {
      dispatch('error', { message: err?.message ?? 'Failed to load maps' });
    }
  });
</script>

<!-- showCompare={false}: the ⇄ button adds to `layersStore`, the /explore layer
     stack. These tools run on an ImageShell and have no geo map, so it was a
     dead control taking a third of every row.
     autofocus={false}: the rail is on screen from load, and a picker that grabs
     the caret means every page starts with the keyboard in a filter box. -->
<div class="tool-map-picker">
  <SearchMapsTab
    maps={listItems}
    {selectedMapId}
    showCompare={false}
    autofocus={false}
    on:selectMap={handleSelect}
  />
</div>

<style>
  /* SearchMapsTab was written for a fixed-height panel; in the rail it is the
     part that flexes, so the list scrolls and the filter box stays put. */
  .tool-map-picker {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    padding: 0.75rem;
    gap: 0.4rem;
  }
  .tool-map-picker :global(.results-list) {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    max-height: none;
  }
</style>
