<!--
  AnnotateMode.svelte — /annotate mode orchestrator.
  Free-form annotation builder. Uses StudioMap for drawing on the map.
  Annotations are drawn on the map and managed in the AnnotationsPanel.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { toLonLat } from "ol/proj";

  import type { ViewMode, MapListItem, SearchResult, AnnotationSummary, DrawingMode } from "$lib/viewer/types";
  import { createMapStore } from "$lib/stores/mapStore";
  import { createLayerStore } from "$lib/stores/layerStore";
  import { createAnnotationHistoryStore } from "$lib/map/stores/annotationHistory";
  import { createAnnotationStateStore } from "$lib/map/stores/annotationState";
  import { setAnnotationContext } from "$lib/map/context/annotationContext";
  import { getSupabaseContext } from "$lib/supabase/context";
  import { fetchMaps } from "$lib/supabase/maps";
  import { fetchAnnotationBounds } from "$lib/trip/mapBounds";
  import { boundsCenter, boundsZoom } from "$lib/ui/searchUtils";

  import StudioMap from "$lib/studio/StudioMap.svelte";
  import AnnotationsPanel from "./AnnotationsPanel.svelte";
  import MapSearchBar from "$lib/ui/MapSearchBar.svelte";

  const { supabase, session } = getSupabaseContext();

  // Annotation context — shared with StudioMap via Svelte context
  const annotationHistory = createAnnotationHistoryStore(100);
  const annotationState = createAnnotationStateStore();
  setAnnotationContext({ history: annotationHistory, state: annotationState });

  const mapStore = createMapStore();
  const layerStore = createLayerStore();

  // Reactive store reads
  $: selectedMapId = $mapStore.activeMapId ?? "";
  $: basemapSelection = $layerStore.basemap;
  $: sideRatio = $layerStore.sideRatio;
  $: viewMode = $layerStore.viewMode;
  $: opacity = $layerStore.overlayOpacity;
  $: lensRadius = $layerStore.lensRadius;

  // Derived from annotation context (single source of truth)
  $: annotations = $annotationState.list;
  $: selectedAnnotationId = $annotationState.selectedId;

  // Derived: selected map object
  $: selectedMap = selectedMapId
    ? (mapList.find((m) => m.id === selectedMapId) ?? null)
    : null;

  // State
  let mapList: MapListItem[] = [];
  let drawingMode: DrawingMode | null = null;
  let projectTitle = "";
  let projectDescription = "";
  let sidebarCollapsed = false;
  let isMobile = false;
  let isCompact = false;

  let responsiveCleanup: (() => void) | null = null;
  let keydownHandler: ((event: KeyboardEvent) => void) | null = null;
  let studioMapRef: StudioMap;
  let overlayLoading = false;
  let overlayError: string | null = null;
  let lensOverlayEl: HTMLDivElement;
  let toolbarEl: HTMLDivElement;
  let annotationsPanelRef: AnnotationsPanel;

  let showZoomPrompt = false;
  let loadingTimer: ReturnType<typeof setTimeout> | null = null;

  // View mode definitions
  const viewModes: { mode: ViewMode; label: string; title: string }[] = [
    { mode: "overlay", label: "Overlay", title: "Full overlay" },
    { mode: "side-x", label: "Side X", title: "Side by side (horizontal)" },
    { mode: "side-y", label: "Side Y", title: "Side by side (vertical)" },
    { mode: "spy", label: "Lens", title: "Spy glass" },
  ];

  function toggleBasemap() {
    const next = basemapSelection === "g-streets" ? "g-satellite" : "g-streets";
    layerStore.setBasemap(next);
    studioMapRef?.applyBasemap(next);
  }

  function handleOpacityInput(event: Event) {
    const val = parseFloat((event.target as HTMLInputElement).value);
    layerStore.setOverlayOpacity(val);
    studioMapRef?.setMapOpacity(val);
  }

  // ── Lens knob drag ──────────────────────────────────────────────
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

  async function loadData() {
    try {
      mapList = await fetchMaps(supabase);
    } catch (err) {
      console.error("[AnnotateMode] Failed to load maps:", err);
    }
  }

  function handleMapReady() {
    loadData();

    // Sync OL View → mapStore on pan/zoom/rotate
    const olMap = studioMapRef?.getMapInstance();
    if (!olMap) return;
    olMap.on("moveend", () => {
      const view = olMap.getView();
      const center = view.getCenter();
      if (!center) return;
      const [lng, lat] = toLonLat(center);
      const zoom = view.getZoom() ?? 14;
      const rotation = view.getRotation();
      mapStore.setView({ lng, lat, zoom, rotation });
    });
  }

  function handleStatusChange(event: CustomEvent<{ message: string; error: boolean }>) {
    if (event.detail.error) {
      overlayError = event.detail.message;
    }
  }

  function handleSearchNavigate(event: CustomEvent<{ result: SearchResult }>) {
    studioMapRef?.zoomToSearchResult(event.detail.result);
  }

  async function handleSelectMap(event: CustomEvent<{ map: MapListItem }>) {
    const id = event.detail.map.id;
    mapStore.setActiveMap(id);
    if (id) {
      overlayLoading = true;
      overlayError = null;
      try {
        await studioMapRef?.loadOverlaySource(id);
      } catch (err) {
        overlayError = "Failed to load map overlay.";
        console.error("[AnnotateMode] overlay load error:", err);
      } finally {
        overlayLoading = false;
      }
    } else {
      studioMapRef?.clearOverlay();
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
      const olMap = studioMapRef?.getMapInstance();
      if (olMap) {
        const { fromLonLat: proj } = await import("ol/proj");
        olMap.getView().animate({
          center: proj([center.lng, center.lat]),
          zoom,
          duration: 400,
        });
      }
    }
  }

  // Handle overlay loading state to potentially show zoom prompt
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

  function handleZoomToActiveMap() {
    if (selectedMap) {
      handleZoomToMap({ detail: { map: selectedMap } } as CustomEvent);
      showZoomPrompt = false;
    }
  }

  // ── Panel event handlers (delegate to StudioMap) ──────────────

  function handleSetDrawingMode(event: CustomEvent<{ mode: DrawingMode | null }>) {
    drawingMode = event.detail.mode;
    if (!drawingMode) studioMapRef?.deactivateDrawing();
  }

  function handleUpdateProject(event: CustomEvent<{ title?: string; description?: string }>) {
    if (event.detail.title !== undefined) projectTitle = event.detail.title;
    if (event.detail.description !== undefined) projectDescription = event.detail.description;
  }

  function handleAnnotationRename(event: CustomEvent<{ id: string; label: string }>) {
    studioMapRef?.updateAnnotationLabel(event.detail.id, event.detail.label);
  }

  function handleAnnotationUpdateDetails(event: CustomEvent<{ id: string; details: string }>) {
    studioMapRef?.updateAnnotationDetails(event.detail.id, event.detail.details);
  }

  function handleAnnotationChangeColor(event: CustomEvent<{ id: string; color: string }>) {
    studioMapRef?.updateAnnotationColor(event.detail.id, event.detail.color);
  }

  function handleAnnotationToggleVisibility(event: CustomEvent<{ id: string }>) {
    studioMapRef?.toggleAnnotationVisibility(event.detail.id);
  }

  function handleAnnotationSelect(event: CustomEvent<{ id: string | null }>) {
    annotationState.setSelected(event.detail.id);
  }

  function handleAnnotationDelete(event: CustomEvent<{ id: string }>) {
    studioMapRef?.deleteAnnotation(event.detail.id);
  }

  function handleAnnotationZoomTo(event: CustomEvent<{ id: string }>) {
    studioMapRef?.zoomToAnnotation(event.detail.id);
  }

  function handleAnnotationClear() {
    studioMapRef?.clearAnnotations();
    annotationsPanelRef?.setNotice("All annotations cleared.", "info");
  }

  function handleAnnotationExport() {
    studioMapRef?.exportAnnotationsAsGeoJSON();
    annotationsPanelRef?.setNotice("GeoJSON downloaded.", "success");
  }

  async function handleAnnotationImport(event: CustomEvent<{ file: File }>) {
    try {
      const text = await event.detail.file.text();
      const count = await studioMapRef?.importGeoJsonText(text);
      annotationsPanelRef?.setNotice(
        `Imported ${count ?? 0} feature${(count ?? 0) !== 1 ? "s" : ""}.`,
        "success",
      );
    } catch (e) {
      console.error("GeoJSON import failed", e);
      annotationsPanelRef?.setNotice("Failed to import GeoJSON file.", "error");
    }
  }

  function handleUndo() {
    studioMapRef?.undoLastAction();
  }

  function handleRedo() {
    studioMapRef?.redoLastAction();
  }

  $: canUndo = $annotationHistory.history.length > 0;
  $: canRedo = $annotationHistory.future.length > 0;

  onMount(() => {
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

    keydownHandler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA"].includes(target.tagName))
      )
        return;
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey && canUndo) {
        event.preventDefault();
        handleUndo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        if (canRedo) {
          event.preventDefault();
          handleRedo();
        }
      }
    };
    window.addEventListener("keydown", keydownHandler);
  });

  onDestroy(() => {
    responsiveCleanup?.();
    if (keydownHandler) {
      window.removeEventListener("keydown", keydownHandler);
      keydownHandler = null;
    }
  });
</script>

<div class="annotate-mode" class:mobile={isMobile}>
  <div
    class="workspace"
    class:with-sidebar={!sidebarCollapsed && !isMobile}
    class:compact={isCompact}
  >
    {#if !sidebarCollapsed && !isMobile}
      <AnnotationsPanel
        bind:this={annotationsPanelRef}
        {annotations}
        {selectedAnnotationId}
        {selectedMap}
        {drawingMode}
        {projectTitle}
        {projectDescription}
        collapsed={false}
        on:toggleCollapse={() => (sidebarCollapsed = true)}
        on:updateProject={handleUpdateProject}
        on:rename={handleAnnotationRename}
        on:changeColor={handleAnnotationChangeColor}
        on:updateDetails={handleAnnotationUpdateDetails}
        on:toggleVisibility={handleAnnotationToggleVisibility}
        on:select={handleAnnotationSelect}
        on:delete={handleAnnotationDelete}
        on:zoomTo={handleAnnotationZoomTo}
        on:setDrawingMode={handleSetDrawingMode}
        on:zoomToMap={handleZoomToMap}
        on:clear={handleAnnotationClear}
        on:exportGeoJSON={handleAnnotationExport}
        on:importFile={handleAnnotationImport}
      />
    {/if}

    <div class="map-stage">
      <StudioMap
        bind:this={studioMapRef}
        {basemapSelection}
        {viewMode}
        {sideRatio}
        {lensRadius}
        {opacity}
        {drawingMode}
        editingEnabled={true}
        on:mapReady={handleMapReady}
        on:statusChange={handleStatusChange}
      />

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

      <!-- Bottom-right: Basemap + Mobile menu -->
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

      <!-- FAT Map Toolbar -->
      <div class="map-toolbar" class:mobile={isMobile} bind:this={toolbarEl}>
        <!-- Standard row: View / Opacity -->
        <div class="toolbar-row">
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
              <span class="toolbar-slider-val"
                >{Math.round(opacity * 100)}%</span
              >
            </div>
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
        showAddAsPoint={false}
        on:navigate={handleSearchNavigate}
        on:selectMap={handleSelectMap}
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
      <AnnotationsPanel
        bind:this={annotationsPanelRef}
        {annotations}
        {selectedAnnotationId}
        {selectedMap}
        {drawingMode}
        {projectTitle}
        {projectDescription}
        collapsed={false}
        on:toggleCollapse={() => (sidebarCollapsed = true)}
        on:updateProject={handleUpdateProject}
        on:rename={handleAnnotationRename}
        on:changeColor={handleAnnotationChangeColor}
        on:updateDetails={handleAnnotationUpdateDetails}
        on:toggleVisibility={handleAnnotationToggleVisibility}
        on:select={handleAnnotationSelect}
        on:delete={handleAnnotationDelete}
        on:zoomTo={handleAnnotationZoomTo}
        on:setDrawingMode={handleSetDrawingMode}
        on:zoomToMap={handleZoomToMap}
        on:clear={handleAnnotationClear}
        on:exportGeoJSON={handleAnnotationExport}
        on:importFile={handleAnnotationImport}
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

  .annotate-mode {
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

  .annotate-mode.mobile .workspace {
    grid-template-columns: minmax(0, 1fr);
    padding: 0;
    gap: 0;
  }

  .annotate-mode.mobile .map-stage {
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
    bottom: calc(env(safe-area-inset-bottom) + 0.75rem);
    left: 50%;
    transform: translateX(-50%);
    z-index: 40;
    display: flex;
    flex-direction: column;
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
    min-width: 320px;
    max-width: calc(100vw - 7rem);
  }

  .map-toolbar.mobile {
    bottom: calc(env(safe-area-inset-bottom) + 0.5rem);
    padding: 0.35rem 0.5rem;
    max-width: calc(100vw - 5rem);
  }

  .toolbar-row {
    display: flex;
    align-items: center;
    gap: 0;
    width: 100%;
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
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
  }

  .tb:hover:not(:disabled) {
    background: rgba(212, 175, 55, 0.15);
    border-color: rgba(212, 175, 55, 0.6);
  }

  .tb.active {
    background: rgba(212, 175, 55, 0.3);
    border-color: #d4af37;
    color: #2b2520;
    font-weight: 700;
  }

  .tb:disabled {
    opacity: 0.35;
    cursor: default;
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

  /* ---------- Overlay Loading ---------- */
  .overlay-loading {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
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

  /* ---------- Overlay Error ---------- */
  .overlay-error {
    position: absolute;
    bottom: calc(env(safe-area-inset-bottom) + 4rem);
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
    .toolbar-row {
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .toolbar-group {
      padding: 0;
    }

    .toolbar-sep {
      display: none;
    }
  }
</style>
