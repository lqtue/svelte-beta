<!--
  AnnotateMode.svelte — /annotate mode orchestrator.
  Free-form annotation builder. Uses StudioMap for drawing on the map.
  Annotations are drawn on the map and managed in the AnnotationsPanel.
  Auth gate → library → editor pattern (mirrors CreateMode).
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import "$lib/styles/layouts/mode-shared.css";
  import "$lib/styles/layouts/create-mode.css";
  import { toLonLat } from "ol/proj";

  import type {
    ViewMode,
    MapListItem,
    SearchResult,
    AnnotationSummary,
    AnnotationSet,
    DrawingMode,
  } from "$lib/viewer/types";
  import { createMapStore } from "$lib/stores/mapStore";
  import { createLayerStore } from "$lib/stores/layerStore";
  import { createAnnotationHistoryStore } from "$lib/map/stores/annotationHistory";
  import { createAnnotationStateStore } from "$lib/map/stores/annotationState";
  import { setAnnotationContext } from "$lib/map/context/annotationContext";
  import { getSupabaseContext } from "$lib/supabase/context";
  import { fetchMaps } from "$lib/supabase/maps";
  import { fetchAnnotationBounds } from "$lib/geo/mapBounds";
  import { boundsCenter, boundsZoom } from "$lib/ui/searchUtils";
  import { createAnnotationProjectStore } from "./stores/annotationProjectStore";

  import StudioMap from "$lib/studio/StudioMap.svelte";
  import AnnotationsPanel from "./AnnotationsPanel.svelte";
  import MapSearchBar from "$lib/ui/MapSearchBar.svelte";
  import MapToolbar from "$lib/ui/MapToolbar.svelte";
  import NameDialog from "$lib/ui/NameDialog.svelte";
  import CatalogPage from "$lib/ui/catalog/CatalogPage.svelte";
  import CatalogHeader from "$lib/ui/catalog/CatalogHeader.svelte";
  import CatalogGrid from "$lib/ui/catalog/CatalogGrid.svelte";
  import CatalogCard from "$lib/ui/catalog/CatalogCard.svelte";

  const { supabase, session } = getSupabaseContext();
  const userId = session?.user?.id;

  // Annotation context — shared with StudioMap via Svelte context
  const annotationHistory = createAnnotationHistoryStore(100);
  const annotationState = createAnnotationStateStore();
  setAnnotationContext({ history: annotationHistory, state: annotationState });

  const mapStore = createMapStore();
  const layerStore = createLayerStore();
  const projectStore = createAnnotationProjectStore(supabase, userId);

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

  // Only show projects owned by the current user
  $: myProjects = $projectStore.projects.filter((p) => p.authorId === userId);

  // State
  let mapList: MapListItem[] = [];
  let drawingMode: DrawingMode | null = null;
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

  function toggleBasemap() {
    const next = basemapSelection === "g-streets" ? "g-satellite" : "g-streets";
    layerStore.setBasemap(next);
    studioMapRef?.applyBasemap(next);
  }

  function handleChangeViewMode(event: CustomEvent<{ mode: ViewMode }>) {
    layerStore.setViewMode(event.detail.mode);
  }

  function handleChangeOpacity(event: CustomEvent<{ value: number }>) {
    layerStore.setOverlayOpacity(event.detail.value);
    studioMapRef?.setMapOpacity(event.detail.value);
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

  function handleStatusChange(
    event: CustomEvent<{ message: string; error: boolean }>,
  ) {
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

  function handleSetDrawingMode(
    event: CustomEvent<{ mode: DrawingMode | null }>,
  ) {
    drawingMode = event.detail.mode;
    if (!drawingMode) studioMapRef?.deactivateDrawing();
  }

  function handleAnnotationRename(
    event: CustomEvent<{ id: string; label: string }>,
  ) {
    studioMapRef?.updateAnnotationLabel(event.detail.id, event.detail.label);
  }

  function handleAnnotationUpdateDetails(
    event: CustomEvent<{ id: string; details: string }>,
  ) {
    studioMapRef?.updateAnnotationDetails(
      event.detail.id,
      event.detail.details,
    );
  }

  function handleAnnotationChangeColor(
    event: CustomEvent<{ id: string; color: string }>,
  ) {
    studioMapRef?.updateAnnotationColor(event.detail.id, event.detail.color);
  }

  function handleAnnotationToggleVisibility(
    event: CustomEvent<{ id: string }>,
  ) {
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

  async function handleSave() {
    if (!currentProject) return;
    isSaving = true;

    // Collect features from StudioMap
    const features = studioMapRef?.exportAnnotationsAsGeoJsonObject?.() ?? {
      type: "FeatureCollection" as const,
      features: [],
    };

    await projectStore.saveFeatures(currentProject.id, features);

    isSaving = false;
    saveSuccess = true;
    setTimeout(() => {
      saveSuccess = false;
    }, 2000);
  }

  function handleUndo() {
    studioMapRef?.undoLastAction();
  }

  function handleRedo() {
    studioMapRef?.redoLastAction();
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
    // Load project features into StudioMap if features exist
    if (
      project.features &&
      project.features.features &&
      project.features.features.length > 0
    ) {
      // We'll load them after map is ready
      setTimeout(() => {
        const text = JSON.stringify(project.features);
        studioMapRef?.importGeoJsonText(text);
      }, 500);
    }
    // Set the map overlay if project has a mapId
    if (project.mapId) {
      mapStore.setActiveMap(project.mapId);
    }
    activeView = "editor";
  }

  function handleEditProjectName(project: AnnotationSet) {
    nameDialogEditId = project.id;
    nameDialogValue = project.title;
    nameDialogHeading = "Rename Project";
    nameDialogOpen = true;
  }

  function handleNameDialogSubmit(
    event: CustomEvent<{ title: string; description?: string }>,
  ) {
    const { title } = event.detail;
    nameDialogOpen = false;

    if (nameDialogEditId) {
      // Edit existing project name
      projectStore.updateProject(nameDialogEditId, { title });
    } else {
      // Create new project
      const mapId = selectedMapId || "";
      const id = projectStore.createProject(title, mapId);
      // Find the newly created project and enter editor
      // Use a small delay to let store update propagate
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
    currentProject = null;
    drawingMode = null;
    activeView = "library";
  }

  function featureCount(project: AnnotationSet): number {
    return project.features?.features?.length ?? 0;
  }

  onMount(() => {
    // Load projects then stop loading indicator
    projectStore.loadFromSupabase().finally(() => {
      projectsLoading = false;
    });

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

<!-- Auth Gate: require login -->
{#if !session}
  <div class="auth-gate">
    <div class="auth-gate-card">
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#d4af37"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
      <h2 class="auth-gate-title">Sign in to Annotate</h2>
      <p class="auth-gate-text">
        Sign in with your Google account to create and manage annotation
        projects.
      </p>
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
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Continue with Google
      </button>
    </div>
  </div>

  <!-- Project Library View -->
{:else if activeView === "library"}
  <CatalogPage>
    <div slot="header">
      <CatalogHeader
        title="My Projects"
        subtitle="Create annotation projects on historical maps"
        variant="hero"
        backLink="/"
        backLabel="Return to Home"
      >
        <div slot="actions">
          <button
            type="button"
            class="library-create-btn"
            on:click={handleOpenNewProject}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Project
          </button>
        </div>
      </CatalogHeader>
    </div>

    {#if projectsLoading}
      <div class="library-loading">
        <div class="loading-spinner"></div>
        <span>Loading projects...</span>
      </div>
    {:else if myProjects.length === 0}
      <div class="library-empty">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#d4af37"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M12 18v-6M9 15h6" />
        </svg>
        <h2 class="empty-title">Create your first project</h2>
        <p class="empty-text">
          Draw points, lines, and polygons on historical maps, then save and
          share your annotations.
        </p>
        <button
          type="button"
          class="library-create-btn large"
          on:click={handleOpenNewProject}
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
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create Project
        </button>
      </div>
    {:else}
      <CatalogGrid>
        {#each myProjects as project (project.id)}
          <CatalogCard
            title={project.title}
            on:click={() => handleSelectProject(project)}
          >
            <div slot="thumb" class="story-thumb-placeholder">
              <span class="story-icon">📝</span>
            </div>

            <div slot="meta" class="meta">
              <span class="meta-tag">
                {featureCount(project)} feature{featureCount(project) !== 1
                  ? "s"
                  : ""}
              </span>
              <span class="meta-tag date">
                {new Date(project.updatedAt).toLocaleDateString("en-GB")}
              </span>
            </div>

            <div slot="description" class="description">
              {project.mapId ? `Map: ${project.mapId.slice(0, 8)}...` : "No map selected"}
            </div>

            <div slot="actions">
              <button
                type="button"
                class="btn-icon-edit"
                title="Rename project"
                on:click|stopPropagation={() => handleEditProjectName(project)}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <path
                    d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                  />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                type="button"
                class="btn-icon-delete"
                title="Delete project"
                on:click|stopPropagation={() => {
                  if (confirm(`Delete "${project.title}"?`)) {
                    projectStore.deleteProject(project.id);
                  }
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
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
  </CatalogPage>

  <NameDialog
    open={nameDialogOpen}
    bind:value={nameDialogValue}
    heading={nameDialogHeading}
    on:submit={handleNameDialogSubmit}
    on:close={() => (nameDialogOpen = false)}
  />

  <!-- Editor View -->
{:else}
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
          {isSaving}
          {saveSuccess}
          collapsed={false}
          on:toggleCollapse={() => (sidebarCollapsed = true)}
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
          on:save={handleSave}
          on:backToLibrary={handleBackToLibrary}
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

        <!-- Map Controls Toolbar -->
        <MapToolbar
          {viewMode}
          {opacity}
          {isMobile}
          bind:toolbarEl
          on:changeViewMode={handleChangeViewMode}
          on:changeOpacity={handleChangeOpacity}
        />

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
          {isSaving}
          {saveSuccess}
          collapsed={false}
          on:toggleCollapse={() => (sidebarCollapsed = true)}
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
          on:save={handleSave}
          on:backToLibrary={handleBackToLibrary}
        />
      </div>
    {/if}
  </div>
{/if}

<style>
  .annotate-mode {
    position: relative;
    height: 100vh;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background-color: var(--color-bg);
    background-image: radial-gradient(var(--color-border) 1px, transparent 1px);
    background-size: 32px 32px;
    overflow: hidden;
  }

  .annotate-mode.mobile .workspace {
    padding: 0;
    gap: 0;
  }

  /* Overlay Error — annotate-specific positioning */
  .overlay-error {
    position: absolute;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    z-index: 60;
    pointer-events: auto;
    max-width: calc(100vw - 8rem);
  }

  @media (max-width: 900px) {
    .overlay-error {
      bottom: calc(env(safe-area-inset-bottom) + 8rem);
    }
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

  /* Mobile Sidebar — annotate uses fixed positioning */
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

  /* Edit icon button in library cards */
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
</style>
