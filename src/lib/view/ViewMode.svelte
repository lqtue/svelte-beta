<!--
  ViewMode.svelte — /view mode orchestrator.

  Replaces TripTracker (map viewing + GPS) and Hunt playback.
  Uses MapShell + HistoricalOverlay instead of manual OL setup.
  Layout handled by ToolLayout.

  URL params:
    ?map=<id>    — load a specific historical map overlay (UUID or allmaps_id)
    ?story=<id>  — start story playback
-->
<script lang="ts">
  import { onMount } from "svelte";
  import "$styles/layouts/view-mode.css";
  import { page } from "$app/stores";
  import { fromLonLat, transformExtent } from "ol/proj";
  import type Map from "ol/Map";

  import type {
    ViewMode as ViewModeType,
    MapListItem,
  } from "$lib/map/types";
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
  } from "$lib/geo/mapBounds";
  import { fetchMapBounds } from "$lib/shell/warpedOverlay";
  import {
    findCoveringMap,
    boundsCenter,
    boundsZoom,
  } from "$lib/ui/searchUtils";

  import ToolLayout from "$lib/shell/ToolLayout.svelte";
  import NavBar from "$lib/ui/NavBar.svelte";
  import MapShell from "$lib/shell/MapShell.svelte";
  import HistoricalOverlay from "$lib/shell/HistoricalOverlay.svelte";
  import ViewSidebar from "./ViewSidebar.svelte";
  import StoryPlayback from "./StoryPlayback.svelte";
  import StoryMarkers from "./StoryMarkers.svelte";
  import GpsTracker from "./GpsTracker.svelte";
  import MapSearchBar from "$lib/ui/MapSearchBar.svelte";
  import MapToolbar from "$lib/ui/MapToolbar.svelte";
  import DualMapPane from "$lib/shell/DualMapPane.svelte";

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
  let toolbarEl: HTMLDivElement;
  let overlayLoading = false;
  let overlayError: string | null = null;
  let shellMap: Map | null = null;

  // Dual-mode state
  let secondaryBasemap = "g-streets";
  let secondaryShowOverlay = true;
  let primaryShowOverlay = false;

  // Track previous mode to detect entering/leaving dual
  let prevViewMode: ViewModeType | null = null;
  $: {
    if (viewMode === "dual" && prevViewMode !== "dual") {
      layerStore.setBasemap("g-satellite");
      layerStore.setOverlayVisible(false);
      primaryShowOverlay = false;
      secondaryBasemap = "g-streets";
      secondaryShowOverlay = true;
    } else if (viewMode === "dual") {
      layerStore.setOverlayVisible(primaryShowOverlay);
    } else if (prevViewMode === "dual") {
      layerStore.setOverlayVisible(true);
    }
    prevViewMode = viewMode;
  }

  // Resize primary map after dual mode layout change
  $: {
    const _mode = viewMode;
    if (shellMap) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          shellMap?.updateSize();
        });
      });
    }
  }

  function toggleBasemap() {
    layerStore.setBasemap(
      basemapSelection === "g-streets" ? "g-satellite" : "g-streets",
    );
  }

  $: playerState = $storyPlayer;
  $: activeStoryProgress = activeStory
    ? (playerState.progress[activeStory.id] ?? null)
    : null;

  let showZoomPrompt = false;
  let loadingTimer: ReturnType<typeof setTimeout> | null = null;

  $: if (overlayLoading) {
    if (!loadingTimer) {
      showZoomPrompt = false;
      loadingTimer = setTimeout(() => {
        showZoomPrompt = true;
      }, 3000);
    }
  } else {
    if (loadingTimer) clearTimeout(loadingTimer);
    loadingTimer = null;
    showZoomPrompt = false;
  }

  // Read URL params
  $: paramMapId = $page.url.searchParams.get("map");
  $: paramStoryId = $page.url.searchParams.get("story");

  async function loadData() {
    try {
      const [maps, publicStories] = await Promise.all([
        fetchMaps(supabase),
        fetchPublicStories(supabase),
      ]);
      mapList = maps;
      stories = publicStories;

      // Fetch bounds in background (non-blocking)
      const mapsWithAllmapsId = maps.filter((m) => m.allmaps_id);
      fetchMultipleBounds(
        mapsWithAllmapsId.map((m) => m.allmaps_id!),
        5,
      ).then((boundsMap) => {
        mapList = mapList.map((map) => {
          const b = map.allmaps_id ? boundsMap.get(map.allmaps_id) : undefined;
          return b ? { ...map, bounds: b } : map;
        });
      });

      // Apply URL params. paramMapId may be UUID (new links) or allmaps_id (old links).
      if (paramMapId) {
        const found = maps.find((m) => m.id === paramMapId || m.allmaps_id === paramMapId);
        if (found) {
          mapStore.setActiveMap(found.id, found.allmaps_id);
        } else {
          mapStore.setActiveMap(paramMapId);
        }
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

  function handleChangeViewMode(event: CustomEvent<{ mode: ViewModeType }>) {
    layerStore.setViewMode(event.detail.mode);
  }

  function handleChangeOpacity(event: CustomEvent<{ value: number }>) {
    layerStore.setOverlayOpacity(event.detail.value);
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
      // overlayMapId may be UUID (new) or allmaps_id (old stories) — look up both
      const found = mapList.find((m) => m.id === point.overlayMapId || m.allmaps_id === point.overlayMapId);
      mapStore.setActiveMap(found?.id ?? point.overlayMapId, found?.allmaps_id);
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
    event: CustomEvent<{ result: import("$lib/map/types").SearchResult }>,
  ) {
    const { result } = event.detail;
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    mapStore.setView({ lng, lat, zoom: 16 });

    const covering = findCoveringMap(lat, lng, mapList);
    if (covering) {
      mapStore.setActiveMap(covering.id, covering.allmaps_id);
    }
  }

  async function handleZoomToMap(event: CustomEvent<{ map: MapListItem }>) {
    const { map } = event.detail;
    let bounds = map.bounds ?? null;
    if (!bounds) {
      bounds = await fetchAnnotationBounds(map.allmaps_id ?? '');
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
  });
</script>

<div class="view-mode" class:mobile={isMobile}>
  <NavBar />
  <ToolLayout bind:sidebarCollapsed bind:isMobile bind:isCompact>

    <!-- Desktop sidebar -->
    <svelte:fragment slot="sidebar">
      <ViewSidebar
        {selectedMap}
        {stories}
        activeStoryId={activeStory?.id ?? null}
        on:selectStory={handleSelectStory}
        on:zoomToMap={handleZoomToMap}
        on:toggleCollapse={() => (sidebarCollapsed = true)}
      />
    </svelte:fragment>

    <!-- Map content (inside map-stage) -->
    <div class="dual-container" class:dual-active={viewMode === "dual"}>
      <div class="dual-primary" class:dual-active={viewMode === "dual"}>
        <MapShell {mapStore} {layerStore} bind:map={shellMap}>
          <HistoricalOverlay
            on:loadstart={() => { overlayLoading = true; overlayError = null; }}
            on:loadend={() => { overlayLoading = false; }}
            on:loaderror={(e) => { overlayLoading = false; overlayError = e.detail.message; }}
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
      </div>
      {#if viewMode === "dual"}
        <div class="dual-divider"></div>
        <div class="dual-secondary">
          {#if shellMap}
            <DualMapPane
              primaryMap={shellMap}
              basemap={secondaryBasemap}
              showOverlay={secondaryShowOverlay}
              overlayOpacity={opacity}
              activeAllmapsId={$mapStore.activeAllmapsId ?? ''}
            />
          {/if}
        </div>
      {/if}
    </div>

    <!-- Map controls toolbar (absolute, inside map-stage) -->
    <MapToolbar
      {viewMode}
      {opacity}
      {isMobile}
      bind:toolbarEl
      on:changeViewMode={handleChangeViewMode}
      on:changeOpacity={handleChangeOpacity}
    />

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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    {/if}

    <MapSearchBar
      maps={mapList}
      {selectedMapId}
      {toolbarEl}
      on:navigate={handleSearchNavigate}
      on:selectMap={(e) => {
        mapStore.setActiveMap(e.detail.map.id, e.detail.map.allmaps_id);
      }}
    />

    <!-- Floating controls (bottom-right) -->
    <svelte:fragment slot="floating">
      <button
        type="button"
        class="ctrl-btn"
        on:click={toggleBasemap}
        title={basemapSelection === "g-streets" ? "Switch to Satellite" : "Switch to Streets"}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          {#if basemapSelection === "g-streets"}
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
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
        on:click={() => { gpsActive = !gpsActive; gpsError = null; }}
        title={gpsActive ? "Stop GPS tracking" : "Start GPS tracking"}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
      {/if}
    </svelte:fragment>

    <!-- Mobile sidebar -->
    <svelte:fragment slot="mobile-sidebar">
      <ViewSidebar
        {selectedMap}
        {stories}
        activeStoryId={activeStory?.id ?? null}
        on:selectStory={(e) => { handleSelectStory(e); sidebarCollapsed = true; }}
        on:zoomToMap={handleZoomToMap}
        on:toggleCollapse={() => (sidebarCollapsed = true)}
      />
    </svelte:fragment>

  </ToolLayout>
</div>
