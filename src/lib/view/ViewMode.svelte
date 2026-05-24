<!--
  ViewMode.svelte — /view mode plugin on MapWorkspace.

  Provides view-specific behavior:
    • Story playback (storyPlayer store + StoryPlayback panel + StoryMarkers)
    • GPS tracker overlay + toggle button
    • Side-by-side pane (DualMapPane) when viewMode === 'dual'
    • URL params: ?map=<id> and ?story=<id>
    • Mobile drawer slots: mobile-layers (LayerStackPanel) + mobile-browse (CatalogSidebarPanel)

  Chrome (MapShell, LayerRenderer, MapModeOverlays) is provided by MapWorkspace via slots.
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
  import { transformExtent } from "ol/proj";

  function toLonLatExtent(extent: number[]): [number, number, number, number] {
    return transformExtent(extent, 'EPSG:3857', 'EPSG:4326') as [number, number, number, number];
  }

  import MapWorkspace from "$lib/shell/MapWorkspace.svelte";
  import ViewSidebar from "./ViewSidebar.svelte";
  import LayerStackPanel from "$lib/ui/catalog/LayerStackPanel.svelte";
  import CatalogSidebarPanel from "$lib/ui/catalog/CatalogSidebarPanel.svelte";
  import StoryPlayback from "./StoryPlayback.svelte";
  import StoryMarkers from "./StoryMarkers.svelte";
  import GpsTracker from "./GpsTracker.svelte";
  import DualMapPane from "$lib/shell/DualMapPane.svelte";
  import { layersStore } from "$lib/stores/layersStore";

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

  // Top overlay (from layersStore) drives the "active map" UI (info card, etc.)
  $: topOverlay = $layersStore.overlays[0]?.ref ?? null;
  $: topOverlayMapId = topOverlay?.mapId ?? null;
  // Keep mapStore.activeMapId in sync with the topmost overlay so legacy
  // consumers (story playback, share, URL hash) still work.
  $: if (topOverlay) {
    if ($mapStore.activeMapId !== topOverlay.mapId) {
      mapStore.setActiveMap(topOverlay.mapId, topOverlay.allmapsId);
    }
  } else if ($mapStore.activeMapId) {
    mapStore.setActiveMap(null, null);
  }
  /** Side-by-side: right pane uses the 2nd overlay (top - 1). */
  $: sideAlt = $layersStore.overlays[1]?.ref ?? null;

  // Track previous mode to detect entering/leaving dual

  // Resize primary map after dual/compare layout changes
  $: {
    const _mode = viewMode;
    const _n = $layersStore.overlays.length;
    if (shellMap) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          shellMap?.updateSize();
        });
      });
    }
  }

  $: dualPaneActive = viewMode === "dual";

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
      const allmapsId = found?.annotation_url ?? found?.allmaps_id;
      const mapId = found?.id ?? paramMapId;
      if (mapId && allmapsId && !layersStore.isOverlay(mapId)) {
        layersStore.addOverlay({ kind: 'historical', mapId, allmapsId, name: found?.name, thumbnail: found?.thumbnail });
      }
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
      const allmapsId = found?.annotation_url ?? found?.allmaps_id ?? null;
      const mapId = found?.id ?? point.overlayMapId;
      if (allmapsId) {
        layersStore.clearOverlays();
        layersStore.addOverlay({ kind: 'historical', mapId, allmapsId, name: found?.name, thumbnail: found?.thumbnail });
      }
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

  // ── Catalog pick from sidebar ─────────────────────────────────────
  let role: 'user' | 'mod' | 'admin' = 'user';

  function handlePickLocation(event: CustomEvent<{ lat: number; lng: number; bbox?: [number, number, number, number] }>) {
    const { lat, lng, bbox } = event.detail;
    if (bbox) {
      const center = boundsCenter(bbox);
      const zoom = boundsZoom(bbox);
      mapStore.setView({ lng: center.lng, lat: center.lat, zoom });
    } else {
      mapStore.setView({ lng, lat, zoom: 15 });
    }
  }

  /**
   * Row click in the catalog = "show this map".
   * Replaces the overlay stack with just this map. To stack, use the + button.
   */
  async function handlePickMap(event: CustomEvent<any>) {
    const item = event.detail;
    if (!item?.id) return;
    let map = mapList.find((m) => m.id === item.id) ?? null;
    if (!map) map = { ...item } as MapListItem;
    const allmapsId = map.annotation_url ?? map.allmaps_id;

    if (allmapsId) {
      layersStore.clearOverlays();
      layersStore.addOverlay({
        kind: 'historical',
        mapId: map.id,
        allmapsId,
        name: map.name,
        thumbnail: map.thumbnail,
      });
    }

    // Zoom to bounds only if not already in view.
    let bounds = map.bounds ?? map.bbox ?? null;
    if (!bounds && map.allmaps_id) bounds = await fetchAnnotationBounds(map.allmaps_id);
    if (!bounds) return;

    if (shellMap) {
      const view = shellMap.getView();
      const size = shellMap.getSize();
      if (size) {
        const [vMinLon, vMinLat, vMaxLon, vMaxLat] = toLonLatExtent(view.calculateExtent(size));
        const [bMinLon, bMinLat, bMaxLon, bMaxLat] = bounds;
        const overlaps =
          bMinLon < vMaxLon && bMaxLon > vMinLon &&
          bMinLat < vMaxLat && bMaxLat > vMinLat;
        if (overlaps) return;
      }
    }

    const center = boundsCenter(bounds);
    const zoom = boundsZoom(bounds);
    mapStore.setView({ lng: center.lng, lat: center.lat, zoom });
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
    const sess = getSupabaseContext().session;
    if (sess?.user?.id) {
      const { data } = await supabase.from('profiles').select('role').eq('id', sess.user.id).single();
      role = ((data as any)?.role as 'user' | 'mod' | 'admin') ?? 'user';
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
        {role}
        {viewMode}
        activeStoryId={activeStory?.id ?? null}
        on:selectStory={handleSelectStory}
        on:zoomToMap={handleZoomToMap}
        on:pickMap={handlePickMap}
        on:pickLocation={handlePickLocation}
        on:changeViewMode={(e) => layerStore.setViewMode(e.detail.mode)}
        on:toggleCollapse={() => (sidebarCollapsed = true)}
      />
    </svelte:fragment>

    <svelte:fragment slot="mobile-layers">
      <div class="mobile-pane">
        <LayerStackPanel
          {viewMode}
          on:changeViewMode={(e) => layerStore.setViewMode(e.detail.mode)}
        />
      </div>
    </svelte:fragment>

    <svelte:fragment slot="mobile-browse">
      <div class="mobile-pane">
        <CatalogSidebarPanel
          {role}
          activeId={selectedMap?.id ?? null}
          requireGeoref={true}
          showLayerActions={true}
          on:pick={handlePickMap}
          on:pickLocation={handlePickLocation}
        />
      </div>
    </svelte:fragment>

    <svelte:fragment slot="map-children">
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
    </svelte:fragment>

    <svelte:fragment slot="dual-pane">
      {#if viewMode === "dual" && shellMap}
        <!-- Side-by-side: right pane drops the topmost overlay.
             If there's a 2nd overlay (sideAlt), it becomes the right pane's overlay.
             Otherwise the right pane is just the base. -->
        <DualMapPane
          primaryMap={shellMap}
          basemap={basemapSelection}
          showOverlay={!!sideAlt}
          overlayOpacity={1}
          activeAllmapsId={sideAlt?.allmapsId ?? ''}
        />
      {/if}
    </svelte:fragment>

    <svelte:fragment slot="map-overlay">
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

  </MapWorkspace>
</div>
