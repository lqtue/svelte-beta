<!--
  HistoricalOverlay.svelte — thin wrapper around shared warpedOverlay utilities.

  Reads the OL Map from shell context. Reacts to mapStore.activeMapId
  and layerStore for opacity / view mode clip masks.

  Dispatches: loadstart, loadend, loaderror
-->
<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import type { WarpedMapLayer } from '@allmaps/openlayers';
  import type Map from 'ol/Map';
  import type { Unsubscriber } from 'svelte/store';

  import { getShellContext } from './context';
  import {
    createWarpedLayer,
    destroyWarpedLayer,
    loadOverlayByUrl,
    setOverlayOpacity,
    clearOverlay as clearWarpedOverlay,
    applyClipMask
  } from './warpedOverlay';

  const dispatch = createEventDispatcher<{
    loadstart: void;
    loadend: void;
    loaderror: { message: string };
  }>();

  const { map: mapWritable, mapStore, layerStore } = getShellContext();

  let warpedLayer: WarpedMapLayer | null = null;
  let currentOverlayId: string | null = null;
  let olMap: Map | null = null;
  let unsubs: Unsubscriber[] = [];
  let initialized = false;
  let loadTimeout: ReturnType<typeof setTimeout> | null = null;

  // ── Overlay loading (delegates to shared utility) ────────────────

  async function load(id: string) {
    if (!warpedLayer || !olMap || id === currentOverlayId) return;

    currentOverlayId = id;

    // Hide canvas immediately to prevent ghosting from the previous map
    const canvas = warpedLayer.getCanvas();
    if (canvas) canvas.style.display = 'none';

    dispatch('loadstart');

    // Clear any previous timeout
    if (loadTimeout) clearTimeout(loadTimeout);

    // Set up tile-loading listeners for this load cycle
    const layer = warpedLayer as any;
    let tileListenerCleanup: (() => void) | null = null;

    const onTilesLoaded = () => {
      if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }
      // Show canvas now that tiles are ready
      const c = warpedLayer?.getCanvas();
      if (c) c.style.display = '';
      dispatch('loadend');
      tileListenerCleanup?.();
    };

    // Listen for the first tile so we know the source is working,
    // then wait for all requested tiles to finish
    layer.on('allrequestedtilesloaded', onTilesLoaded);
    tileListenerCleanup = () => {
      try { layer.un('allrequestedtilesloaded', onTilesLoaded); } catch {}
    };

    // Timeout: if tiles don't load within 20s, treat as error
    loadTimeout = setTimeout(() => {
      tileListenerCleanup?.();
      // Check if we actually got content — the canvas might still be hidden
      const c = warpedLayer?.getCanvas();
      if (c && c.style.display === 'none') {
        dispatch('loaderror', { message: 'Map tiles timed out. The image source may be unavailable.' });
      }
    }, 20000);

    try {
      const ls = get(layerStore);
      await loadOverlayByUrl(warpedLayer, olMap, id, ls.overlayOpacity);
    } catch (err) {
      if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }
      tileListenerCleanup?.();
      console.warn('[HistoricalOverlay] Failed to load:', id, err);
      dispatch('loaderror', { message: 'Failed to load map overlay. The annotation may be invalid.' });
    }
  }

  function clear() {
    if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }
    if (warpedLayer) clearWarpedOverlay(warpedLayer);
    currentOverlayId = null;
    dispatch('loadend');
  }

  // ── Refresh clip mask (delegates to shared utility) ──────────────

  function refreshClip() {
    if (!warpedLayer || !olMap) return;
    const ls = get(layerStore);
    applyClipMask(warpedLayer, olMap, ls.viewMode, ls.sideRatio, ls.lensRadius);
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  onMount(() => {
    unsubs.push(
      mapWritable.subscribe(($map) => {
        if (!$map || initialized) return;
        initialized = true;
        olMap = $map;

        // Create the layer once the map is ready
        warpedLayer = createWarpedLayer($map);

        // React to activeMapId changes
        unsubs.push(
          mapStore.subscribe(($ms) => {
            if ($ms.activeMapId) {
              load($ms.activeMapId);
            } else {
              clear();
            }
          })
        );

        // React to layer settings (opacity, visibility, view mode)
        unsubs.push(
          layerStore.subscribe(($ls) => {
            if (!warpedLayer || !olMap) return;

            // Visibility toggle
            const canvas = warpedLayer.getCanvas();
            if (canvas) {
              canvas.style.display = $ls.overlayVisible ? '' : 'none';
            }

            // Opacity via layer.setOpacity + map.render
            setOverlayOpacity(warpedLayer, olMap, $ls.overlayOpacity);

            // View mode clip mask
            applyClipMask(warpedLayer, olMap, $ls.viewMode, $ls.sideRatio, $ls.lensRadius);
          })
        );

        // Refresh clip on map resize / pan
        $map.on('moveend', refreshClip);
        $map.on('change:size', refreshClip);
      })
    );
  });

  onDestroy(() => {
    if (loadTimeout) clearTimeout(loadTimeout);
    unsubs.forEach((u) => u());
    unsubs = [];
    if (warpedLayer) {
      destroyWarpedLayer(warpedLayer);
      warpedLayer = null;
    }
  });
</script>
