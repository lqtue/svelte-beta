<!--
  /explore — VMA's canonical map-viewing surface.

  Reuses the same MapWorkspace chrome as the (now-merged) /view route and
  adds:
    • a one-time welcome chooser (location vs. show-all),
    • coverage lookup at the user's GPS fix,
    • an interactive tour for first-time visitors,
    • ?map=/?story= deeplinks (preserved from legacy /view share links).

  Deeplinks bypass the welcome modal entirely.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import type Map from 'ol/Map';

  import { getSupabaseContext } from '$lib/supabase/context';
  import { createGeoMapStores } from '$lib/shell/geoMapSetup';
  import { fetchAnnotationBounds } from '$lib/geo/mapBounds';
  import { boundsCenter, boundsZoom } from '$lib/ui/searchUtils';
  import { layersStore } from '$lib/stores/layersStore';
  import { fetchPublicStories } from '$lib/supabase/stories';
  import { createStoryPlayerStore } from '$lib/story/stores/storyStore';
  import type { Story, StoryPoint } from '$lib/story/types';

  import MapWorkspace from '$lib/shell/MapWorkspace.svelte';
  import DualMapPane from '$lib/shell/DualMapPane.svelte';
  import GpsTracker from '$lib/shell/GpsTracker.svelte';
  import StoryMarkers from '$lib/story/StoryMarkers.svelte';
  import StoryPlayback from '$lib/story/StoryPlayback.svelte';
  import LayerStackPanel from '$lib/ui/catalog/LayerStackPanel.svelte';
  import LayerControlsPanel from '$lib/ui/catalog/LayerControlsPanel.svelte';

  import ExploreSidebar from '$lib/explore/ExploreSidebar.svelte';
  import ExploreBrowsePanel from '$lib/explore/ExploreBrowsePanel.svelte';
  import ExplorePrivacyNotice from '$lib/explore/ExplorePrivacyNotice.svelte';
  import ExploreSheet from '$lib/explore/ExploreSheet.svelte';
  import ExploreTour, { shouldShowTour } from '$lib/explore/ExploreTour.svelte';
  import type { MapListItem } from '$lib/map/types';
  import {
    matchMapsAtPoint,
    unresolvedAllmapsIds,
    fetchMultipleBounds,
    SAIGON_CENTER,
    SAIGON_DEFAULT_ZOOM,
    type ResolvedMap,
  } from '$lib/explore/spatialLookup';

  type Bbox = [number, number, number, number];
  type Mode = 'location' | 'all';

  const { supabase, session } = getSupabaseContext();
  const { mapStore, layerStore } = createGeoMapStores();
  const storyPlayer = createStoryPlayerStore(supabase, session?.user?.id);

  // ── MapWorkspace-managed state ─────────────────────────────────
  let mapList: MapListItem[] = [];
  let shellMap: Map | null = null;
  let sidebarCollapsed = false;
  let isMobile = false;
  let isCompact = false;
  let openDrawer: 'none' | 'layers' | 'controls' | 'browse' | 'legacy' = 'none';

  // ── Explore-specific state ─────────────────────────────────────
  let choseMode = false;
  let mode: Mode | null = null;
  let userPosition: [number, number] | null = null;
  let matches: ResolvedMap[] = [];
  let loading = true;
  let gpsActive = false;
  let gpsAllowed = false;
  let gpsError: string | null = null;
  let stories: Story[] = [];
  let activeStory: Story | null = null;
  let role: 'user' | 'mod' | 'admin' = 'user';

  // ── Reactive derivations ───────────────────────────────────────
  $: viewMode = $layerStore.viewMode;
  $: basemapSelection = $layerStore.basemap;
  $: dualPaneActive = viewMode === 'dual';
  $: sideAlt = $layersStore.overlays[1] ?? null;
  $: stackCount = $layersStore.overlays.length;
  $: playerState = $storyPlayer;
  $: activeStoryProgress = activeStory ? (playerState.progress[activeStory.id] ?? null) : null;

  // URL deeplinks — auto-dismiss the welcome modal when present.
  $: paramMapId = $page.url.searchParams.get('map');
  $: paramStoryId = $page.url.searchParams.get('story');
  $: hasDeeplink = !!(paramMapId || paramStoryId);
  $: if (hasDeeplink && !choseMode) { choseMode = true; mode = 'all'; }

  // Reactive deeplink application — both `mapList` (from MapWorkspace) and
  // `stories` (from onMount fetch) arrive async, so a one-shot in onMount
  // races with whichever finishes second. Run once when both are ready.
  let appliedUrl = false;
  $: if (
    !appliedUrl &&
    mapList.length > 0 &&
    (paramMapId || (paramStoryId && stories.length > 0))
  ) {
    appliedUrl = true;
    applyUrlParams(mapList);
  }

  // Admins/mods get draft maps in coverage too (mirrors the browse panel).
  $: canSeeDrafts = role === 'admin' || role === 'mod';

  // Maps whose bounds we've already tried to resolve. Some annotations have no
  // GCPs / 404 on allmaps.org (e.g. R2-mirrored drafts) and resolve to null —
  // those can never become valid, so without tracking attempts they'd keep the
  // "Looking up maps…" spinner on forever. `loading` means "a fetch is still
  // pending for a map we haven't tried", NOT "every map produced a bbox".
  let attemptedBounds = new Set<string>();
  function pendingBoundsIds(): string[] {
    return unresolvedAllmapsIds(mapList, canSeeDrafts).filter((id) => !attemptedBounds.has(id));
  }

  // Coverage match runs whenever the user moves OR new bounds land. Pure
  // client-side filter — no Supabase round-trip.
  $: if (userPosition && mapList.length > 0) {
    matches = matchMapsAtPoint(mapList, userPosition[0], userPosition[1], canSeeDrafts);
    loading = pendingBoundsIds().length > 0;
  }

  // Trigger bounds resolution as new entries arrive. Re-runs when canSeeDrafts
  // flips (role lands after mount) so draft maps get their bounds backfilled
  // too. The attemptedBounds guard prevents re-fetching the same ids.
  $: if (mapList.length > 0) { void canSeeDrafts; ensureBoundsResolved(); }

  async function ensureBoundsResolved() {
    const need = pendingBoundsIds();
    if (need.length === 0) { loading = false; return; }
    loading = true;
    for (const id of need) attemptedBounds.add(id);
    const resolved = await fetchMultipleBounds(need, 12);
    mapList = mapList.map((m) => {
      if (!m.allmaps_id) return m;
      const b = resolved.get(m.allmaps_id);
      return b ? { ...m, bounds: b } : m;
    });
    // Clears once every needed map has been attempted, even if some yielded no
    // bbox — the reassignment above re-triggers this block, which then exits.
    loading = pendingBoundsIds().length > 0;
  }

  // ── Helpers ────────────────────────────────────────────────────
  function addMapOverlay(map: MapListItem, { clear = false } = {}): boolean {
    const allmapsId = map.annotation_url ?? map.allmaps_id;
    if (!allmapsId) return false;
    if (clear) layersStore.clearOverlays();
    if (layersStore.isOverlay(map.id)) return false;
    layersStore.addOverlay({
      kind: 'historical',
      mapId: map.id,
      allmapsId,
      name: map.name,
      thumbnail: map.thumbnail,
    });
    return true;
  }

  async function resolveMapBounds(map: MapListItem): Promise<Bbox | null> {
    if (map.bounds) return map.bounds;
    if (map.bbox) return map.bbox;
    const src = map.annotation_url ?? map.allmaps_id;
    return src ? await fetchAnnotationBounds(src) : null;
  }

  function setViewFromBounds(bounds: Bbox) {
    const c = boundsCenter(bounds);
    mapStore.setView({ lng: c.lng, lat: c.lat, zoom: boundsZoom(bounds) });
  }

  // Skip the zoom if the map already covers the current viewport centre —
  // avoids yanking the camera when the user adds something they're on.
  function viewportIsInside(bounds: Bbox): boolean {
    const v = $mapStore;
    return v.lng >= bounds[0] && v.lng <= bounds[2] && v.lat >= bounds[1] && v.lat <= bounds[3];
  }

  async function zoomToMap(map: MapListItem, { force = false } = {}) {
    const bounds = await resolveMapBounds(map);
    if (!bounds) return;
    if (!force && viewportIsInside(bounds)) return;
    setViewFromBounds(bounds);
  }

  // ── Guided tour ────────────────────────────────────────────────
  // Wait for coverage to resolve so step 1 (Browse) shows location-relevant
  // rows in location mode. In all-mode the catalogue is enough.
  let tourOpen = false;
  let tourPending = false;
  $: if (tourPending && !tourOpen) {
    const ready = mode === 'all' ? mapList.length > 0 : userPosition !== null && !loading;
    if (ready) { tourPending = false; tourOpen = true; }
  }
  function requestTour() {
    if (shouldShowTour()) tourPending = true;
  }

  // ── GPS ────────────────────────────────────────────────────────
  function handleGpsPosition(e: CustomEvent<{ lon: number; lat: number }>) {
    const pos: [number, number] = [e.detail.lon, e.detail.lat];
    if (!userPosition) {
      userPosition = pos;
      mapStore.setView({ lng: pos[0], lat: pos[1], zoom: 15 });
      return;
    }
    const dx = (pos[0] - userPosition[0]) * 111000 * Math.cos((pos[1] * Math.PI) / 180);
    const dy = (pos[1] - userPosition[1]) * 111000;
    if (Math.hypot(dx, dy) > 250) {
      userPosition = pos;
      // Don't snap on subsequent updates — user may have panned away.
    } else {
      userPosition = pos;
    }
  }
  function handleGpsError(e: CustomEvent<{ message: string }>) { gpsError = e.detail.message; }
  function toggleGps() { gpsActive = !gpsActive; gpsError = null; }

  // ── Welcome chooser ────────────────────────────────────────────
  function chooseLocation() {
    choseMode = true; mode = 'location';
    gpsAllowed = true; gpsActive = true;
    requestTour();
  }
  function chooseShowAll() {
    choseMode = true; mode = 'all';
    gpsAllowed = false; gpsActive = false;
    mapStore.setView({ lng: SAIGON_CENTER[0], lat: SAIGON_CENTER[1], zoom: SAIGON_DEFAULT_ZOOM });
    requestTour();
  }

  // ── Sheet CTAs ─────────────────────────────────────────────────
  function jumpToSaigon() {
    userPosition = [SAIGON_CENTER[0], SAIGON_CENTER[1]];
    mapStore.setView({ lng: SAIGON_CENTER[0], lat: SAIGON_CENTER[1], zoom: SAIGON_DEFAULT_ZOOM });
  }

  // ── Catalog / sidebar event handlers ───────────────────────────
  function handlePickLocation(e: CustomEvent<{ lat: number; lng: number; bbox?: Bbox }>) {
    const { lat, lng, bbox } = e.detail;
    if (bbox) setViewFromBounds(bbox);
    else mapStore.setView({ lng, lat, zoom: 15 });
  }

  // Additive: tap a row → add to stack (if not on) + zoom to it. Never
  // clears — removal is explicit via Layers panel × or tap-again.
  async function handlePickMap(e: CustomEvent<any>) {
    const item = e.detail?.map ?? e.detail;
    if (!item?.id) return;
    const map = mapList.find((m) => m.id === item.id) ?? (item as MapListItem);
    addMapOverlay(map);
    await zoomToMap(map);
  }
  function handleRemoveOverlay(e: CustomEvent<{ mapId: string }>) {
    layersStore.removeOverlayByMapId(e.detail.mapId);
  }
  function handleZoomToOverlay(e: CustomEvent<{ mapId: string }>) {
    const m = mapList.find((m) => m.id === e.detail.mapId);
    if (m) zoomToMap(m, { force: true });
  }

  // ── Stories ────────────────────────────────────────────────────
  function handleNavigatePoint(e: CustomEvent<{ index: number; point: StoryPoint }>) {
    const { point } = e.detail;
    if (point.coordinates) {
      mapStore.setView({ lng: point.coordinates[0], lat: point.coordinates[1], zoom: 17 });
    }
    if (point.overlayMapId) {
      const found = mapList.find((m) => m.id === point.overlayMapId || m.allmaps_id === point.overlayMapId);
      if (found) addMapOverlay(found, { clear: true });
    }
  }
  function handleCompletePoint(e: CustomEvent<{ storyId: string; pointId: string }>) {
    if (!activeStory) return;
    storyPlayer.completePoint(e.detail.storyId, e.detail.pointId, activeStory.points.length);
  }
  function closeStory() { storyPlayer.stopStory(); activeStory = null; }

  // ── URL deeplinks ──────────────────────────────────────────────
  async function applyUrlParams(maps: MapListItem[]) {
    if (paramMapId) {
      const found = maps.find((m) => m.id === paramMapId || m.allmaps_id === paramMapId);
      if (found) {
        addMapOverlay(found);
        await zoomToMap(found, { force: true });
      }
    }
    if (paramStoryId) {
      const story = stories.find((s) => s.id === paramStoryId);
      if (story) { activeStory = story; storyPlayer.startStory(story.id); }
    }
  }

  onMount(async () => {
    mapStore.setView({ lng: SAIGON_CENTER[0], lat: SAIGON_CENTER[1], zoom: SAIGON_DEFAULT_ZOOM });
    if (session?.user?.id) {
      const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      role = ((data as any)?.role as 'user' | 'mod' | 'admin') ?? 'user';
    }
    try {
      stories = await fetchPublicStories(supabase);
    } catch (err) {
      console.error('[explore] Failed to load stories:', err);
    }
  });
</script>

<svelte:head>
  <title>Explore — Vietnam Map Archive</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
</svelte:head>

<div class="explore-mode" class:mobile={isMobile}>
  <MapWorkspace
    {supabase}
    {mapStore}
    {layerStore}
    tabOrder={['browse', 'layers', 'controls']}
    showDual={true}
    {dualPaneActive}
    bind:mapList
    bind:shellMap
    bind:sidebarCollapsed
    bind:isMobile
    bind:isCompact
    bind:openDrawer
  >
    <svelte:fragment slot="sidebar">
      <ExploreSidebar
        {viewMode}
        {mapList}
        {gpsActive}
        {matches}
        {role}
        forceBrowseExpanded={mode === 'all'}
        on:zoomToOverlay={handleZoomToOverlay}
        on:pickMap={handlePickMap}
        on:removeOverlay={handleRemoveOverlay}
        on:pickLocation={handlePickLocation}
        on:changeViewMode={(e) => layerStore.setViewMode(e.detail.mode)}
        on:toggleGps={toggleGps}
        on:toggleCollapse={() => (sidebarCollapsed = true)}
      />
    </svelte:fragment>

    <svelte:fragment slot="mobile-layers">
      <div class="mobile-pane" data-tour="layers-mobile">
        <LayerStackPanel {viewMode} {mapList} on:zoomToOverlay={handleZoomToOverlay} />
      </div>
    </svelte:fragment>

    <svelte:fragment slot="mobile-controls">
      <div class="mobile-pane" data-tour="controls-mobile">
        <LayerControlsPanel
          {viewMode}
          {gpsActive}
          on:changeViewMode={(e) => layerStore.setViewMode(e.detail.mode)}
          on:pickLocation={handlePickLocation}
          on:toggleGps={toggleGps}
        />
      </div>
    </svelte:fragment>

    <svelte:fragment slot="mobile-browse">
      <div class="mobile-pane" data-tour="browse-mobile">
        <ExploreBrowsePanel
          {matches}
          {role}
          forceExpanded={mode === 'all'}
          on:pick={handlePickMap}
          on:remove={handleRemoveOverlay}
        />
      </div>
    </svelte:fragment>

    <svelte:fragment slot="map-children">
      <GpsTracker active={gpsActive && gpsAllowed} on:position={handleGpsPosition} on:error={handleGpsError} />
      {#if activeStory}
        <StoryMarkers points={activeStory.points} currentIndex={activeStoryProgress?.currentPointIndex ?? 0} />
        <StoryPlayback
          story={activeStory}
          progress={activeStoryProgress}
          on:navigatePoint={handleNavigatePoint}
          on:completePoint={handleCompletePoint}
          on:close={closeStory}
          on:finish={closeStory}
        />
      {/if}
    </svelte:fragment>

    <svelte:fragment slot="dual-pane">
      {#if dualPaneActive && shellMap}
        <DualMapPane
          primaryMap={shellMap}
          basemap={basemapSelection}
          showOverlay={!!sideAlt}
          overlayOpacity={sideAlt?.opacity ?? 1}
          activeAllmapsId={sideAlt?.ref.allmapsId ?? ''}
        />
      {/if}
    </svelte:fragment>

    <svelte:fragment slot="map-overlay">
      {#if choseMode && mode === 'location' && userPosition && !loading && matches.length === 0 && stackCount === 0}
        <ExploreSheet userLocation={userPosition} on:jumpToSaigon={jumpToSaigon} />
      {/if}
      {#if tourPending || (loading && mode === 'location' && choseMode)}
        <div class="resolving" role="status">
          <span class="spinner" aria-hidden="true"></span>
          {mode === 'location' ? 'Looking up maps at your location…' : 'Loading archive…'}
        </div>
      {/if}
      {#if gpsError}
        <div class="gps-error" role="alert">{gpsError}</div>
      {/if}
    </svelte:fragment>
  </MapWorkspace>

  {#if !hasDeeplink}
    <ExplorePrivacyNotice on:allow={chooseLocation} on:skip={chooseShowAll} />
  {/if}
  <ExploreTour
    open={tourOpen}
    {mapStore}
    {layerStore}
    {isMobile}
    {openDrawer}
    on:close={() => (tourOpen = false)}
    on:setDrawer={(e) => (openDrawer = e.detail.drawer)}
  />
</div>

<style>
  .explore-mode {
    position: fixed;
    inset: var(--nav-height) 0 0 0;
    display: flex;
    flex-direction: column;
    background-color: var(--color-bg);
    background-image: radial-gradient(var(--color-border) 1px, transparent 1px);
    background-size: 32px 32px;
    overflow: hidden;
  }
  .explore-mode.mobile :global(.workspace) { padding: 0; gap: 0; }

  .mobile-pane { height: 100%; overflow-y: auto; padding: 0.5rem; }

  .resolving {
    position: absolute;
    top: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.85rem;
    background: var(--sb-card-bg);
    border: var(--border-thin);
    border-radius: var(--sb-radius-pill);
    box-shadow: var(--shadow-solid-xs);
    font-size: 0.82rem;
    font-weight: var(--font-semibold);
    z-index: 95;
  }
  .spinner {
    width: 14px;
    height: 14px;
    border: 2.5px solid var(--color-gray-300);
    border-top-color: var(--sb-accent-warm);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .gps-error {
    position: absolute;
    top: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    max-width: 80%;
    padding: 0.5rem 0.75rem;
    background: var(--sb-accent-yellow);
    border: var(--border-thin);
    border-radius: var(--sb-radius-sm);
    font-size: var(--text-sm);
    z-index: 95;
  }
</style>
