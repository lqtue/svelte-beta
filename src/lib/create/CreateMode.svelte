<!--
  CreateMode.svelte — /create mode orchestrator.
  Story/adventure builder. Uses MapShell + HistoricalOverlay.
  Points are placed on the map and configured in the StoryEditor panel.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { fromLonLat, transformExtent } from "ol/proj";
  import type Map from "ol/Map";

  import type { ViewMode, MapListItem, SearchResult } from "$lib/viewer/types";
  import type { Story, StoryPoint } from "$lib/story/types";
  import { createMapStore } from "$lib/stores/mapStore";
  import { createLayerStore } from "$lib/stores/layerStore";
  import { getSupabaseContext } from "$lib/supabase/context";
  import { fetchMaps } from "$lib/supabase/maps";
  import { createStoryLibraryStore } from "$lib/story/stores/storyStore";
  import { fetchAnnotationBounds } from "$lib/trip/mapBounds";
  import { boundsCenter, boundsZoom } from "$lib/ui/searchUtils";
  import { fetchMapBounds } from "$lib/shell/warpedOverlay"; // New import

  import MapShell from "$lib/shell/MapShell.svelte";
  import HistoricalOverlay from "$lib/shell/HistoricalOverlay.svelte";
  import MapClickCapture from "./MapClickCapture.svelte";
  import StoryEditor from "./StoryEditor.svelte";
  import MapSearchBar from "$lib/ui/MapSearchBar.svelte";
  import StoryMarkers from "$lib/view/StoryMarkers.svelte";
  import CatalogPage from "$lib/ui/catalog/CatalogPage.svelte";
  import CatalogHeader from "$lib/ui/catalog/CatalogHeader.svelte";
  import CatalogGrid from "$lib/ui/catalog/CatalogGrid.svelte";
  import CatalogCard from "$lib/ui/catalog/CatalogCard.svelte";

  const { supabase, session } = getSupabaseContext();
  const userId = session?.user?.id;

  const mapStore = createMapStore();
  const layerStore = createLayerStore();
  const storyLibrary = createStoryLibraryStore(supabase, userId);

  // Reactive store reads
  $: selectedMapId = $mapStore.activeMapId ?? "";
  $: basemapSelection = $layerStore.basemap;
  $: currentPointIndex =
    currentStory?.points.findIndex((p) => p.id === selectedPointId) ?? -1;
  $: sideRatio = $layerStore.sideRatio;
  $: viewMode = $layerStore.viewMode;
  $: opacity = $layerStore.overlayOpacity;
  $: lensRadius = $layerStore.lensRadius;

  // Derived: selected map object
  $: selectedMap = selectedMapId
    ? (mapList.find((m) => m.id === selectedMapId) ?? null)
    : null;

  // State
  let mapList: MapListItem[] = [];
  let currentStory: Story | null = null;
  let selectedPointId: string | null = null;
  let placingPoint = false;
  let movingPoint = false;
  let isSaving = false;
  let saveSuccess = false;
  let sidebarCollapsed = false;
  let isMobile = false;
  let isCompact = false;

  let responsiveCleanup: (() => void) | null = null;
  let keydownHandler: ((event: KeyboardEvent) => void) | null = null;
  let shellMap: Map | null = null;
  let toolbarEl: HTMLDivElement;
  let overlayLoading = false;
  let overlayError: string | null = null;
  let lensOverlayEl: HTMLDivElement;

  let activeView: "library" | "editor" = "library";
  let storiesLoading = true;

  let showZoomPrompt = false; // Show "Zoom to Map" if loading takes too long
  let loadingTimer: ReturnType<typeof setTimeout> | null = null;

  $: points = currentStory?.points ?? [];

  // Only show stories owned by the current user
  $: myStories = $storyLibrary.stories.filter((s) => s.authorId === userId);

  // View mode definitions
  const viewModes: { mode: ViewMode; label: string; title: string }[] = [
    { mode: "overlay", label: "Overlay", title: "Full overlay" },
    { mode: "side-x", label: "Side X", title: "Side by side (horizontal)" },
    { mode: "side-y", label: "Side Y", title: "Side by side (vertical)" },
    { mode: "spy", label: "Lens", title: "Spy glass" },
  ];

  function toggleBasemap() {
    layerStore.setBasemap(
      basemapSelection === "g-streets" ? "g-satellite" : "g-streets",
    );
  }

  function handleOpacityInput(event: Event) {
    const target = event.target as HTMLInputElement;
    layerStore.setOverlayOpacity(parseFloat(target.value));
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

  function createNewStory(): Story {
    const id = crypto.randomUUID();
    return {
      id,
      title: "Untitled Story",
      description: "",
      mode: "guided",
      points: [],
      stops: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPublic: false,
      authorId: userId!,
    };
  }

  function createNewPoint(lon: number, lat: number): StoryPoint {
    const order = currentStory?.points.length ?? 0;
    return {
      id: crypto.randomUUID(),
      order,
      title: `Point ${order + 1}`,
      description: "",
      coordinates: [lon, lat],
      triggerRadius: 15,
      interaction: "proximity",
      challenge: { type: "none" },
      overlayMapId: selectedMapId || undefined,
    };
  }

  async function loadData() {
    try {
      mapList = await fetchMaps(supabase);
    } catch (err) {
      console.error("[CreateMode] Failed to load maps:", err);
    }
  }

  // -- Map click: place OR move --
  function handleMapClick(event: CustomEvent<{ lon: number; lat: number }>) {
    if (!currentStory) return;
    const { lon, lat } = event.detail;

    // Mode: Moving existing point
    if (movingPoint && selectedPointId) {
      handleUpdatePoint(
        new CustomEvent("updatePoint", {
          detail: {
            pointId: selectedPointId,
            updates: { coordinates: [lon, lat] },
          },
        }),
      );
      movingPoint = false; // Auto-exit move mode after placing
      return;
    }

    // Mode: Placing new point
    if (placingPoint) {
      const point = createNewPoint(lon, lat);
      currentStory = {
        ...currentStory,
        points: [...currentStory.points, point],
        stops: [...currentStory.points, point],
        updatedAt: Date.now(),
      };
      selectedPointId = point.id;
    }
  }

  function handleMapReady(event: CustomEvent<{ map: Map }>) {
    shellMap = event.detail.map;
  }

  // -- Handlers: StoryEditor --
  function handleUpdateStory(
    event: CustomEvent<{ title?: string; description?: string }>,
  ) {
    if (!currentStory) return;
    const updates = event.detail;
    currentStory = {
      ...currentStory,
      ...updates,
      updatedAt: Date.now(),
    };
  }

  function handleUpdatePoint(
    event: CustomEvent<{ pointId: string; updates: Partial<StoryPoint> }>,
  ) {
    if (!currentStory) return;
    const { pointId, updates } = event.detail;
    const pts = currentStory.points.map((p) =>
      p.id === pointId ? { ...p, ...updates } : p,
    );
    currentStory = {
      ...currentStory,
      points: pts,
      stops: pts,
      updatedAt: Date.now(),
    };
  }

  function handleRemovePoint(event: CustomEvent<{ pointId: string }>) {
    if (!currentStory) return;
    const pts = currentStory.points
      .filter((p) => p.id !== event.detail.pointId)
      .map((p, i) => ({ ...p, order: i }));
    currentStory = {
      ...currentStory,
      points: pts,
      stops: pts,
      updatedAt: Date.now(),
    };
    if (selectedPointId === event.detail.pointId) selectedPointId = null;
  }

  function handleSelectPoint(event: CustomEvent<{ pointId: string | null }>) {
    selectedPointId = event.detail.pointId;
  }

  function handleZoomToPoint(event: CustomEvent<{ pointId: string }>) {
    if (!currentStory) return;
    const point = currentStory.points.find(
      (p) => p.id === event.detail.pointId,
    );
    if (point) {
      mapStore.setView({
        lng: point.coordinates[0],
        lat: point.coordinates[1],
        zoom: 17,
      });
    }
  }

  function handleZoomToAll() {
    if (!currentStory || !currentStory.points.length || !shellMap) return;
    const coords = currentStory.points.map((p) => fromLonLat(p.coordinates));
    const extent = coords.reduce(
      (ext, c) => [
        Math.min(ext[0], c[0]),
        Math.min(ext[1], c[1]),
        Math.max(ext[2], c[0]),
        Math.max(ext[3], c[1]),
      ],
      [Infinity, Infinity, -Infinity, -Infinity],
    );
    shellMap
      .getView()
      .fit(extent, { padding: [60, 60, 60, 60], duration: 800 });
  }

  function handleTogglePlacing() {
    if (!currentStory) {
      currentStory = createNewStory();
    }
    placingPoint = !placingPoint;
    if (placingPoint) movingPoint = false;
  }

  function handleToggleMoving() {
    movingPoint = !movingPoint;
    if (movingPoint) placingPoint = false;
  }

  async function handleSave() {
    if (!currentStory) return;
    isSaving = true;

    // Simulate network delay for better UX feedback
    await new Promise((r) => setTimeout(r, 600));

    storyLibrary.update((lib) => {
      const exists = lib.stories.some((s) => s.id === currentStory!.id);
      if (exists) {
        return {
          stories: lib.stories.map((s) =>
            s.id === currentStory!.id ? currentStory! : s,
          ),
        };
      }
      return { stories: [...lib.stories, currentStory!] };
    });
    console.log("[CreateMode] Story saved:", currentStory.id);

    // Reset loading state and show success
    isSaving = false;
    saveSuccess = true;
    setTimeout(() => {
      saveSuccess = false;
    }, 2000);
  }

  function handlePreview() {
    // TODO: open story playback in preview mode
    console.log("[CreateMode] Preview story:", currentStory?.id);
  }

  function handleBackToLibrary() {
    currentStory = null;
    selectedPointId = null;
    placingPoint = false;
    activeView = "library";
  }

  function handleSelectStory(story: Story) {
    currentStory = story;
    activeView = "editor";
  }

  function handleCreateNewStory() {
    currentStory = createNewStory();
    activeView = "editor";
  }

  function handleSearchNavigate(event: CustomEvent<{ result: SearchResult }>) {
    mapStore.setView({
      lng: parseFloat(event.detail.result.lon),
      lat: parseFloat(event.detail.result.lat),
      zoom: 16,
    });
  }

  function handleSearchAddPoint(event: CustomEvent<{ result: SearchResult }>) {
    const { result } = event.detail;
    const lon = parseFloat(result.lon);
    const lat = parseFloat(result.lat);
    handleMapClick(new CustomEvent("mapClick", { detail: { lon, lat } }));

    // Update the newly created point with the search result name
    if (currentStory && currentStory.points.length > 0) {
      const lastPoint = currentStory.points[currentStory.points.length - 1];
      const updatedPoint = {
        ...lastPoint,
        title: result.display_name.split(",")[0],
      };
      const newPoints = [...currentStory.points];
      newPoints[newPoints.length - 1] = updatedPoint;
      currentStory = { ...currentStory, points: newPoints, stops: newPoints };
      selectedPointId = updatedPoint.id;
    }

    // Zoom to location
    mapStore.setView({ lng: lon, lat: lat, zoom: 16 });
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
    }
  }

  // Handle overlay loading state to potential show zoom prompt
  $: if (overlayLoading) {
    if (!loadingTimer) {
      showZoomPrompt = false;
      loadingTimer = setTimeout(() => {
        showZoomPrompt = true;
      }, 3000); // Show prompt after 3s of loading
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

  function handleUndo() {
    // Simple undo: remove last point
    if (!currentStory || !currentStory.points.length) return;
    const pts = currentStory.points
      .slice(0, -1)
      .map((p, i) => ({ ...p, order: i }));
    currentStory = {
      ...currentStory,
      points: pts,
      stops: pts,
      updatedAt: Date.now(),
    };
  }

  onMount(() => {
    loadData();

    // Load stories then stop loading indicator
    storyLibrary.loadFromSupabase().finally(() => {
      storiesLoading = false;
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
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
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
      <h2 class="auth-gate-title">Sign in to Create</h2>
      <p class="auth-gate-text">
        Sign in with your Google account to create and manage stories.
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

  <!-- Story Library View -->
{:else if activeView === "library"}
  <CatalogPage>
    <div slot="header">
      <CatalogHeader
        title="My Stories"
        subtitle="Create guided stories and adventures on historical maps"
        variant="hero"
        backLink="/"
        backLabel="Return to Home"
      >
        <div slot="actions">
          <button
            type="button"
            class="library-create-btn"
            on:click={handleCreateNewStory}
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
            New Story
          </button>
        </div>
      </CatalogHeader>
    </div>

    {#if storiesLoading}
      <div class="library-loading">
        <div class="loading-spinner"></div>
        <span>Loading stories...</span>
      </div>
    {:else if myStories.length === 0}
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
        <h2 class="empty-title">Create your first story</h2>
        <p class="empty-text">
          Place points on historical maps, add descriptions and challenges, and
          share your creation.
        </p>
        <button
          type="button"
          class="library-create-btn large"
          on:click={handleCreateNewStory}
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
          Create Story
        </button>
      </div>
    {:else}
      <CatalogGrid>
        {#each myStories as story (story.id)}
          <CatalogCard
            title={story.title}
            on:click={() => handleSelectStory(story)}
          >
            <div slot="thumb" class="story-thumb-placeholder">
              <span class="story-icon">📖</span>
            </div>

            <div slot="meta" class="meta">
              <span class="meta-tag">
                {story.points.length} point{story.points.length !== 1
                  ? "s"
                  : ""}
              </span>
              <span class="meta-tag date">
                {new Date(story.updatedAt).toLocaleDateString("en-GB")}
              </span>
            </div>

            <div slot="description" class="description">
              {story.description || "No description"}
            </div>

            <div slot="actions">
              <button
                type="button"
                class="btn-icon-delete"
                title="Delete story"
                on:click|stopPropagation={() => {
                  if (confirm(`Delete "${story.title}"?`)) {
                    storyLibrary.deleteStory(story.id);
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

  <!-- Editor View -->
{:else}
  <div class="create-mode" class:mobile={isMobile}>
    <div
      class="workspace"
      class:with-sidebar={!sidebarCollapsed && !isMobile}
      class:compact={isCompact}
    >
      {#if !sidebarCollapsed && !isMobile}
        <StoryEditor
          story={currentStory}
          {selectedMap}
          {selectedPointId}
          {placingPoint}
          {movingPoint}
          {isSaving}
          {saveSuccess}
          collapsed={false}
          on:updateStory={handleUpdateStory}
          on:updatePoint={handleUpdatePoint}
          on:removePoint={handleRemovePoint}
          on:selectPoint={handleSelectPoint}
          on:zoomToPoint={handleZoomToPoint}
          on:zoomToAll={handleZoomToAll}
          on:togglePlacing={handleTogglePlacing}
          on:toggleMoving={handleToggleMoving}
          on:save={handleSave}
          on:zoomToMap={handleZoomToMap}
          on:toggleCollapse={() => (sidebarCollapsed = true)}
          on:backToLibrary={handleBackToLibrary}
        />
      {/if}

      <div class="map-stage">
        <MapShell {mapStore} {layerStore}>
          <HistoricalOverlay
            on:loadstart={() => {
              overlayLoading = true;
              overlayError = null;
            }}
            on:loadend={() => {
              overlayLoading = false;
            }}
            on:loaderror={(e) => {
              overlayLoading = false;
              overlayError = e.detail.message;
            }}
          />
          <MapClickCapture
            enabled={placingPoint || movingPoint}
            on:mapClick={handleMapClick}
            on:mapReady={handleMapReady}
          />
          {#if currentStory}
            <StoryMarkers
              points={currentStory.points}
              currentIndex={currentPointIndex}
            />
          {/if}
        </MapShell>

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
          showAddAsPoint={true}
          on:navigate={handleSearchNavigate}
          on:addAsPoint={handleSearchAddPoint}
          on:selectMap={(e) => {
            mapStore.setActiveMap(e.detail.map.id);
          }}
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
        <StoryEditor
          story={currentStory}
          {selectedMap}
          {selectedPointId}
          {placingPoint}
          collapsed={false}
          on:updateStory={handleUpdateStory}
          on:updatePoint={handleUpdatePoint}
          on:removePoint={handleRemovePoint}
          on:selectPoint={handleSelectPoint}
          on:zoomToPoint={handleZoomToPoint}
          on:zoomToAll={handleZoomToAll}
          on:togglePlacing={handleTogglePlacing}
          on:save={handleSave}
          on:zoomToMap={handleZoomToMap}
          on:toggleCollapse={() => (sidebarCollapsed = true)}
          on:backToLibrary={handleBackToLibrary}
        />
      </div>
    {/if}
  </div>
{/if}

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

  .create-mode {
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

  .create-mode.mobile .workspace {
    grid-template-columns: minmax(0, 1fr);
    padding: 0;
    gap: 0;
  }

  .create-mode.mobile .map-stage {
    min-height: 100vh;
  }

  /* ---------- Control Buttons (shared) ---------- */
  .ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
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
    touch-action: manipulation;
  }

  .ctrl-btn:hover {
    background: rgba(212, 175, 55, 0.25);
    transform: scale(1.05);
  }

  .ctrl-btn:active {
    transform: scale(0.95);
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
    bottom: calc(env(safe-area-inset-bottom) + 1rem);
    right: calc(env(safe-area-inset-right) + 1rem);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 50;
    pointer-events: auto;
  }

  @media (max-width: 900px) {
    .floating-controls {
      bottom: calc(env(safe-area-inset-bottom) + 5rem);
    }
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
    bottom: calc(env(safe-area-inset-bottom) + 4.5rem);
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

  /* ---------- Auth Gate ---------- */
  .auth-gate {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    background: linear-gradient(180deg, #f4e8d8 0%, #ebe0d0 50%, #e8d5ba 100%);
  }

  .auth-gate-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    width: 100%;
    max-width: 400px;
    padding: 3rem 2.5rem;
    background: rgba(255, 255, 255, 0.6);
    border: 2px solid rgba(212, 175, 55, 0.4);
    border-radius: 4px;
    text-align: center;
  }

  .auth-gate-title {
    margin: 0;
    font-family: "Spectral", serif;
    font-size: 1.5rem;
    font-weight: 700;
    color: #2b2520;
  }

  .auth-gate-text {
    margin: 0;
    font-family: "Be Vietnam Pro", sans-serif;
    font-size: 0.9rem;
    color: #6b5d52;
  }

  .auth-gate-btn.google {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    padding: 0.75rem 2rem;
    background: #fff;
    color: #2b2520;
    border: 2px solid rgba(212, 175, 55, 0.4);
    border-radius: 4px;
    font-family: "Be Vietnam Pro", sans-serif;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .auth-gate-btn.google:hover {
    border-color: #d4af37;
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  /* ---------- Story Library ---------- */
  .library-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .library-title {
    margin: 0;
    font-family: "Spectral", serif;
    font-size: 1.75rem;
    font-weight: 800;
    color: #2b2520;
  }

  .library-subtitle {
    margin: 0.35rem 0 0;
    font-family: "Be Vietnam Pro", sans-serif;
    font-size: 0.85rem;
    color: #8b7355;
  }

  .library-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .library-create-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.6rem 1.2rem;
    background: #2b2520;
    color: #f4e8d8;
    border: none;
    border-radius: 4px;
    font-family: "Be Vietnam Pro", sans-serif;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
    white-space: nowrap;
  }

  .library-create-btn:hover {
    background: #4a3f35;
  }

  .library-create-btn.large {
    padding: 0.85rem 2rem;
    font-size: 0.95rem;
  }

  .library-home-btn {
    text-decoration: none;
    font-family: "Be Vietnam Pro", sans-serif;
    font-size: 0.9rem;
    color: #2b2520;
    padding: 0.5rem 1rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.4);
    border: 1px solid rgba(212, 175, 55, 0.2);
    transition: all 0.2s;
  }
  .library-home-btn:hover {
    background: rgba(255, 255, 255, 0.7);
    border-color: #d4af37;
  }

  .library-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 4rem 1rem;
    font-family: "Be Vietnam Pro", sans-serif;
    font-size: 0.875rem;
    color: #8b7355;
  }

  .library-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    padding: 4rem 1.5rem;
    text-align: center;
  }

  .empty-title {
    margin: 0;
    font-family: "Spectral", serif;
    font-size: 1.35rem;
    font-weight: 700;
    color: #2b2520;
  }

  .empty-text {
    margin: 0;
    font-family: "Be Vietnam Pro", sans-serif;
    font-size: 0.875rem;
    color: #6b5d52;
    max-width: 360px;
    line-height: 1.5;
  }

  /* Story Card Custom Styles for CatalogCard slots */
  .story-thumb-placeholder {
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #f4e8d8 0%, #e8d5ba 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    color: #d4af37;
  }

  .meta {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.25rem;
  }

  .meta-tag {
    font-size: 0.75rem;
    color: #8b7355;
    background: rgba(212, 175, 55, 0.15);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }

  .description {
    font-size: 0.85rem;
    color: #6b5d52;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .btn-icon-delete {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: #8b7355;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-icon-delete:hover {
    background: rgba(220, 53, 69, 0.1);
    color: #dc3545;
  }
  .btn-primary:hover {
    background: #c9a430;
  }

  .btn-secondary {
    padding: 0.6rem 1.2rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
    color: #333;
    font-weight: 600;
    cursor: pointer;
  }

  /* ---------- Logic / Dialog Styles ---------- */
  .dialog-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.5);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dialog-card {
    background: white;
    padding: 2rem;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    max-width: 400px;
    text-align: center;
  }

  .dialog-card h3 {
    margin-top: 0;
    color: #2b2520;
  }

  .dialog-actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-top: 1.5rem;
  }

  .btn-primary {
    padding: 0.6rem 1.2rem;
    border: none;
    border-radius: 4px;
    background: #d4af37;
    color: white;
    font-weight: 600;
    cursor: pointer;
  }

  /* ---------- Logic / Dialog Styles ---------- */
  .overlay-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
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
</style>
