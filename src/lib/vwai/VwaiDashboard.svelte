<!--
  VwaiDashboard.svelte — VWAI / CDEC records map dashboard.

  Orchestrates:
    • CdecPanel (sidebar)
    • MapShell + HistoricalOverlay + CdecLayer (primary map)
    • DualMapPane (side-by-side mode)
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import type Map from "ol/Map";
  import type { ViewMode } from "$lib/viewer/types";
  import type { MapListItem } from "$lib/viewer/types";

  import { createMapStore } from "$lib/stores/mapStore";
  import { createLayerStore } from "$lib/stores/layerStore";
  import { getSupabaseContext } from "$lib/supabase/context";
  import { fetchMaps } from "$lib/supabase/maps";

  import MapShell from "$lib/shell/MapShell.svelte";
  import HistoricalOverlay from "$lib/shell/HistoricalOverlay.svelte";
  import DualMapPane from "$lib/shell/DualMapPane.svelte";

  import CdecLayer from "./CdecLayer.svelte";
  import CdecPanel from "./CdecPanel.svelte";
  import {
    fetchCdecData,
    applyFilters,
    EMPTY_FILTERS,
    DEFAULT_CONFIG,
  } from "./cdecData";
  import type { CdecRecord, FilterState, VwaiConfig } from "./cdecData";

  // ── Supabase ─────────────────────────────────────────────────────
  const { supabase } = getSupabaseContext();

  // ── Stores ───────────────────────────────────────────────────────
  const mapStore = createMapStore({ lat: 11.5, lng: 106.8, zoom: 8 });
  const layerStore = createLayerStore({ basemap: "g-satellite" });

  // ── State ────────────────────────────────────────────────────────
  let records: CdecRecord[] = [];
  let filters: FilterState = { ...EMPTY_FILTERS };
  let config: VwaiConfig = { ...DEFAULT_CONFIG };
  let selectedRecord: CdecRecord | null = null;
  let vmaMaps: MapListItem[] = [];
  let loading = true;
  let error: string | null = null;
  let overlayLoading = false;
  let overlayError: string | null = null;
  let shellMap: Map | null = null;
  let dualMap: Map | null = null;

  // ── Reactive ─────────────────────────────────────────────────────
  $: filteredRecords = applyFilters(records, filters, config.colorColumn);
  $: viewMode = $layerStore.viewMode;
  $: overlayOpacity = $layerStore.overlayOpacity;
  $: selectedMapId = $mapStore.activeMapId ?? "";

  // Resize primary map when entering/leaving dual mode
  $: {
    void viewMode;
    if (shellMap) {
      requestAnimationFrame(() => requestAnimationFrame(() => shellMap?.updateSize()));
    }
  }

  // ── Data loading ─────────────────────────────────────────────────
  async function loadData() {
    loading = true;
    error = null;
    try {
      const [cdec, maps] = await Promise.all([
        fetchCdecData(),
        fetchMaps(supabase),
      ]);
      records = cdec;
      vmaMaps = maps;
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load data";
      console.error("[VwaiDashboard]", err);
    } finally {
      loading = false;
    }
  }

  // ── Event handlers ────────────────────────────────────────────────
  function handleFiltersChange(e: CustomEvent<{ filters: FilterState }>) {
    filters = e.detail.filters;
  }

  function handleConfigChange(e: CustomEvent<{ config: VwaiConfig }>) {
    config = e.detail.config;
  }

  function handleSelectRecord(e: CustomEvent<{ record: CdecRecord | null }>) {
    selectedRecord = e.detail.record;
    if (selectedRecord?.lat !== null && selectedRecord?.lng !== null) {
      const currentZoom = get(mapStore).zoom;
      mapStore.setView({
        lat: selectedRecord!.lat!,
        lng: selectedRecord!.lng!,
        zoom: Math.max(currentZoom, 12),
      });
    }
  }

  function handleCdecSelect(e: CustomEvent<{ record: CdecRecord | null }>) {
    selectedRecord = e.detail.record;
  }

  function handleZoomToRecord(e: CustomEvent<{ record: CdecRecord }>) {
    const r = e.detail.record;
    if (r.lat !== null && r.lng !== null) mapStore.setView({ lat: r.lat, lng: r.lng, zoom: 14 });
  }

  // ── Pending-dual: load map in overlay first, then switch ─────────
  // Selecting a map while in dual mode (or clicking Side-by-Side while a map
  // is loading) forces a temporary switch to overlay so HistoricalOverlay can
  // load the tiles. Once loadend fires we flip to dual automatically.
  let pendingDual = false;

  function handleSelectMap(e: CustomEvent<{ mapId: string }>) {
    const mapId = e.detail.mapId || null;
    if (viewMode === "dual") {
      // Switch to overlay so HistoricalOverlay handles loading/clearing cleanly.
      layerStore.setViewMode("overlay");
      if (mapId) pendingDual = true;
    }
    mapStore.setActiveMap(mapId);
  }

  function handleViewModeChange(e: CustomEvent<{ mode: ViewMode }>) {
    const mode = e.detail.mode as ViewMode;
    if (mode === "dual" && selectedMapId && overlayLoading) {
      // Map is still loading in overlay — auto-switch when loadend fires.
      pendingDual = true;
    } else {
      pendingDual = false;
      layerStore.setViewMode(mode);
    }
  }

  function handleOpacityChange(e: CustomEvent<{ value: number }>) {
    layerStore.setOverlayOpacity(e.detail.value);
  }

  function toggleBasemap() {
    layerStore.setBasemap($layerStore.basemap === "g-streets" ? "g-satellite" : "g-streets");
  }

  // ── Responsive ───────────────────────────────────────────────────
  let isMobile = false;
  let sidebarOpen = true;       // mobile slide-in
  let sidebarCollapsed = false; // desktop collapse
  let cleanup: (() => void) | null = null;

  onMount(() => {
    loadData();
    const mq = window.matchMedia("(max-width: 900px)");
    const update = () => { isMobile = mq.matches; if (isMobile) sidebarOpen = false; };
    update();
    mq.addEventListener("change", update);
    cleanup = () => mq.removeEventListener("change", update);
  });

  onDestroy(() => cleanup?.());
</script>

<div class="vwai-dashboard" class:mobile={isMobile} class:sidebar-collapsed={!isMobile && sidebarCollapsed}>

  <!-- Sidebar -->
  <div class="sidebar" class:open={isMobile ? sidebarOpen : !sidebarCollapsed} class:mobile={isMobile} class:collapsed={!isMobile && sidebarCollapsed}>
    <CdecPanel
      {records}
      {filteredRecords}
      {filters}
      {config}
      {selectedRecord}
      {loading}
      {error}
      {vmaMaps}
      {selectedMapId}
      viewMode={pendingDual ? "dual" : viewMode}
      {overlayOpacity}
      on:filtersChange={handleFiltersChange}
      on:configChange={handleConfigChange}
      on:selectRecord={handleSelectRecord}
      on:zoomToRecord={handleZoomToRecord}
      on:selectMap={handleSelectMap}
      on:viewModeChange={handleViewModeChange}
      on:opacityChange={handleOpacityChange}
    />
  </div>

  <!-- Desktop collapse tab -->
  {#if !isMobile}
    <button
      class="sidebar-tab"
      class:collapsed={sidebarCollapsed}
      on:click={() => (sidebarCollapsed = !sidebarCollapsed)}
      title={sidebarCollapsed ? "Expand panel" : "Collapse panel"}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        {#if sidebarCollapsed}
          <path d="M9 18l6-6-6-6"/>
        {:else}
          <path d="M15 18l-6-6 6-6"/>
        {/if}
      </svg>
    </button>
  {/if}

  {#if isMobile && sidebarOpen}
    <div class="mobile-backdrop" role="presentation" on:click={() => (sidebarOpen = false)}></div>
  {/if}

  <!-- Map area -->
  <div class="map-area">
    <!-- Dual layout wrapper -->
    <div class="map-stage" class:dual={viewMode === "dual"}>

      <!-- Primary pane -->
      <div class="primary-pane">
        <MapShell {mapStore} {layerStore} bind:map={shellMap}>
          {#if viewMode !== "dual"}
            <HistoricalOverlay
              on:loadstart={() => { overlayLoading = true; overlayError = null; }}
              on:loadend={() => {
                overlayLoading = false;
                if (pendingDual && selectedMapId) {
                  pendingDual = false;
                  layerStore.setViewMode("dual");
                }
              }}
              on:loaderror={(e) => { overlayLoading = false; overlayError = e.detail.message; }}
            />
          {/if}
          <CdecLayer
            records={filteredRecords}
            selectedId={selectedRecord?.id ?? null}
            colorColumn={config.colorColumn}
            iconColumn={config.iconColumn}
            on:select={handleCdecSelect}
          />

          <!-- Selected record popup -->
          {#if selectedRecord && selectedRecord.lat !== null}
            <div class="map-popup" style="pointer-events:auto">
              <div class="popup-id">{selectedRecord.id}</div>
              {#if selectedRecord.personName}<div class="popup-name">{selectedRecord.personName}</div>{/if}
              <div class="popup-loc">{[selectedRecord.province, selectedRecord.district].filter(Boolean).join(", ")}</div>
              <button class="popup-close" on:click={() => (selectedRecord = null)}>✕</button>
            </div>
          {/if}

          {#if overlayLoading}
            <div class="overlay-loading">
              <div class="loading-spinner"></div>
              <span>Loading overlay…</span>
            </div>
          {/if}
          {#if overlayError}
            <div class="overlay-error">
              {overlayError}
              <button class="overlay-error-close" on:click={() => (overlayError = null)}>✕</button>
            </div>
          {/if}
        </MapShell>
      </div>

      <!-- Secondary pane (dual mode) -->
      {#if viewMode === "dual"}
        <div class="dual-divider"></div>
        <div class="secondary-pane">
          {#if shellMap}
            <DualMapPane
              primaryMap={shellMap}
              showOverlay={true}
              overlayOpacity={overlayOpacity}
              activeMapId={selectedMapId}
              bind:map={dualMap}
            />
            {#if dualMap}
              <CdecLayer
                olMap={dualMap}
                records={filteredRecords}
                selectedId={selectedRecord?.id ?? null}
                colorColumn={config.colorColumn}
                iconColumn={config.iconColumn}
                on:select={handleCdecSelect}
              />
            {/if}
          {/if}
        </div>
      {/if}

    </div><!-- end map-stage -->

    <!-- Top-left controls -->
    <div class="map-controls-tl">
      {#if isMobile && !sidebarOpen}
        <button class="ctrl-btn" on:click={() => (sidebarOpen = !sidebarOpen)} title="Toggle panel">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M3 12h18M3 18h18"/>
          </svg>
        </button>
      {/if}
    </div>

    <!-- Bottom-right controls -->
    <div class="map-controls-br">
      <button class="ctrl-btn" on:click={toggleBasemap} title="Toggle basemap">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          {#if $layerStore.basemap === "g-streets"}
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
          {:else}
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
          {/if}
        </svg>
      </button>
    </div>


  </div><!-- end map-area -->
</div>

<style>
  .vwai-dashboard {
    position: relative;
    width: 100%;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    background: var(--color-bg);
    display: grid;
    grid-template-columns: 320px minmax(0, 1fr);
    grid-template-rows: 100vh;
    grid-template-rows: 100dvh;
  }

  .vwai-dashboard.mobile {
    grid-template-columns: minmax(0, 1fr);
  }

  .vwai-dashboard.sidebar-collapsed {
    grid-template-columns: 0 minmax(0, 1fr);
  }

  /* ── Sidebar ────────────────────────────────────── */
  .sidebar {
    border-right: var(--border-thick);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-bg);
    transition: border-color 0.15s;
  }

  .sidebar.collapsed {
    border-right-color: transparent;
  }

  .sidebar.mobile {
    position: absolute;
    top: 0; bottom: 0; left: 0;
    width: 320px;
    z-index: 200;
    transform: translateX(-100%);
    transition: transform 0.2s ease;
    box-shadow: var(--shadow-solid-hover);
  }

  .sidebar.mobile.open { transform: translateX(0); }

  /* ── Desktop collapse tab ───────────────────────── */
  .sidebar-tab {
    position: absolute;
    top: 3.5rem;
    left: 320px;
    width: 14px; height: 44px;
    background: var(--color-white);
    border: var(--border-thick);
    border-left: none;
    border-radius: 0 6px 6px 0;
    cursor: pointer;
    z-index: 100;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 3px 0 6px rgba(0,0,0,0.07);
    padding: 0;
    color: var(--color-gray-500);
    transition: left 0.18s ease, background 0.1s;
  }
  .sidebar-tab:hover { background: var(--color-gray-100); color: var(--color-text); }
  .sidebar-tab.collapsed { left: 0; border-radius: 0 6px 6px 0; }

  .mobile-backdrop {
    position: absolute; inset: 0;
    background: rgba(0,0,0,0.4); z-index: 150;
    backdrop-filter: blur(2px);
  }

  /* ── Map area ───────────────────────────────────── */
  .map-area { position: relative; overflow: hidden; }

  /* ── Dual map stage ─────────────────────────────── */
  .map-stage {
    position: absolute; inset: 0;
    display: flex; flex-direction: row;
  }

  .primary-pane { flex: 1; position: relative; min-width: 0; }
  .dual-divider { width: 4px; background: var(--color-border); flex-shrink: 0; }
  .secondary-pane { flex: 1; position: relative; min-width: 0; }

  @media (max-width: 900px) {
    .map-stage.dual { flex-direction: column; }
    .dual-divider { width: auto; height: 4px; }
  }

  /* ── Controls ───────────────────────────────────── */
  .map-controls-tl {
    position: absolute; top: 1rem; left: 1rem; z-index: 50;
    display: flex; flex-direction: column; gap: 0.5rem;
  }

  .map-controls-br {
    position: absolute;
    bottom: calc(env(safe-area-inset-bottom) + 1.5rem);
    right: calc(env(safe-area-inset-right) + 1.5rem);
    z-index: 50;
    display: flex; flex-direction: column; gap: 0.75rem;
  }

  .ctrl-btn {
    display: flex; align-items: center; justify-content: center;
    width: 42px; height: 42px; border-radius: 50%;
    border: var(--border-thick); background: var(--color-white);
    color: var(--color-text); cursor: pointer;
    box-shadow: var(--shadow-solid-sm); transition: all 0.1s;
  }
  .ctrl-btn:hover { background: var(--color-yellow); transform: translate(-2px, -2px); box-shadow: var(--shadow-solid); }


  /* ── Map popup ──────────────────────────────────── */
  .map-popup {
    position: absolute; top: 1rem; left: 50%; transform: translateX(-50%);
    background: var(--color-white); border: var(--border-thick);
    border-radius: var(--radius-md); padding: 0.6rem 2.5rem 0.6rem 1rem;
    box-shadow: var(--shadow-solid); z-index: 60;
    min-width: 180px; max-width: 300px; pointer-events: auto;
  }
  .popup-id { font-family: monospace; font-size: 0.68rem; font-weight: var(--font-bold); letter-spacing: 0.04em; color: var(--color-gray-500); }
  .popup-name { font-weight: var(--font-semibold); font-size: var(--text-sm); }
  .popup-loc { font-size: 0.72rem; color: var(--color-gray-500); }
  .popup-close { position: absolute; top: 0.45rem; right: 0.55rem; background: none; border: none; font-size: 0.75rem; cursor: pointer; color: var(--color-gray-500); }
  .popup-close:hover { color: var(--color-text); }

  /* ── Overlay states ─────────────────────────────── */
  .overlay-loading {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: var(--color-white); border: var(--border-thick); border-radius: var(--radius-md);
    padding: 1rem 1.5rem; display: flex; align-items: center; gap: 0.75rem;
    box-shadow: var(--shadow-solid); z-index: 60; pointer-events: none;
  }
  .loading-spinner {
    width: 20px; height: 20px; border: 3px solid var(--color-gray-300);
    border-top-color: var(--color-blue); border-radius: 50%;
    animation: spin 1s linear infinite; flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .overlay-error {
    position: absolute; top: 1rem; left: 50%; transform: translateX(-50%);
    background: var(--color-primary); color: white; padding: 0.45rem 2.5rem 0.45rem 0.9rem;
    border-radius: var(--radius-pill); font-size: var(--text-sm);
    box-shadow: var(--shadow-solid-sm); z-index: 70;
  }
  .overlay-error-close { position: absolute; right: 0.6rem; top: 50%; transform: translateY(-50%); background: none; border: none; color: white; cursor: pointer; font-size: 0.8rem; }
</style>
