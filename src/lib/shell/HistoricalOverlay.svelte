<!--
  HistoricalOverlay.svelte — thin wrapper around shared warpedOverlay utilities.

  Reads the OL Map from shell context. Reacts to mapStore.activeMapId
  and layerStore for opacity / view mode clip masks.

  Dispatches: loadstart, loadend, loaderror
-->
<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { get } from "svelte/store";
  import type { WarpedMapLayer } from "@allmaps/openlayers";
  import type Map from "ol/Map";
  import type { Unsubscriber } from "svelte/store";

  import { getShellContext } from "./context";
  import {
    createWarpedLayer,
    destroyWarpedLayer,
    loadOverlayByUrl,
    setOverlayOpacity,
    clearOverlay as clearWarpedOverlay,
    applyClipMask,
  } from "./warpedOverlay";

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
    if (canvas) canvas.style.display = "none";

    dispatch("loadstart");
    overlayLoading = true;

    // Clear any previous timeout and listeners
    if (loadTimeout) {
      clearTimeout(loadTimeout);
      loadTimeout = null;
    }
    tileListenerCleanup?.();

    // Set up tile-loading listeners for this load cycle
    const layer = warpedLayer as any;

    const onTilesLoaded = () => {
      if (!overlayLoading) return;
      if (loadTimeout) {
        clearTimeout(loadTimeout);
        loadTimeout = null;
      }
      // Show canvas now that tiles are ready
      const c = warpedLayer?.getCanvas();
      if (c) c.style.display = "";
      overlayLoading = false;
      dispatch("loadend");
      tileListenerCleanup?.();
    };

    const onTileError = () => {
      // If we get tile errors but some tiles might still load, we don't necessarily want to fail hard immediately,
      // but if info.json fails internally, we might never get allrequestedtilesloaded.
      // For now, let's just keep the timeout as the primary failure mechanism but maybe shorten it.
    };

    // Listen for the first tile so we know the source is working,
    // then wait for all requested tiles to finish
    layer.on("allrequestedtilesloaded", onTilesLoaded);
    layer.on("tileloaderror", onTileError);

    tileListenerCleanup = () => {
      try {
        layer.un("allrequestedtilesloaded", onTilesLoaded);
        layer.un("tileloaderror", onTileError);
      } catch {}
    };

    // Timeout: if tiles don't load within 12s, treat as error (reduced from 20s)
    loadTimeout = setTimeout(() => {
      if (!overlayLoading) return;
      tileListenerCleanup?.();
      // Check if we actually got content — the canvas might still be hidden
      const c = warpedLayer?.getCanvas();
      if (c && c.style.display === "none") {
        overlayLoading = false;
        dispatch("loaderror", {
          message: "Map tiles timed out. The image source may be unavailable.",
        });
      }
    }, 12000);

    try {
      const ls = get(layerStore);
      await loadOverlayByUrl(warpedLayer, olMap, id, ls.overlayOpacity);
      // loadOverlayByUrl only fetches the annotation; tiles load asynchronously in the background
    } catch (err) {
      if (!overlayLoading) return;
      if (loadTimeout) {
        clearTimeout(loadTimeout);
        loadTimeout = null;
      }
      tileListenerCleanup?.();
      overlayLoading = false;
      console.warn("[HistoricalOverlay] Failed to load:", id, err);
      dispatch("loaderror", {
        message: "Failed to load map overlay. The annotation may be invalid.",
      });
    }
  }

  let overlayLoading = false;

  function clear() {
    if (loadTimeout) {
      clearTimeout(loadTimeout);
      loadTimeout = null;
    }
    if (warpedLayer) clearWarpedOverlay(warpedLayer);
    currentOverlayId = null;
    dispatch("loadend");
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

        // React to activeAllmapsId changes (the Allmaps service credential).
        // activeMapId is the UUID (canonical); activeAllmapsId is what the Allmaps API needs.
        unsubs.push(
          mapStore.subscribe(($ms) => {
            if ($ms.activeAllmapsId) {
              load($ms.activeAllmapsId);
            } else if (!$ms.activeMapId) {
              clear();
            }
          }),
        );

        // React to layer settings (opacity, visibility, view mode)
        unsubs.push(
          layerStore.subscribe(($ls) => {
            if (!warpedLayer || !olMap) return;

            // Visibility toggle
            const canvas = warpedLayer.getCanvas();
            if (canvas) {
              canvas.style.display = $ls.overlayVisible ? "" : "none";
            }

            // Opacity via layer.setOpacity + map.render
            setOverlayOpacity(warpedLayer, olMap, $ls.overlayOpacity);

            // View mode clip mask
            applyClipMask(
              warpedLayer,
              olMap,
              $ls.viewMode,
              $ls.sideRatio,
              $ls.lensRadius,
            );
          }),
        );

        // Refresh clip on map resize / pan
        $map.on("moveend", refreshClip);
        $map.on("change:size", refreshClip);
      }),
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
