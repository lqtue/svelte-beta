<!--
  StudioMode.svelte — /studio plugin on MapWorkspace.

  Desktop two-sidebar layout (mirrors /create):
    • Left sidebar  — Layers · Controls · Browse (CreateSidebar, reused)
    • Right sidebar — Project header · Annotations · Inspector (StudioRightPane)

  Mobile is intentionally unsupported here — the library view still works on
  mobile (read-only project list), but the editor itself is desktop-only.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { toLonLat } from "ol/proj";
  import "$styles/layouts/create-mode.css";

  import type {
    MapListItem,
    SearchResult,
    AnnotationSet,
    DrawingMode,
  } from "$lib/map/types";
  import { createGeoMapStores } from "$lib/shell/geoMapSetup";
  import { createAnnotationHistoryStore } from "$lib/map/annotationHistory";
  import { createAnnotationStateStore } from "$lib/map/annotationState";
  import { setAnnotationContext } from "$lib/map/annotationContext";
  import { getSupabaseContext } from "$lib/supabase/context";
  import { fetchAnnotationBounds } from "$lib/geo/mapBounds";
  import { boundsCenter, boundsZoom } from "$lib/ui/searchUtils";
  import { layersStore } from "$lib/stores/layersStore";
  import { createAnnotationProjectStore } from "./stores/annotationProjectStore";
  import { timelineStore, type Keyframe } from "./animation/timelineStore";
  import { playTimeline, applyKeyframeInstant, type PlaybackHandle } from "./animation/playback";

  import MapWorkspace from "$lib/shell/MapWorkspace.svelte";
  import DrawTool from "$lib/shell/DrawTool.svelte";
  import CreateSidebar from "$lib/create/CreateSidebar.svelte";
  import StudioRightPane from "./StudioRightPane.svelte";
  import StudioOverpassDialog from "./StudioOverpassDialog.svelte";
  import BboxSelector from "./BboxSelector.svelte";
  import OverpassPreviewLayer from "./OverpassPreviewLayer.svelte";
  import type { FeatureCollection } from "geojson";
  import {
    buildQuery, fetchOverpass, overpassToGeoJson,
    type Bbox4, type OverpassPreset,
  } from "./overpass";
  import NameDialog from "$lib/ui/NameDialog.svelte";
  import PageHero from "$lib/ui/PageHero.svelte";
  import CatalogGrid from "$lib/ui/catalog/CatalogGrid.svelte";
  import CatalogCard from "$lib/ui/catalog/CatalogCard.svelte";

  const { supabase, session } = getSupabaseContext();
  const userId = session?.user?.id;

  // Annotation context — shared with DrawTool via Svelte context
  const annotationHistory = createAnnotationHistoryStore(100);
  const annotationState = createAnnotationStateStore();
  setAnnotationContext({ history: annotationHistory, state: annotationState });

  const { mapStore, layerStore } = createGeoMapStores();
  const projectStore = createAnnotationProjectStore(supabase, userId);

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
  let isMobile = false;
  let isCompact = false;

  // Studio-specific state
  let drawingMode: DrawingMode | null = null;
  let drawToolRef: DrawTool;
  let rightPaneRef: StudioRightPane;
  let keydownHandler: ((event: KeyboardEvent) => void) | null = null;

  // Library/Editor view state
  let activeView: "library" | "editor" = "library";
  let projectsLoading = true;
  let currentProject: AnnotationSet | null = null;
  let isSaving = false;
  let saveSuccess = false;

  // Name dialog state
  let nameDialogOpen = false;
  let nameDialogValue = "";
  let nameDialogHeading = "New Project";
  let nameDialogEditId: string | null = null;

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

  async function handleZoomToMap(event: CustomEvent<{ map: MapListItem }>) {
    const { map } = event.detail;
    let bounds = map.bounds ?? map.bbox ?? null;
    if (!bounds) bounds = await fetchAnnotationBounds(map.annotation_url ?? map.allmaps_id ?? '');
    if (bounds) {
      const center = boundsCenter(bounds);
      const zoom = boundsZoom(bounds);
      mapStore.setView({ lng: center.lng, lat: center.lat, zoom });
      if (shellMap) {
        const { fromLonLat: proj } = await import("ol/proj");
        shellMap.getView().animate({
          center: proj([center.lng, center.lat]),
          zoom,
          duration: 400,
        });
      }
    }
  }

  function handleZoomToOverlay(e: CustomEvent<{ mapId: string }>) {
    const m = mapList.find((x) => x.id === e.detail.mapId);
    if (m) handleZoomToMap(new CustomEvent('zoomToMap', { detail: { map: m } }));
  }

  /** Catalog row click = swap top overlay to this map (same as /view + /create). */
  async function handlePickMap(event: CustomEvent<any>) {
    const item = event.detail;
    if (!item?.id) return;
    let map = mapList.find((m) => m.id === item.id) ?? null;
    if (!map) map = { ...item } as MapListItem;
    const allmapsId = map.annotation_url ?? map.allmaps_id;
    if (allmapsId) {
      layersStore.clearOverlays();
      layersStore.addOverlay({
        kind: 'historical', mapId: map.id, allmapsId,
        name: map.name, thumbnail: map.thumbnail,
      });
    }
    let bounds = map.bounds ?? map.bbox ?? null;
    if (!bounds) {
      const src = map.annotation_url ?? map.allmaps_id;
      if (src) bounds = await fetchAnnotationBounds(src);
    }
    if (bounds) {
      const center = boundsCenter(bounds);
      mapStore.setView({ lng: center.lng, lat: center.lat, zoom: boundsZoom(bounds) });
    }
  }

  function handlePickLocation(event: CustomEvent<{ lat: number; lng: number; bbox?: [number, number, number, number] }>) {
    const { lat, lng, bbox } = event.detail;
    if (bbox) {
      const c = boundsCenter(bbox);
      mapStore.setView({ lng: c.lng, lat: c.lat, zoom: boundsZoom(bbox) });
    } else {
      mapStore.setView({ lng, lat, zoom: 15 });
    }
  }

  // ── Annotation event handlers (delegate to DrawTool) ────────────────

  function handleSetDrawingMode(event: CustomEvent<{ mode: DrawingMode | null }>) {
    drawingMode = event.detail.mode;
    if (!drawingMode) drawToolRef?.deactivateDrawing();
  }

  function handleAnnotationRename(event: CustomEvent<{ id: string; label: string }>) {
    drawToolRef?.updateAnnotationLabel(event.detail.id, event.detail.label);
  }
  function handleAnnotationUpdateDetails(event: CustomEvent<{ id: string; details: string }>) {
    drawToolRef?.updateAnnotationDetails(event.detail.id, event.detail.details);
  }
  function handleAnnotationChangeColor(event: CustomEvent<{ id: string; color: string }>) {
    drawToolRef?.updateAnnotationColor(event.detail.id, event.detail.color);
  }
  function handleAnnotationToggleVisibility(event: CustomEvent<{ id: string }>) {
    drawToolRef?.toggleAnnotationVisibility(event.detail.id);
  }
  function handleAnnotationSelect(event: CustomEvent<{ id: string | null }>) {
    annotationState.setSelected(event.detail.id);
  }
  function handleAnnotationDelete(event: CustomEvent<{ id: string }>) {
    drawToolRef?.deleteAnnotation(event.detail.id);
  }
  function handleAnnotationZoomTo(event: CustomEvent<{ id: string }>) {
    drawToolRef?.zoomToAnnotation(event.detail.id);
  }
  function handleAnnotationClear() {
    drawToolRef?.clearAnnotations();
    rightPaneRef?.setNotice("All annotations cleared.", "info");
  }
  function handleAnnotationExport() {
    drawToolRef?.exportAnnotationsAsGeoJSON();
    rightPaneRef?.setNotice("GeoJSON downloaded.", "success");
  }
  async function handleAnnotationImport(event: CustomEvent<{ file: File }>) {
    try {
      const text = await event.detail.file.text();
      const count = await drawToolRef?.importGeoJsonText(text);
      rightPaneRef?.setNotice(
        `Imported ${count ?? 0} feature${(count ?? 0) !== 1 ? "s" : ""}.`,
        "success",
      );
    } catch (e) {
      console.error("GeoJSON import failed", e);
      rightPaneRef?.setNotice("Failed to import GeoJSON file.", "error");
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

  async function runOverpassImport(event: CustomEvent<{ preset: OverpassPreset; customQuery: string }>) {
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
    rightPaneRef?.setNotice(
      `Added ${count ?? 0} OSM feature${(count ?? 0) !== 1 ? 's' : ''}.`,
      'success',
    );
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
      type: "FeatureCollection" as const,
      features: [],
    };
    await projectStore.saveFeatures(currentProject.id, features);
    isSaving = false;
    saveSuccess = true;
    setTimeout(() => { saveSuccess = false; }, 2000);
  }

  function handleRenameProject(event: CustomEvent<{ title: string }>) {
    if (!currentProject) return;
    const title = event.detail.title;
    projectStore.updateProject(currentProject.id, { title });
    currentProject = { ...currentProject, title };
  }

  function handleUndo() { drawToolRef?.undoLastAction(); }
  function handleRedo() { drawToolRef?.redoLastAction(); }

  // ── Timeline / animation playback ────────────────────────────

  let playbackHandle: PlaybackHandle | null = null;

  function handleAddKeyframe() { timelineStore.addFromCurrent(mapStore); }
  function handleRemoveKeyframe(e: CustomEvent<{ id: string }>) {
    timelineStore.remove(e.detail.id);
  }
  function handleReorderKeyframe(e: CustomEvent<{ id: string; delta: 1 | -1 }>) {
    timelineStore.reorder(e.detail.id, e.detail.delta);
  }
  function handleUpdateKeyframe(e: CustomEvent<{ id: string; patch: Partial<Pick<Keyframe, 'label' | 'duration_ms' | 'hold_ms'>> }>) {
    timelineStore.update(e.detail.id, e.detail.patch);
  }
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

  function handleOpenNewProject() {
    nameDialogEditId = null;
    nameDialogValue = "";
    nameDialogHeading = "New Project";
    nameDialogOpen = true;
  }

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
    activeView = "editor";
  }

  function handleEditProjectName(project: AnnotationSet) {
    nameDialogEditId = project.id;
    nameDialogValue = project.title;
    nameDialogHeading = "Rename Project";
    nameDialogOpen = true;
  }

  function handleNameDialogSubmit(event: CustomEvent<{ title: string; description?: string }>) {
    const { title } = event.detail;
    nameDialogOpen = false;

    if (nameDialogEditId) {
      projectStore.updateProject(nameDialogEditId, { title });
    } else {
      const mapId = $mapStore.activeMapId || "";
      const id = projectStore.createProject(title, mapId);
      setTimeout(() => {
        const projects = $projectStore.projects;
        const newProject = projects.find((p) => p.id === id);
        if (newProject) {
          currentProject = newProject;
          activeView = "editor";
        }
      }, 50);
    }
  }

  function handleBackToLibrary() {
    playbackHandle?.stop();
    playbackHandle = null;
    timelineStore.setPlaying(false, null);
    currentProject = null;
    drawingMode = null;
    activeView = "library";
  }

  function featureCount(project: AnnotationSet): number {
    return project.features?.features?.length ?? 0;
  }

  onMount(() => {
    projectStore.loadFromSupabase().finally(() => { projectsLoading = false; });

    keydownHandler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName))) return;
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
    if (keydownHandler) {
      window.removeEventListener("keydown", keydownHandler);
      keydownHandler = null;
    }
    playbackHandle?.stop();
    playbackHandle = null;
  });
</script>

<!-- Auth Gate: require login -->
{#if !session}
  <div class="auth-gate">
    <div class="auth-gate-card">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d4af37" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
      <h2 class="auth-gate-title">Sign in to Studio</h2>
      <p class="auth-gate-text">Sign in with your Google account to create and manage annotation projects.</p>
      <button
        type="button"
        class="auth-gate-btn google"
        on:click={async () => {
          const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: `${window.location.origin}/auth/callback` },
          });
          if (error) console.error("Google sign-in failed:", error.message);
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        Continue with Google
      </button>
    </div>
  </div>

  <!-- Project Library View -->
{:else if activeView === "library"}
  <div class="page">
    <PageHero eyebrow="Tools" sub="Create annotation projects on historical maps">
      <svelte:fragment slot="title">My <span class="text-highlight">Studio.</span></svelte:fragment>
      <div slot="actions">
        <button type="button" class="action-btn primary-btn" on:click={handleOpenNewProject}>
          + New Project
        </button>
      </div>
    </PageHero>

    <main class="editorial-main">
      {#if projectsLoading}
        <div class="library-loading">
          <div class="loading-spinner"></div>
          <span>Loading projects...</span>
        </div>
      {:else if myProjects.length === 0}
        <div class="library-empty">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#d4af37" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <path d="M12 18v-6M9 15h6" />
          </svg>
          <h2 class="empty-title">Create your first project</h2>
          <p class="empty-text">Draw points, lines, and polygons on historical maps, then save and share your annotations.</p>
          <button type="button" class="library-create-btn large" on:click={handleOpenNewProject}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create Project
          </button>
        </div>
      {:else}
        <CatalogGrid>
          {#each myProjects as project (project.id)}
            <CatalogCard title={project.title} on:click={() => handleSelectProject(project)}>
              <div slot="thumb" class="story-thumb-placeholder">
                <span class="story-icon">📝</span>
              </div>
              <div slot="meta" class="meta">
                <span class="meta-tag">{featureCount(project)} feature{featureCount(project) !== 1 ? "s" : ""}</span>
                <span class="meta-tag date">{new Date(project.updatedAt).toLocaleDateString("en-GB")}</span>
              </div>
              <div slot="description" class="description">
                {project.mapId ? `Map: ${project.mapId.slice(0, 8)}...` : "No map selected"}
              </div>
              <div slot="actions">
                <button type="button" class="btn-icon-edit" title="Rename project" on:click|stopPropagation={() => handleEditProjectName(project)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button type="button" class="btn-icon-delete" title="Delete project" on:click|stopPropagation={() => {
                  if (confirm(`Delete "${project.title}"?`)) projectStore.deleteProject(project.id);
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </button>
              </div>
            </CatalogCard>
          {/each}
        </CatalogGrid>
      {/if}
    </main>
  </div>

  <NameDialog
    open={nameDialogOpen}
    bind:value={nameDialogValue}
    heading={nameDialogHeading}
    on:submit={handleNameDialogSubmit}
    on:close={() => (nameDialogOpen = false)}
  />

  <!-- Editor View — desktop two-sidebar layout -->
{:else}
  <div class="studio-mode">
    <MapWorkspace
      {supabase}
      {mapStore}
      {layerStore}
      showDual={false}
      rightSidebarWidth={380}
      bind:mapList
      bind:selectedMap
      bind:shellMap
      bind:sidebarCollapsed
      bind:rightSidebarCollapsed
      bind:isMobile
      bind:isCompact
      on:searchnavigate={handleSearchNavigate}
    >
      <svelte:fragment slot="sidebar">
        <CreateSidebar
          {mapList}
          {selectedMap}
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
          bind:this={rightPaneRef}
          project={currentProject}
          {annotations}
          {selectedAnnotationId}
          {selectedMap}
          {drawingMode}
          {isSaving}
          {saveSuccess}
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
          on:importOSM={openOverpassDialog}
          on:save={handleSave}
          on:renameProject={handleRenameProject}
          on:backToLibrary={handleBackToLibrary}
          on:toggleCollapse={() => (rightSidebarCollapsed = true)}
          on:addKeyframe={handleAddKeyframe}
          on:removeKeyframe={handleRemoveKeyframe}
          on:reorderKeyframe={handleReorderKeyframe}
          on:updateKeyframe={handleUpdateKeyframe}
          on:clearTimeline={handleClearTimeline}
          on:jumpToKeyframe={handleJumpToKeyframe}
          on:play={handlePlayTimeline}
          on:stop={handleStopTimeline}
        />
      </svelte:fragment>

      <svelte:fragment slot="map-children">
        <DrawTool bind:this={drawToolRef} {drawingMode} editingEnabled={true} />
        <BboxSelector
          enabled={bboxPickerActive}
          bind:bbox={pickerBbox}
        />
        <OverpassPreviewLayer features={overpassPreview} />
      </svelte:fragment>
    </MapWorkspace>

    {#if bboxPickerActive}
      <div class="bbox-picker-bar">
        <span class="bbox-picker-label">Drag the rectangle corners to resize · drag inside to move</span>
        <code class="bbox-picker-coords">
          {pickerBbox
            ? `${pickerBbox[1].toFixed(4)}, ${pickerBbox[0].toFixed(4)} → ${pickerBbox[3].toFixed(4)}, ${pickerBbox[2].toFixed(4)}`
            : '—'}
        </code>
        <button type="button" class="sb-btn is-sm" on:click={cancelBboxPicker}>Cancel</button>
        <button type="button" class="sb-btn is-sm is-primary" on:click={confirmBboxPicker} disabled={!pickerBbox}>
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
    on:close={() => { if (!overpassFetching) { overpassOpen = false; overpassPreview = null; } }}
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
  .studio-mode {
    position: fixed;
    inset: var(--nav-height) 0 0 0;
    display: flex;
    flex-direction: column;
    background-color: var(--color-bg);
    background-image: radial-gradient(var(--color-border) 1px, transparent 1px);
    background-size: 32px 32px;
    overflow: hidden;
  }

  .btn-icon-edit {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    border: var(--border-thin);
    background: var(--color-white);
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 2px 2px 0px var(--color-border);
  }

  .btn-icon-edit:hover {
    color: var(--color-blue);
    background: #dbeafe;
    transform: translate(-1px, -1px);
  }

  /* Floating bbox-picker bar (top center of map) */
  .bbox-picker-bar {
    position: absolute;
    top: calc(var(--nav-height) + 0.75rem);
    left: 50%;
    transform: translateX(-50%);
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.55rem 0.75rem;
    background: var(--color-white, #fff);
    border: var(--border-thick, 2px solid #111);
    border-radius: 10px;
    box-shadow: 4px 4px 0 #111;
    z-index: 150;
    font-size: 0.85rem;
    max-width: calc(100vw - 2rem);
  }
  .bbox-picker-label { font-weight: 600; }
  .bbox-picker-coords {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.78rem;
    padding: 0.2rem 0.4rem;
    background: var(--color-bg, #f6f4ef);
    border-radius: 4px;
  }
</style>
