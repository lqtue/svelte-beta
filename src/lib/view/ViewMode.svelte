<!--
  ViewMode.svelte — /view mode orchestrator.

  Replaces TripTracker (map viewing + GPS) and Hunt playback.
  Uses MapShell + HistoricalOverlay instead of manual OL setup.

  URL params:
    ?map=<id>    — load a specific historical map overlay
    ?story=<id>  — start story playback
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { page } from "$app/stores";
  import { get } from "svelte/store";
  import { fromLonLat, transformExtent } from "ol/proj";
  import type Map from "ol/Map";

  import type {
    ViewMode as ViewModeType,
    MapListItem,
  } from "$lib/viewer/types";
  import type { Story, StoryProgress } from "$lib/story/types";
  import { createMapStore } from "$lib/stores/mapStore";
  import { createLayerStore } from "$lib/stores/layerStore";
  import { getSupabaseContext } from "$lib/supabase/context";
  import { fetchMaps } from "$lib/supabase/maps";
  import { fetchPublicStories } from "$lib/supabase/stories";
  import { createStoryPlayerStore } from "$lib/story/stores/storyStore";

  import {
    fetchMultipleBounds,
    fetchAnnotationBounds,
  } from "$lib/trip/mapBounds";
  import { fetchMapBounds } from "$lib/shell/warpedOverlay";
  import {
    findCoveringMap,
    boundsCenter,
    boundsZoom,
  } from "$lib/ui/searchUtils";

  import MapShell from "$lib/shell/MapShell.svelte";
  import HistoricalOverlay from "$lib/shell/HistoricalOverlay.svelte";
  import ViewSidebar from "./ViewSidebar.svelte";
  import StoryPlayback from "./StoryPlayback.svelte";
  import StoryMarkers from "./StoryMarkers.svelte";
  import GpsTracker from "./GpsTracker.svelte";
  import MapSearchBar from "$lib/ui/MapSearchBar.svelte";

  const { supabase, session } = getSupabaseContext();
  const userId = session?.user?.id;

  const mapStore = createMapStore();
  const layerStore = createLayerStore();
  const storyPlayer = createStoryPlayerStore(supabase, userId);

  // Reactive store reads
  $: selectedMapId = $mapStore.activeMapId ?? "";
  $: basemapSelection = $layerStore.basemap;
  $: viewMode = $layerStore.viewMode;
  $: opacity = $layerStore.overlayOpacity;
  $: lensRadius = $layerStore.lensRadius;

  // Derived: selected map object
  $: selectedMap = selectedMapId
    ? (mapList.find((m) => m.id === selectedMapId) ?? null)
    : null;

  // State
  let mapList: MapListItem[] = [];
  let stories: Story[] = [];
  let activeStory: Story | null = null;
  let sidebarCollapsed = false;
  let isMobile = false;
  let isCompact = false;

  let gpsActive = false;
  let gpsError: string | null = null;
  let responsiveCleanup: (() => void) | null = null;
  let toolbarEl: HTMLDivElement;
  let overlayLoading = false;
  let overlayError: string | null = null;
  let shellMap: Map | null = null; // We need shellMap reference for zooming logic

  function toggleBasemap() {
    layerStore.setBasemap(
      basemapSelection === "g-streets" ? "g-satellite" : "g-streets",
    );
  }

  $: playerState = $storyPlayer;
  $: activeStoryProgress = activeStory
    ? (playerState.progress[activeStory.id] ?? null)
    : null;

  let showZoomPrompt = false; // Show "Zoom to Map" if loading takes too long
  let loadingTimer: ReturnType<typeof setTimeout> | null = null;

  $: if (overlayLoading) {
    if (!loadingTimer) {
      showZoomPrompt = false;
      loadingTimer = setTimeout(() => {
        showZoomPrompt = true;
      }, 3000); // Show prompt after 3s of loading
    }
  } else {
    if (loadingTimer) clearTimeout(loadingTimer);
    loadingTimer = null;
    showZoomPrompt = false;
  }

  // Read URL params
  $: paramMapId = $page.url.searchParams.get("map");
  $: paramStoryId = $page.url.searchParams.get("story");

  // View mode definitions
  const viewModes: { mode: ViewModeType; label: string; title: string }[] = [
    { mode: "overlay", label: "Overlay", title: "Full overlay" },
    { mode: "side-x", label: "Side X", title: "Side by side (horizontal)" },
    { mode: "side-y", label: "Side Y", title: "Side by side (vertical)" },
    { mode: "spy", label: "Lens", title: "Spy glass" },
  ];

  async function loadData() {
    try {
      const [maps, publicStories] = await Promise.all([
        fetchMaps(supabase),
        fetchPublicStories(supabase),
      ]);
      mapList = maps;
      stories = publicStories;

      // Fetch bounds in background (non-blocking)
      fetchMultipleBounds(
        maps.map((m) => m.id),
        5,
      ).then((boundsMap) => {
        mapList = mapList.map((map) => {
          const b = boundsMap.get(map.id);
          return b ? { ...map, bounds: b } : map;
        });
      });

      // Apply URL params after data is loaded
      if (paramMapId) {
        mapStore.setActiveMap(paramMapId);
      }
      if (paramStoryId) {
        const story = stories.find((s) => s.id === paramStoryId);
        if (story) {
          activeStory = story;
          storyPlayer.startStory(story.id);
        }
      }
    } catch (err) {
      console.error("[ViewMode] Failed to load data:", err);
    }
  }

  function handleOpacityInput(event: Event) {
    const target = event.target as HTMLInputElement;
    layerStore.setOverlayOpacity(parseFloat(target.value));
  }

  // ── Lens knob drag ──────────────────────────────────────────────
  let lensOverlayEl: HTMLDivElement;

  function startLensDrag(e: MouseEvent | TouchEvent) {
    e.preventDefault();

    const handleMove = (ev: MouseEvent | TouchEvent) => {
      if (!lensOverlayEl) return;
      const rect = lensOverlayEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const clientX =
        "touches" in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX;
      const clientY =
        "touches" in ev ? ev.touches[0].clientY : (ev as MouseEvent).clientY;

      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
      layerStore.setLensRadius(Math.max(30, Math.min(500, dist)));
    };

    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleUp);
  }

  function handleSelectStory(event: CustomEvent<{ story: Story }>) {
    activeStory = event.detail.story;
    storyPlayer.startStory(activeStory.id);

    // If the story has a region, zoom to it
    if (activeStory.region) {
      mapStore.setView({
        lng: activeStory.region.center[0],
        lat: activeStory.region.center[1],
        zoom: activeStory.region.zoom,
      });
    }
  }

  function handleNavigatePoint(
    event: CustomEvent<{
      index: number;
      point: import("$lib/story/types").StoryPoint;
    }>,
  ) {
    const { point } = event.detail;
    if (point.coordinates) {
      mapStore.setView({
        lng: point.coordinates[0],
        lat: point.coordinates[1],
        zoom: 17,
      });
    }
    if (point.overlayMapId) {
      mapStore.setActiveMap(point.overlayMapId);
    }
  }

  function handleCompletePoint(
    event: CustomEvent<{ storyId: string; pointId: string }>,
  ) {
    if (!activeStory) return;
    storyPlayer.completePoint(
      event.detail.storyId,
      event.detail.pointId,
      activeStory.points.length,
    );
  }

  function handleCloseStory() {
    storyPlayer.stopStory();
    activeStory = null;
  }

  function handleFinishStory() {
    storyPlayer.stopStory();
    activeStory = null;
  }

  function handleSearchNavigate(
    event: CustomEvent<{ result: import("$lib/viewer/types").SearchResult }>,
  ) {
    const { result } = event.detail;
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    mapStore.setView({ lng, lat, zoom: 16 });

    // Auto-select nearest covering map
    const covering = findCoveringMap(lat, lng, mapList);
    if (covering) {
      mapStore.setActiveMap(covering.id);
    }
  }

  async function handleZoomToMap(event: CustomEvent<{ map: MapListItem }>) {
    const { map } = event.detail;
    let bounds = map.bounds ?? null;
    if (!bounds) {
      bounds = await fetchAnnotationBounds(map.id);
    }
    if (bounds) {
      const center = boundsCenter(bounds);
      const zoom = boundsZoom(bounds);
      mapStore.setView({ lng: center.lng, lat: center.lat, zoom });
    }
  }

  function handleZoomToActiveMap() {
    if (selectedMap) {
      handleZoomToMap({ detail: { map: selectedMap } } as CustomEvent);
      showZoomPrompt = false;
    }
  }

  function handleGpsError(event: CustomEvent<{ message: string }>) {
    gpsError = event.detail.message;
  }

  onMount(() => {
    loadData();

    const mobileQuery = window.matchMedia("(max-width: 900px)");
    const compactQuery = window.matchMedia("(max-width: 1400px)");
    const updateResponsive = () => {
      isMobile = mobileQuery.matches;
      isCompact = compactQuery.matches;
    };
    updateResponsive();
    mobileQuery.addEventListener("change", updateResponsive);
    compactQuery.addEventListener("change", updateResponsive);
    responsiveCleanup = () => {
      mobileQuery.removeEventListener("change", updateResponsive);
      compactQuery.removeEventListener("change", updateResponsive);
    };
  });

  onDestroy(() => {
    responsiveCleanup?.();
  });
</script>

<div class="view-mode" class:mobile={isMobile}>
  <div
    class="workspace"
    class:with-sidebar={!sidebarCollapsed && !isMobile}
    class:compact={isCompact}
  >
    {#if !sidebarCollapsed && !isMobile}
      <ViewSidebar
        {selectedMap}
        {stories}
        activeStoryId={activeStory?.id ?? null}
        on:selectStory={handleSelectStory}
        on:zoomToMap={handleZoomToMap}
        on:toggleCollapse={() => (sidebarCollapsed = !sidebarCollapsed)}
      />
    {/if}

    <div class="map-stage">
      <MapShell {mapStore} {layerStore} bind:map={shellMap}>
        <HistoricalOverlay
          on:loadstart={() => {
            overlayLoading = true;
            overlayError = null;
          }}
          on:loadend={() => {
            overlayLoading = false;
          }}
          on:loaderror={(e) => {
            overlayLoading = false;
            overlayError = e.detail.message;
          }}
        />
        <GpsTracker active={gpsActive} on:error={handleGpsError} />

        {#if activeStory}
          <StoryMarkers
            points={activeStory.points}
            currentIndex={activeStoryProgress?.currentPointIndex ?? 0}
          />
          <StoryPlayback
            story={activeStory}
            progress={activeStoryProgress}
            on:navigatePoint={handleNavigatePoint}
            on:completePoint={handleCompletePoint}
            on:close={handleCloseStory}
            on:finish={handleFinishStory}
          />
        {/if}
      </MapShell>

      <!-- Top-left: Show Panel (when collapsed) -->
      {#if sidebarCollapsed && !isMobile}
        <div class="top-controls">
          <button
            type="button"
            class="ctrl-btn"
            on:click={() => (sidebarCollapsed = false)}
            title="Show panel"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18" />
            </svg>
          </button>
        </div>
      {/if}

      <!-- Bottom-right: Basemap + GPS + Mobile menu -->
      <div class="floating-controls">
        <button
          type="button"
          class="ctrl-btn"
          on:click={toggleBasemap}
          title={basemapSelection === "g-streets"
            ? "Switch to Satellite"
            : "Switch to Streets"}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            {#if basemapSelection === "g-streets"}
              <circle cx="12" cy="12" r="10" />
              <path
                d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"
              />
            {:else}
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
            {/if}
          </svg>
        </button>
        <button
          type="button"
          class="ctrl-btn"
          class:active={gpsActive}
          on:click={() => {
            gpsActive = !gpsActive;
            gpsError = null;
          }}
          title={gpsActive ? "Stop GPS tracking" : "Start GPS tracking"}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        </button>
        {#if isMobile}
          <button
            type="button"
            class="ctrl-btn"
            on:click={() => (sidebarCollapsed = !sidebarCollapsed)}
            title="Toggle panel"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
        {/if}
      </div>

      <!-- Map Controls Toolbar -->
      <div class="map-toolbar" class:mobile={isMobile} bind:this={toolbarEl}>
        <div class="toolbar-group">
          <span class="toolbar-label">View</span>
          <div class="toolbar-btns">
            {#each viewModes as vm}
              <button
                type="button"
                class="tb"
                class:active={viewMode === vm.mode}
                on:click={() => layerStore.setViewMode(vm.mode)}
                title={vm.title}>{vm.label}</button
              >
            {/each}
          </div>
        </div>

        <div class="toolbar-sep"></div>

        <div class="toolbar-group toolbar-opacity">
          <span class="toolbar-label">Opacity</span>
          <div class="toolbar-slider-row">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={opacity}
              on:input={handleOpacityInput}
              class="toolbar-slider"
            />
            <span class="toolbar-slider-val">{Math.round(opacity * 100)}%</span>
          </div>
        </div>
      </div>

      <!-- Lens resize knob (spy mode only) -->
      {#if viewMode === "spy"}
        <div class="lens-overlay" bind:this={lensOverlayEl}>
          <div
            class="lens-ring"
            style="width: {lensRadius * 2}px; height: {lensRadius * 2}px;"
          ></div>
          <div
            class="lens-knob"
            style="transform: translateX({lensRadius}px);"
            on:mousedown={startLensDrag}
            on:touchstart|preventDefault={startLensDrag}
            role="slider"
            aria-label="Lens size"
            aria-valuemin={30}
            aria-valuemax={500}
            aria-valuenow={lensRadius}
            tabindex="0"
          ></div>
        </div>
      {/if}

      {#if gpsError}
        <div class="gps-error">{gpsError}</div>
      {/if}

      {#if overlayLoading}
        <div class="overlay-loading">
          <div class="loading-spinner"></div>
          <span>Loading map overlay...</span>
          {#if showZoomPrompt}
            <span>or try</span>
            <button class="loading-zoom-btn" on:click={handleZoomToActiveMap}>
              Zoom to Map
            </button>
          {/if}
        </div>
      {/if}

      {#if overlayError}
        <div class="overlay-error">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span>{overlayError}</span>
          <button
            type="button"
            class="overlay-error-close"
            on:click={() => (overlayError = null)}
            aria-label="Dismiss"
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
      {/if}

      <MapSearchBar
        maps={mapList}
        {selectedMapId}
        {toolbarEl}
        on:navigate={handleSearchNavigate}
        on:selectMap={(e) => {
          mapStore.setActiveMap(e.detail.map.id);
        }}
      />
    </div>
  </div>

  <!-- Mobile sidebar (sliding panel) -->
  {#if isMobile && !sidebarCollapsed}
    <div
      class="mobile-overlay"
      on:click={() => (sidebarCollapsed = true)}
      role="presentation"
    ></div>
    <div class="mobile-sidebar">
      <ViewSidebar
        {selectedMap}
        {stories}
        activeStoryId={activeStory?.id ?? null}
        on:selectStory={(e) => {
          handleSelectStory(e);
          sidebarCollapsed = true;
        }}
        on:zoomToMap={handleZoomToMap}
        on:toggleCollapse={() => (sidebarCollapsed = true)}
      />
    </div>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    font-family:
      "Be Vietnam Pro",
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    background: #2b2520;
    color: #2b2520;
  }

  .view-mode {
    position: relative;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, #f4e8d8 0%, #ebe0d0 50%, #e8d5ba 100%);
    overflow: hidden;
  }

  /* Workspace: single column by default, two columns when sidebar visible */
  .workspace {
    flex: 1 1 0%;
    min-height: 0;
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    align-items: stretch;
  }

  .workspace.with-sidebar {
    grid-template-columns: minmax(260px, 0.25fr) minmax(0, 1fr);
    gap: 0;
    padding: 0;
  }

  .workspace.with-sidebar.compact {
    grid-template-columns: minmax(200px, 0.24fr) minmax(0, 1fr);
    gap: 0;
    padding: 0;
  }

  /* No padding when sidebar is collapsed — map fills the space */

  .map-stage {
    position: relative;
    min-height: 0;
    height: 100%;
    min-width: 0;
    border-radius: 4px;
    overflow: hidden;
    background: #2b2520;
    border: 2px solid #d4af37;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  }

  /* Full-bleed map when no sidebar (collapsed or mobile) */
  .workspace:not(.with-sidebar) .map-stage {
    border-radius: 0;
    border: none;
    box-shadow: none;
  }

  .view-mode.mobile .workspace {
    grid-template-columns: minmax(0, 1fr);
    padding: 0;
    gap: 0;
  }

  .view-mode.mobile .map-stage {
    min-height: 100vh;
  }

  /* ---------- Control Buttons (shared) ---------- */
  .ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 2px solid #d4af37;
    background: linear-gradient(
      160deg,
      rgba(244, 232, 216, 0.95) 0%,
      rgba(232, 213, 186, 0.95) 100%
    );
    color: #4a3f35;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: all 0.15s ease;
    text-decoration: none;
  }

  .ctrl-btn:hover {
    background: rgba(212, 175, 55, 0.25);
    transform: scale(1.05);
  }

  .ctrl-btn.active {
    background: #d4af37;
    color: #fff;
  }

  /* ---------- Top Controls ---------- */
  .top-controls {
    position: absolute;
    top: 1rem;
    left: 1rem;
    display: flex;
    gap: 0.5rem;
    z-index: 50;
    pointer-events: auto;
  }

  /* ---------- Floating Controls (bottom-right) ---------- */
  .floating-controls {
    position: absolute;
    bottom: 1rem;
    right: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 50;
    pointer-events: auto;
  }

  /* ---------- FAT Map Toolbar ---------- */
  .map-toolbar {
    position: absolute;
    bottom: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 40;
    display: flex;
    align-items: center;
    gap: 0;
    background: linear-gradient(
      160deg,
      rgba(244, 232, 216, 0.96) 0%,
      rgba(232, 213, 186, 0.96) 100%
    );
    border: 2px solid #d4af37;
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.18);
    backdrop-filter: blur(12px);
    pointer-events: auto;
    max-width: calc(100vw - 7rem);
  }

  .map-toolbar.mobile {
    bottom: 0.5rem;
    padding: 0.35rem 0.5rem;
    max-width: calc(100vw - 5rem);
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0 0.5rem;
  }

  .toolbar-group:first-child {
    padding-left: 0;
  }

  .toolbar-group:last-child {
    padding-right: 0;
  }

  .toolbar-sep {
    width: 1px;
    height: 24px;
    background: rgba(212, 175, 55, 0.35);
    flex-shrink: 0;
  }

  .map-toolbar.mobile .toolbar-sep {
    display: none;
  }

  .toolbar-label {
    font-family: "Be Vietnam Pro", sans-serif;
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #8b7355;
    white-space: nowrap;
  }

  .toolbar-btns {
    display: flex;
    gap: 2px;
  }

  .tb {
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.45);
    color: #4a3f35;
    padding: 0.3rem 0.55rem;
    font-family: "Be Vietnam Pro", sans-serif;
    font-size: 0.72rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    line-height: 1.2;
  }

  .tb:hover {
    background: rgba(212, 175, 55, 0.15);
    border-color: rgba(212, 175, 55, 0.6);
  }

  /* ---------- Loading Overlay Styles ---------- */
  .overlay-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .loading-zoom-btn {
    margin-top: 0.5rem;
    padding: 0.4rem 0.8rem;
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.3);
    color: white;
    font-size: 0.8rem;
    cursor: pointer;
    pointer-events: auto;
    transition: background 0.2s;
  }

  .loading-zoom-btn:hover {
    background: rgba(0, 0, 0, 0.5);
  }

  .tb.active {
    background: rgba(212, 175, 55, 0.3);
    border-color: #d4af37;
    color: #2b2520;
    font-weight: 700;
  }

  /* ---------- Opacity in toolbar ---------- */
  .toolbar-opacity {
    min-width: 80px;
  }

  .toolbar-slider-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .toolbar-slider {
    flex: 1 1 auto;
    width: 60px;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: linear-gradient(
      90deg,
      rgba(212, 175, 55, 0.2) 0%,
      rgba(212, 175, 55, 0.4) 100%
    );
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  .toolbar-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: linear-gradient(135deg, #d4af37 0%, #b8942f 100%);
    border: 2px solid #f4e8d8;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
    cursor: pointer;
  }

  .toolbar-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: linear-gradient(135deg, #d4af37 0%, #b8942f 100%);
    border: 2px solid #f4e8d8;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
    cursor: pointer;
  }

  .toolbar-slider-val {
    font-family: "Be Vietnam Pro", sans-serif;
    font-size: 0.6875rem;
    font-weight: 700;
    color: #2b2520;
    min-width: 1.75rem;
    text-align: right;
  }

  /* ---------- Lens Resize Knob ---------- */
  .lens-overlay {
    position: absolute;
    inset: 0;
    z-index: 45;
    pointer-events: none;
  }

  .lens-ring {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    border: 2px dashed rgba(212, 175, 55, 0.5);
    border-radius: 50%;
    pointer-events: none;
  }

  .lens-knob {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 18px;
    height: 18px;
    margin: -9px 0 0 -9px;
    border-radius: 50%;
    background: linear-gradient(135deg, #d4af37 0%, #b8942f 100%);
    border: 2px solid #f4e8d8;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    cursor: grab;
    pointer-events: auto;
    transition: box-shadow 0.15s ease;
  }

  .lens-knob:hover {
    box-shadow: 0 2px 12px rgba(212, 175, 55, 0.5);
  }

  .lens-knob:active {
    cursor: grabbing;
    box-shadow:
      0 0 0 4px rgba(212, 175, 55, 0.3),
      0 2px 12px rgba(0, 0, 0, 0.3);
  }

  /* ---------- GPS Error ---------- */
  .gps-error {
    position: absolute;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.5rem 1rem;
    background: rgba(180, 40, 40, 0.9);
    color: #fff;
    font-size: 0.78rem;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 60;
    pointer-events: auto;
  }

  /* ---------- Overlay Loading ---------- */
  .overlay-loading {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.6rem 1.2rem;
    background: linear-gradient(
      160deg,
      rgba(244, 232, 216, 0.95) 0%,
      rgba(232, 213, 186, 0.95) 100%
    );
    border: 2px solid #d4af37;
    border-radius: 6px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
    z-index: 55;
    pointer-events: none;
    font-family: "Be Vietnam Pro", sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    color: #4a3f35;
  }

  .loading-spinner {
    width: 18px;
    height: 18px;
    border: 2.5px solid rgba(212, 175, 55, 0.3);
    border-top-color: #d4af37;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ---------- Overlay Error ---------- */
  .overlay-error {
    position: absolute;
    bottom: 4rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.55rem 0.75rem;
    background: rgba(160, 40, 40, 0.92);
    color: #fff;
    font-family: "Be Vietnam Pro", sans-serif;
    font-size: 0.78rem;
    font-weight: 500;
    border-radius: 5px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    z-index: 60;
    pointer-events: auto;
    max-width: calc(100vw - 8rem);
  }

  .overlay-error svg {
    flex-shrink: 0;
    opacity: 0.9;
  }

  .overlay-error-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: none;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
    cursor: pointer;
    flex-shrink: 0;
    margin-left: 0.25rem;
    transition: background 0.15s ease;
  }

  .overlay-error-close:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  /* ---------- Mobile Sidebar ---------- */
  .mobile-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 200;
  }

  .mobile-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 300px;
    z-index: 201;
    overflow-y: auto;
  }

  /* ---------- Responsive mobile toolbar ---------- */
  @media (max-width: 900px) {
    .map-toolbar {
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .toolbar-group {
      padding: 0;
    }

    .toolbar-sep {
      display: none;
    }
  }
</style>
