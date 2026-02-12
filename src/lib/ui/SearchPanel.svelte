<!--
  SearchPanel.svelte — Unified search: Maps catalog + Location/Coordinates.
  Floating panel (not a full modal). Two tabs: Maps, Location.
  Replaces SearchDialog with a superset of functionality.

  Location tab: after finding a location, shows nearby historical maps for that area.
  "Locate me" uses the browser Geolocation API directly.
-->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { SearchResult, MapListItem } from "$lib/viewer/types";
  import { parseCoordinates, findNearbyMaps } from "./searchUtils";

  const dispatch = createEventDispatcher<{
    close: void;
    navigate: { result: SearchResult };
    selectMap: { map: MapListItem };
    addToAnnotations: { result: SearchResult };
    addAsPoint: { result: SearchResult };
  }>();

  export let open = false;
  export let maps: MapListItem[] = [];
  export let selectedMapId: string | null = null;
  /** When true, show 'Add as point' on location results */
  export let showAddAsPoint = false;

  let activeTab: "maps" | "location" = "maps";

  // Maps tab state
  let mapsQuery = "";

  // Location tab state
  let locationQuery = "";
  let locationResults: SearchResult[] = [];
  let locationLoading = false;
  let locatingUser = false;
  let locationNotice: string | null = null;
  let locationNoticeType: "info" | "error" = "info";
  let searchDebounce: ReturnType<typeof setTimeout> | null = null;
  let searchAbortController: AbortController | null = null;

  // Nearby maps shown after a location is found
  let nearbyMaps: MapListItem[] = [];
  let nearbyLabel = "";

  let searchInputEl: HTMLInputElement | null = null;
  let panelEl: HTMLDivElement | null = null;

  // Focus input when panel opens or tab changes
  $: if (open && searchInputEl) {
    queueMicrotask(() => searchInputEl?.focus());
  }

  // Coordinate detection
  $: parsedCoords = parseCoordinates(locationQuery);

  // When coords are detected, show nearby maps immediately
  $: if (parsedCoords && maps.length) {
    nearbyMaps = findNearbyMaps(parsedCoords.lat, parsedCoords.lng, maps);
    nearbyLabel = `${parsedCoords.lat.toFixed(3)}, ${parsedCoords.lng.toFixed(3)}`;
  }

  // Client-side map filtering
  $: filteredMaps = (() => {
    const q = mapsQuery.trim().toLowerCase();
    if (!q) return maps;
    return maps.filter((m) => {
      const haystack = [
        m.name,
        m.type,
        m.summary ?? "",
        m.year != null ? String(m.year) : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  })();

  // -- Location search (Nominatim) --

  function clearLocationResults() {
    locationResults = [];
    locationNotice = null;
    locationLoading = false;
    nearbyMaps = [];
    nearbyLabel = "";
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
        format: "jsonv2",
        q: trimmed,
        addressdetails: "1",
        polygon_geojson: "1",
        limit: "10",
      });
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        {
          signal: searchAbortController.signal,
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as SearchResult[];
      locationResults = data;
      if (!data.length) {
        locationNotice = "No results found.";
        locationNoticeType = "info";
        nearbyMaps = [];
        nearbyLabel = "";
      } else {
        // Show nearby maps for the first result
        const first = data[0];
        const lat = parseFloat(first.lat);
        const lng = parseFloat(first.lon);
        if (!isNaN(lat) && !isNaN(lng) && maps.length) {
          nearbyMaps = findNearbyMaps(lat, lng, maps);
          nearbyLabel = first.display_name.split(",")[0];
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      locationNotice = "Search failed. Please try again.";
      locationNoticeType = "error";
      locationResults = [];
      nearbyMaps = [];
      nearbyLabel = "";
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
    nearbyLabel = "";
    searchDebounce = setTimeout(() => runLocationSearch(query), 1000);
  }

  function clearLocation() {
    locationQuery = "";
    clearLocationResults();
    searchAbortController?.abort();
    searchAbortController = null;
  }

  function goToCoordinates() {
    if (!parsedCoords) return;
    const result: SearchResult = {
      display_name: `${parsedCoords.lat.toFixed(4)}, ${parsedCoords.lng.toFixed(4)}`,
      lat: String(parsedCoords.lat),
      lon: String(parsedCoords.lng),
      type: "coordinate",
    };
    dispatch("navigate", { result });
    dispatch("close");
  }

  function handleLocationResultClick(result: SearchResult) {
    // Update nearby maps for the clicked result
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    if (!isNaN(lat) && !isNaN(lng) && maps.length) {
      nearbyMaps = findNearbyMaps(lat, lng, maps);
      nearbyLabel = result.display_name.split(",")[0];
    }
    dispatch("navigate", { result });
  }

  function handleNearbyMapClick(map: MapListItem) {
    dispatch("selectMap", { map });
  }

  function handleMapResultClick(map: MapListItem) {
    dispatch("selectMap", { map });
    dispatch("close");
  }

  // -- Locate me (browser Geolocation API) --

  function handleLocateMe() {
    if (!navigator.geolocation) {
      locationNotice = "Geolocation is not supported by your browser.";
      locationNoticeType = "error";
      return;
    }
    locatingUser = true;
    locationNotice = null;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        locatingUser = false;
        const { latitude, longitude } = position.coords;
        const result: SearchResult = {
          display_name: `My location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
          lat: String(latitude),
          lon: String(longitude),
          type: "user location",
        };
        // Show nearby maps for user's location
        if (maps.length) {
          nearbyMaps = findNearbyMaps(latitude, longitude, maps);
          nearbyLabel = "your location";
        }
        locationResults = [result];
        dispatch("navigate", { result });
      },
      (error) => {
        locatingUser = false;
        switch (error.code) {
          case error.PERMISSION_DENIED:
            locationNotice = "Location permission denied.";
            break;
          case error.POSITION_UNAVAILABLE:
            locationNotice = "Location unavailable.";
            break;
          case error.TIMEOUT:
            locationNotice = "Location request timed out.";
            break;
          default:
            locationNotice = "Failed to get location.";
        }
        locationNoticeType = "error";
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      dispatch("close");
    }
  }

  function handleBackdropClick() {
    dispatch("close");
  }

  function switchTab(tab: "maps" | "location") {
    activeTab = tab;
    queueMicrotask(() => searchInputEl?.focus());
  }
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div
    class="search-backdrop"
    on:click={handleBackdropClick}
    role="presentation"
  ></div>
  <div
    class="search-panel"
    role="dialog"
    aria-label="Search"
    tabindex="-1"
    bind:this={panelEl}
    on:keydown={handleKeydown}
  >
    <!-- Tab bar -->
    <div class="tab-bar">
      <button
        type="button"
        class="tb"
        class:active={activeTab === "maps"}
        on:click={() => switchTab("maps")}>Maps</button
      >
      <button
        type="button"
        class="tb"
        class:active={activeTab === "location"}
        on:click={() => switchTab("location")}>Location</button
      >
      <div class="tab-spacer"></div>
      <button
        type="button"
        class="close-btn"
        on:click={() => dispatch("close")}
        aria-label="Close search"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg
        >
      </button>
    </div>

    <!-- Maps tab -->
    {#if activeTab === "maps"}
      <div class="search-form">
        <input
          type="text"
          placeholder="Filter maps by name, city, year..."
          bind:value={mapsQuery}
          bind:this={searchInputEl}
        />
      </div>
      <div class="results-list custom-scrollbar">
        {#if filteredMaps.length}
          {#each filteredMaps as map (map.id)}
            <button
              type="button"
              class="result-item map-item"
              class:active-map={map.id === selectedMapId}
              on:click={() => handleMapResultClick(map)}
            >
              <div class="result-row">
                <span class="result-title">{map.name}</span>
                {#if map.id === selectedMapId}
                  <span class="badge active-badge">Active</span>
                {/if}
              </div>
              <div class="result-meta">
                {#if map.year}<span class="badge year-badge">{map.year}</span
                  >{/if}
                {#if map.type}<span class="badge type-badge">{map.type}</span
                  >{/if}
              </div>
            </button>
          {/each}
        {:else if mapsQuery.trim()}
          <p class="empty-msg">No maps match "{mapsQuery}"</p>
        {:else}
          <p class="empty-msg">No maps available</p>
        {/if}
      </div>

      <!-- Location tab -->
    {:else}
      <div class="search-form">
        <input
          type="text"
          placeholder="Search place, address, or coordinates..."
          bind:value={locationQuery}
          bind:this={searchInputEl}
          on:input={(e) =>
            queueLocationSearch((e.target as HTMLInputElement).value)}
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
          <button
            type="button"
            class="result-item coord-item"
            on:click={goToCoordinates}
          >
            <span class="coord-icon">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                ><circle cx="12" cy="12" r="3" /><path
                  d="M12 2v4M12 18v4M2 12h4M18 12h4"
                /></svg
              >
            </span>
            <span class="result-title"
              >Go to {parsedCoords.lat.toFixed(4)}, {parsedCoords.lng.toFixed(
                4,
              )}</span
            >
          </button>
        {/if}

        {#if locationLoading}
          <p class="muted">Searching&hellip;</p>
        {:else if locationNotice}
          <p class:errored={locationNoticeType === "error"}>
            {locationNotice}
          </p>
        {/if}

        {#each locationResults as result (result.display_name)}
          <div class="result-item">
            <button
              type="button"
              class="result-main"
              on:click={() => handleLocationResultClick(result)}
            >
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
                  on:click={() => dispatch("addAsPoint", { result })}
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
                ><rect x="3" y="3" width="18" height="18" rx="2" /><path
                  d="M3 9h18M9 3v18"
                /></svg
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
                  {#if map.year}<span class="badge year-badge">{map.year}</span
                    >{/if}
                  {#if map.type}<span class="badge type-badge">{map.type}</span
                    >{/if}
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>.search-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
    background: transparent;
}

.search-panel {
    position: absolute;
    top: 1rem;
    right: 4rem;
    z-index: 100;
    width: 320px;
    max-height: calc(100% - 5rem);
    display: flex;
    flex-direction: column;
    background: var(--color-white);
    border: var(--border-thick);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-solid);
    color: var(--color-text);
    overflow: hidden;
}

/* Tab bar */
.tab-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 0.75rem 0;
    border-bottom: var(--border-thick);
    padding-bottom: 0.75rem;
    background: var(--color-bg);
}

.tab-spacer {
    flex: 1;
}

.tb {
    border: var(--border-thick);
    border-radius: var(--radius-pill);
    background: var(--color-white);
    color: var(--color-text);
    padding: 0.4rem 0.75rem;
    font-family: var(--font-family-base);
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.1s;
    white-space: nowrap;
    line-height: 1.2;
    box-shadow: 2px 2px 0px var(--color-border);
}

.tb:hover {
    background: var(--color-yellow);
    transform: translate(-1px, -1px);
    box-shadow: 3px 3px 0px var(--color-border);
}

.tb.active {
    background: var(--color-blue);
    color: white;
    transform: translate(1px, 1px);
    box-shadow: none;
}

.close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: var(--border-thin);
    border-radius: 50%;
    background: var(--color-white);
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.1s;
    box-shadow: 2px 2px 0px var(--color-border);
}

.close-btn:hover {
    background: var(--color-yellow);
    transform: translate(-1px, -1px);
}

/* Search form */
.search-form {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: var(--color-white);
}

.search-form input {
    padding: 0.6rem 0.75rem;
    border-radius: var(--radius-pill);
    border: var(--border-thick);
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 0.9rem;
    font-family: var(--font-family-base);
    font-weight: 600;
    box-shadow: inset 2px 2px 0px rgba(0, 0, 0, 0.05);
}

@media (max-width: 768px) {
    .search-form input {
        font-size: 16px;
    }
}

.search-form input:focus {
    outline: none;
    background: var(--color-white);
    box-shadow: 2px 2px 0px var(--color-border);
}

.search-form input::placeholder {
    color: var(--color-text);
    opacity: 0.5;
}

.search-form-actions {
    display: flex;
    gap: 0.5rem;
}

/* Results */
.results-list {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 0 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 380px;
    background: var(--color-white);
}

.result-item {
    background: var(--color-white);
    border: var(--border-thin);
    border-radius: var(--radius-md);
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    transition: all 0.1s;
    text-align: left;
    cursor: pointer;
    width: 100%;
    box-shadow: 2px 2px 0px var(--color-border);
}

button.result-item {
    font-family: var(--font-family-base);
}

.result-item:hover,
.result-item:focus-within {
    background: var(--color-yellow);
    transform: translate(-2px, -2px);
    box-shadow: 3px 3px 0px var(--color-border);
}

.result-item.active-map {
    background: var(--color-blue);
    color: white;
    border-color: var(--color-border);
}

.result-item.active-map .result-title,
.result-item.active-map .result-type {
    color: white;
}

.result-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
}

.result-title {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--color-text);
    line-height: 1.3;
}

.result-type {
    font-size: 0.75rem;
    color: var(--color-text);
    opacity: 0.7;
}

.result-meta {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
}

.badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: var(--radius-sm);
    font-size: 0.7rem;
    font-weight: 700;
    line-height: 1.4;
    border: var(--border-thin);
    background: var(--color-bg);
    color: var(--color-text);
}

.year-badge {
    background: var(--color-orange);
    color: white;
}

.type-badge {
    background: var(--color-gray-100);
}

.active-badge {
    background: var(--color-green);
    color: white;
    border-color: var(--color-green);
}

/* Coordinate item */
.coord-item {
    flex-direction: row;
    align-items: center;
    gap: 0.75rem;
    background: var(--color-bg);
}

.coord-icon {
    display: flex;
    align-items: center;
    color: var(--color-primary);
    flex-shrink: 0;
}

/* Nearby maps section */
.nearby-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: var(--border-thin);
}

.nearby-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
    font-size: 0.7rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text);
    opacity: 0.6;
}

/* Location result (with actions) */
.result-main {
    text-align: left;
    background: transparent;
    border: none;
    padding: 0;
    color: var(--color-text);
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    cursor: pointer;
    width: 100%;
    font-family: var(--font-family-base);
}

.result-main:focus-visible {
    outline: none;
    background: rgba(255, 255, 255, 0.2);
}

.result-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-top: 0.5rem;
}

/* Chips */
.chip {
    border: var(--border-thin);
    border-radius: var(--radius-pill);
    padding: 0.35rem 0.6rem;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.1s;
    font-family: var(--font-family-base);
    background: var(--color-white);
    color: var(--color-text);
    box-shadow: 1px 1px 0px var(--color-border);
}

.chip:hover {
    background: var(--color-yellow);
    transform: translate(-1px, -1px);
    box-shadow: 2px 2px 0px var(--color-border);
}

.chip.ghost:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: var(--color-gray-100);
    transform: none;
    box-shadow: none;
}

/* Notices */
.muted {
    color: var(--color-text);
    opacity: 0.6;
    font-size: 0.8rem;
    padding: 0.5rem;
    font-weight: 600;
}

.errored {
    color: #b91c1c;
    font-weight: 700;
}

.empty-msg {
    text-align: center;
    padding: 1rem;
    color: var(--color-text);
    opacity: 0.6;
    font-weight: 600;
}

.custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: var(--color-gray-300) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--color-gray-300);
    border-radius: 999px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: var(--color-gray-400);
}

</style>