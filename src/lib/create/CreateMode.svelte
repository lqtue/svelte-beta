<!--
  CreateMode.svelte — /create plugin on MapWorkspace.

  Desktop authoring:
    • Left sidebar  — Layers · Controls · Browse (reused from /view)
    • Right sidebar — Story info · Points · Point editor (CreateRightPane)
  Edits to currentStory auto-persist to storyLibrary on every change
  (see persistDraft below), and the last-open story id is remembered in
  localStorage so reloads land back in the editor.

  Mobile: editor is desktop-only. Mobile users see the library and tapping a
  story opens it in /view?story=<id> for playback. A banner explains the limit.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import "$styles/layouts/create-mode.css";
  import { fromLonLat } from "ol/proj";
  import { goto } from "$app/navigation";
  import type Map from "ol/Map";

  import type { MapListItem, SearchResult } from "$lib/map/types";
  import type { Story, StoryPoint } from "$lib/story/types";
  import { createGeoMapStores } from "$lib/shell/geoMapSetup";
  import { getSupabaseContext } from "$lib/supabase/context";
  import { syncStoryToSupabase } from "$lib/supabase/stories";
  import { createStoryLibraryStore } from "$lib/story/stores/storyStore";
  import { fetchGeoreferencedMaps } from "$lib/maps/service";
  import { fetchAnnotationBounds } from "$lib/geo/mapBounds";
  import { boundsCenter, boundsZoom } from "$lib/ui/searchUtils";
  import { layersStore } from "$lib/stores/layersStore";

  import MapWorkspace from "$lib/shell/MapWorkspace.svelte";
  import MapClickCapture from "./MapClickCapture.svelte";
  import CreateSidebar from "./CreateSidebar.svelte";
  import CreateRightPane from "./CreateRightPane.svelte";
  import StoryMarkers from "$lib/view/StoryMarkers.svelte";
  import StoryPlayback from "$lib/view/StoryPlayback.svelte";
  import LayerStackPanel from "$lib/ui/catalog/LayerStackPanel.svelte";
  import LayerControlsPanel from "$lib/ui/catalog/LayerControlsPanel.svelte";
  import CatalogSidebarPanel from "$lib/ui/catalog/CatalogSidebarPanel.svelte";
  import NameDialog from "$lib/ui/NameDialog.svelte";
  import PageHero from "$lib/ui/PageHero.svelte";
  import CatalogGrid from "$lib/ui/catalog/CatalogGrid.svelte";
  import CatalogCard from "$lib/ui/catalog/CatalogCard.svelte";

  const { supabase, session } = getSupabaseContext();
  const userId = session?.user?.id;

  const { mapStore, layerStore } = createGeoMapStores();
  const storyLibrary = createStoryLibraryStore(supabase, userId);

  // Bound from MapWorkspace when in editor view. Pre-fetched independently on
  // mount so the library-view seed can pin a real historical layer (the
  // workspace doesn't mount until the user opens a story).
  let mapList: MapListItem[] = [];
  let selectedMap: MapListItem | null = null;
  let shellMap: Map | null = null;
  let sidebarCollapsed = false;
  let rightSidebarCollapsed = false;
  let isMobile = false;
  let isCompact = false;

  // Editor state
  let currentStory: Story | null = null;
  let selectedPointId: string | null = null;
  let placingPoint = false;
  let movingPoint = false;
  let isPublishing = false;
  let publishSuccess = false;
  let keydownHandler: ((event: KeyboardEvent) => void) | null = null;

  let activeView: "library" | "editor" = "library";
  let storiesLoading = true;

  // /create always lands on the library (welcome screen); the user picks
  // which story to edit. Drafts auto-persist regardless via persistDraft.

  // Preview
  let previewMode = false;
  let previewProgress: import("$lib/story/types").StoryProgress | null = null;

  // Name dialog
  let nameDialogOpen = false;
  let nameDialogValue = "";
  let nameDialogDescriptionValue = "";
  let nameDialogHeading = "New Story";
  let nameDialogEditId: string | null = null;

  // Reactive: top historical overlay drives new-point pinning + inspector display.
  $: topOverlay = $layersStore.overlays[0]?.ref ?? null;
  $: topLayerMapId = topOverlay?.mapId ?? null;
  $: topLayerName = topOverlay?.name ?? null;

  $: selectedPoint = currentStory?.points.find((p) => p.id === selectedPointId) ?? null;
  $: selectedPointIndex = selectedPoint
    ? currentStory!.points.findIndex((p) => p.id === selectedPoint!.id)
    : -1;
  $: pinnedLayerName = (() => {
    if (!selectedPoint?.overlayMapId) return null;
    const m = mapList.find(
      (x) => x.id === selectedPoint!.overlayMapId || x.allmaps_id === selectedPoint!.overlayMapId,
    );
    return m?.name ?? selectedPoint!.overlayMapId;
  })();

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

  function createNewStory(title = "Untitled Story", description = ""): Story {
    return {
      id: crypto.randomUUID(),
      title, description,
      mode: "guided",
      points: [], stops: [],
      createdAt: Date.now(), updatedAt: Date.now(),
      isPublic: false,
      authorId: userId!,
    };
  }

  // Seed a sample story across central District 1 with mixed challenge types
  // (none / question / reach) and the first georeferenced map covering Saigon
  // pinned as the historical overlay for every point.
  type SamplePoint = {
    title: string; description: string; lon: number; lat: number;
    challenge: import("$lib/story/types").PointChallenge;
  };
  const SAIGON_CENTER: [number, number] = [106.6988, 10.7787];
  const SAIGON_SAMPLE_POINTS: SamplePoint[] = [
    {
      title: "Notre-Dame Cathedral",
      description: "Neo-Romanesque cathedral built 1877–1880 with bricks shipped from Marseille.",
      lon: 106.69906, lat: 10.77983,
      challenge: { type: "none" },
    },
    {
      title: "Central Post Office",
      description: "Opened 1891 in the French Indochina style next to the cathedral.",
      lon: 106.69963, lat: 10.77996,
      challenge: { type: "question", question: "Which famous engineer's firm is often credited with this building?", answer: "Eiffel" },
    },
    {
      title: "Independence Palace",
      description: "Rebuilt 1962–1966 on the site of the former Norodom Palace.",
      lon: 106.69530, lat: 10.77700,
      challenge: { type: "question", question: "In which year did this site mark the end of the war?", answer: "1975" },
    },
    {
      title: "Saigon Opera House",
      description: "Beaux-Arts theatre opened 1900 on the former Rue Catinat.",
      lon: 106.70370, lat: 10.77650,
      challenge: { type: "reach", triggerRadius: 30 },
    },
    {
      title: "Bến Thành Market",
      description: "Iconic four-gate covered market relocated here in 1914.",
      lon: 106.69830, lat: 10.77260,
      challenge: { type: "reach", triggerRadius: 25 },
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
      mapList.find((m) => (m.allmaps_id || m.annotation_url) && containsSaigon(m))
      ?? mapList.find((m) => m.allmaps_id || m.annotation_url)
      ?? null
    );
  }

  // Auto-seed the Saigon example exactly once per seed-version. Bumping
  // SAIGON_SEED_KEY (e.g. v2 → v3) forces a re-seed so changes to the sample
  // (new challenges, new layer pick, etc.) reach existing users on next visit.
  // Any prior copy of the example (matched by title) is removed first so the
  // user gets the up-to-date version exactly once.
  const SAIGON_SEED_KEY = "vma-create-saigon-seeded-v2";
  const SAIGON_SEED_TITLE = "Walk around central Saigon";
  let saigonSeeded = false;
  $: if (
    !saigonSeeded
    && userId
    && !storiesLoading
    && mapList.length > 0
    && typeof window !== "undefined"
    && !localStorage.getItem(SAIGON_SEED_KEY)
  ) {
    saigonSeeded = true;
    try { localStorage.setItem(SAIGON_SEED_KEY, "1"); } catch {}
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
      "Five landmarks of colonial-era District 1 — try Question and Reach challenges as you go."
    );
    story.points = SAIGON_SAMPLE_POINTS.map((p, i) => ({
      id: crypto.randomUUID(),
      order: i,
      title: p.title,
      description: p.description,
      coordinates: [p.lon, p.lat],
      triggerRadius: p.challenge.type === "reach" ? (p.challenge.triggerRadius ?? 15) : 15,
      interaction: "proximity",
      challenge: p.challenge,
      overlayMapId,
    }));
    story.stops = story.points;
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
      description: "",
      coordinates: [lon, lat],
      triggerRadius: 15,
      interaction: "proximity",
      challenge: { type: "none" },
      // Pin to current top historical overlay so playback re-shows it.
      overlayMapId: topLayerMapId ?? undefined,
    };
  }

  // Map click: place OR move.
  function handleMapClick(event: CustomEvent<{ lon: number; lat: number }>) {
    if (!currentStory) return;
    const { lon, lat } = event.detail;

    if (movingPoint && selectedPointId) {
      handleUpdatePoint(new CustomEvent("updatePoint", {
        detail: { pointId: selectedPointId, updates: { coordinates: [lon, lat] } },
      }));
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
      // Stay in placing mode so the user can drop multiple points in a row.
      // Don't auto-open the inspector — that would swap the right pane away
      // from the points list and break the placement flow. The user opens
      // the editor by tapping a row, or by toggling Place off and back on.
    }
  }

  function handleMapReady(event: CustomEvent<{ map: Map }>) {
    shellMap = event.detail.map;
  }

  // Story / point handlers
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

  function handleReorder(event: CustomEvent<{ from: number; to: number }>) {
    if (!currentStory) return;
    const { from, to } = event.detail;
    const pts = [...currentStory.points];
    const [moved] = pts.splice(from, 1);
    pts.splice(to, 0, moved);
    const reordered = pts.map((p, i) => ({ ...p, order: i }));
    currentStory = { ...currentStory, points: reordered, stops: reordered, updatedAt: Date.now() };
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
    if (!ok) { isPublishing = false; return; }

    currentStory = next;
    isPublishing = false;
    publishSuccess = true;
    setTimeout(() => { publishSuccess = false; }, 2000);
  }

  function handlePreview() {
    // Toggle: clicking Preview while previewing exits the preview.
    if (previewMode) { handlePreviewClose(); return; }
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

    const first = currentStory.points[0];
    if (first.coordinates) {
      mapStore.setView({ lng: first.coordinates[0], lat: first.coordinates[1], zoom: 17 });
    }
    applyPointOverlay(first);
  }

  function applyPointOverlay(point: StoryPoint) {
    if (!point.overlayMapId) return;
    const found = mapList.find((m) => m.id === point.overlayMapId || m.allmaps_id === point.overlayMapId);
    const allmapsId = found?.annotation_url ?? found?.allmaps_id;
    const mapId = found?.id ?? point.overlayMapId;
    if (allmapsId) {
      layersStore.clearOverlays();
      layersStore.addOverlay({ kind: 'historical', mapId, allmapsId, name: found?.name, thumbnail: found?.thumbnail });
    }
  }

  function handlePreviewNavigate(event: CustomEvent<{ index: number; point: StoryPoint }>) {
    const { index, point } = event.detail;
    if (!previewProgress) return;
    previewProgress = { ...previewProgress, currentPointIndex: index, currentStopIndex: index };
    if (point.coordinates) {
      mapStore.setView({ lng: point.coordinates[0], lat: point.coordinates[1], zoom: 17 });
    }
    applyPointOverlay(point);
  }

  function handlePreviewComplete(event: CustomEvent<{ storyId: string; pointId: string }>) {
    if (!previewProgress || !currentStory) return;
    const { pointId } = event.detail;
    const done = new Set(previewProgress.completedPoints);
    done.add(pointId);
    previewProgress = {
      ...previewProgress,
      completedPoints: Array.from(done),
      completedStops: Array.from(done),
      currentPointIndex: Math.min(previewProgress.currentPointIndex + 1, currentStory.points.length),
      currentStopIndex: Math.min(previewProgress.currentStopIndex + 1, currentStory.points.length),
    };
  }

  function handlePreviewClose() { previewMode = false; previewProgress = null; }

  function handleBackToLibrary() {
    currentStory = null;
    selectedPointId = null;
    placingPoint = false;
    movingPoint = false;
    activeView = "library";
  }

  function handleSelectStory(story: Story) {
    // Mobile: open in /view for playback, since editor is desktop-only.
    if (isMobile) {
      goto(`/view?story=${story.id}`);
      return;
    }
    currentStory = story;
    activeView = "editor";
    // Pre-apply any pinned historical overlay from the first point so the
    // editor shows the same scene as preview/playback.
    const first = story.points.find((p) => p.overlayMapId);
    if (first) applyPointOverlay(first);
    // Centre on the first point with coords, if any.
    const p0 = story.points[0];
    if (p0?.coordinates) {
      mapStore.setView({ lng: p0.coordinates[0], lat: p0.coordinates[1], zoom: 15 });
    }
  }

  function handleCreateNewStory() {
    if (isMobile) return; // Should not be reachable — button is hidden on mobile.
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
        const story = $storyLibrary.stories.find((s) => s.id === id);
        if (story) { currentStory = story; activeView = "editor"; }
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

  function handlePickLocation(event: CustomEvent<{ lat: number; lng: number; bbox?: [number, number, number, number] }>) {
    const { lat, lng, bbox } = event.detail;
    if (bbox) {
      mapStore.setView({ ...boundsCenter(bbox), zoom: boundsZoom(bbox), lng: boundsCenter(bbox).lng, lat: boundsCenter(bbox).lat });
    } else {
      mapStore.setView({ lng, lat, zoom: 15 });
    }
  }

  /** Catalog row click = swap top overlay to this map (same as /view). */
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

  async function handleZoomToMap(event: CustomEvent<{ map: MapListItem }>) {
    const { map } = event.detail;
    let bounds = map.bounds ?? map.bbox ?? null;
    if (!bounds) bounds = await fetchAnnotationBounds(map.annotation_url ?? map.allmaps_id ?? '');
    if (bounds) {
      const c = boundsCenter(bounds);
      mapStore.setView({ lng: c.lng, lat: c.lat, zoom: boundsZoom(bounds) });
    }
  }

  function handleZoomToOverlay(e: CustomEvent<{ mapId: string }>) {
    const m = mapList.find((x) => x.id === e.detail.mapId);
    if (m) handleZoomToMap(new CustomEvent('zoomToMap', { detail: { map: m } }));
  }

  function handleUndo() {
    if (!currentStory || !currentStory.points.length) return;
    const pts = currentStory.points.slice(0, -1).map((p, i) => ({ ...p, order: i }));
    currentStory = { ...currentStory, points: pts, stops: pts, updatedAt: Date.now() };
  }

  onMount(() => {
    // /create doesn't support side-by-side — snap back if state is stale from /view.
    if ($layerStore.viewMode === 'dual') layerStore.setViewMode('overlay');

    storyLibrary.loadFromSupabase().finally(() => { storiesLoading = false; });
    // Pre-fetch the catalog so the Saigon seed (running on the library page,
    // before MapWorkspace mounts) can pick a real historical layer.
    if (mapList.length === 0) {
      fetchGeoreferencedMaps(supabase).then((maps) => {
        if (mapList.length === 0) mapList = maps;
      }).catch(() => {});
    }

    keydownHandler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName))) return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      } else if (event.key === "Escape") {
        if (selectedPointId) selectedPointId = null;
        else if (placingPoint) placingPoint = false;
        else if (movingPoint) movingPoint = false;
      }
    };
    window.addEventListener("keydown", keydownHandler);
  });

  onDestroy(() => {
    if (keydownHandler) window.removeEventListener("keydown", keydownHandler);
  });
</script>

<!-- Auth Gate -->
{#if !session}
  <div class="auth-gate">
    <div class="auth-gate-card">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d4af37" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
      <h2 class="auth-gate-title">Sign in to Create</h2>
      <p class="auth-gate-text">Sign in with your Google account to create and manage stories.</p>
      <button type="button" class="auth-gate-btn google" on:click={async () => {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) console.error("Google sign-in failed:", error.message);
      }}>
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

<!-- Library View (desktop + mobile) -->
{:else if activeView === "library"}
  <div class="page">
    <PageHero eyebrow="Tools" sub="Create guided stories and adventures on historical maps">
      <svelte:fragment slot="title">My <span class="text-highlight">Stories.</span></svelte:fragment>
      <div slot="actions">
        {#if !isMobile}
          <button type="button" class="action-btn primary-btn" on:click={handleCreateNewStory}>+ New Story</button>
        {/if}
      </div>
    </PageHero>

    {#if isMobile}
      <div class="mobile-banner">
        <strong>Editing is desktop-only.</strong>
        Tap a story to play it here. Open Vietnam Map Archive on a laptop to add or edit points.
      </div>
    {/if}

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
          <h2 class="empty-title">{isMobile ? 'No stories yet' : 'Create your first story'}</h2>
          <p class="empty-text">
            {isMobile
              ? 'Open the site on a laptop to author a guided tour or treasure hunt.'
              : 'Place points on historical maps, add descriptions and challenges, and share your creation.'}
          </p>
          {#if !isMobile}
            <button type="button" class="library-create-btn large" on:click={handleCreateNewStory}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Create Story
            </button>
          {/if}
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
                {#if !isMobile}
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
                {/if}
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

<!-- Editor View (desktop primary; mobile shows playback only via library redirect) -->
{:else}
  <div class="create-mode" class:mobile={isMobile}>
    <MapWorkspace
      {supabase}
      {mapStore}
      {layerStore}
      showDual={false}
      showAddAsPointInSearch={true}
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
          {topLayerMapId}
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
        <MapClickCapture
          enabled={placingPoint || movingPoint}
          on:mapClick={handleMapClick}
          on:mapReady={handleMapReady}
        />
        {#if currentStory}
          <StoryMarkers
            points={currentStory.points}
            currentIndex={previewMode ? (previewProgress?.currentPointIndex ?? 0) : selectedPointIndex}
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
  .mobile-banner strong { display: block; margin-bottom: 0.2rem; font-weight: 800; }

  /* Match mobile drawer wrapper used by /view */
  .mobile-pane {
    display: flex; flex-direction: column;
    height: 100%; min-height: 0;
    overflow: hidden;
  }
</style>
