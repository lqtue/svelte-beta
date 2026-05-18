<!--
  ViewMode.svelte — /view mode plugin on MapWorkspace.

  Provides view-specific behavior:
    • Story playback (storyPlayer store + StoryPlayback panel + StoryMarkers)
    • GPS tracker overlay + toggle button
    • Dual-pane mode (DualMapPane in the right pane)
    • Compare tray (split / stack / off) with StackedOverlay loops
    • URL params: ?map=<id> and ?story=<id>

  Chrome (MapShell, HistoricalOverlay, MapToolbar, MapSearchBar, MapModeOverlays,
  basemap toggle, mobile sidebar) is provided by MapWorkspace via slots.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import "$styles/layouts/view-mode.css";
  import { page } from "$app/stores";
  import type Map from "ol/Map";

  import type {
    ViewMode as ViewModeType,
    MapListItem,
  } from "$lib/map/types";
  import type { Story } from "$lib/story/types";
  import { createGeoMapStores } from "$lib/shell/geoMapSetup";
  import { getSupabaseContext } from "$lib/supabase/context";
  import { fetchPublicStories } from "$lib/supabase/stories";
  import { createStoryPlayerStore } from "$lib/story/stores/storyStore";
  import { fetchAnnotationBounds } from "$lib/geo/mapBounds";
  import { boundsCenter, boundsZoom } from "$lib/ui/searchUtils";

  import MapWorkspace from "$lib/shell/MapWorkspace.svelte";
  import ViewSidebar from "./ViewSidebar.svelte";
  import StoryPlayback from "./StoryPlayback.svelte";
  import StoryMarkers from "./StoryMarkers.svelte";
  import GpsTracker from "./GpsTracker.svelte";
  import DualMapPane from "$lib/shell/DualMapPane.svelte";
  import StackedOverlay from "$lib/shell/StackedOverlay.svelte";
  import CompareTray from "$lib/ui/CompareTray.svelte";
  import { compareStore } from "$lib/stores/compareStore";

  const { supabase } = getSupabaseContext();

  const { mapStore, layerStore } = createGeoMapStores();
  const storyPlayer = createStoryPlayerStore(supabase, getSupabaseContext().session?.user?.id);

  // Reactive store reads
  $: viewMode = $layerStore.viewMode;
  $: opacity = $layerStore.overlayOpacity;
  $: basemapSelection = $layerStore.basemap;

  // State bound out of MapWorkspace
  let mapList: MapListItem[] = [];
  let selectedMap: MapListItem | null = null;
  let shellMap: Map | null = null;
  let sidebarCollapsed = false;
  let isMobile = false;
  let isCompact = false;

  // View-specific state
  let stories: Story[] = [];
  let activeStory: Story | null = null;

  let gpsActive = false;
  let gpsError: string | null = null;

  // Dual-mode state
  let secondaryBasemap = "g-streets";
  let secondaryShowOverlay = true;
  let primaryShowOverlay = false;

  // Compare-mode state
  $: compareIds = $compareStore.ids;
  $: compareMode = $compareStore.mode;
  $: compareActive = compareMode !== 'off' && compareIds.length >= 2;
  $: compareMaps = compareIds
    .map((id) => mapList.find((m) => m.id === id))
    .filter((m): m is MapListItem => !!m);
  let stackOpacities: Record<string, number> = {};

  $: {
    for (const m of compareMaps) {
      if (stackOpacities[m.id] === undefined) stackOpacities[m.id] = 0.6;
    }
  }

  // Sync the primary map (mapStore.activeMapId) with compareIds[0] when compare is active,
  // so the existing HistoricalOverlay shows the first map in the tray.
  $: if (compareActive && compareMaps[0]) {
    const primary = compareMaps[0];
    if ($mapStore.activeMapId !== primary.id && primary.allmaps_id) {
      mapStore.setActiveMap(primary.id, primary.annotation_url ?? primary.allmaps_id);
    }
  }

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

  // Resize primary map after dual/compare layout changes
  $: {
    const _mode = viewMode;
    const _cmode = $compareStore.mode;
    const _cn = $compareStore.ids.length;
    if (shellMap) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          shellMap?.updateSize();
        });
      });
    }
  }

  $: dualPaneActive = viewMode === "dual" || (compareActive && compareMode === 'split');

  $: playerState = $storyPlayer;
  $: activeStoryProgress = activeStory
    ? (playerState.progress[activeStory.id] ?? null)
    : null;

  // URL params
  $: paramMapId = $page.url.searchParams.get("map");
  $: paramStoryId = $page.url.searchParams.get("story");

  function applyUrlParams(maps: MapListItem[]) {
    if (paramMapId) {
      const found = maps.find((m) => m.id === paramMapId || m.allmaps_id === paramMapId);
      if (found) mapStore.setActiveMap(found.id, found.annotation_url ?? found.allmaps_id);
      else mapStore.setActiveMap(paramMapId);
    }
    if (paramStoryId) {
      const story = stories.find((s) => s.id === paramStoryId);
      if (story) {
        activeStory = story;
        storyPlayer.startStory(story.id);
      }
    }
  }

  function handleMapsLoaded(e: CustomEvent<{ maps: MapListItem[] }>) {
    applyUrlParams(e.detail.maps);
  }

  // ── View-specific handlers ──────────────────────────────────────

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
      const found = mapList.find((m) => m.id === point.overlayMapId || m.allmaps_id === point.overlayMapId);
      mapStore.setActiveMap(found?.id ?? point.overlayMapId, found?.annotation_url ?? found?.allmaps_id);
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

  async function handleZoomToMap(event: CustomEvent<{ map: MapListItem }>) {
    const { map } = event.detail;
    let bounds = map.bounds ?? null;
    if (!bounds) bounds = await fetchAnnotationBounds(map.allmaps_id ?? '');
    if (bounds) {
      const center = boundsCenter(bounds);
      const zoom = boundsZoom(bounds);
      mapStore.setView({ lng: center.lng, lat: center.lat, zoom });
    }
  }

  function handleGpsError(event: CustomEvent<{ message: string }>) {
    gpsError = event.detail.message;
  }

  onMount(async () => {
    try {
      stories = await fetchPublicStories(supabase);
      // If maps are already loaded by the time stories resolve, re-apply URL params.
      if (paramStoryId && mapList.length > 0) applyUrlParams(mapList);
    } catch (err) {
      console.error('[ViewMode] Failed to load stories:', err);
    }
  });
</script>

<div class="view-mode" class:mobile={isMobile}>
  <MapWorkspace
    {supabase}
    {mapStore}
    {layerStore}
    showDual={true}
    bind:mapList
    bind:selectedMap
    bind:shellMap
    bind:sidebarCollapsed
    bind:isMobile
    bind:isCompact
    {dualPaneActive}
    on:mapsloaded={handleMapsLoaded}
  >
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

    <svelte:fragment slot="map-children">
      <GpsTracker active={gpsActive} on:error={handleGpsError} />

      {#if compareActive && compareMode === 'stack'}
        {#each compareMaps.slice(1) as cm (cm.id)}
          {#if cm.allmaps_id}
            <StackedOverlay allmapsId={cm.allmaps_id} opacity={stackOpacities[cm.id] ?? 0.6} />
          {/if}
        {/each}
      {/if}

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
    </svelte:fragment>

    <svelte:fragment slot="dual-pane">
      {#if viewMode === "dual" && shellMap}
        <DualMapPane
          primaryMap={shellMap}
          basemap={secondaryBasemap}
          showOverlay={secondaryShowOverlay}
          overlayOpacity={opacity}
          activeAllmapsId={$mapStore.activeAllmapsId ?? ''}
        />
      {:else if compareActive && compareMode === 'split' && (compareMaps[1]?.annotation_url || compareMaps[1]?.allmaps_id) && shellMap}
        <DualMapPane
          primaryMap={shellMap}
          basemap={basemapSelection}
          showOverlay={true}
          overlayOpacity={opacity}
          activeAllmapsId={compareMaps[1].annotation_url ?? compareMaps[1].allmaps_id ?? ''}
        />
      {/if}
    </svelte:fragment>

    <svelte:fragment slot="map-overlay">
      <CompareTray mapList={mapList} bind:stackOpacities />
      {#if gpsError}
        <div class="gps-error">{gpsError}</div>
      {/if}
    </svelte:fragment>

    <svelte:fragment slot="floating">
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
    </svelte:fragment>

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
  </MapWorkspace>
</div>
