<!--
  MapWorkspace.svelte — Unified map base for View/Create/Annotate (and future modes).

  Owns the shared chrome (ToolLayout + MapShell + HistoricalOverlay + MapToolbar +
  MapSearchBar + MapModeOverlays + floating basemap toggle) so that mode pages
  become thin plugin shells that supply only their differentiating bits.

  Slots
    sidebar         — desktop sidebar panel (forwarded to ToolLayout)
    mobile-sidebar  — mobile drawer content (forwarded to ToolLayout)
    floating        — extra bottom-right buttons (rendered after basemap toggle)
    map-children    — children injected inside MapShell's default slot
                      (StoryMarkers, GpsTracker, DrawTool, StackedOverlay, …)
    dual-pane       — content rendered in the right pane when {dualPaneActive}
                      (e.g. DualMapPane for ViewMode's dual view)
    map-overlay     — absolutely-positioned DOM above the map but below the
                      toolbar (StoryPlayback panel, error toasts, …)

  What this component owns
    • Mounting MapShell, HistoricalOverlay, MapToolbar, MapSearchBar, MapModeOverlays
    • Loading mapList (`fetchMaps` + bounds backfill); deriving selectedMap
    • Forwarding view-mode/opacity changes to layerStore via geoMapSetup helpers
    • Default basemap toggle + mobile sidebar toggle buttons
    • The "Zoom to Map" prompt for the spinner

  What it does NOT own
    • Auth gates (caller decides whether to render us)
    • Mode-specific stores (story, project, compare, annotation)
    • Library/editor view state
    • URL parameter parsing (the route page reads params and seeds the stores)
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type Map from 'ol/Map';
  import type { SupabaseClient } from '@supabase/supabase-js';

  import type {
    ViewMode as ViewModeType,
    MapListItem,
    SearchResult,
  } from '$lib/map/types';
  import {
    createGeoMapStores,
    toggleBasemap as _toggleBasemap,
    onChangeViewMode,
    onChangeOpacity,
  } from '$lib/shell/geoMapSetup';
  import type { createMapStore } from '$lib/stores/mapStore';
  import type { createLayerStore } from '$lib/stores/layerStore';
  import { createMapList } from '$lib/shell/useMapList';
  import {
    findCoveringMap,
    boundsCenter,
    boundsZoom,
  } from '$lib/ui/searchUtils';
  import { fetchAnnotationBounds } from '$lib/geo/mapBounds';

  import ToolLayout from '$lib/shell/ToolLayout.svelte';
  import MapShell from '$lib/shell/MapShell.svelte';
  import HistoricalOverlay from '$lib/shell/HistoricalOverlay.svelte';
  import MapModeOverlays from '$lib/shell/MapModeOverlays.svelte';
  import MapToolbar from '$lib/ui/MapToolbar.svelte';
  import MapSearchBar from '$lib/ui/MapSearchBar.svelte';

  // ── Props ────────────────────────────────────────────────────────

  /** Supabase client for the initial map-list fetch. Pass null to skip auto-load. */
  export let supabase: SupabaseClient | null = null;
  /** Show the "dual" pill in the view-mode cycle (only ViewMode wants this today). */
  export let showDual: boolean = false;
  /** Show "Add as point" action on location search hits (CreateMode). */
  export let showAddAsPointInSearch: boolean = false;
  /** Hide the Location tab in search (maps-only mode). */
  export let searchMapsOnly: boolean = false;
  /** When true, MapShell is wrapped in a half-width pane and the `dual-pane` slot is rendered alongside. */
  export let dualPaneActive: boolean = false;

  // ── Stores (caller-owned: route page creates via createGeoMapStores() and passes in) ──

  export let mapStore: ReturnType<typeof createMapStore>;
  export let layerStore: ReturnType<typeof createLayerStore>;

  // ── Bind targets exposed to caller ───────────────────────────────

  /** OL Map instance once mounted. */
  export let shellMap: Map | null = null;
  /** Toolbar element so plugins can size against it. */
  export let toolbarEl: HTMLDivElement | undefined = undefined;
  /** Responsive + sidebar state from ToolLayout. */
  export let sidebarCollapsed: boolean = false;
  export let isMobile: boolean = false;
  export let isCompact: boolean = false;
  /** Reactive map list (also passed to MapSearchBar internally). */
  export let mapList: MapListItem[] = [];
  /** Derived from mapList + activeMapId; read-only for callers. */
  export let selectedMap: MapListItem | null = null;

  // ── Events ───────────────────────────────────────────────────────

  const dispatch = createEventDispatcher<{
    overlayloadstart: void;
    overlayloadend: void;
    overlayloaderror: { message: string };
    searchnavigate: { result: SearchResult };
    selectmap: { map: MapListItem };
    changeviewmode: { mode: ViewModeType };
    changeopacity: { value: number };
    /** Fired after a search location pick, in case the parent wants to react. */
    mapsloaded: { maps: MapListItem[] };
  }>();

  // ── Reactive store reads ─────────────────────────────────────────

  $: selectedMapId = $mapStore.activeMapId ?? '';
  $: basemapSelection = $layerStore.basemap;
  $: viewMode = $layerStore.viewMode;
  $: opacity = $layerStore.overlayOpacity;
  $: lensRadius = $layerStore.lensRadius;

  $: selectedMap = selectedMapId
    ? (mapList.find((m) => m.id === selectedMapId) ?? null)
    : null;

  // ── Map list load ────────────────────────────────────────────────

  const listCtrl = createMapList();
  const { maps: mapsStore } = listCtrl;
  $: mapList = $mapsStore;

  onMount(() => {
    if (supabase) {
      listCtrl.loadMaps(supabase).then((m) => dispatch('mapsloaded', { maps: m })).catch((err) => {
        console.error('[MapWorkspace] Failed to load map list:', err);
      });
    }
  });

  // ── Overlay status forwarding ────────────────────────────────────

  let overlayLoading = false;
  let overlayError: string | null = null;

  // ── Event handlers ───────────────────────────────────────────────

  function handleToggleBasemap() {
    _toggleBasemap(layerStore, basemapSelection);
  }

  function handleChangeViewMode(e: CustomEvent<{ mode: ViewModeType }>) {
    onChangeViewMode(layerStore, e);
    dispatch('changeviewmode', e.detail);
  }

  function handleChangeOpacity(e: CustomEvent<{ value: number }>) {
    onChangeOpacity(layerStore, e);
    dispatch('changeopacity', e.detail);
  }

  function handleSearchNavigate(e: CustomEvent<{ result: SearchResult }>) {
    const { result } = e.detail;
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    mapStore.setView({ lng, lat, zoom: 16 });

    const covering = findCoveringMap(lat, lng, mapList);
    if (covering) {
      mapStore.setActiveMap(covering.id, covering.annotation_url ?? covering.allmaps_id);
    }
    dispatch('searchnavigate', { result });
  }

  function handleSelectMap(e: CustomEvent<{ map: MapListItem }>) {
    mapStore.setActiveMap(e.detail.map.id, e.detail.map.annotation_url ?? e.detail.map.allmaps_id);
    dispatch('selectmap', e.detail);
  }

  async function handleZoomToActiveMap() {
    if (!selectedMap) return;
    let bounds = selectedMap.bounds ?? null;
    if (!bounds && selectedMap.allmaps_id) {
      bounds = await fetchAnnotationBounds(selectedMap.allmaps_id);
    }
    if (bounds) {
      const center = boundsCenter(bounds);
      const zoom = boundsZoom(bounds);
      mapStore.setView({ lng: center.lng, lat: center.lat, zoom });
    }
  }
</script>

<ToolLayout bind:sidebarCollapsed bind:isMobile bind:isCompact>
  <svelte:fragment slot="sidebar">
    <slot name="sidebar" />
  </svelte:fragment>

  <!-- Map stage -->
  <div class="dual-container" class:dual-active={dualPaneActive}>
    <div class="dual-primary" class:dual-active={dualPaneActive}>
      <MapShell {mapStore} {layerStore} bind:map={shellMap}>
        <HistoricalOverlay
          on:loadstart={() => { overlayLoading = true; overlayError = null; dispatch('overlayloadstart'); }}
          on:loadend={() => { overlayLoading = false; dispatch('overlayloadend'); }}
          on:loaderror={(e) => { overlayLoading = false; overlayError = e.detail.message; dispatch('overlayloaderror', e.detail); }}
        />
        <slot name="map-children" />
      </MapShell>
    </div>
    {#if dualPaneActive}
      <div class="dual-divider"></div>
      <div class="dual-secondary">
        <slot name="dual-pane" />
      </div>
    {/if}
  </div>

  <slot name="map-overlay" />

  <MapToolbar
    {viewMode}
    {opacity}
    {isMobile}
    {showDual}
    bind:toolbarEl
    on:changeViewMode={handleChangeViewMode}
    on:changeOpacity={handleChangeOpacity}
  />

  <MapModeOverlays
    {viewMode}
    {lensRadius}
    loading={overlayLoading}
    error={overlayError}
    on:lensresize={(e) => layerStore.setLensRadius(e.detail.value)}
    on:zoomtomap={handleZoomToActiveMap}
    on:dismisserror={() => (overlayError = null)}
  />

  <MapSearchBar
    maps={mapList}
    {selectedMapId}
    {toolbarEl}
    showAddAsPoint={showAddAsPointInSearch}
    mapsOnly={searchMapsOnly}
    on:navigate={handleSearchNavigate}
    on:selectMap={handleSelectMap}
  />

  <!-- Floating controls (bottom-right) -->
  <svelte:fragment slot="floating">
    <button
      type="button"
      class="ctrl-btn"
      on:click={handleToggleBasemap}
      title={basemapSelection === 'g-streets' ? 'Switch to Satellite' : 'Switch to Streets'}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        {#if basemapSelection === 'g-streets'}
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
        {:else}
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
        {/if}
      </svg>
    </button>

    <slot name="floating" />

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

  <svelte:fragment slot="mobile-sidebar">
    <slot name="mobile-sidebar" />
  </svelte:fragment>
</ToolLayout>
