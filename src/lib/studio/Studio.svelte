<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type Map from "ol/Map";

  import {
    APP_STATE_KEY,
    BASEMAP_DEFS,
    INITIAL_CENTER,
  } from "$lib/viewer/constants";
  import type {
    ViewMode,
    DrawingMode,
    MapListItem,
    AnnotationSummary,
    PersistedAppState,
    SearchResult,
  } from "$lib/viewer/types";
  import { getSupabaseContext } from "$lib/supabase/context";
  import { fetchMaps } from "$lib/supabase/maps";
  import { createAnnotationHistoryStore } from "$lib/map/stores/annotationHistory";
  import { createAnnotationStateStore } from "$lib/map/stores/annotationState";
  import { setAnnotationContext } from "$lib/map/context/annotationContext";
  import { fromLonLat, toLonLat } from "ol/proj";
  import { createMapStore } from "$lib/stores/mapStore";
  import { createLayerStore } from "$lib/stores/layerStore";
  import { initUrlSync } from "$lib/stores/urlStore";

  import StudioMap from "./StudioMap.svelte";
  import StudioToolbar from "./StudioToolbar.svelte";
  import ToolsPanel from "$lib/ui/ToolsPanel.svelte";
  import AnnotationsPanel from "$lib/annotate/AnnotationsPanel.svelte";
  import SearchPanel from "$lib/ui/SearchPanel.svelte";
  import MetadataDialog from "$lib/ui/MetadataDialog.svelte";
  import HuntCreator from "$lib/story/StoryCreator.svelte";
  import { createHuntLibraryStore } from "$lib/story/stores/storyStore";
  import type { TreasureHunt, HuntStop } from "$lib/story/types";
  import { SAIGON_WALK } from "$lib/story/mocks/saigon-walk";

  const HISTORY_LIMIT = 100;

  const { supabase, session } = getSupabaseContext();

  const annotationHistory = createAnnotationHistoryStore(HISTORY_LIMIT);
  const annotationState = createAnnotationStateStore();
  setAnnotationContext({ history: annotationHistory, state: annotationState });

  // Central stores — single source of truth for map + layer state
  const mapStore = createMapStore();
  const layerStore = createLayerStore();
  let urlTeardown: (() => void) | null = null;

  // Reactive aliases for the template (read from stores)
  $: selectedMapId = $mapStore.activeMapId ?? "";
  $: basemapSelection = $layerStore.basemap;
  $: viewMode = $layerStore.viewMode;
  $: sideRatio = $layerStore.sideRatio;
  $: lensRadius = $layerStore.lensRadius;
  $: opacity = $layerStore.overlayOpacity;

  let mapList: MapListItem[] = [];
  let drawingMode: DrawingMode | null = null;
  let editingEnabled = true;
  let searchOverlayOpen = false;
  let metadataOverlayOpen = false;
  let leftCollapsed = false;
  let rightCollapsed = false;
  let isMobile = false;
  let isCompact = false;
  let isNarrow = false;

  type StudioMode = "annotate" | "hunt";
  let studioMode: StudioMode = "annotate";
  let activeHuntId: string | null = null;
  let selectedStopId: string | null = null;
  let placingStop = false;
  const huntLibrary = createHuntLibraryStore(supabase, session?.user?.id);

  $: activeHunt = $huntLibrary.hunts.find((h) => h.id === activeHuntId) ?? null;

  $: userId = session?.user?.id ?? null;

  let statusMessage = "Select a map from the list.";
  let statusError = false;
  let stateLoaded = false;
  let stateSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let responsiveCleanup: (() => void) | null = null;
  let keydownHandler: ((event: KeyboardEvent) => void) | null = null;

  let studioMapRef: StudioMap;
  let annotationsPanelRef: AnnotationsPanel;

  $: canUndo = $annotationHistory.history.length > 0;
  $: canRedo = $annotationHistory.future.length > 0;
  $: annotations = $annotationState.list;
  $: selectedAnnotationId = $annotationState.selectedId;
  $: selectedMap = mapList.find((m) => m.id === selectedMapId) ?? null;

  $: if (!selectedMap) metadataOverlayOpen = false;

  $: workspaceStyle = !isMobile
    ? `grid-template-columns: ${panelColumnSize(leftCollapsed)} minmax(0, ${mapColumnFraction(leftCollapsed, rightCollapsed)}fr) ${panelColumnSize(rightCollapsed)}; gap: ${
        isNarrow ? "1rem" : isCompact ? "1.1rem" : "1.2rem"
      }; padding: ${isNarrow ? "1rem" : isCompact ? "1.2rem" : "1.4rem"};`
    : undefined;

  function panelColumnSize(collapsed: boolean): string {
    if (collapsed) return "0px";
    if (isNarrow) return "minmax(200px, 0.24fr)";
    if (isCompact) return "minmax(220px, 0.25fr)";
    return "minmax(260px, 0.25fr)";
  }

  function mapColumnFraction(leftC: boolean, rightC: boolean): string {
    const both = 1;
    const single = isNarrow ? 0.82 : isCompact ? 0.78 : 0.75;
    const open = isNarrow ? 0.56 : isCompact ? 0.53 : 0.5;
    if (leftC && rightC) return both.toString();
    if (leftC || rightC) return single.toString();
    return open.toString();
  }

  // --- Dataset loading ---

  async function loadDataset() {
    try {
      statusMessage = "Loading map list\u2026";
      statusError = false;
      const items = await fetchMaps(supabase);
      mapList = items;
      statusMessage = "Select a map from the list.";
    } catch (error) {
      statusMessage = `Failed to load map list: ${error instanceof Error ? error.message : "Unknown error"}`;
      statusError = true;
      mapList = [];
    }
  }

  // --- Persistence ---

  function saveAppState() {
    if (typeof window === "undefined" || !stateLoaded || !studioMapRef) return;
    const mapInstance = studioMapRef.getMapInstance();
    const view = mapInstance?.getView();
    const $ms = $mapStore;
    const $ls = $layerStore;
    const state: PersistedAppState = {
      basemapSelection: $ls.basemap,
      selectedMapId: $ms.activeMapId || undefined,
      overlayId: studioMapRef.getLoadedOverlayId() || undefined,
      view: { mode: $ls.viewMode, sideRatio: $ls.sideRatio, lensRadius: $ls.lensRadius, opacity: $ls.overlayOpacity },
    };
    if (view) {
      const center = view.getCenter();
      const zoom = view.getZoom();
      const rotation = view.getRotation();
      if (center && typeof zoom === "number" && typeof rotation === "number") {
        state.mapView = { center: center as [number, number], zoom, rotation };
      }
    }
    const geojson = studioMapRef.getAnnotationsGeoJSON();
    if (geojson)
      state.annotations = geojson as PersistedAppState["annotations"];
    try {
      window.localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Unable to save viewer state", e);
    }
  }

  function queueSaveState() {
    if (typeof window === "undefined" || !stateLoaded) return;
    if (stateSaveTimer) window.clearTimeout(stateSaveTimer);
    stateSaveTimer = window.setTimeout(saveAppState, 500);
  }

  async function loadAppState() {
    if (typeof window === "undefined") {
      stateLoaded = true;
      return;
    }
    const raw = window.localStorage.getItem(APP_STATE_KEY);
    if (!raw) {
      stateLoaded = true;
      return;
    }
    try {
      stateLoaded = false;
      const saved = JSON.parse(raw) as PersistedAppState;
      if (
        saved.basemapSelection &&
        BASEMAP_DEFS.some((b) => b.key === saved.basemapSelection)
      ) {
        layerStore.setBasemap(saved.basemapSelection);
      }
      if (saved.view) {
        if (saved.view.mode) layerStore.setViewMode(saved.view.mode);
        if (saved.view.sideRatio != null) layerStore.setSideRatio(saved.view.sideRatio);
        if (saved.view.lensRadius != null) layerStore.setLensRadius(saved.view.lensRadius);
        if (saved.view.opacity != null) layerStore.setOverlayOpacity(saved.view.opacity);
      }
      if (studioMapRef && saved.annotations) {
        studioMapRef.restoreAnnotations(saved.annotations);
      }
      const mapInstance = studioMapRef?.getMapInstance();
      const view = mapInstance?.getView();
      if (view && saved.mapView) {
        if (saved.mapView.center) view.setCenter(saved.mapView.center);
        if (typeof saved.mapView.zoom === "number")
          view.setZoom(saved.mapView.zoom);
        if (typeof saved.mapView.rotation === "number")
          view.setRotation(saved.mapView.rotation);
      }
      const overlayId = saved.overlayId ?? saved.selectedMapId;
      if (overlayId && mapList.some((item) => item.id === overlayId)) {
        mapStore.setActiveMap(overlayId);
        await studioMapRef?.loadOverlaySource(overlayId);
      } else if (
        saved.selectedMapId &&
        mapList.some((item) => item.id === saved.selectedMapId)
      ) {
        mapStore.setActiveMap(saved.selectedMapId);
      }
      studioMapRef?.refreshDecorations();
    } catch (e) {
      console.warn("Failed to load saved viewer state", e);
    } finally {
      stateLoaded = true;
      studioMapRef?.scheduleMapResize();
    }
  }

  function clearSavedState() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(APP_STATE_KEY);
    } catch {
      /* no-op */
    }
    window.location.reload();
  }

  // --- Event handlers from child components ---

  let suppressViewSync = false;

  function handleMapReady() {
    loadDataset()
      .then(() => loadAppState())
      .then(() => {
        // Sync OL View → mapStore on every pan/zoom/rotate
        const olMap = studioMapRef?.getMapInstance();
        if (!olMap) return;

        olMap.on("moveend", () => {
          if (suppressViewSync) return;
          const view = olMap.getView();
          const center = view.getCenter();
          if (!center) return;
          const [lng, lat] = toLonLat(center);
          const zoom = view.getZoom() ?? 14;
          const rotation = view.getRotation();
          suppressViewSync = true;
          mapStore.setView({ lng, lat, zoom, rotation });
          requestAnimationFrame(() => { suppressViewSync = false; });
        });
      })
      .catch((e) => {
        console.error("Failed to initialise dataset", e);
        stateLoaded = true;
      });
  }

  function handleStatusChange(
    event: CustomEvent<{ message: string; error: boolean }>,
  ) {
    statusMessage = event.detail.message;
    statusError = event.detail.error;
  }

  async function handleSelectMap(event: CustomEvent<{ id: string }>) {
    const id = event.detail.id?.trim() ?? "";
    mapStore.setActiveMap(id || null);
    if (id) {
      await studioMapRef.loadOverlaySource(id);
    } else {
      studioMapRef.clearOverlay();
    }
    queueSaveState();
  }

  function handleChangeBasemap(event: CustomEvent<{ key: string }>) {
    layerStore.setBasemap(event.detail.key);
    studioMapRef?.applyBasemap(event.detail.key);
    queueSaveState();
  }

  function handleChangeViewMode(event: CustomEvent<{ mode: ViewMode }>) {
    layerStore.setViewMode(event.detail.mode);
    studioMapRef?.setViewMode(event.detail.mode);
    queueSaveState();
    studioMapRef?.scheduleMapResize();
  }

  function handleChangeOpacity(event: CustomEvent<{ value: number }>) {
    layerStore.setOverlayOpacity(event.detail.value);
    studioMapRef?.setMapOpacity(event.detail.value);
    queueSaveState();
  }

  function handleSetDrawingMode(
    event: CustomEvent<{ mode: DrawingMode | null }>,
  ) {
    drawingMode = event.detail.mode;
    if (!drawingMode) studioMapRef?.deactivateDrawing();
  }

  function handleUndo() {
    studioMapRef?.undoLastAction();
    annotationsPanelRef?.setNotice("Undid last action.", "info");
    queueSaveState();
  }

  function handleRedo() {
    studioMapRef?.redoLastAction();
    annotationsPanelRef?.setNotice("Redid last action.", "info");
    queueSaveState();
  }

  // Annotation panel handlers
  function handleAnnotationSelect(event: CustomEvent<{ id: string | null }>) {
    annotationState.setSelected(event.detail.id);
  }

  function handleAnnotationRename(
    event: CustomEvent<{ id: string; label: string }>,
  ) {
    studioMapRef?.updateAnnotationLabel(event.detail.id, event.detail.label);
    queueSaveState();
  }

  function handleAnnotationChangeColor(
    event: CustomEvent<{ id: string; color: string }>,
  ) {
    studioMapRef?.updateAnnotationColor(event.detail.id, event.detail.color);
    queueSaveState();
  }

  function handleAnnotationUpdateDetails(
    event: CustomEvent<{ id: string; details: string }>,
  ) {
    studioMapRef?.updateAnnotationDetails(
      event.detail.id,
      event.detail.details,
    );
    queueSaveState();
  }

  function handleAnnotationToggleVisibility(
    event: CustomEvent<{ id: string }>,
  ) {
    studioMapRef?.toggleAnnotationVisibility(event.detail.id);
    queueSaveState();
  }

  function handleAnnotationDelete(event: CustomEvent<{ id: string }>) {
    studioMapRef?.deleteAnnotation(event.detail.id);
    queueSaveState();
  }

  function handleAnnotationZoomTo(event: CustomEvent<{ id: string }>) {
    studioMapRef?.zoomToAnnotation(event.detail.id);
  }

  function handleAnnotationClear() {
    studioMapRef?.clearAnnotations();
    annotationsPanelRef?.setNotice("All annotations cleared.", "info");
    queueSaveState();
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
      queueSaveState();
    } catch (e) {
      console.error("GeoJSON import failed", e);
      annotationsPanelRef?.setNotice("Failed to import GeoJSON file.", "error");
    }
  }

  // Search handlers
  function handleSearchNavigate(event: CustomEvent<{ result: SearchResult }>) {
    studioMapRef?.zoomToSearchResult(event.detail.result);
  }

  function handleSearchAddToAnnotations(
    event: CustomEvent<{ result: SearchResult }>,
  ) {
    studioMapRef?.addSearchResultToAnnotations(event.detail.result);
    studioMapRef?.clearSearchLayer();
    annotationsPanelRef?.setNotice("Annotation added from search.", "success");
    queueSaveState();
  }

  function handleSearchLocate() {
    studioMapRef?.locateUser();
  }

  // --- Hunt mode handlers ---

  function handleToggleHuntMode() {
    if (studioMode === "hunt") {
      studioMode = "annotate";
      placingStop = false;
      studioMapRef?.clearHuntStops();
      activeHuntId = null;
      selectedStopId = null;
    } else {
      studioMode = "hunt";
      drawingMode = null;
      studioMapRef?.deactivateDrawing();
      if (!activeHuntId) {
        // If Saigon walk exists, load it; otherwise create a new empty hunt
        const existing = $huntLibrary.hunts.find(
          (h) => h.id === SAIGON_WALK.id,
        );
        if (existing) {
          activeHuntId = existing.id;
        } else if ($huntLibrary.hunts.length > 0) {
          activeHuntId = $huntLibrary.hunts[0].id;
        } else {
          // Seed the Saigon walk
          huntLibrary.update((lib) => ({ hunts: [...lib.hunts, SAIGON_WALK] }));
          activeHuntId = SAIGON_WALK.id;
        }
      }
      refreshHuntStopsOnMap();
    }
  }

  function handleCloseHuntMode() {
    studioMode = "annotate";
    placingStop = false;
    studioMapRef?.clearHuntStops();
    activeHuntId = null;
    selectedStopId = null;
  }

  function refreshHuntStopsOnMap() {
    if (!studioMapRef || !activeHunt) return;
    studioMapRef.setHuntStops(activeHunt.stops);
  }

  function handleMapClick(
    event: CustomEvent<{ coordinate: [number, number] }>,
  ) {
    if (studioMode !== "hunt" || !placingStop || !activeHuntId) return;
    huntLibrary.addStop(activeHuntId, event.detail.coordinate);
    // Reactive update will trigger refreshHuntStopsOnMap via $: block below
  }

  function handleHuntUpdateHunt(
    event: CustomEvent<{ title?: string; description?: string }>,
  ) {
    if (!activeHuntId) return;
    huntLibrary.updateHunt(activeHuntId, event.detail);
  }

  function handleHuntUpdateStop(
    event: CustomEvent<{ stopId: string; updates: Partial<HuntStop> }>,
  ) {
    if (!activeHuntId) return;
    huntLibrary.updateStop(
      activeHuntId,
      event.detail.stopId,
      event.detail.updates,
    );
  }

  function handleHuntRemoveStop(event: CustomEvent<{ stopId: string }>) {
    if (!activeHuntId) return;
    huntLibrary.removeStop(activeHuntId, event.detail.stopId);
    if (selectedStopId === event.detail.stopId) selectedStopId = null;
  }

  function handleHuntSelectStop(event: CustomEvent<{ stopId: string | null }>) {
    selectedStopId = event.detail.stopId;
    if (event.detail.stopId) {
      studioMapRef?.updateHuntStopState(event.detail.stopId, { active: true });
    }
    // Deactivate other stops
    if (activeHunt) {
      activeHunt.stops.forEach((s) => {
        if (s.id !== event.detail.stopId) {
          studioMapRef?.updateHuntStopState(s.id, { active: false });
        }
      });
    }
  }

  function handleHuntZoomToStop(event: CustomEvent<{ stopId: string }>) {
    studioMapRef?.zoomToHuntStop(event.detail.stopId);
  }

  function handleHuntZoomToAll() {
    studioMapRef?.zoomToHuntStops();
  }

  function handleHuntTogglePlacing() {
    placingStop = !placingStop;
    if (placingStop) {
      drawingMode = null;
      studioMapRef?.deactivateDrawing();
    }
  }

  function handleHuntExport() {
    if (!activeHunt) return;
    const blob = new Blob([JSON.stringify(activeHunt, null, 2)], {
      type: "application/json;charset=utf-8;",
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hunt-${activeHunt.title.replace(/\s+/g, "-").toLowerCase()}-${stamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleHuntImport(event: CustomEvent<{ data: TreasureHunt }>) {
    const imported = event.detail.data;
    // Store it in the library
    huntLibrary.update((lib) => {
      const exists = lib.hunts.some((h) => h.id === imported.id);
      if (exists) {
        return {
          hunts: lib.hunts.map((h) => (h.id === imported.id ? imported : h)),
        };
      }
      return { hunts: [...lib.hunts, imported] };
    });
    activeHuntId = imported.id;
    refreshHuntStopsOnMap();
  }

  // Keep hunt stops in sync with store changes
  $: if (studioMode === "hunt" && activeHunt && studioMapRef) {
    studioMapRef.setHuntStops(activeHunt.stops);
  }

  // Reactive: resize map when panels collapse/expand
  $: if (studioMapRef) {
    leftCollapsed;
    rightCollapsed;
    isMobile;
    studioMapRef.scheduleMapResize();
  }

  // Reactive: save state on annotation changes
  $: if (stateLoaded && annotations) queueSaveState();

  onMount(() => {
    const mobileQuery = window.matchMedia("(max-width: 900px)");
    const compactQuery = window.matchMedia("(max-width: 1400px)");
    const narrowQuery = window.matchMedia("(max-width: 1180px)");
    const updateResponsive = () => {
      isMobile = mobileQuery.matches;
      isCompact = compactQuery.matches;
      isNarrow = narrowQuery.matches;
    };
    updateResponsive();
    mobileQuery.addEventListener("change", updateResponsive);
    compactQuery.addEventListener("change", updateResponsive);
    narrowQuery.addEventListener("change", updateResponsive);
    responsiveCleanup = () => {
      mobileQuery.removeEventListener("change", updateResponsive);
      compactQuery.removeEventListener("change", updateResponsive);
      narrowQuery.removeEventListener("change", updateResponsive);
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
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
      } else if (key === "y") {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", keydownHandler);

    // Check URL params for tool mode
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tool = params.get("tool");
      if (tool === "hunt") {
        handleToggleHuntMode();
      }
    }

    // Start URL ↔ store sync
    urlTeardown = initUrlSync({ mapStore, layerStore });
  });

  onDestroy(() => {
    urlTeardown?.();
    responsiveCleanup?.();
    if (keydownHandler) {
      window.removeEventListener("keydown", keydownHandler);
      keydownHandler = null;
    }
    if (stateSaveTimer) {
      window.clearTimeout(stateSaveTimer);
      stateSaveTimer = null;
    }
  });
</script>

<div class="studio" class:mobile={isMobile}>
  <div class="workspace" style={workspaceStyle}>
    {#if !isMobile}
      <ToolsPanel
        {mapList}
        {selectedMapId}
        {basemapSelection}
        {viewMode}
        {opacity}
        collapsed={leftCollapsed}
        on:selectMap={handleSelectMap}
        on:changeBasemap={handleChangeBasemap}
        on:changeViewMode={handleChangeViewMode}
        on:changeOpacity={handleChangeOpacity}
        on:toggleCollapse={() => (leftCollapsed = !leftCollapsed)}
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
        {editingEnabled}
        on:mapReady={handleMapReady}
        on:statusChange={handleStatusChange}
        on:mapClick={handleMapClick}
      />
    </div>

    {#if !isMobile}
      {#if studioMode === "hunt"}
        <HuntCreator
          hunt={activeHunt}
          {selectedStopId}
          {placingStop}
          on:updateHunt={handleHuntUpdateHunt}
          on:updateStop={handleHuntUpdateStop}
          on:removeStop={handleHuntRemoveStop}
          on:selectStop={handleHuntSelectStop}
          on:zoomToStop={handleHuntZoomToStop}
          on:zoomToAll={handleHuntZoomToAll}
          on:togglePlacing={handleHuntTogglePlacing}
          on:exportHunt={handleHuntExport}
          on:importHunt={handleHuntImport}
          on:close={handleCloseHuntMode}
        />
      {:else}
        <AnnotationsPanel
          bind:this={annotationsPanelRef}
          {annotations}
          {selectedAnnotationId}
          collapsed={rightCollapsed}
          on:select={handleAnnotationSelect}
          on:rename={handleAnnotationRename}
          on:changeColor={handleAnnotationChangeColor}
          on:updateDetails={handleAnnotationUpdateDetails}
          on:toggleVisibility={handleAnnotationToggleVisibility}
          on:delete={handleAnnotationDelete}
          on:zoomTo={handleAnnotationZoomTo}
          on:clear={handleAnnotationClear}
          on:exportGeoJSON={handleAnnotationExport}
          on:importFile={handleAnnotationImport}
          on:toggleCollapse={() => (rightCollapsed = !rightCollapsed)}
        />
      {/if}
    {/if}
  </div>

  <StudioToolbar
    {drawingMode}
    {canUndo}
    {canRedo}
    {studioMode}
    on:setDrawingMode={handleSetDrawingMode}
    on:undo={handleUndo}
    on:redo={handleRedo}
    on:openSearch={() => (searchOverlayOpen = true)}
    on:openMetadata={() => (metadataOverlayOpen = true)}
    on:clearState={clearSavedState}
    on:huntMode={handleToggleHuntMode}
  />

  <SearchPanel
    open={searchOverlayOpen}
    maps={[]}
    on:close={() => (searchOverlayOpen = false)}
    on:navigate={handleSearchNavigate}
    on:addToAnnotations={handleSearchAddToAnnotations}
  />

  <MetadataDialog
    open={metadataOverlayOpen}
    {selectedMap}
    on:close={() => (metadataOverlayOpen = false)}
  />
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

  .studio {
    position: relative;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, #f4e8d8 0%, #ebe0d0 50%, #e8d5ba 100%);
  }

  .workspace {
    flex: 1 1 auto;
    min-height: 0;
    position: relative;
    display: grid;
    grid-template-columns: minmax(260px, 0.25fr) minmax(0, 0.5fr) minmax(
        260px,
        0.25fr
      );
    grid-template-rows: minmax(0, 1fr);
    gap: 1.2rem;
    padding: 1.4rem;
    align-items: stretch;
    height: 100%;
  }

  .map-stage {
    position: relative;
    min-height: 0;
    height: 100%;
    min-width: 0;
    border-radius: 4px;
    overflow: visible;
    background: #2b2520;
    border: 2px solid #d4af37;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  }

  .studio.mobile .workspace {
    grid-template-columns: minmax(0, 1fr);
    padding: 0;
    gap: 0;
    padding-bottom: 90px;
  }

  .studio.mobile .map-stage {
    min-height: calc(100vh - 3rem);
    border-radius: 0;
    border: none;
  }
</style>
