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
  import "$lib/styles/layouts/view-mode.css";
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
  } from "$lib/geo/mapBounds";
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
