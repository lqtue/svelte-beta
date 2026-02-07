<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type Map from 'ol/Map';

  import {
    DATASET_URL,
    APP_STATE_KEY,
    BASEMAP_DEFS,
    INITIAL_CENTER
  } from '$lib/viewer/constants';
  import type {
    ViewMode,
    DrawingMode,
    MapListItem,
    AnnotationSummary,
    PersistedAppState,
    SearchResult
  } from '$lib/viewer/types';
  import { createAnnotationHistoryStore } from '$lib/map/stores/annotationHistory';
  import { createAnnotationStateStore } from '$lib/map/stores/annotationState';
  import { setAnnotationContext } from '$lib/map/context/annotationContext';
  import { fromLonLat, toLonLat } from 'ol/proj';

  import StudioMap from './StudioMap.svelte';
  import StudioToolbar from './StudioToolbar.svelte';
  import ToolsPanel from './ToolsPanel.svelte';
  import AnnotationsPanel from './AnnotationsPanel.svelte';
  import SearchDialog from './SearchDialog.svelte';
  import MetadataDialog from './MetadataDialog.svelte';

  const HISTORY_LIMIT = 100;

  const annotationHistory = createAnnotationHistoryStore(HISTORY_LIMIT);
  const annotationState = createAnnotationStateStore();
  setAnnotationContext({ history: annotationHistory, state: annotationState });

  let mapList: MapListItem[] = [];
  let selectedMapId = '';
  let basemapSelection = 'g-streets';
  let viewMode: ViewMode = 'overlay';
  let sideRatio = 0.5;
  let lensRadius = 150;
  let opacity = 0.8;
  let drawingMode: DrawingMode | null = null;
  let editingEnabled = true;
  let searchOverlayOpen = false;
  let metadataOverlayOpen = false;
  let leftCollapsed = false;
  let rightCollapsed = false;
  let isMobile = false;
  let isCompact = false;
  let isNarrow = false;

  let statusMessage = 'Select a map from the list.';
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

  $: workspaceStyle =
    !isMobile
      ? `grid-template-columns: ${panelColumnSize(leftCollapsed)} minmax(0, ${mapColumnFraction(leftCollapsed, rightCollapsed)}fr) ${panelColumnSize(rightCollapsed)}; gap: ${
          isNarrow ? '1rem' : isCompact ? '1.1rem' : '1.2rem'
        }; padding: ${isNarrow ? '1rem' : isCompact ? '1.2rem' : '1.4rem'};`
      : undefined;

  function panelColumnSize(collapsed: boolean): string {
    if (collapsed) return '0px';
    if (isNarrow) return 'minmax(200px, 0.24fr)';
    if (isCompact) return 'minmax(220px, 0.25fr)';
    return 'minmax(260px, 0.25fr)';
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
      statusMessage = 'Loading map list\u2026';
      statusError = false;
      const response = await fetch(DATASET_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const lines = text.trim().split(/\r?\n/);
      if (!lines.length) throw new Error('No rows.');
      const header = (lines.shift() ?? '').split(',').map((h) => h.trim().toLowerCase());
      const nameIndex = header.indexOf('name');
      const idIndex = header.indexOf('id');
      const typeIndex = header.indexOf('type');
      const summaryIndex = header.indexOf('summary');
      const descriptionIndex =
        header.indexOf('description') !== -1 ? header.indexOf('description')
          : header.indexOf('details') !== -1 ? header.indexOf('details')
          : header.indexOf('detail');
      const thumbnailIndex =
        header.indexOf('thumbnail') !== -1 ? header.indexOf('thumbnail') : header.indexOf('image');
      const featuredIndex =
        header.indexOf('featured') !== -1 ? header.indexOf('featured') : header.indexOf('is_featured');
      if (nameIndex === -1 || idIndex === -1) throw new Error("Missing 'name' or 'id' column.");
      const items: MapListItem[] = lines
        .map((line) => line.match(/(".*?"|[^",\r\n]+)(?=\s*,|\s*$)/g) || [])
        .map((cols) => {
          const name = (cols[nameIndex] || '').replace(/"/g, '').trim();
          const id = (cols[idIndex] || '').replace(/"/g, '').trim();
          const type = typeIndex > -1 ? (cols[typeIndex] || '').replace(/"/g, '').trim() || 'Uncategorized' : 'Uncategorized';
          const summary = summaryIndex > -1 ? (cols[summaryIndex] || '').replace(/"/g, '').trim() : '';
          const description = descriptionIndex > -1 ? (cols[descriptionIndex] || '').replace(/"/g, '').trim() : '';
          const thumbnail = thumbnailIndex > -1 ? (cols[thumbnailIndex] || '').replace(/"/g, '').trim() : '';
          const featuredValue = featuredIndex > -1 ? (cols[featuredIndex] || '').replace(/"/g, '').trim() : '';
          const isFeatured = /^y(es)?$/i.test(featuredValue) || /^true$/i.test(featuredValue) || featuredValue === '1';
          if (!name || !id) return null;
          const entry: MapListItem = { id, name, type };
          if (summary) entry.summary = summary;
          if (description) entry.description = description;
          if (thumbnail) entry.thumbnail = thumbnail;
          if (isFeatured) entry.isFeatured = true;
          return entry;
        })
        .filter((item): item is MapListItem => !!item);
      mapList = items;
      statusMessage = 'Select a map from the list.';
    } catch (error) {
      statusMessage = `Failed to load map list: ${error instanceof Error ? error.message : 'Unknown error'}`;
      statusError = true;
      mapList = [];
    }
  }

  // --- Persistence ---

  function saveAppState() {
    if (typeof window === 'undefined' || !stateLoaded || !studioMapRef) return;
    const mapInstance = studioMapRef.getMapInstance();
    const view = mapInstance?.getView();
    const state: PersistedAppState = {
      basemapSelection,
      selectedMapId: selectedMapId || undefined,
      overlayId: studioMapRef.getLoadedOverlayId() || undefined,
      view: { mode: viewMode, sideRatio, lensRadius, opacity }
    };
    if (view) {
      const center = view.getCenter();
      const zoom = view.getZoom();
      const rotation = view.getRotation();
      if (center && typeof zoom === 'number' && typeof rotation === 'number') {
        state.mapView = { center: center as [number, number], zoom, rotation };
      }
    }
    const geojson = studioMapRef.getAnnotationsGeoJSON();
    if (geojson) state.annotations = geojson as PersistedAppState['annotations'];
    try { window.localStorage.setItem(APP_STATE_KEY, JSON.stringify(state)); } catch (e) { console.warn('Unable to save viewer state', e); }
  }

  function queueSaveState() {
    if (typeof window === 'undefined' || !stateLoaded) return;
    if (stateSaveTimer) window.clearTimeout(stateSaveTimer);
    stateSaveTimer = window.setTimeout(saveAppState, 500);
  }

  async function loadAppState() {
    if (typeof window === 'undefined') { stateLoaded = true; return; }
    const raw = window.localStorage.getItem(APP_STATE_KEY);
    if (!raw) { stateLoaded = true; return; }
    try {
      stateLoaded = false;
      const saved = JSON.parse(raw) as PersistedAppState;
      if (saved.basemapSelection && BASEMAP_DEFS.some((b) => b.key === saved.basemapSelection)) {
        basemapSelection = saved.basemapSelection;
      }
      if (saved.view) {
        viewMode = saved.view.mode ?? viewMode;
        sideRatio = saved.view.sideRatio ?? sideRatio;
        lensRadius = saved.view.lensRadius ?? lensRadius;
        opacity = saved.view.opacity ?? opacity;
      }
      if (studioMapRef && saved.annotations) {
        studioMapRef.restoreAnnotations(saved.annotations);
      }
      const mapInstance = studioMapRef?.getMapInstance();
      const view = mapInstance?.getView();
      if (view && saved.mapView) {
        if (saved.mapView.center) view.setCenter(saved.mapView.center);
        if (typeof saved.mapView.zoom === 'number') view.setZoom(saved.mapView.zoom);
        if (typeof saved.mapView.rotation === 'number') view.setRotation(saved.mapView.rotation);
      }
      const overlayId = saved.overlayId ?? saved.selectedMapId;
      if (overlayId && mapList.some((item) => item.id === overlayId)) {
        selectedMapId = overlayId;
        await studioMapRef?.loadOverlaySource(overlayId);
      } else if (saved.selectedMapId && mapList.some((item) => item.id === saved.selectedMapId)) {
        selectedMapId = saved.selectedMapId;
      }
      studioMapRef?.refreshDecorations();
    } catch (e) {
      console.warn('Failed to load saved viewer state', e);
    } finally {
      stateLoaded = true;
      studioMapRef?.scheduleMapResize();
    }
  }

  function clearSavedState() {
    if (typeof window === 'undefined') return;
    try { window.localStorage.removeItem(APP_STATE_KEY); } catch { /* no-op */ }
    window.location.reload();
  }

  // --- Event handlers from child components ---

  function handleMapReady() {
    loadDataset()
      .then(() => loadAppState())
      .catch((e) => { console.error('Failed to initialise dataset', e); stateLoaded = true; });
  }

  function handleStatusChange(event: CustomEvent<{ message: string; error: boolean }>) {
    statusMessage = event.detail.message;
    statusError = event.detail.error;
  }

  async function handleSelectMap(event: CustomEvent<{ id: string }>) {
    const id = event.detail.id?.trim() ?? '';
    selectedMapId = id;
    if (id) {
      await studioMapRef.loadOverlaySource(id);
    } else {
      studioMapRef.clearOverlay();
    }
    queueSaveState();
  }

  function handleChangeBasemap(event: CustomEvent<{ key: string }>) {
    basemapSelection = event.detail.key;
    studioMapRef?.applyBasemap(basemapSelection);
    queueSaveState();
  }

  function handleChangeViewMode(event: CustomEvent<{ mode: ViewMode }>) {
    viewMode = event.detail.mode;
    studioMapRef?.setViewMode(viewMode);
    queueSaveState();
    studioMapRef?.scheduleMapResize();
  }

  function handleChangeOpacity(event: CustomEvent<{ value: number }>) {
    opacity = event.detail.value;
    studioMapRef?.setMapOpacity(opacity);
    queueSaveState();
  }

  function handleSetDrawingMode(event: CustomEvent<{ mode: DrawingMode | null }>) {
    drawingMode = event.detail.mode;
    if (!drawingMode) studioMapRef?.deactivateDrawing();
  }

  function handleUndo() {
    studioMapRef?.undoLastAction();
    annotationsPanelRef?.setNotice('Undid last action.', 'info');
    queueSaveState();
  }

  function handleRedo() {
    studioMapRef?.redoLastAction();
    annotationsPanelRef?.setNotice('Redid last action.', 'info');
    queueSaveState();
  }

  // Annotation panel handlers
  function handleAnnotationSelect(event: CustomEvent<{ id: string }>) {
    annotationState.setSelected(event.detail.id);
  }

  function handleAnnotationRename(event: CustomEvent<{ id: string; label: string }>) {
    studioMapRef?.updateAnnotationLabel(event.detail.id, event.detail.label);
    queueSaveState();
  }

  function handleAnnotationChangeColor(event: CustomEvent<{ id: string; color: string }>) {
    studioMapRef?.updateAnnotationColor(event.detail.id, event.detail.color);
    queueSaveState();
  }

  function handleAnnotationUpdateDetails(event: CustomEvent<{ id: string; details: string }>) {
    studioMapRef?.updateAnnotationDetails(event.detail.id, event.detail.details);
    queueSaveState();
  }

  function handleAnnotationToggleVisibility(event: CustomEvent<{ id: string }>) {
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
    annotationsPanelRef?.setNotice('All annotations cleared.', 'info');
    queueSaveState();
  }

  function handleAnnotationExport() {
    studioMapRef?.exportAnnotationsAsGeoJSON();
    annotationsPanelRef?.setNotice('GeoJSON downloaded.', 'success');
  }

  async function handleAnnotationImport(event: CustomEvent<{ file: File }>) {
    try {
      const text = await event.detail.file.text();
      const count = await studioMapRef?.importGeoJsonText(text);
      annotationsPanelRef?.setNotice(`Imported ${count ?? 0} feature${(count ?? 0) !== 1 ? 's' : ''}.`, 'success');
      queueSaveState();
    } catch (e) {
      console.error('GeoJSON import failed', e);
      annotationsPanelRef?.setNotice('Failed to import GeoJSON file.', 'error');
    }
  }

  // Search handlers
  function handleSearchNavigate(event: CustomEvent<{ result: SearchResult }>) {
    studioMapRef?.zoomToSearchResult(event.detail.result);
  }

  function handleSearchAddToAnnotations(event: CustomEvent<{ result: SearchResult }>) {
    studioMapRef?.addSearchResultToAnnotations(event.detail.result);
    studioMapRef?.clearSearchLayer();
    annotationsPanelRef?.setNotice('Annotation added from search.', 'success');
    queueSaveState();
  }

  function handleSearchLocate() {
    studioMapRef?.locateUser();
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
    const mobileQuery = window.matchMedia('(max-width: 900px)');
    const compactQuery = window.matchMedia('(max-width: 1400px)');
    const narrowQuery = window.matchMedia('(max-width: 1180px)');
    const updateResponsive = () => {
      isMobile = mobileQuery.matches;
      isCompact = compactQuery.matches;
      isNarrow = narrowQuery.matches;
    };
    updateResponsive();
    mobileQuery.addEventListener('change', updateResponsive);
    compactQuery.addEventListener('change', updateResponsive);
    narrowQuery.addEventListener('change', updateResponsive);
    responsiveCleanup = () => {
      mobileQuery.removeEventListener('change', updateResponsive);
      compactQuery.removeEventListener('change', updateResponsive);
      narrowQuery.removeEventListener('change', updateResponsive);
    };

    keydownHandler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName))) return;
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
      } else if (key === 'y') {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', keydownHandler);
  });

  onDestroy(() => {
    responsiveCleanup?.();
    if (keydownHandler) {
      window.removeEventListener('keydown', keydownHandler);
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
      />
    </div>

    {#if !isMobile}
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
  </div>

  <StudioToolbar
    {drawingMode}
    {canUndo}
    {canRedo}
    on:setDrawingMode={handleSetDrawingMode}
    on:undo={handleUndo}
    on:redo={handleRedo}
    on:openSearch={() => (searchOverlayOpen = true)}
    on:openMetadata={() => (metadataOverlayOpen = true)}
    on:clearState={clearSavedState}
  />

  <SearchDialog
    open={searchOverlayOpen}
    on:close={() => (searchOverlayOpen = false)}
    on:navigate={handleSearchNavigate}
    on:addToAnnotations={handleSearchAddToAnnotations}
    on:locate={handleSearchLocate}
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
    font-family: 'Be Vietnam Pro', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
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
    grid-template-columns: minmax(260px, 0.25fr) minmax(0, 0.5fr) minmax(260px, 0.25fr);
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
