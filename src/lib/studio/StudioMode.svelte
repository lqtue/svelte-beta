<!--
  StudioMode.svelte — /studio plugin on MapWorkspace.

  Desktop two-sidebar layout (mirrors /create):
    • Left sidebar  — Layers · Controls · Browse (MapViewerSidebar, shared)
    • Right sidebar — Project header · Annotations · Inspector (StudioRightPane)

  Mobile is intentionally unsupported here — the library view still works on
  mobile (read-only project list), but the editor itself is desktop-only.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { toLonLat } from 'ol/proj';
  import '$styles/layouts/create-mode.css';

  import type { MapListItem, SearchResult, AnnotationSet, DrawingMode } from '$lib/map/types';
  import { createGeoMapStores } from '$lib/shell/geoMapSetup';
  import { createAnnotationHistoryStore } from '$lib/map/annotationHistory';
  import { createAnnotationStateStore } from '$lib/map/annotationState';
  import { setAnnotationContext } from '$lib/map/annotationContext';
  import { getSupabaseContext } from '$lib/supabase/context';
  import { createMapPickHandlers } from '$lib/story/mapPickHandlers';
  import { createAnnotationProjectStore } from './stores/annotationProjectStore';
  import { createTimelineStore } from './animation/timelineStore';
  import { playTimeline, applyKeyframeInstant, type PlaybackHandle } from './animation/playback';

  import MapWorkspace from '$lib/shell/MapWorkspace.svelte';
  import DrawTool from '$lib/shell/DrawTool.svelte';
  import MapViewerSidebar from '$lib/ui/catalog/MapViewerSidebar.svelte';
  import StudioRightPane from './StudioRightPane.svelte';
  import StudioOverpassDialog from './StudioOverpassDialog.svelte';
  import BboxSelector from './BboxSelector.svelte';
  import OverpassPreviewLayer from './OverpassPreviewLayer.svelte';
  import type { FeatureCollection } from 'geojson';
  import {
    buildQuery,
    fetchOverpass,
    overpassToGeoJson,
    type Bbox4,
    type OverpassPreset,
  } from './overpass';
  import AuthGate from '$lib/ui/AuthGate.svelte';
  import LibraryGrid from '$lib/ui/LibraryGrid.svelte';

  const { supabase, session } = getSupabaseContext();
  const userId = session?.user?.id;

  // Annotation context — shared with DrawTool via Svelte context
  const annotationHistory = createAnnotationHistoryStore(100);
  const annotationState = createAnnotationStateStore();
  setAnnotationContext({ history: annotationHistory, state: annotationState });

  const { mapStore, layerStore } = createGeoMapStores();
  const projectStore = createAnnotationProjectStore(supabase, userId);
  const timelineStore = createTimelineStore();

  // Derived from annotation context (single source of truth)
  $: annotations = $annotationState.list;
  $: selectedAnnotationId = $annotationState.selectedId;

  // Only show projects owned by the current user
  $: myProjects = $projectStore.projects.filter((p) => p.authorId === userId);

  // Bound from MapWorkspace
  let mapList: MapListItem[] = [];
  let selectedMap: MapListItem | null = null;
  let shellMap: import('ol/Map').default | null = null;
  let sidebarCollapsed = false;
  let rightSidebarCollapsed = false;

  // Studio-specific state
  let drawingMode: DrawingMode | null = null;
  let drawToolRef: DrawTool;
  let notice: { text: string; tone: 'info' | 'error' | 'success' } | null = null;
  let keydownHandler: ((event: KeyboardEvent) => void) | null = null;

  // Library/Editor view state
  let activeView: 'library' | 'editor' = 'library';
  let projectsLoading = true;
  let currentProject: AnnotationSet | null = null;
  let isSaving = false;
  let saveSuccess = false;

  // Overpass dialog state
  let overpassOpen = false;
  let overpassBbox: Bbox4 | null = null;
  let overpassFetching = false;
  let overpassError: string | null = null;
  // Bbox-on-map picker state
  let bboxPickerActive = false;
  let pickerBbox: Bbox4 | null = null;
  // OSM preview state (between fetch and Add)
  let overpassPreview: FeatureCollection | null = null;
  $: overpassResultCount = overpassPreview?.features.length ?? null;

  function handleSearchNavigate(event: CustomEvent<{ result: SearchResult }>) {
    drawToolRef?.zoomToSearchResult(event.detail.result);
  }

  const { handlePickMap, handleZoomToOverlay, handlePickLocation } = createMapPickHandlers({
    mapStore,
    mapList: () => mapList,
    shellMap: () => shellMap,
  });

  // ── Annotation event handlers (delegate to DrawTool) ────────────────

  function handleSetDrawingMode(event: CustomEvent<{ mode: DrawingMode | null }>) {
    drawingMode = event.detail.mode;
    if (!drawingMode) drawToolRef?.deactivateDrawing();
  }

  function handleAnnotationClear() {
    drawToolRef?.clearAnnotations();
    notice = { text: 'All annotations cleared.', tone: 'info' };
  }
  function handleAnnotationExport() {
    drawToolRef?.exportAnnotationsAsGeoJSON();
    notice = { text: 'GeoJSON downloaded.', tone: 'success' };
  }
  async function handleAnnotationImport(event: CustomEvent<{ file: File }>) {
    try {
      const text = await event.detail.file.text();
      const count = await drawToolRef?.importGeoJsonText(text);
      notice = {
        text: `Imported ${count ?? 0} feature${(count ?? 0) !== 1 ? 's' : ''}.`,
        tone: 'success',
      };
    } catch (e) {
      console.error('GeoJSON import failed', e);
      notice = { text: 'Failed to import GeoJSON file.', tone: 'error' };
    }
  }

  function currentViewportBbox(): Bbox4 | null {
    if (!shellMap) return null;
    const view = shellMap.getView();
    const extent = view.calculateExtent(shellMap.getSize() ?? undefined);
    // OL extent is EPSG:3857; convert to lon/lat for Overpass.
    const [w, s] = toLonLat([extent[0], extent[1]]);
    const [e, n] = toLonLat([extent[2], extent[3]]);
    return [w, s, e, n];
  }

  function openOverpassDialog() {
    overpassError = null;
    if (!overpassBbox) overpassBbox = currentViewportBbox();
    overpassOpen = true;
  }

  function startBboxPicker() {
    pickerBbox = overpassBbox ?? currentViewportBbox();
    bboxPickerActive = true;
    overpassOpen = false;
  }

  function confirmBboxPicker() {
    if (pickerBbox) overpassBbox = pickerBbox;
    bboxPickerActive = false;
    overpassOpen = true;
  }

  function cancelBboxPicker() {
    bboxPickerActive = false;
    overpassOpen = true;
  }

  function useViewportBbox() {
    overpassBbox = currentViewportBbox();
  }

  async function handlePickBboxFromSearch(event: CustomEvent<{ bbox: Bbox4; label: string }>) {
    const { bbox } = event.detail;
    overpassBbox = bbox;
    // Pan/zoom so the chosen area is on-screen — useful before tweaking via Draw on map.
    if (shellMap) {
      const { fromLonLat } = await import('ol/proj');
      const [w, s] = fromLonLat([bbox[0], bbox[1]]);
      const [e, n] = fromLonLat([bbox[2], bbox[3]]);
      shellMap.getView().fit([w, s, e, n], { duration: 400, padding: [40, 40, 40, 40] });
    }
  }

  async function runOverpassImport(
    event: CustomEvent<{ preset: OverpassPreset; customQuery: string }>
  ) {
    if (!overpassBbox) return;
    overpassFetching = true;
    overpassError = null;
    try {
      const query = buildQuery({
        preset: event.detail.preset,
        customQuery: event.detail.customQuery,
        bbox: overpassBbox,
      });
      const data = await fetchOverpass(query);
      const geojson = overpassToGeoJson(data);
      if (geojson.features.length === 0) {
        overpassError = 'No features returned for this area + query.';
        overpassFetching = false;
        return;
      }
      // Show as a preview on the map; the Add button commits.
      overpassPreview = geojson;
    } catch (e) {
      console.error('Overpass import failed', e);
      overpassError = e instanceof Error ? e.message : String(e);
    } finally {
      overpassFetching = false;
    }
  }

  async function addOverpassResult() {
    if (!overpassPreview) return;
    const count = await drawToolRef?.importGeoJsonText(JSON.stringify(overpassPreview));
    notice = {
      text: `Added ${count ?? 0} OSM feature${(count ?? 0) !== 1 ? 's' : ''}.`,
      tone: 'success',
    };
    overpassPreview = null;
    overpassOpen = false;
  }

  function discardOverpassResult() {
    overpassPreview = null;
  }

  async function handleSave() {
    if (!currentProject) return;
    isSaving = true;
    const features = drawToolRef?.exportAnnotationsAsGeoJsonObject?.() ?? {
      type: 'FeatureCollection' as const,
      features: [],
    };
    await projectStore.saveFeatures(currentProject.id, features);
    isSaving = false;
    saveSuccess = true;
    setTimeout(() => {
      saveSuccess = false;
    }, 2000);
  }

  function handleRenameProject(event: CustomEvent<{ title: string }>) {
    if (!currentProject) return;
    const title = event.detail.title;
    projectStore.updateProject(currentProject.id, { title });
    currentProject = { ...currentProject, title };
  }

  function handleUndo() {
    drawToolRef?.undoLastAction();
  }
  function handleRedo() {
    drawToolRef?.redoLastAction();
  }

  // ── Timeline / animation playback ────────────────────────────

  let playbackHandle: PlaybackHandle | null = null;

  function handleClearTimeline() {
    playbackHandle?.stop();
    playbackHandle = null;
    timelineStore.clear();
    timelineStore.setPlaying(false, null);
  }
  function handleJumpToKeyframe(e: CustomEvent<{ id: string }>) {
    if (!shellMap) return;
    const frame = $timelineStore.frames.find((f) => f.id === e.detail.id);
    if (frame) applyKeyframeInstant(shellMap, frame);
  }
  function handlePlayTimeline() {
    if (!shellMap) return;
    const frames = $timelineStore.frames;
    if (frames.length < 2) return;
    playbackHandle?.stop();
    timelineStore.setPlaying(true, 0);
    playbackHandle = playTimeline(shellMap, frames, {
      onFrameEnter: (i) => timelineStore.setCurrentIndex(i),
      onFinish: () => {
        timelineStore.setPlaying(false, null);
        playbackHandle = null;
      },
      onError: () => {
        timelineStore.setPlaying(false, null);
        playbackHandle = null;
      },
    });
  }
  function handleStopTimeline() {
    playbackHandle?.stop();
    playbackHandle = null;
    timelineStore.setPlaying(false, null);
  }

  $: canUndo = $annotationHistory.history.length > 0;
  $: canRedo = $annotationHistory.future.length > 0;

  // ── Library handlers ──────────────────────────────────────────

  function handleSelectProject(project: AnnotationSet) {
    currentProject = project;
    if (project.features?.features?.length) {
      setTimeout(() => {
        const text = JSON.stringify(project.features);
        drawToolRef?.importGeoJsonText(text);
      }, 500);
    }
    if (project.mapId) {
      const m = mapList.find((x) => x.id === project.mapId);
      mapStore.setActiveMap(project.mapId, m?.annotation_url ?? m?.allmaps_id);
    }
    activeView = 'editor';
  }

  function handleLibraryCreate(event: CustomEvent<{ title: string }>) {
    const mapId = $mapStore.activeMapId || '';
    const id = projectStore.createProject(event.detail.title, mapId);
    setTimeout(() => {
      const newProject = $projectStore.projects.find((p) => p.id === id);
      if (newProject) {
        currentProject = newProject;
        activeView = 'editor';
      }
    }, 50);
  }

  function handleLibraryRename(event: CustomEvent<{ item: AnnotationSet; title: string }>) {
    projectStore.updateProject(event.detail.item.id, { title: event.detail.title });
  }

  function handleBackToLibrary() {
    playbackHandle?.stop();
    playbackHandle = null;
    timelineStore.setPlaying(false, null);
    currentProject = null;
    drawingMode = null;
    activeView = 'library';
  }

  function featureCount(project: AnnotationSet): number {
    return project.features?.features?.length ?? 0;
  }

  onMount(() => {
    // /studio doesn't support side-by-side — snap back if state is stale from /view.
    if ($layerStore.viewMode === 'dual') layerStore.setViewMode('overlay');

    projectStore.loadFromSupabase().finally(() => {
      projectsLoading = false;
    });

    keydownHandler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName)))
        return;
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey && canUndo) {
        event.preventDefault();
        handleUndo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        if (canRedo) {
          event.preventDefault();
          handleRedo();
        }
      }
    };
    window.addEventListener('keydown', keydownHandler);
  });

  onDestroy(() => {
    if (keydownHandler) {
      window.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }
    playbackHandle?.stop();
    playbackHandle = null;
  });
</script>

<!-- Auth Gate: require login -->
{#if !session}
  <AuthGate
    {supabase}
    title="Sign in to Studio"
    body="Sign in with your Google account to create and manage annotation projects."
  />

  <!-- Project Library View -->
{:else if activeView === 'library'}
  <LibraryGrid
    items={myProjects}
    loading={projectsLoading}
    noun="Project"
    sub="Create annotation projects on historical maps"
    thumbIcon="📝"
    createLabel="+ New Project"
    emptyCtaLabel="Create Project"
    emptyTitle="Create your first project"
    emptyText="Draw points, lines, and polygons on historical maps, then save and share your annotations."
    on:select={(e) => handleSelectProject(e.detail.item)}
    on:create={handleLibraryCreate}
    on:rename={handleLibraryRename}
    on:remove={(e) => projectStore.deleteProject(e.detail.item.id)}
  >
    <svelte:fragment slot="title">My <span class="text-highlight">Studio.</span></svelte:fragment>

    <svelte:fragment slot="meta" let:item>
      <span class="meta-tag">{featureCount(item)} feature{featureCount(item) !== 1 ? 's' : ''}</span
      >
      <span class="meta-tag date">{new Date(item.updatedAt).toLocaleDateString('en-GB')}</span>
    </svelte:fragment>

    <svelte:fragment slot="description" let:item>
      {item.mapId ? `Map: ${item.mapId.slice(0, 8)}...` : 'No map selected'}
    </svelte:fragment>
  </LibraryGrid>

  <!-- Editor View — desktop two-sidebar layout -->
{:else}
  <div class="studio-mode">
    <MapWorkspace
      {supabase}
      {mapStore}
      {layerStore}
      rightSidebarWidth={380}
      bind:mapList
      bind:selectedMap
      bind:shellMap
      bind:sidebarCollapsed
      bind:rightSidebarCollapsed
      on:searchnavigate={handleSearchNavigate}
    >
      <svelte:fragment slot="sidebar">
        <MapViewerSidebar
          {mapList}
          {selectedMap}
          allowDual={false}
          viewMode={$layerStore.viewMode}
          on:toggleCollapse={() => (sidebarCollapsed = true)}
          on:zoomToOverlay={handleZoomToOverlay}
          on:pickMap={handlePickMap}
          on:pickLocation={handlePickLocation}
          on:changeViewMode={(e) => layerStore.setViewMode(e.detail.mode)}
        />
      </svelte:fragment>

      <svelte:fragment slot="right-sidebar">
        <StudioRightPane
          project={currentProject}
          {annotations}
          {selectedAnnotationId}
          {selectedMap}
          {drawingMode}
          {isSaving}
          {saveSuccess}
          {notice}
          {timelineStore}
          on:rename={(e) => drawToolRef?.updateAnnotationLabel(e.detail.id, e.detail.label)}
          on:changeColor={(e) => drawToolRef?.updateAnnotationColor(e.detail.id, e.detail.color)}
          on:updateDetails={(e) =>
            drawToolRef?.updateAnnotationDetails(e.detail.id, e.detail.details)}
          on:toggleVisibility={(e) => drawToolRef?.toggleAnnotationVisibility(e.detail.id)}
          on:select={(e) => annotationState.setSelected(e.detail.id)}
          on:delete={(e) => drawToolRef?.deleteAnnotation(e.detail.id)}
          on:zoomTo={(e) => drawToolRef?.zoomToAnnotation(e.detail.id)}
          on:setDrawingMode={handleSetDrawingMode}
          on:clear={handleAnnotationClear}
          on:exportGeoJSON={handleAnnotationExport}
          on:importFile={handleAnnotationImport}
          on:importOSM={openOverpassDialog}
          on:save={handleSave}
          on:renameProject={handleRenameProject}
          on:backToLibrary={handleBackToLibrary}
          on:toggleCollapse={() => (rightSidebarCollapsed = true)}
          on:addKeyframe={() => timelineStore.addFromCurrent(mapStore)}
          on:removeKeyframe={(e) => timelineStore.remove(e.detail.id)}
          on:reorderKeyframe={(e) => timelineStore.reorder(e.detail.id, e.detail.delta)}
          on:updateKeyframe={(e) => timelineStore.update(e.detail.id, e.detail.patch)}
          on:clearTimeline={handleClearTimeline}
          on:jumpToKeyframe={handleJumpToKeyframe}
          on:play={handlePlayTimeline}
          on:stop={handleStopTimeline}
        />
      </svelte:fragment>

      <svelte:fragment slot="map-children">
        <DrawTool bind:this={drawToolRef} {drawingMode} editingEnabled={true} />
        <BboxSelector enabled={bboxPickerActive} bind:bbox={pickerBbox} />
        <OverpassPreviewLayer features={overpassPreview} />
      </svelte:fragment>
    </MapWorkspace>

    {#if bboxPickerActive}
      <div class="bbox-picker-bar">
        <span class="bbox-picker-label"
          >Drag the rectangle corners to resize · drag inside to move</span
        >
        <code class="bbox-picker-coords">
          {pickerBbox
            ? `${pickerBbox[1].toFixed(4)}, ${pickerBbox[0].toFixed(4)} → ${pickerBbox[3].toFixed(4)}, ${pickerBbox[2].toFixed(4)}`
            : '—'}
        </code>
        <button type="button" class="sb-btn is-sm" on:click={cancelBboxPicker}>Cancel</button>
        <button
          type="button"
          class="sb-btn is-sm is-primary"
          on:click={confirmBboxPicker}
          disabled={!pickerBbox}
        >
          Use this bbox
        </button>
      </div>
    {/if}
  </div>

  <StudioOverpassDialog
    open={overpassOpen}
    bbox={overpassBbox}
    isFetching={overpassFetching}
    error={overpassError}
    resultCount={overpassResultCount}
    on:close={() => {
      if (!overpassFetching) {
        overpassOpen = false;
        overpassPreview = null;
      }
    }}
    on:pickOnMap={startBboxPicker}
    on:useViewport={useViewportBbox}
    on:pickBbox={handlePickBboxFromSearch}
    on:previewLocation={(e) => (overpassPreview = e.detail.features)}
    on:submit={runOverpassImport}
    on:addResult={addOverpassResult}
    on:discardResult={discardOverpassResult}
  />
{/if}

<style>
  /* Floating bbox-picker bar (top center of map) */
  .bbox-picker-bar {
    position: absolute;
    top: calc(var(--nav-height) + 0.75rem);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0.75rem;
    background: var(--color-white, #fff);
    border: var(--border-thick, 2px solid #111);
    border-radius: 10px;
    box-shadow: 4px 4px 0 #111;
    z-index: 150;
    font-size: 0.85rem;
    max-width: calc(100vw - 2rem);
  }
  .bbox-picker-label {
    font-weight: 600;
  }
  .bbox-picker-coords {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.78rem;
    padding: 0.2rem 0.4rem;
    background: var(--color-bg, #f6f4ef);
    border-radius: 4px;
  }
</style>
