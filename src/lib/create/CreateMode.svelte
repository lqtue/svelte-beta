<!--
  CreateMode.svelte — /create plugin on MapWorkspace.

  Desktop authoring:
    • Left sidebar  — Layers · Controls · Browse (MapViewerSidebar, shared)
    • Right sidebar — Story info · Points · Point editor (CreateRightPane)
  Edits to currentStory auto-persist to storyLibrary on every change
  (see persistDraft below), and the last-open story id is remembered in
  localStorage so reloads land back in the editor.

  Mobile: editor is desktop-only. Mobile users see the library and tapping a
  story opens it in /explore?story=<id> for playback. A banner explains the limit.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import '$styles/layouts/create-mode.css';
  import { goto } from '$app/navigation';

  import type { MapListItem, SearchResult } from '$lib/map/types';
  import type { Story, StoryPoint } from '$lib/story/types';
  import { createGeoMapStores } from '$lib/shell/geoMapSetup';
  import { getSupabaseContext } from '$lib/supabase/context';
  import { syncStoryToSupabase } from '$lib/supabase/stories';
  import { createStoryLibraryStore } from '$lib/story/stores/storyStore';
  import { fetchGeoreferencedMaps } from '$lib/maps/service';
  import { layersStore } from '$lib/stores/layersStore';
  import { applyPointOverlay, applyStoryPoint, resolveMapRef } from '$lib/story/applyPoint';
  import { createMapPickHandlers } from '$lib/story/mapPickHandlers';

  import MapWorkspace from '$lib/shell/MapWorkspace.svelte';
  import MapClickCapture from './MapClickCapture.svelte';
  import MapViewerSidebar from '$lib/ui/catalog/MapViewerSidebar.svelte';
  import CreateRightPane from './CreateRightPane.svelte';
  import StoryMarkers from '$lib/story/StoryMarkers.svelte';
  import StoryPlayback from '$lib/story/StoryPlayback.svelte';
  import LayerStackPanel from '$lib/ui/catalog/LayerStackPanel.svelte';
  import LayerControlsPanel from '$lib/ui/catalog/LayerControlsPanel.svelte';
  import CatalogSidebarPanel from '$lib/ui/catalog/CatalogSidebarPanel.svelte';
  import AuthGate from '$lib/ui/AuthGate.svelte';
  import LibraryGrid from '$lib/ui/LibraryGrid.svelte';

  const { supabase, session } = getSupabaseContext();
  const userId = session?.user?.id;

  const { mapStore, layerStore } = createGeoMapStores();
  const storyLibrary = createStoryLibraryStore(supabase, userId);

  // Bound from MapWorkspace when in editor view. Pre-fetched independently on
  // mount so the library-view seed can pin a real historical layer (the
  // workspace doesn't mount until the user opens a story).
  let mapList: MapListItem[] = [];
  let selectedMap: MapListItem | null = null;
  let sidebarCollapsed = false;
  let rightSidebarCollapsed = false;
  let isMobile = false;

  const { handlePickMap, handleZoomToOverlay, handlePickLocation } = createMapPickHandlers({
    mapStore,
    mapList: () => mapList,
  });

  // Editor state
  let currentStory: Story | null = null;
  let selectedPointId: string | null = null;
  let placingPoint = false;
  let movingPoint = false;
  let isPublishing = false;
  let publishSuccess = false;
  let keydownHandler: ((event: KeyboardEvent) => void) | null = null;

  let activeView: 'library' | 'editor' = 'library';
  let storiesLoading = true;

  // /create always lands on the library (welcome screen); the user picks
  // which story to edit. Drafts auto-persist regardless via persistDraft.

  // Preview
  let previewMode = false;
  let previewProgress: import('$lib/story/types').StoryProgress | null = null;

  // Reactive: top historical overlay drives new-point pinning + inspector display.
  $: topOverlay = $layersStore.overlays[0]?.ref ?? null;
  $: topLayerMapId = topOverlay?.mapId ?? null;
  $: topLayerName = topOverlay?.name ?? null;

  $: selectedPoint = currentStory?.points.find((p) => p.id === selectedPointId) ?? null;
  $: selectedPointIndex = selectedPoint
    ? currentStory!.points.findIndex((p) => p.id === selectedPoint!.id)
    : -1;
  $: pinnedLayerName = selectedPoint?.overlayMapId
    ? (resolveMapRef(mapList, selectedPoint.overlayMapId)?.name ?? selectedPoint.overlayMapId)
    : null;

  $: myStories = $storyLibrary.stories.filter((s) => s.authorId === userId);

  // Auto-deselect on mobile (right rail not rendered there)
  $: if (isMobile && selectedPointId) selectedPointId = null;

  // Auto-persist edits to the library so a reload never loses unsaved work.
  // storyLibrary is a localStorage-backed persisted store (debounced 300ms),
  // so every change to currentStory is written through within ~300ms.
  $: if (currentStory) persistDraft(currentStory);
  function persistDraft(s: Story) {
    storyLibrary.update((lib) => {
      const idx = lib.stories.findIndex((x) => x.id === s.id);
      if (idx === -1) return { stories: [...lib.stories, s] };
      const existing = lib.stories[idx];
      if (existing === s) return { stories: lib.stories };
      const next = [...lib.stories];
      next[idx] = s;
      return { stories: next };
    });
  }

  function createNewStory(title = 'Untitled Story', description = ''): Story {
    return {
      id: crypto.randomUUID(),
      title,
      description,
      mode: 'guided',
      points: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPublic: false,
      authorId: userId!,
    };
  }

  // Seed a sample story across central District 1 with mixed challenge types
  // (none / question / reach) and the first georeferenced map covering Saigon
  // pinned as the historical overlay for every point.
  type SamplePoint = {
    title: string;
    description: string;
    lon: number;
    lat: number;
    challenge: import('$lib/story/types').PointChallenge;
  };
  const SAIGON_CENTER: [number, number] = [106.6988, 10.7787];
  const SAIGON_SAMPLE_POINTS: SamplePoint[] = [
    {
      title: 'Notre-Dame Cathedral',
      description: 'Neo-Romanesque cathedral built 1877–1880 with bricks shipped from Marseille.',
      lon: 106.69906,
      lat: 10.77983,
      challenge: { type: 'none' },
    },
    {
      title: 'Central Post Office',
      description: 'Opened 1891 in the French Indochina style next to the cathedral.',
      lon: 106.69963,
      lat: 10.77996,
      challenge: {
        type: 'question',
        question: "Which famous engineer's firm is often credited with this building?",
        answer: 'Eiffel',
      },
    },
    {
      title: 'Independence Palace',
      description: 'Rebuilt 1962–1966 on the site of the former Norodom Palace.',
      lon: 106.6953,
      lat: 10.777,
      challenge: {
        type: 'question',
        question: 'In which year did this site mark the end of the war?',
        answer: '1975',
      },
    },
    {
      title: 'Saigon Opera House',
      description: 'Beaux-Arts theatre opened 1900 on the former Rue Catinat.',
      lon: 106.7037,
      lat: 10.7765,
      challenge: { type: 'reach', triggerRadius: 30 },
    },
    {
      title: 'Bến Thành Market',
      description: 'Iconic four-gate covered market relocated here in 1914.',
      lon: 106.6983,
      lat: 10.7726,
      challenge: { type: 'reach', triggerRadius: 25 },
    },
  ];

  function pickSaigonHistoricalMap(): MapListItem | null {
    const [lng, lat] = SAIGON_CENTER;
    const containsSaigon = (m: MapListItem) => {
      const bb = m.bounds ?? m.bbox;
      if (!bb) return false;
      const [w, s, e, n] = bb;
      return lng >= w && lng <= e && lat >= s && lat <= n;
    };
    // Prefer a georeferenced map whose bbox covers central Saigon.
    return (
      mapList.find((m) => (m.allmaps_id || m.annotation_url) && containsSaigon(m)) ??
      mapList.find((m) => m.allmaps_id || m.annotation_url) ??
      null
    );
  }

  // Auto-seed the Saigon example exactly once per seed-version. Bumping
  // SAIGON_SEED_KEY (e.g. v2 → v3) forces a re-seed so changes to the sample
  // (new challenges, new layer pick, etc.) reach existing users on next visit.
  // Any prior copy of the example (matched by title) is removed first so the
  // user gets the up-to-date version exactly once.
  const SAIGON_SEED_KEY = 'vma-create-saigon-seeded-v2';
  const SAIGON_SEED_TITLE = 'Walk around central Saigon';
  let saigonSeeded = false;
  $: if (
    !saigonSeeded &&
    userId &&
    !storiesLoading &&
    mapList.length > 0 &&
    typeof window !== 'undefined' &&
    !localStorage.getItem(SAIGON_SEED_KEY)
  ) {
    saigonSeeded = true;
    try {
      localStorage.setItem(SAIGON_SEED_KEY, '1');
    } catch {}
    // Remove any stale copy from a prior seed version, then seed fresh.
    storyLibrary.update((lib) => ({
      stories: lib.stories.filter((s) => s.title !== SAIGON_SEED_TITLE),
    }));
    seedSaigonExample();
  }

  function seedSaigonExample() {
    const baseMap = pickSaigonHistoricalMap();
    const overlayMapId = baseMap?.id ?? undefined;

    const story = createNewStory(
      SAIGON_SEED_TITLE,
      'Five landmarks of colonial-era District 1 — try Question and Reach challenges as you go.'
    );
    story.points = SAIGON_SAMPLE_POINTS.map((p, i) => ({
      id: crypto.randomUUID(),
      order: i,
      title: p.title,
      description: p.description,
      coordinates: [p.lon, p.lat],
      triggerRadius: p.challenge.type === 'reach' ? (p.challenge.triggerRadius ?? 15) : 15,
      interaction: 'proximity',
      challenge: p.challenge,
      overlayMapId,
    }));
    // Persist directly to the library (we're on the library screen — don't
    // hijack the user into the editor).
    storyLibrary.update((lib) => ({ stories: [...lib.stories, story] }));
  }

  function createNewPoint(lon: number, lat: number): StoryPoint {
    const order = currentStory?.points.length ?? 0;
    return {
      id: crypto.randomUUID(),
      order,
      title: `Point ${order + 1}`,
      description: '',
      coordinates: [lon, lat],
      triggerRadius: 15,
      interaction: 'proximity',
      challenge: { type: 'none' },
      // Pin to current top historical overlay so playback re-shows it.
      overlayMapId: topLayerMapId ?? undefined,
    };
  }

  // Map click: place OR move.
  function handleMapClick(event: CustomEvent<{ lon: number; lat: number }>) {
    if (!currentStory) return;
    const { lon, lat } = event.detail;

    if (movingPoint && selectedPointId) {
      handleUpdatePoint(
        new CustomEvent('updatePoint', {
          detail: { pointId: selectedPointId, updates: { coordinates: [lon, lat] } },
        })
      );
      movingPoint = false;
      return;
    }

    if (placingPoint) {
      const point = createNewPoint(lon, lat);
      currentStory = {
        ...currentStory,
        points: [...currentStory.points, point],
        updatedAt: Date.now(),
      };
      // Stay in placing mode so the user can drop multiple points in a row.
      // Don't auto-open the inspector — that would swap the right pane away
      // from the points list and break the placement flow. The user opens
      // the editor by tapping a row, or by toggling Place off and back on.
    }
  }

  // Story / point handlers
  function handleUpdatePoint(
    event: CustomEvent<{ pointId: string; updates: Partial<StoryPoint> }>
  ) {
    if (!currentStory) return;
    const { pointId, updates } = event.detail;
    const pts = currentStory.points.map((p) => (p.id === pointId ? { ...p, ...updates } : p));
    currentStory = { ...currentStory, points: pts, updatedAt: Date.now() };
  }

  function handleRemovePoint(event: CustomEvent<{ pointId: string }>) {
    if (!currentStory) return;
    const pts = currentStory.points
      .filter((p) => p.id !== event.detail.pointId)
      .map((p, i) => ({ ...p, order: i }));
    currentStory = { ...currentStory, points: pts, updatedAt: Date.now() };
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

  function handleReorder(event: CustomEvent<{ from: number; to: number }>) {
    if (!currentStory) return;
    const { from, to } = event.detail;
    const pts = [...currentStory.points];
    const [moved] = pts.splice(from, 1);
    pts.splice(to, 0, moved);
    const reordered = pts.map((p, i) => ({ ...p, order: i }));
    currentStory = { ...currentStory, points: reordered, updatedAt: Date.now() };
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
    if (!currentStory || !userId) return;
    isPublishing = true;
    publishSuccess = false;

    // Push the full local draft (story row + every point) before flipping the
    // public flag — the row may not exist in Supabase yet since drafts are
    // localStorage-only until first publish.
    const next: Story = { ...currentStory, isPublic: !currentStory.isPublic };
    const ok = await syncStoryToSupabase(supabase, next, userId);
    if (!ok) {
      isPublishing = false;
      return;
    }

    currentStory = next;
    isPublishing = false;
    publishSuccess = true;
    setTimeout(() => {
      publishSuccess = false;
    }, 2000);
  }

  function handlePreview() {
    // Toggle: clicking Preview while previewing exits the preview.
    if (previewMode) {
      handlePreviewClose();
      return;
    }
    if (!currentStory || currentStory.points.length === 0) return;
    previewProgress = {
      storyId: currentStory.id,
      currentPointIndex: 0,
      completedPoints: [],
      startedAt: Date.now(),
    };
    previewMode = true;
    applyStoryPoint(currentStory.points[0], mapList, mapStore);
  }

  function handlePreviewNavigate(event: CustomEvent<{ index: number; point: StoryPoint }>) {
    const { index, point } = event.detail;
    if (!previewProgress) return;
    previewProgress = { ...previewProgress, currentPointIndex: index };
    applyStoryPoint(point, mapList, mapStore);
  }

  function handlePreviewComplete(event: CustomEvent<{ storyId: string; pointId: string }>) {
    if (!previewProgress || !currentStory) return;
    const { pointId } = event.detail;
    const done = new Set(previewProgress.completedPoints);
    done.add(pointId);
    previewProgress = {
      ...previewProgress,
      completedPoints: Array.from(done),
      currentPointIndex: Math.min(
        previewProgress.currentPointIndex + 1,
        currentStory.points.length
      ),
    };
  }

  function handlePreviewClose() {
    previewMode = false;
    previewProgress = null;
  }

  function handleBackToLibrary() {
    currentStory = null;
    selectedPointId = null;
    placingPoint = false;
    movingPoint = false;
    activeView = 'library';
  }

  function handleSelectStory(story: Story) {
    // Mobile: open in /explore for playback, since editor is desktop-only.
    if (isMobile) {
      goto(`/explore?story=${story.id}`);
      return;
    }
    currentStory = story;
    activeView = 'editor';
    // Pre-apply any pinned historical overlay from the first point so the
    // editor shows the same scene as preview/playback.
    const first = story.points.find((p) => p.overlayMapId);
    if (first) applyPointOverlay(first, mapList);
    // Centre on the first point with coords, if any.
    const p0 = story.points[0];
    if (p0?.coordinates) {
      mapStore.setView({ lng: p0.coordinates[0], lat: p0.coordinates[1], zoom: 15 });
    }
  }

  function handleLibraryCreate(event: CustomEvent<{ title: string; description?: string }>) {
    const { title, description } = event.detail;
    const id = storyLibrary.createStory(title, description || '');
    setTimeout(() => {
      const story = $storyLibrary.stories.find((s) => s.id === id);
      if (story) {
        currentStory = story;
        activeView = 'editor';
      }
    }, 50);
  }

  function handleLibraryRename(
    event: CustomEvent<{ item: Story; title: string; description?: string }>
  ) {
    const { item, title, description } = event.detail;
    storyLibrary.updateStory(item.id, { title, description });
  }

  function handleSearchNavigate(event: CustomEvent<{ result: SearchResult }>) {
    mapStore.setView({
      lng: parseFloat(event.detail.result.lon),
      lat: parseFloat(event.detail.result.lat),
      zoom: 16,
    });
  }

  function handleUndo() {
    if (!currentStory || !currentStory.points.length) return;
    const pts = currentStory.points.slice(0, -1).map((p, i) => ({ ...p, order: i }));
    currentStory = { ...currentStory, points: pts, updatedAt: Date.now() };
  }

  onMount(() => {
    // /create doesn't support side-by-side — snap back if state is stale from /view.
    if ($layerStore.viewMode === 'dual') layerStore.setViewMode('overlay');

    storyLibrary.loadFromSupabase().finally(() => {
      storiesLoading = false;
    });
    // Pre-fetch the catalog so the Saigon seed (running on the library page,
    // before MapWorkspace mounts) can pick a real historical layer.
    if (mapList.length === 0) {
      fetchGeoreferencedMaps(supabase)
        .then((maps) => {
          if (mapList.length === 0) mapList = maps;
        })
        .catch(() => {});
    }

    keydownHandler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName)))
        return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      } else if (event.key === 'Escape') {
        if (selectedPointId) selectedPointId = null;
        else if (placingPoint) placingPoint = false;
        else if (movingPoint) movingPoint = false;
      }
    };
    window.addEventListener('keydown', keydownHandler);
  });

  onDestroy(() => {
    if (keydownHandler) window.removeEventListener('keydown', keydownHandler);
  });
</script>

{#if !session}
  <AuthGate
    {supabase}
    title="Sign in to build a story"
    body="Stories are saved to your account so you can come back and edit them."
  />

  <!-- Library View (desktop + mobile) -->
{:else if activeView === 'library'}
  <LibraryGrid
    items={myStories}
    loading={storiesLoading}
    noun="Story"
    sub="Walk readers through a place, one historical layer at a time."
    thumbIcon="📖"
    createLabel="+ New story"
    emptyCtaLabel="New story"
    emptyTitle={isMobile ? 'No stories yet.' : 'Start your first story.'}
    emptyText={isMobile
      ? 'Open the site on a laptop to author a guided tour or scrollytelling walk.'
      : 'Drop points on a historical map, write a line or two for each, optionally add a challenge, and share.'}
    showCreate={!isMobile}
    showItemActions={!isMobile}
    descriptionOf={(s) => s.description || ''}
    on:select={(e) => handleSelectStory(e.detail.item)}
    on:create={handleLibraryCreate}
    on:rename={handleLibraryRename}
    on:remove={(e) => storyLibrary.deleteStory(e.detail.item.id)}
  >
    <svelte:fragment slot="title">Your <span class="text-highlight">stories.</span></svelte:fragment
    >

    <svelte:fragment slot="banner">
      {#if isMobile}
        <div class="mobile-banner">
          <strong>Editing is desktop-only.</strong>
          Tap a story here to play it. To author or edit one, open VMA on a laptop.
        </div>
      {/if}
    </svelte:fragment>

    <svelte:fragment slot="meta" let:item>
      <span class="meta-tag">{item.points.length} point{item.points.length !== 1 ? 's' : ''}</span>
      <span class="meta-tag date">{new Date(item.updatedAt).toLocaleDateString('en-GB')}</span>
      <span class="meta-tag publish-status" class:published={item.isPublic}>
        {item.isPublic ? 'Public' : 'Private'}
      </span>
    </svelte:fragment>

    <svelte:fragment slot="description" let:item>
      {item.description || 'No description'}
    </svelte:fragment>

    <svelte:fragment slot="item-actions" let:item>
      {#if item.points.length}
        <a
          class="sb-btn is-sm"
          href="/trip/{item.id}"
          title="Walk this story on mobile"
          on:click|stopPropagation>Walk</a
        >
      {/if}
    </svelte:fragment>
  </LibraryGrid>

  <!-- Editor View (desktop primary; mobile shows playback only via library redirect) -->
{:else}
  <div class="create-mode" class:mobile={isMobile}>
    <MapWorkspace
      {supabase}
      {mapStore}
      {layerStore}
      rightSidebarWidth={380}
      bind:mapList
      bind:selectedMap
      bind:sidebarCollapsed
      bind:rightSidebarCollapsed
      bind:isMobile
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
        <CreateRightPane
          story={currentStory}
          {selectedPointId}
          {placingPoint}
          {previewMode}
          {isPublishing}
          {publishSuccess}
          {topLayerName}
          {selectedPoint}
          {selectedPointIndex}
          {movingPoint}
          {pinnedLayerName}
          on:backToLibrary={handleBackToLibrary}
          on:togglePublish={handleTogglePublish}
          on:preview={handlePreview}
          on:togglePlacing={handleTogglePlacing}
          on:selectPoint={handleSelectPoint}
          on:zoomToPoint={handleZoomToPoint}
          on:removePoint={handleRemovePoint}
          on:reorder={handleReorder}
          on:renameStory={(e) => {
            if (!currentStory) return;
            storyLibrary.updateStory(currentStory.id, { title: e.detail.title });
            currentStory = { ...currentStory, title: e.detail.title };
          }}
          on:updatePoint={handleUpdatePoint}
          on:toggleMoving={handleToggleMoving}
          on:close={() => (selectedPointId = null)}
          on:toggleCollapse={() => (rightSidebarCollapsed = true)}
        />
      </svelte:fragment>

      <!-- Mobile drawers: same 3-tab pattern as /view. Story panel is desktop-only. -->
      <svelte:fragment slot="mobile-layers">
        <div class="mobile-pane">
          <LayerStackPanel
            viewMode={$layerStore.viewMode}
            {mapList}
            on:zoomToOverlay={handleZoomToOverlay}
          />
        </div>
      </svelte:fragment>

      <svelte:fragment slot="mobile-controls">
        <div class="mobile-pane">
          <LayerControlsPanel
            viewMode={$layerStore.viewMode}
            gpsActive={false}
            allowDual={false}
            on:changeViewMode={(e) => layerStore.setViewMode(e.detail.mode)}
            on:pickLocation={handlePickLocation}
          />
        </div>
      </svelte:fragment>

      <svelte:fragment slot="mobile-browse">
        <div class="mobile-pane">
          <CatalogSidebarPanel
            role={'user'}
            activeId={selectedMap?.id ?? null}
            requireGeoref={true}
            showLayerActions={true}
            showLocation={false}
            on:pick={handlePickMap}
          />
        </div>
      </svelte:fragment>

      <svelte:fragment slot="map-children">
        <MapClickCapture enabled={placingPoint || movingPoint} on:mapClick={handleMapClick} />
        {#if currentStory}
          <StoryMarkers
            points={currentStory.points}
            currentIndex={previewMode
              ? (previewProgress?.currentPointIndex ?? 0)
              : selectedPointIndex}
          />
        {/if}
        {#if previewMode && currentStory}
          <StoryPlayback
            story={currentStory}
            progress={previewProgress}
            on:navigatePoint={handlePreviewNavigate}
            on:completePoint={handlePreviewComplete}
            on:close={handlePreviewClose}
            on:finish={handlePreviewClose}
          />
        {/if}
      </svelte:fragment>
    </MapWorkspace>
  </div>
{/if}

<style>
  .mobile-banner {
    margin: 0.75rem 1rem;
    padding: 0.75rem 1rem;
    background: #fff7d1;
    border: 1.5px solid #111;
    border-radius: 10px;
    font-family: 'Outfit', sans-serif;
    font-size: 0.86rem;
    color: #111;
    line-height: 1.4;
  }
  .mobile-banner strong {
    display: block;
    margin-bottom: 0.2rem;
    font-weight: 800;
  }

  /* Match mobile drawer wrapper used by /view */
  .mobile-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
</style>
