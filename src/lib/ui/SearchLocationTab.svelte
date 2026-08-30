<!--
  SearchLocationTab.svelte — the "Location" tab of SearchPanel.
  Nominatim place search + coordinate shortcut + nearby historical maps.
  Deliberately NOT merged with $lib/ui/LocationSearch.svelte: that one
  debounces at 300ms, uses different Nominatim params and swallows errors.
  Styles live in $styles/components/search-panel.css (imported by SearchPanel).
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { SearchResult } from '$lib/map/types';
  import type { MapListItem } from '$lib/data/maps/types';
  import { parseCoordinates, findNearbyMaps, coordinateResult } from './searchUtils';

  const dispatch = createEventDispatcher<{
    close: void;
    navigate: { result: SearchResult };
    selectMap: { map: MapListItem };
    addAsPoint: { result: SearchResult };
  }>();

  export let maps: MapListItem[] = [];
  export let selectedMapId: string | null = null;
  /** When true, show 'Add as point' on location results */
  export let showAddAsPoint = false;

  let locationQuery = '';
  let locationResults: SearchResult[] = [];
  let locationLoading = false;
  let locationNotice: string | null = null;
  let locationNoticeType: 'info' | 'error' = 'info';
  let searchDebounce: ReturnType<typeof setTimeout> | null = null;
  let searchAbortController: AbortController | null = null;

  // Nearby maps shown after a location is found
  let nearbyMaps: MapListItem[] = [];
  let nearbyLabel = '';

  let searchInputEl: HTMLInputElement | null = null;

  onMount(() => {
    queueMicrotask(() => searchInputEl?.focus());
  });

  // Coordinate detection
  $: parsedCoords = parseCoordinates(locationQuery);

  // When coords are detected, show nearby maps immediately
  $: if (parsedCoords && maps.length) {
    nearbyMaps = findNearbyMaps(parsedCoords.lat, parsedCoords.lng, maps);
    nearbyLabel = `${parsedCoords.lat.toFixed(3)}, ${parsedCoords.lng.toFixed(3)}`;
  }

  function clearLocationResults() {
    locationResults = [];
    locationNotice = null;
    locationLoading = false;
    nearbyMaps = [];
    nearbyLabel = '';
  }

  async function runLocationSearch(query: string) {
    const trimmed = query.trim();
    if (!trimmed) {
      clearLocationResults();
      searchAbortController?.abort();
      searchAbortController = null;
      return;
    }
    searchAbortController?.abort();
    searchAbortController = new AbortController();
    locationLoading = true;
    locationNotice = null;
    try {
      const params = new URLSearchParams({
        format: 'jsonv2',
        q: trimmed,
        addressdetails: '1',
        polygon_geojson: '1',
        limit: '10',
      });
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        {
          signal: searchAbortController.signal,
          headers: { Accept: 'application/json' },
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as SearchResult[];
      locationResults = data;
      if (!data.length) {
        locationNotice = 'Nothing matched that search.';
        locationNoticeType = 'info';
        nearbyMaps = [];
        nearbyLabel = '';
      } else {
        // Show nearby maps for the first result
        const first = data[0];
        const lat = parseFloat(first.lat);
        const lng = parseFloat(first.lon);
        if (!isNaN(lat) && !isNaN(lng) && maps.length) {
          nearbyMaps = findNearbyMaps(lat, lng, maps);
          nearbyLabel = first.display_name.split(',')[0];
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      locationNotice = 'Search failed. Try again in a moment.';
      locationNoticeType = 'error';
      locationResults = [];
      nearbyMaps = [];
      nearbyLabel = '';
    } finally {
      locationLoading = false;
    }
  }

  function queueLocationSearch(query: string) {
    locationQuery = query;
    if (searchDebounce) clearTimeout(searchDebounce);
    // Don't run Nominatim if it's coordinates (nearby maps handled reactively)
    if (parseCoordinates(query)) {
      locationResults = [];
      locationNotice = null;
      locationLoading = false;
      return;
    }
    // Clear nearby maps while typing new query
    nearbyMaps = [];
    nearbyLabel = '';
    searchDebounce = setTimeout(() => runLocationSearch(query), 1000);
  }

  function clearLocation() {
    locationQuery = '';
    clearLocationResults();
    searchAbortController?.abort();
    searchAbortController = null;
  }

  function goToCoordinates() {
    if (!parsedCoords) return;
    dispatch('navigate', { result: coordinateResult(parsedCoords) });
    dispatch('close');
  }

  function handleLocationResultClick(result: SearchResult) {
    // Update nearby maps for the clicked result
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    if (!isNaN(lat) && !isNaN(lng) && maps.length) {
      nearbyMaps = findNearbyMaps(lat, lng, maps);
      nearbyLabel = result.display_name.split(',')[0];
    }
    dispatch('navigate', { result });
  }

  function handleNearbyMapClick(map: MapListItem) {
    dispatch('selectMap', { map });
  }
</script>

<div class="search-form">
  <input
    type="text"
    placeholder="Place, address, or lat,lng…"
    bind:value={locationQuery}
    bind:this={searchInputEl}
    on:input={(e) => queueLocationSearch((e.target as HTMLInputElement).value)}
  />
  <div class="search-form-actions">
    <button
      type="button"
      class="chip ghost"
      on:click={clearLocation}
      disabled={!locationQuery && !locationResults.length}
    >
      Clear
    </button>
  </div>
</div>

<div class="results-list custom-scrollbar">
  {#if parsedCoords}
    <button type="button" class="result-item coord-item" on:click={goToCoordinates}>
      <span class="coord-icon">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          ><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg
        >
      </span>
      <span class="result-title"
        >Go to {parsedCoords.lat.toFixed(4)}, {parsedCoords.lng.toFixed(4)}</span
      >
    </button>
  {/if}

  {#if locationLoading}
    <p class="muted">Searching&hellip;</p>
  {:else if locationNotice}
    <p class:errored={locationNoticeType === 'error'}>
      {locationNotice}
    </p>
  {/if}

  {#each locationResults as result (result.display_name)}
    <div class="result-item">
      <button type="button" class="result-main" on:click={() => handleLocationResultClick(result)}>
        <span class="result-title">{result.display_name}</span>
        {#if result.type}
          <span class="result-type">{result.type}</span>
        {/if}
      </button>
      {#if showAddAsPoint}
        <div class="result-actions">
          <button
            type="button"
            class="chip ghost"
            on:click={() => dispatch('addAsPoint', { result })}
          >
            + Add as point
          </button>
        </div>
      {/if}
    </div>
  {/each}

  <!-- Nearby historical maps for the found location -->
  {#if nearbyMaps.length > 0}
    <div class="nearby-section">
      <div class="nearby-header">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          ><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 3v18" /></svg
        >
        <span>Historical maps near {nearbyLabel}</span>
      </div>
      {#each nearbyMaps as map (map.id)}
        <button
          type="button"
          class="result-item map-item"
          class:active-map={map.id === selectedMapId}
          on:click={() => handleNearbyMapClick(map)}
        >
          <div class="result-row">
            <span class="result-title">{map.name}</span>
            {#if map.id === selectedMapId}
              <span class="badge active-badge">Active</span>
            {/if}
          </div>
          <div class="result-meta">
            {#if map.year}<span class="badge year-badge">{map.year}</span>{/if}
            {#if map.location}<span class="badge type-badge">{map.location}</span>{/if}
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>
