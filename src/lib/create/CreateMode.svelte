<!--
  CreateMode.svelte — /create mode orchestrator.
  Story/adventure builder. Uses MapShell + HistoricalOverlay.
  Points are placed on the map and configured in the StoryEditor panel.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import "$lib/styles/layouts/create-mode.css";
  import { fromLonLat, transformExtent } from "ol/proj";
  import type Map from "ol/Map";

  import type { ViewMode, MapListItem, SearchResult } from "$lib/viewer/types";
  import type { Story, StoryPoint } from "$lib/story/types";
  import { createMapStore } from "$lib/stores/mapStore";
  import { createLayerStore } from "$lib/stores/layerStore";
  import { getSupabaseContext } from "$lib/supabase/context";
  import { fetchMaps } from "$lib/supabase/maps";
  import { publishStory, unpublishStory } from "$lib/supabase/stories";
  import { createStoryLibraryStore } from "$lib/story/stores/storyStore";
  import { fetchAnnotationBounds } from "$lib/geo/mapBounds";
  import { boundsCenter, boundsZoom } from "$lib/ui/searchUtils";
  import { fetchMapBounds } from "$lib/shell/warpedOverlay"; // New import

  import MapShell from "$lib/shell/MapShell.svelte";
  import HistoricalOverlay from "$lib/shell/HistoricalOverlay.svelte";
  import MapClickCapture from "./MapClickCapture.svelte";
  import StoryEditor from "./StoryEditor.svelte";
  import MapSearchBar from "$lib/ui/MapSearchBar.svelte";
  import StoryMarkers from "$lib/view/StoryMarkers.svelte";
  import StoryPlayback from "$lib/view/StoryPlayback.svelte";
  import NameDialog from "$lib/ui/NameDialog.svelte";
  import CatalogPage from "$lib/ui/catalog/CatalogPage.svelte";
  import CatalogHeader from "$lib/ui/catalog/CatalogHeader.svelte";
  import CatalogGrid from "$lib/ui/catalog/CatalogGrid.svelte";
  import CatalogCard from "$lib/ui/catalog/CatalogCard.svelte";
  import MapToolbar from "$lib/ui/MapToolbar.svelte";

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
  let isPublishing = false;
  let publishSuccess = false;
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

  // Preview mode state
  let previewMode = false;
  let previewProgress: import("$lib/story/types").StoryProgress | null = null;

  // Name dialog state
  let nameDialogOpen = false;
  let nameDialogValue = "";
  let nameDialogDescriptionValue = "";
  let nameDialogHeading = "New Story";
  let nameDialogEditId: string | null = null;

  $: points = currentStory?.points ?? [];

  // Only show stories owned by the current user
  $: myStories = $storyLibrary.stories.filter((s) => s.authorId === userId);

  function toggleBasemap() {
    layerStore.setBasemap(
      basemapSelection === "g-streets" ? "g-satellite" : "g-streets",
    );
  }

  function handleChangeViewMode(event: CustomEvent<{ mode: ViewMode }>) {
    layerStore.setViewMode(event.detail.mode);
  }

  function handleChangeOpacity(event: CustomEvent<{ value: number }>) {
    layerStore.setOverlayOpacity(event.detail.value);
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

  function createNewStory(title = "Untitled Story", description = ""): Story {
    const id = crypto.randomUUID();
    return {
      id,
      title,
      description,
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

  async function handleTogglePublish() {
    if (!currentStory) return;
    isPublishing = true;
    publishSuccess = false;

    const newPublishState = !currentStory.isPublic;

    // Update in database
    const success = newPublishState
      ? await publishStory(supabase, currentStory.id)
      : await unpublishStory(supabase, currentStory.id);

    if (!success) {
      console.error("[CreateMode] Failed to update publish status");
      isPublishing = false;
      return;
    }

    // Update local state after successful DB update
    currentStory = { ...currentStory, isPublic: newPublishState };

    // Update in library
    storyLibrary.update((lib) => ({
      stories: lib.stories.map((s) =>
        s.id === currentStory!.id ? currentStory! : s,
      ),
    }));

    console.log(
      `[CreateMode] Story ${newPublishState ? "published" : "unpublished"}:`,
      currentStory.id,
    );

    // Show success feedback
    isPublishing = false;
    publishSuccess = true;
    setTimeout(() => {
      publishSuccess = false;
    }, 2000);
  }

  function handlePreview() {
    if (!currentStory || currentStory.points.length === 0) return;

    // Initialize preview progress
    previewProgress = {
      storyId: currentStory.id,
      huntId: currentStory.id,
      currentPointIndex: 0,
      currentStopIndex: 0,
      completedPoints: [],
      completedStops: [],
      startedAt: Date.now(),
    };

    previewMode = true;

    // Navigate to first point
    const firstPoint = currentStory.points[0];
    if (firstPoint.coordinates) {
      mapStore.setView({
        lng: firstPoint.coordinates[0],
        lat: firstPoint.coordinates[1],
        zoom: 17,
      });
    }
    if (firstPoint.overlayMapId) {
      mapStore.setActiveMap(firstPoint.overlayMapId);
    }

    console.log("[CreateMode] Preview started");
  }

  function handlePreviewNavigate(
    event: CustomEvent<{
      index: number;
      point: import("$lib/story/types").StoryPoint;
    }>,
  ) {
    const { index, point } = event.detail;
    if (!previewProgress) return;

    previewProgress = {
      ...previewProgress,
      currentPointIndex: index,
      currentStopIndex: index,
    };

    // Navigate to point
    if (point.coordinates) {
      mapStore.setView({
        lng: point.coordinates[0],
        lat: point.coordinates[1],
        zoom: 17,
      });
    }
    if (point.overlayMapId) {
      mapStore.setActiveMap(point.overlayMapId);
    }
  }

  function handlePreviewComplete(
    event: CustomEvent<{ storyId: string; pointId: string }>,
  ) {
    if (!previewProgress || !currentStory) return;

    const { pointId } = event.detail;
    const completedSet = new Set(previewProgress.completedPoints);
    completedSet.add(pointId);

    previewProgress = {
      ...previewProgress,
      completedPoints: Array.from(completedSet),
      completedStops: Array.from(completedSet),
      currentPointIndex: Math.min(
        previewProgress.currentPointIndex + 1,
        currentStory.points.length,
      ),
      currentStopIndex: Math.min(
        previewProgress.currentStopIndex + 1,
        currentStory.points.length,
      ),
    };
  }

  function handlePreviewClose() {
    previewMode = false;
    previewProgress = null;
    console.log("[CreateMode] Preview closed");
  }

  function handlePreviewFinish() {
    previewMode = false;
    previewProgress = null;
    console.log("[CreateMode] Preview finished");
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
    nameDialogEditId = null;
    nameDialogValue = "";
    nameDialogDescriptionValue = "";
    nameDialogHeading = "New Story";
    nameDialogOpen = true;
  }

  function handleEditStoryName(story: Story) {
    nameDialogEditId = story.id;
    nameDialogValue = story.title;
    nameDialogDescriptionValue = story.description || "";
    nameDialogHeading = "Rename Story";
    nameDialogOpen = true;
  }

  function handleNameDialogSubmit(
    event: CustomEvent<{ title: string; description?: string }>,
  ) {
    const { title, description } = event.detail;
    nameDialogOpen = false;

    if (nameDialogEditId) {
      // Edit existing story
      storyLibrary.updateStory(nameDialogEditId, { title, description });
    } else {
      // Create new story
      const id = storyLibrary.createStory(title, description || "");
      // Enter editor
      setTimeout(() => {
        const stories = $storyLibrary.stories;
        const newStory = stories.find((s) => s.id === id);
        if (newStory) {
          currentStory = newStory;
          activeView = "editor";
        }
      }, 50);
    }
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
              <span
                class="meta-tag publish-status"
                class:published={story.isPublic}
              >
                {story.isPublic ? "🌍 Public" : "🔒 Private"}
              </span>
            </div>

            <div slot="description" class="description">
              {story.description || "No description"}
            </div>

            <div slot="actions">
              <button
                type="button"
                class="btn-icon-edit"
                title="Rename story"
                on:click|stopPropagation={() => handleEditStoryName(story)}
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
                  <path
                    d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                  />
                </svg>
              </button>
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

  <NameDialog
    open={nameDialogOpen}
    bind:value={nameDialogValue}
    showDescription={true}
    bind:descriptionValue={nameDialogDescriptionValue}
    heading={nameDialogHeading}
    on:submit={handleNameDialogSubmit}
    on:close={() => (nameDialogOpen = false)}
  />

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
          {isPublishing}
          {publishSuccess}
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
          on:togglePublish={handleTogglePublish}
          on:preview={handlePreview}
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
              currentIndex={previewMode
                ? (previewProgress?.currentPointIndex ?? 0)
                : currentPointIndex}
            />
          {/if}

          {#if previewMode && currentStory}
            <StoryPlayback
              story={currentStory}
              progress={previewProgress}
              on:navigatePoint={handlePreviewNavigate}
              on:completePoint={handlePreviewComplete}
              on:close={handlePreviewClose}
              on:finish={handlePreviewFinish}
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
