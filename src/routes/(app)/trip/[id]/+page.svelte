<!--
  /trip/[id] — Tourist-grade mobile story player.

  The UX flow:
    1. Cold load → TripIntro bottom-sheet over the map.
    2. Tap Start → intro dismisses, TripPlayback peek bar appears.
    3. Walk → GPS auto-completes "reach" stops and reveals the next marker.
    4. Last stop completed → TripComplete in the same sheet.

  Progress is local-only (createStoryPlayerStore persists to localStorage),
  so QR-scan tourists with no account never see a login prompt unless they
  opt in at the end.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  import type { Story, StoryPoint } from '$lib/story/types';
  import type { MapListItem } from '$lib/map/types';

  import { getSupabaseContext } from '$lib/supabase/context';
  import { createStoryPlayerStore } from '$lib/story/stores/storyStore';
  import { createGeoMapStores } from '$lib/shell/geoMapSetup';
  import { fetchMaps } from '$lib/maps/service';
  import { haversineDistance } from '$lib/geo/geo';
  import { layersStore } from '$lib/stores/layersStore';

  import MapShell from '$lib/shell/MapShell.svelte';
  import LayerRenderer from '$lib/shell/LayerRenderer.svelte';
  import GpsTracker from '$lib/shell/GpsTracker.svelte';
  import TripIntro from '$lib/trip/TripIntro.svelte';
  import TripPlayback from '$lib/trip/TripPlayback.svelte';
  import TripMarkers from '$lib/trip/TripMarkers.svelte';

  const ctx = getSupabaseContext();
  const supabase = ctx.supabase;
  const { mapStore, layerStore } = createGeoMapStores();
  const storyPlayer = createStoryPlayerStore(supabase, ctx.session?.user?.id);

  $: storyId = $page.params.id;
  $: isLoggedIn = !!ctx.session?.user?.id;

  let story: Story | null = null;
  let mapList: MapListItem[] = [];
  let loading = true;
  let error: string | null = null;

  let gpsActive = true;
  let gpsError: string | null = null;
  let userPosition: [number, number] | null = null;
  let walkedMeters = 0;
  let lastTrackedPosition: [number, number] | null = null;

  // Intro visibility is decided after the story + progress load (see loadStory).
  // Default to true so we never flash the map before the intro on cold load.
  let showIntro = true;

  $: playerState = $storyPlayer;
  $: progress = story ? (playerState.progress[story.id] ?? null) : null;
  $: completedIds = new Set(progress?.completedPoints ?? []);
  $: currentIndex = progress?.currentPointIndex ?? 0;
  $: currentPoint = story && currentIndex < story.points.length ? story.points[currentIndex] : null;
  $: isFinished = !!story && currentIndex >= story.points.length;

  // ── Route length & estimated duration ─────────────────────────────
  $: routeMeters = story
    ? story.points.reduce((sum, pt, i, arr) => {
        if (i === 0) return 0;
        return sum + haversineDistance(arr[i - 1].coordinates, pt.coordinates);
      }, 0)
    : 0;
  // Walking pace 4 km/h + 4 min standing at each stop, rounded to nearest 5.
  $: estimatedMinutes = story
    ? Math.max(5, Math.round((routeMeters / 1000 / 4) * 60 + story.points.length * 4) / 5 * 5 | 0)
    : 0;

  // ── GPS handlers ──────────────────────────────────────────────────
  function handleGpsPosition(e: CustomEvent<{ lon: number; lat: number }>) {
    const pos: [number, number] = [e.detail.lon, e.detail.lat];

    // Track distance walked (sum of consecutive position deltas, ignoring
    // unrealistic jumps that would indicate a GPS spike).
    if (lastTrackedPosition) {
      const seg = haversineDistance(lastTrackedPosition, pos);
      if (seg < 80) walkedMeters += seg; // skip teleport jumps
    }
    lastTrackedPosition = pos;
    userPosition = pos;

    if (!story || !currentPoint) return;
    if (completedIds.has(currentPoint.id)) return;
    const ch = currentPoint.challenge?.type ?? 'none';
    if (ch === 'question') return; // requires explicit answer
    const radius =
      ch === 'reach'
        ? (currentPoint.challenge?.triggerRadius ?? currentPoint.triggerRadius ?? 15)
        : (currentPoint.triggerRadius ?? 15);
    if (haversineDistance(pos, currentPoint.coordinates) <= radius) {
      // Mark visited only — user explicitly taps Next to advance.
      handleMarkVisited(new CustomEvent('markVisited', {
        detail: { storyId: story.id, pointId: currentPoint.id },
      }));
    }
  }

  // ── Geolocation pre-prompt ────────────────────────────────────────
  // Tapping Start triggers the browser permission dialog in-context, so the
  // tourist understands why we're asking. We don't block on denial — GpsTracker
  // will simply remain idle and show its own banner.
  type PermissionResult = 'granted' | 'denied' | 'unavailable';
  async function requestGeolocation(): Promise<PermissionResult> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return 'unavailable';
    }
    return await new Promise<PermissionResult>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve('granted'),
        (err) => resolve(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    });
  }

  // ── TripPlayback events ───────────────────────────────────────────
  // Mark the current stop visited WITHOUT advancing — user controls Next.
  function handleMarkVisited(e: CustomEvent<{ storyId: string; pointId: string }>) {
    if (!story) return;
    const { storyId: sid, pointId } = e.detail;
    storyPlayer.update((state) => {
      const p = state.progress[sid];
      if (!p || p.completedPoints.includes(pointId)) return state;
      const completed = [...p.completedPoints, pointId];
      return {
        ...state,
        progress: {
          ...state.progress,
          [sid]: { ...p, completedPoints: completed, completedStops: completed },
        },
      };
    });
  }

  // Advance / go back one stop. Next fires completedAt when leaving the final stop.
  function handleAdvance(e: CustomEvent<{ direction: 'next' | 'prev' }>) {
    if (!story) return;
    const dir = e.detail.direction;
    const total = story.points.length;
    storyPlayer.update((state) => {
      const p = state.progress[story!.id];
      if (!p) return state;
      const nextIndex =
        dir === 'next'
          ? Math.min(p.currentPointIndex + 1, total)
          : Math.max(p.currentPointIndex - 1, 0);
      const isFinished = nextIndex >= total;
      return {
        ...state,
        progress: {
          ...state.progress,
          [story!.id]: {
            ...p,
            currentPointIndex: nextIndex,
            currentStopIndex: nextIndex,
            completedAt: isFinished ? (p.completedAt ?? Date.now()) : p.completedAt,
          },
        },
      };
    });
  }

  function handleDone() {
    if (story) storyPlayer.stopStory();
    goto('/view');
  }
  function handleShare() { /* no-op — TripComplete handles the share dialog */ }
  function handleSave() {
    // Tourist opts in to keep their progress. Send them to login with a
    // return-to back to this trip.
    goto(`/login?next=${encodeURIComponent(`/trip/${storyId}`)}`);
  }

  function applyPointOverlay(point: StoryPoint) {
    if (!point.overlayMapId) return;
    const found = mapList.find(
      (m) => m.id === point.overlayMapId || m.allmaps_id === point.overlayMapId
    );
    const allmapsId = found?.annotation_url ?? found?.allmaps_id ?? null;
    const mapId = found?.id ?? point.overlayMapId;
    if (!allmapsId) return;
    layersStore.clearOverlays();
    layersStore.addOverlay({
      kind: 'historical',
      mapId,
      allmapsId,
      name: found?.name,
      thumbnail: found?.thumbnail,
    });
  }

  // ── Intro events ──────────────────────────────────────────────────
  async function startTrip() {
    if (!story) return;
    // Ask for location BEFORE dismissing the intro so the prompt context is
    // clear ("Walk around Saigon needs your location to guide you").
    const perm = await requestGeolocation();
    if (perm === 'denied') {
      gpsError = 'Location permission was denied. You can re-enable it in your browser settings, or continue without it.';
      gpsActive = false;
    } else if (perm === 'unavailable') {
      gpsError = 'This device cannot share its location. The trip will work, but auto check-in is off.';
      gpsActive = false;
    }
    storyPlayer.startStory(story.id);
    showIntro = false;
    if (story.points[0]) applyPointOverlay(story.points[0]);
  }

  async function resumeTrip() {
    const perm = await requestGeolocation();
    if (perm === 'denied') {
      gpsError = 'Location permission was denied. Auto check-in is off — use Mark visited instead.';
      gpsActive = false;
    } else if (perm === 'unavailable') {
      gpsActive = false;
    }
    showIntro = false;
    if (story && currentPoint) applyPointOverlay(currentPoint);
  }

  async function restartTrip() {
    if (!story) return;
    storyPlayer.resetProgress(story.id);
    walkedMeters = 0;
    await startTrip();
  }

  // ── Re-frame map + swap overlay when current point changes ──────
  // Track the last point we framed so we only react to real changes.
  let lastFramedPointId: string | null = null;
  $: if (!showIntro && story && currentPoint && currentPoint.id !== lastFramedPointId) {
    lastFramedPointId = currentPoint.id;
    mapStore.setView({
      lng: currentPoint.coordinates[0],
      lat: currentPoint.coordinates[1],
      zoom: 17,
    });
    applyPointOverlay(currentPoint);
  }

  async function loadStory() {
    loading = true;
    error = null;
    try {
      if (!storyId) throw new Error('Missing story id');
      const { data, error: err } = await supabase
        .from('stories')
        .select('*, story_points(*)')
        .eq('id', storyId)
        .single();
      if (err || !data) throw err ?? new Error('Story not found');

      const points: StoryPoint[] = ((data as any).story_points ?? [])
        .slice()
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((row: any) => ({
          id: row.id,
          order: row.sort_order,
          title: row.title,
          description: row.description ?? '',
          hint: row.hint ?? undefined,
          quest: row.quest ?? undefined,
          coordinates: [row.lon, row.lat],
          triggerRadius: row.trigger_radius,
          interaction: row.interaction,
          challenge: row.challenge ?? { type: 'none' },
          qrPayload: row.qr_payload ?? undefined,
          overlayMapId: row.overlay_map_id ?? undefined,
          camera: row.camera && Object.keys(row.camera).length ? row.camera : undefined,
        }));

      story = {
        id: (data as any).id,
        authorId: (data as any).user_id,
        title: (data as any).title,
        description: (data as any).description ?? '',
        mode: (data as any).mode,
        region:
          (data as any).region && Object.keys((data as any).region).length
            ? (data as any).region
            : undefined,
        isPublic: (data as any).is_public,
        points,
        stops: points,
        createdAt: new Date((data as any).created_at).getTime(),
        updatedAt: new Date((data as any).updated_at).getTime(),
      };

      // Decide intro behavior based on existing progress:
      //   - finished trip → skip intro, go straight to completion screen
      //   - in-progress    → show intro with Resume/Restart
      //   - fresh          → show intro with Start
      const existing = storyId ? get(storyPlayer).progress[storyId] : null;
      if (existing?.completedAt) {
        showIntro = false;
        // Re-apply the last visited stop's overlay so the map matches.
        const last = story.points[story.points.length - 1];
        if (last) applyPointOverlay(last);
      }

      // Initial framing: region, else first point.
      if (story.region) {
        mapStore.setView({
          lng: story.region.center[0],
          lat: story.region.center[1],
          zoom: story.region.zoom,
        });
      } else if (story.points[0]) {
        mapStore.setView({
          lng: story.points[0].coordinates[0],
          lat: story.points[0].coordinates[1],
          zoom: 16,
        });
      }
    } catch (e: any) {
      console.error('[trip] failed to load story:', e);
      error = e?.message ?? 'Could not load this story.';
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    try {
      mapList = await fetchMaps(supabase);
    } catch (e) {
      console.error('[trip] failed to load maps:', e);
    }
    await loadStory();
  });
</script>

<svelte:head>
  <title>{story?.title ?? 'Trip'} — Vietnam Map Archive</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
</svelte:head>

<div class="trip">
  {#if loading}
    <div class="state">
      <div class="spinner" aria-hidden="true"></div>
      <p>Loading your trip…</p>
    </div>
  {:else if error || !story}
    <div class="state">
      <h2>Trip unavailable</h2>
      <p>{error ?? 'This story could not be loaded.'}</p>
      <button type="button" class="back-btn" on:click={() => goto('/view')}>← Back to maps</button>
    </div>
  {:else}
    <MapShell {mapStore} {layerStore} disableUrlSync={true}>
      <LayerRenderer />
      <GpsTracker
        active={gpsActive && !showIntro}
        autoFollow={false}
        showTrack={true}
        on:position={handleGpsPosition}
        on:error={(e) => (gpsError = e.detail.message)}
      />
      {#if !showIntro}
        <TripMarkers points={story.points} {currentIndex} {completedIds} />
        <TripPlayback
          {story}
          {progress}
          {userPosition}
          {walkedMeters}
          canSaveProgress={!isLoggedIn}
          on:markVisited={handleMarkVisited}
          on:advance={handleAdvance}
          on:done={handleDone}
          on:share={handleShare}
          on:save={handleSave}
        />
      {/if}
    </MapShell>

    {#if showIntro}
      <TripIntro
        {story}
        {estimatedMinutes}
        hasProgress={!!progress && !isFinished && completedIds.size > 0}
        on:start={() => (progress && !isFinished ? restartTrip() : startTrip())}
        on:resume={resumeTrip}
      />
    {:else}
      <button
        type="button"
        class="gps-toggle"
        class:is-on={gpsActive}
        on:click={() => { gpsActive = !gpsActive; gpsError = null; }}
        aria-label={gpsActive ? 'Pause location tracking' : 'Resume location tracking'}
        title={gpsActive ? 'Tracking on' : 'Tracking off'}
      >
        {gpsActive ? '📍' : '⊘'}
      </button>

      {#if gpsError}
        <div class="gps-error" role="alert">{gpsError}</div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .trip {
    position: fixed;
    inset: 0;
    top: 56px; /* leave room for the (app) NavBar */
    background: var(--sb-bg, #faf8f3);
    overflow: hidden;
  }

  .state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    height: 100%;
    padding: 1.5rem;
    text-align: center;
    color: var(--sb-text, #111);
  }
  .state h2 {
    margin: 0;
    font-family: var(--sb-font-display, 'Spectral', serif);
    font-size: 1.4rem;
  }
  .state p { margin: 0; font-size: 0.95rem; color: var(--sb-text-meta, #555); }

  .spinner {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 3px solid #11111122;
    border-top-color: var(--sb-accent, #ea580c);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .back-btn {
    margin-top: 0.5rem;
    padding: 0.55rem 1rem;
    background: var(--sb-card-bg, #fff);
    border: 2px solid #111;
    border-radius: var(--sb-radius, 10px);
    box-shadow: 3px 3px 0 #111;
    font-weight: 700;
    cursor: pointer;
  }
  .back-btn:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #111; }

  .gps-toggle {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    border: 2px solid #111;
    border-radius: 50%;
    box-shadow: 3px 3px 0 #111;
    font-size: 1.1rem;
    cursor: pointer;
    z-index: 110;
  }
  .gps-toggle.is-on { background: var(--sb-accent, #ea580c); color: #fff; }
  .gps-toggle:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #111; }

  .gps-error {
    position: absolute;
    top: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    max-width: 80%;
    padding: 0.5rem 0.75rem;
    background: #fff3cd;
    border: 2px solid #111;
    border-radius: var(--sb-radius-sm, 6px);
    font-size: 0.8rem;
    z-index: 110;
  }
</style>
