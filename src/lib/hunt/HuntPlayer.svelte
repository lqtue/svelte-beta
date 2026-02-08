<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { createAnnotationHistoryStore } from '$lib/map/stores/annotationHistory';
  import { createAnnotationStateStore } from '$lib/map/stores/annotationState';
  import { setAnnotationContext } from '$lib/map/context/annotationContext';
  import { startTracking, stopTracking, formatError } from '$lib/trip/geolocation';
  import { isWithinRadius } from './utils/geo';
  import type { TreasureHunt, HuntProgress } from './types';
  import StudioMap from '$lib/studio/StudioMap.svelte';
  import StopCard from './StopCard.svelte';

  const dispatch = createEventDispatcher<{
    completeStop: { huntId: string; stopId: string };
    finish: { huntId: string };
    exit: void;
  }>();

  export let hunt: TreasureHunt;
  export let progress: HuntProgress | null = null;

  const annotationHistory = createAnnotationHistoryStore(50);
  const annotationState = createAnnotationStateStore();
  setAnnotationContext({ history: annotationHistory, state: annotationState });

  let studioMapRef: StudioMap;
  let watchId: number | null = null;
  let gpsError: string | null = null;
  let gpsState: 'idle' | 'requesting' | 'active' | 'denied' | 'simulate' = 'idle';
  let playerPosition: [number, number] | null = null;
  let showStopCard = false;
  let consecutiveInRange = 0;
  let simWalking = false;
  let simWalkTimer: ReturnType<typeof setTimeout> | null = null;

  const TRIGGER_COUNT = 2;

  $: currentStopIndex = progress?.currentStopIndex ?? 0;
  $: completedStops = progress?.completedStops ?? [];
  $: currentStop = currentStopIndex < hunt.stops.length ? hunt.stops[currentStopIndex] : null;
  $: isFinished = currentStopIndex >= hunt.stops.length;

  async function handleMapReady() {
    await tick();
    studioMapRef.setHuntStops(hunt.stops);

    // Mark completed stops
    completedStops.forEach((id) => {
      studioMapRef.updateHuntStopState(id, { completed: true });
    });

    // Mark current stop as active
    if (currentStop) {
      studioMapRef.updateHuntStopState(currentStop.id, { active: true });
    }

    studioMapRef.zoomToHuntStops();
  }

  function requestLocationAndStart() {
    gpsState = 'requesting';
    gpsError = null;
    startGps();
  }

  function startGps() {
    if (watchId !== null) return;
    const id = startTracking({
      onPosition: handlePosition,
      onError: handleGpsError
    });
    if (id === null) {
      gpsState = 'denied';
      gpsError = 'Geolocation is not supported by this device.';
    } else {
      watchId = id;
    }
  }

  function stopGps() {
    if (watchId !== null) {
      stopTracking(watchId);
      watchId = null;
    }
  }

  function handlePosition(position: GeolocationPosition) {
    gpsError = null;
    gpsState = 'active';
    const lon = position.coords.longitude;
    const lat = position.coords.latitude;
    playerPosition = [lon, lat];
    studioMapRef?.updatePlayerPosition(playerPosition);

    if (!currentStop || showStopCard || isFinished) return;

    if (isWithinRadius(playerPosition, currentStop.coordinates, currentStop.triggerRadius)) {
      consecutiveInRange++;
      if (consecutiveInRange >= TRIGGER_COUNT) {
        triggerStop();
      }
    } else {
      consecutiveInRange = 0;
    }
  }

  function handleGpsError(error: GeolocationPositionError) {
    gpsError = formatError(error);
    if (error.code === error.PERMISSION_DENIED) {
      gpsState = 'denied';
    }
  }

  // --- Simulate mode ---

  function startSimulate() {
    gpsState = 'simulate';
    gpsError = null;
    stopGps();
    // Place player at first uncompleted stop's approach position
    if (currentStop) {
      const approach = offsetCoord(currentStop.coordinates, 50);
      simulatePosition(approach);
    }
  }

  function simulatePosition(lonLat: [number, number]) {
    playerPosition = lonLat;
    gpsState = 'simulate';
    studioMapRef?.updatePlayerPosition(lonLat);
  }

  function simulateTeleport(stopIndex: number) {
    const stop = hunt.stops[stopIndex];
    if (!stop) return;
    simulatePosition(stop.coordinates);
    studioMapRef?.zoomToHuntStop(stop.id);

    // Feed through proximity check (need TRIGGER_COUNT hits)
    if (!showStopCard && !isFinished && currentStop && stop.id === currentStop.id) {
      consecutiveInRange = TRIGGER_COUNT;
      triggerStop();
    }
  }

  function simulateAutoWalk() {
    if (simWalking) {
      cancelAutoWalk();
      return;
    }
    simWalking = true;
    walkToNextStop();
  }

  function walkToNextStop() {
    if (!simWalking) return;
    if (showStopCard || isFinished) {
      // Wait for card dismiss before continuing
      simWalkTimer = setTimeout(walkToNextStop, 500);
      return;
    }
    if (!currentStop) {
      simWalking = false;
      return;
    }
    // Animate approach: first show nearby, then teleport to stop
    const approach = offsetCoord(currentStop.coordinates, 30);
    simulatePosition(approach);
    studioMapRef?.zoomToHuntStop(currentStop.id);

    simWalkTimer = setTimeout(() => {
      if (!simWalking || !currentStop) return;
      simulateTeleport(currentStopIndex);
    }, 1200);
  }

  function cancelAutoWalk() {
    simWalking = false;
    if (simWalkTimer) {
      clearTimeout(simWalkTimer);
      simWalkTimer = null;
    }
  }

  /** Offset a [lon,lat] by ~meters north-east (rough approximation for UI) */
  function offsetCoord(coord: [number, number], meters: number): [number, number] {
    const degPerMeter = 1 / 111320;
    return [coord[0] + meters * degPerMeter * 0.7, coord[1] + meters * degPerMeter * 0.7];
  }

  function triggerStop() {
    if (!currentStop) return;
    showStopCard = true;
    consecutiveInRange = 0;

    // Load historical map overlay if configured
    if (currentStop.overlayMapId) {
      studioMapRef?.loadOverlaySource(currentStop.overlayMapId);
    }

    // Zoom to the stop
    studioMapRef?.zoomToHuntStop(currentStop.id);
  }

  function handleDismissStop() {
    if (!currentStop) return;

    // Mark stop as completed on the map
    studioMapRef.updateHuntStopState(currentStop.id, { completed: true, active: false });

    // Clear overlay
    studioMapRef.clearOverlay();

    const stopId = currentStop.id;
    showStopCard = false;

    dispatch('completeStop', { huntId: hunt.id, stopId });

    // Check if finished
    const nextIndex = currentStopIndex + 1;
    if (nextIndex >= hunt.stops.length) {
      dispatch('finish', { huntId: hunt.id });
      cancelAutoWalk();
    } else {
      // Activate next stop
      const nextStop = hunt.stops[nextIndex];
      if (nextStop) {
        studioMapRef.updateHuntStopState(nextStop.id, { active: true });
      }
      // Continue auto-walk after brief pause
      if (simWalking) {
        simWalkTimer = setTimeout(walkToNextStop, 1500);
      }
    }
  }

  onMount(() => {
    return () => { stopGps(); cancelAutoWalk(); };
  });

  onDestroy(() => {
    stopGps();
    cancelAutoWalk();
  });
</script>

<div class="player">
  <div class="player-header">
    <button type="button" class="back-btn" on:click={() => dispatch('exit')}>
      Back
    </button>
    <h2 class="hunt-title">{hunt.title}</h2>
    <span class="progress-badge">
      {completedStops.length} / {hunt.stops.length}
    </span>
  </div>

  <div class="player-map">
    <StudioMap
      bind:this={studioMapRef}
      basemapSelection="g-streets"
      viewMode="overlay"
      sideRatio={0.5}
      lensRadius={150}
      opacity={0.8}
      drawingMode={null}
      editingEnabled={false}
      on:mapReady={handleMapReady}
    />
  </div>

  {#if gpsError}
    <div class="gps-error">
      <p>{gpsError}</p>
      {#if gpsState === 'denied'}
        <p class="gps-error-hint">Please enable location access in your browser settings and try again.</p>
        <button type="button" class="retry-btn" on:click={requestLocationAndStart}>Retry</button>
      {/if}
    </div>
  {/if}

  {#if gpsState === 'idle' || gpsState === 'requesting'}
    <div class="start-overlay">
      <div class="start-card">
        <div class="start-icon">&#x1F4CD;</div>
        <h3>{hunt.title}</h3>
        <p class="start-desc">{hunt.stops.length} stop{hunt.stops.length !== 1 ? 's' : ''} to discover</p>
        {#if hunt.description}
          <p class="start-detail">{hunt.description}</p>
        {/if}
        <p class="start-notice">This hunt uses your GPS location to trigger stops as you walk. You'll be asked to share your location.</p>
        <button
          type="button"
          class="start-btn"
          disabled={gpsState === 'requesting'}
          on:click={requestLocationAndStart}
        >
          {#if gpsState === 'requesting'}
            Waiting for location...
          {:else}
            Start Hunt
          {/if}
        </button>
        <button
          type="button"
          class="sim-start-btn"
          on:click={startSimulate}
        >
          Simulate (no GPS)
        </button>
      </div>
    </div>
  {/if}

  {#if gpsState === 'simulate' && !isFinished}
    <div class="sim-toolbar">
      <span class="sim-label">SIM</span>
      {#each hunt.stops as stop, i (stop.id)}
        <button
          type="button"
          class="sim-stop-btn"
          class:completed={completedStops.includes(stop.id)}
          class:current={currentStop?.id === stop.id}
          disabled={showStopCard}
          on:click={() => simulateTeleport(i)}
          title="Teleport to {stop.title}"
        >
          {i + 1}
        </button>
      {/each}
      <button
        type="button"
        class="sim-auto-btn"
        class:active={simWalking}
        on:click={simulateAutoWalk}
        title={simWalking ? 'Stop auto-walk' : 'Auto-walk all stops'}
      >
        {simWalking ? '&#x23F8;' : '&#x25B6;'}
      </button>
    </div>
  {/if}

  {#if (gpsState === 'active' || gpsState === 'simulate') && currentStop && !showStopCard && !isFinished}
    <div class="hint-bar">
      {#if currentStop.hint}
        <p class="hint-text">{currentStop.hint}</p>
      {:else}
        <p class="hint-text">Head to stop {currentStop.order + 1}: {currentStop.title}</p>
      {/if}
    </div>
  {/if}

  {#if isFinished}
    <div class="finish-card">
      <h3>Hunt Complete!</h3>
      <p>You visited all {hunt.stops.length} stops.</p>
      <button type="button" class="continue-btn" on:click={() => dispatch('exit')}>
        Done
      </button>
    </div>
  {/if}

  {#if showStopCard && currentStop}
    <StopCard
      stop={currentStop}
      isLast={currentStopIndex === hunt.stops.length - 1}
      on:dismiss={handleDismissStop}
    />
  {/if}
</div>

<style>
  .player {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #2b2520;
  }

  .player-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.98) 0%, rgba(232, 213, 186, 0.98) 100%);
    border-bottom: 2px solid #d4af37;
    z-index: 50;
  }

  .back-btn {
    border: 1px solid rgba(212, 175, 55, 0.4);
    background: rgba(255, 255, 255, 0.5);
    border-radius: 2px;
    color: #4a3f35;
    font-size: 0.78rem;
    padding: 0.35rem 0.75rem;
    cursor: pointer;
  }

  .back-btn:hover {
    background: rgba(212, 175, 55, 0.2);
    border-color: #d4af37;
  }

  .hunt-title {
    margin: 0;
    font-family: 'Spectral', serif;
    font-size: 1.05rem;
    font-weight: 700;
    color: #2b2520;
    flex: 1;
  }

  .progress-badge {
    background: #d4af37;
    color: #fff;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.25rem 0.65rem;
    border-radius: 999px;
  }

  .player-map {
    flex: 1;
    position: relative;
    min-height: 0;
  }

  .gps-error {
    position: absolute;
    top: 4.5rem;
    left: 1rem;
    right: 1rem;
    background: rgba(168, 72, 72, 0.95);
    color: #fff;
    font-size: 0.78rem;
    padding: 0.55rem 0.75rem;
    border-radius: 4px;
    z-index: 60;
    text-align: center;
  }

  .gps-error p {
    margin: 0 0 0.35rem;
  }

  .gps-error-hint {
    font-size: 0.72rem;
    opacity: 0.85;
  }

  .retry-btn {
    margin-top: 0.4rem;
    padding: 0.35rem 1rem;
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .retry-btn:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  .start-overlay {
    position: absolute;
    inset: 0;
    background: rgba(43, 37, 32, 0.6);
    z-index: 80;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 1rem;
  }

  .start-card {
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.99) 0%, rgba(232, 213, 186, 0.99) 100%);
    border: 2px solid #d4af37;
    border-radius: 8px;
    padding: 1.5rem;
    max-width: 380px;
    width: 100%;
    text-align: center;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
  }

  .start-icon {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }

  .start-card h3 {
    margin: 0 0 0.35rem;
    font-family: 'Spectral', serif;
    font-size: 1.2rem;
    font-weight: 700;
    color: #2b2520;
  }

  .start-desc {
    margin: 0 0 0.5rem;
    font-size: 0.82rem;
    color: #8b7355;
    font-weight: 600;
  }

  .start-detail {
    margin: 0 0 0.75rem;
    font-size: 0.82rem;
    color: #4a3f35;
    line-height: 1.45;
  }

  .start-notice {
    margin: 0 0 1rem;
    font-size: 0.72rem;
    color: #8b7355;
    line-height: 1.4;
    border-top: 1px solid rgba(212, 175, 55, 0.25);
    padding-top: 0.75rem;
  }

  .start-btn {
    width: 100%;
    padding: 0.75rem 1.5rem;
    border: 2px solid #d4af37;
    border-radius: 4px;
    background: linear-gradient(135deg, #d4af37 0%, #b8942f 100%);
    color: #fff;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .start-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, #e0c050 0%, #d4af37 100%);
    box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);
  }

  .start-btn:disabled {
    opacity: 0.7;
    cursor: wait;
  }

  .sim-start-btn {
    width: 100%;
    margin-top: 0.5rem;
    padding: 0.55rem 1rem;
    border: 1px solid rgba(212, 175, 55, 0.4);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.5);
    color: #6b5d52;
    font-size: 0.78rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .sim-start-btn:hover {
    background: rgba(212, 175, 55, 0.15);
    border-color: #d4af37;
    color: #2b2520;
  }

  .sim-toolbar {
    position: absolute;
    top: 4rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.3rem;
    background: linear-gradient(160deg, rgba(43, 37, 32, 0.92) 0%, rgba(30, 25, 20, 0.92) 100%);
    border: 1px solid rgba(212, 175, 55, 0.5);
    border-radius: 999px;
    padding: 0.3rem 0.55rem;
    z-index: 70;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(8px);
  }

  .sim-label {
    font-size: 0.6rem;
    font-weight: 700;
    color: #d4af37;
    letter-spacing: 0.08em;
    padding: 0 0.25rem;
  }

  .sim-stop-btn {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid #d4af37;
    background: transparent;
    color: #d4af37;
    font-size: 0.68rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .sim-stop-btn:hover:not(:disabled) {
    background: rgba(212, 175, 55, 0.3);
  }

  .sim-stop-btn.current {
    background: #d4af37;
    color: #fff;
    box-shadow: 0 0 8px rgba(212, 175, 55, 0.5);
  }

  .sim-stop-btn.completed {
    border-color: #2d7a4f;
    color: #2d7a4f;
    background: rgba(45, 122, 79, 0.15);
  }

  .sim-stop-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .sim-auto-btn {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid rgba(234, 88, 12, 0.7);
    background: transparent;
    color: #ea580c;
    font-size: 0.7rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 0.15rem;
    transition: all 0.15s ease;
  }

  .sim-auto-btn:hover {
    background: rgba(234, 88, 12, 0.2);
  }

  .sim-auto-btn.active {
    background: #ea580c;
    color: #fff;
    border-color: #ea580c;
    animation: pulse 1.5s ease infinite;
  }

  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(234, 88, 12, 0.4); }
    50% { box-shadow: 0 0 0 6px rgba(234, 88, 12, 0); }
  }

  .hint-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.95) 0%, rgba(232, 213, 186, 0.95) 100%);
    border-top: 2px solid #d4af37;
    padding: 0.75rem 1rem;
    z-index: 50;
  }

  .hint-text {
    margin: 0;
    font-size: 0.85rem;
    color: #4a3f35;
    text-align: center;
  }

  .finish-card {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.98) 0%, rgba(232, 213, 186, 0.98) 100%);
    border-top: 3px solid #2d7a4f;
    border-radius: 12px 12px 0 0;
    padding: 1.5rem;
    text-align: center;
    z-index: 100;
    box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.15);
  }

  .finish-card h3 {
    margin: 0 0 0.5rem;
    font-family: 'Spectral', serif;
    font-size: 1.3rem;
    font-weight: 700;
    color: #2d7a4f;
  }

  .finish-card p {
    margin: 0 0 1rem;
    font-size: 0.88rem;
    color: #4a3f35;
  }

  .continue-btn {
    padding: 0.65rem 1.5rem;
    border: 2px solid #d4af37;
    border-radius: 4px;
    background: linear-gradient(135deg, #d4af37 0%, #b8942f 100%);
    color: #fff;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
  }

  .continue-btn:hover {
    background: linear-gradient(135deg, #e0c050 0%, #d4af37 100%);
  }
</style>
