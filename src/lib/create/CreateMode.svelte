<!--
  CreateMode.svelte — /create plugin on MapWorkspace.
  Story/adventure builder: place points by clicking the map, preview a story playback,
  Cmd+Z undo, save+publish. Auth gate → library → editor.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import "$styles/layouts/create-mode.css";
  import { fromLonLat } from "ol/proj";
  import type Map from "ol/Map";

  import type { MapListItem, SearchResult } from "$lib/map/types";
  import type { Story, StoryPoint } from "$lib/story/types";
  import { createGeoMapStores } from "$lib/shell/geoMapSetup";
  import { getSupabaseContext } from "$lib/supabase/context";
  import { publishStory, unpublishStory } from "$lib/supabase/stories";
  import { createStoryLibraryStore } from "$lib/story/stores/storyStore";
  import { fetchAnnotationBounds } from "$lib/geo/mapBounds";
  import { boundsCenter, boundsZoom } from "$lib/ui/searchUtils";

  import MapWorkspace from "$lib/shell/MapWorkspace.svelte";
  import MapClickCapture from "./MapClickCapture.svelte";
  import StoryEditor from "./StoryEditor.svelte";
  import StoryMarkers from "$lib/view/StoryMarkers.svelte";
  import StoryPlayback from "$lib/view/StoryPlayback.svelte";
  import NameDialog from "$lib/ui/NameDialog.svelte";
  import PageHero from "$lib/ui/PageHero.svelte";
  import CatalogGrid from "$lib/ui/catalog/CatalogGrid.svelte";
  import CatalogCard from "$lib/ui/catalog/CatalogCard.svelte";

  const { supabase, session } = getSupabaseContext();
  const userId = session?.user?.id;

  const { mapStore, layerStore } = createGeoMapStores();
  const storyLibrary = createStoryLibraryStore(supabase, userId);

  // Bound from MapWorkspace
  let mapList: MapListItem[] = [];
  let selectedMap: MapListItem | null = null;
  let shellMap: Map | null = null;
  let sidebarCollapsed = false;
  let isMobile = false;
  let isCompact = false;

  // Create-specific state
  let currentStory: Story | null = null;
  let selectedPointId: string | null = null;
  let placingPoint = false;
  let movingPoint = false;
  let isSaving = false;
  let saveSuccess = false;
  let isPublishing = false;
  let publishSuccess = false;
  let keydownHandler: ((event: KeyboardEvent) => void) | null = null;

  let activeView: "library" | "editor" = "library";
  let storiesLoading = true;

  // Preview mode state
  let previewMode = false;
  let previewProgress: import("$lib/story/types").StoryProgress | null = null;

  // Name dialog state
  let nameDialogOpen = false;
  let nameDialogValue = "";
  let nameDialogDescriptionValue = "";
  let nameDialogHeading = "New Story";
  let nameDialogEditId: string | null = null;

  $: currentPointIndex = currentStory?.points.findIndex((p) => p.id === selectedPointId) ?? -1;
  $: myStories = $storyLibrary.stories.filter((s) => s.authorId === userId);

  function createNewStory(title = "Untitled Story", description = ""): Story {
    return {
      id: crypto.randomUUID(),
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
      overlayMapId: $mapStore.activeMapId || undefined,
    };
  }

  // -- Map click: place OR move --
  function handleMapClick(event: CustomEvent<{ lon: number; lat: number }>) {
    if (!currentStory) return;
    const { lon, lat } = event.detail;

    if (movingPoint && selectedPointId) {
      handleUpdatePoint(
        new CustomEvent("updatePoint", {
          detail: { pointId: selectedPointId, updates: { coordinates: [lon, lat] } },
        }),
      );
      movingPoint = false;
      return;
    }

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
  function handleUpdateStory(event: CustomEvent<{ title?: string; description?: string }>) {
    if (!currentStory) return;
    currentStory = { ...currentStory, ...event.detail, updatedAt: Date.now() };
  }

  function handleUpdatePoint(event: CustomEvent<{ pointId: string; updates: Partial<StoryPoint> }>) {
    if (!currentStory) return;
    const { pointId, updates } = event.detail;
    const pts = currentStory.points.map((p) => p.id === pointId ? { ...p, ...updates } : p);
    currentStory = { ...currentStory, points: pts, stops: pts, updatedAt: Date.now() };
  }

  function handleRemovePoint(event: CustomEvent<{ pointId: string }>) {
    if (!currentStory) return;
    const pts = currentStory.points
      .filter((p) => p.id !== event.detail.pointId)
      .map((p, i) => ({ ...p, order: i }));
    currentStory = { ...currentStory, points: pts, stops: pts, updatedAt: Date.now() };
    if (selectedPointId === event.detail.pointId) selectedPointId = null;
  }

  function handleSelectPoint(event: CustomEvent<{ pointId: string | null }>) {
    selectedPointId = event.detail.pointId;
  }

  function handleZoomToPoint(event: CustomEvent<{ pointId: string }>) {
    if (!currentStory) return;
    const point = currentStory.points.find((p) => p.id === event.detail.pointId);
    if (point) {
      mapStore.setView({ lng: point.coordinates[0], lat: point.coordinates[1], zoom: 17 });
    }
  }

  function handleZoomToAll() {
    if (!currentStory || !currentStory.points.length || !shellMap) return;
    const coords = currentStory.points.map((p) => fromLonLat(p.coordinates));
    const extent = coords.reduce(
      (ext, c) => [Math.min(ext[0], c[0]), Math.min(ext[1], c[1]), Math.max(ext[2], c[0]), Math.max(ext[3], c[1])],
      [Infinity, Infinity, -Infinity, -Infinity],
    );
    shellMap.getView().fit(extent, { padding: [60, 60, 60, 60], duration: 800 });
  }

  function handleTogglePlacing() {
    if (!currentStory) currentStory = createNewStory();
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
    const success = newPublishState
      ? await publishStory(supabase, currentStory.id)
      : await unpublishStory(supabase, currentStory.id);

    if (!success) {
      console.error("[CreateMode] Failed to update publish status");
      isPublishing = false;
      return;
    }

    currentStory = { ...currentStory, isPublic: newPublishState };
    storyLibrary.update((lib) => ({
      stories: lib.stories.map((s) => s.id === currentStory!.id ? currentStory! : s),
    }));

    isPublishing = false;
    publishSuccess = true;
    setTimeout(() => { publishSuccess = false; }, 2000);
  }

  function handlePreview() {
    if (!currentStory || currentStory.points.length === 0) return;
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

    const firstPoint = currentStory.points[0];
    if (firstPoint.coordinates) {
      mapStore.setView({ lng: firstPoint.coordinates[0], lat: firstPoint.coordinates[1], zoom: 17 });
    }
    if (firstPoint.overlayMapId) {
      const found = mapList.find((m) => m.id === firstPoint.overlayMapId || m.allmaps_id === firstPoint.overlayMapId);
      mapStore.setActiveMap(found?.id ?? firstPoint.overlayMapId, found?.annotation_url ?? found?.allmaps_id);
    }
  }

  function handlePreviewNavigate(event: CustomEvent<{ index: number; point: StoryPoint }>) {
    const { index, point } = event.detail;
    if (!previewProgress) return;
    previewProgress = { ...previewProgress, currentPointIndex: index, currentStopIndex: index };
    if (point.coordinates) {
      mapStore.setView({ lng: point.coordinates[0], lat: point.coordinates[1], zoom: 17 });
    }
    if (point.overlayMapId) {
      const found = mapList.find((m) => m.id === point.overlayMapId || m.allmaps_id === point.overlayMapId);
      mapStore.setActiveMap(found?.id ?? point.overlayMapId, found?.annotation_url ?? found?.allmaps_id);
    }
  }

  function handlePreviewComplete(event: CustomEvent<{ storyId: string; pointId: string }>) {
    if (!previewProgress || !currentStory) return;
    const { pointId } = event.detail;
    const completedSet = new Set(previewProgress.completedPoints);
    completedSet.add(pointId);
    previewProgress = {
      ...previewProgress,
      completedPoints: Array.from(completedSet),
      completedStops: Array.from(completedSet),
      currentPointIndex: Math.min(previewProgress.currentPointIndex + 1, currentStory.points.length),
      currentStopIndex: Math.min(previewProgress.currentStopIndex + 1, currentStory.points.length),
    };
  }

  function handlePreviewClose() {
    previewMode = false;
    previewProgress = null;
  }

  function handlePreviewFinish() {
    previewMode = false;
    previewProgress = null;
  }

  async function handleSave() {
    if (!currentStory) return;
    isSaving = true;
    await new Promise((r) => setTimeout(r, 600));
    storyLibrary.update((lib) => {
      const exists = lib.stories.some((s) => s.id === currentStory!.id);
      return exists
        ? { stories: lib.stories.map((s) => s.id === currentStory!.id ? currentStory! : s) }
        : { stories: [...lib.stories, currentStory!] };
    });
    isSaving = false;
    saveSuccess = true;
    setTimeout(() => { saveSuccess = false; }, 2000);
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

  function handleNameDialogSubmit(event: CustomEvent<{ title: string; description?: string }>) {
    const { title, description } = event.detail;
    nameDialogOpen = false;

    if (nameDialogEditId) {
      storyLibrary.updateStory(nameDialogEditId, { title, description });
    } else {
      const id = storyLibrary.createStory(title, description || "");
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

    if (currentStory && currentStory.points.length > 0) {
      const lastPoint = currentStory.points[currentStory.points.length - 1];
      const updatedPoint = { ...lastPoint, title: result.display_name.split(",")[0] };
      const newPoints = [...currentStory.points];
      newPoints[newPoints.length - 1] = updatedPoint;
      currentStory = { ...currentStory, points: newPoints, stops: newPoints };
      selectedPointId = updatedPoint.id;
    }

    mapStore.setView({ lng: lon, lat: lat, zoom: 16 });
  }

  async function handleZoomToMap(event: CustomEvent<{ map: MapListItem }>) {
    const { map } = event.detail;
    let bounds = map.bounds ?? null;
    if (!bounds) bounds = await fetchAnnotationBounds(map.allmaps_id ?? '');
    if (bounds) {
      const center = boundsCenter(bounds);
      const zoom = boundsZoom(bounds);
      mapStore.setView({ lng: center.lng, lat: center.lat, zoom });
    }
  }

  function handleUndo() {
    if (!currentStory || !currentStory.points.length) return;
    const pts = currentStory.points.slice(0, -1).map((p, i) => ({ ...p, order: i }));
    currentStory = { ...currentStory, points: pts, stops: pts, updatedAt: Date.now() };
  }

  onMount(() => {
    storyLibrary.loadFromSupabase().finally(() => { storiesLoading = false; });

    keydownHandler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName))) return;
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
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d4af37" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
      <h2 class="auth-gate-title">Sign in to Create</h2>
      <p class="auth-gate-text">Sign in with your Google account to create and manage stories.</p>
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

  <!-- Story Library View -->
{:else if activeView === "library"}
  <div class="page">
    <PageHero eyebrow="Tools" sub="Create guided stories and adventures on historical maps">
      <svelte:fragment slot="title">My <span class="text-highlight">Stories.</span></svelte:fragment>
      <div slot="actions">
        <button type="button" class="action-btn primary-btn" on:click={handleCreateNewStory}>+ New Story</button>
      </div>
    </PageHero>

    <main class="editorial-main">
      {#if storiesLoading}
        <div class="library-loading">
          <div class="loading-spinner"></div>
          <span>Loading stories...</span>
        </div>
      {:else if myStories.length === 0}
        <div class="library-empty">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#d4af37" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <path d="M12 18v-6M9 15h6" />
          </svg>
          <h2 class="empty-title">Create your first story</h2>
          <p class="empty-text">Place points on historical maps, add descriptions and challenges, and share your creation.</p>
          <button type="button" class="library-create-btn large" on:click={handleCreateNewStory}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create Story
          </button>
        </div>
      {:else}
        <CatalogGrid>
          {#each myStories as story (story.id)}
            <CatalogCard title={story.title} on:click={() => handleSelectStory(story)}>
              <div slot="thumb" class="story-thumb-placeholder">
                <span class="story-icon">📖</span>
              </div>
              <div slot="meta" class="meta">
                <span class="meta-tag">{story.points.length} point{story.points.length !== 1 ? "s" : ""}</span>
                <span class="meta-tag date">{new Date(story.updatedAt).toLocaleDateString("en-GB")}</span>
                <span class="meta-tag publish-status" class:published={story.isPublic}>
                  {story.isPublic ? "🌍 Public" : "🔒 Private"}
                </span>
              </div>
              <div slot="description" class="description">{story.description || "No description"}</div>
              <div slot="actions">
                <button type="button" class="btn-icon-edit" title="Rename story" on:click|stopPropagation={() => handleEditStoryName(story)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button type="button" class="btn-icon-delete" title="Delete story" on:click|stopPropagation={() => {
                  if (confirm(`Delete "${story.title}"?`)) storyLibrary.deleteStory(story.id);
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
    showDescription={true}
    bind:descriptionValue={nameDialogDescriptionValue}
    heading={nameDialogHeading}
    on:submit={handleNameDialogSubmit}
    on:close={() => (nameDialogOpen = false)}
  />

  <!-- Editor View -->
{:else}
  <div class="create-mode" class:mobile={isMobile}>
    <MapWorkspace
      {supabase}
      {mapStore}
      {layerStore}
      showDual={false}
      showAddAsPointInSearch={true}
      bind:mapList
      bind:selectedMap
      bind:shellMap
      bind:sidebarCollapsed
      bind:isMobile
      bind:isCompact
      on:searchnavigate={handleSearchNavigate}
    >
      <svelte:fragment slot="sidebar">
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
      </svelte:fragment>

      <svelte:fragment slot="map-children">
        <MapClickCapture
          enabled={placingPoint || movingPoint}
          on:mapClick={handleMapClick}
          on:mapReady={handleMapReady}
        />
        {#if currentStory}
          <StoryMarkers
            points={currentStory.points}
            currentIndex={previewMode ? (previewProgress?.currentPointIndex ?? 0) : currentPointIndex}
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
      </svelte:fragment>

      <svelte:fragment slot="mobile-sidebar">
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
      </svelte:fragment>
    </MapWorkspace>
  </div>
{/if}
