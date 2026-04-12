<!--
  DualMapPane.svelte — Secondary OL Map for dual side-by-side view.

  Shares the View from the primary map for automatic pan/zoom/rotation sync.
  Has its own basemap layers and optional WarpedMapLayer overlay.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import OlMap from "ol/Map";
  import BaseLayer from "ol/layer/Base";
  import { defaults as defaultControls } from "ol/control/defaults";
  import { BASEMAP_DEFS } from "$lib/map/constants";
  import {
    createWarpedLayer,
    destroyWarpedLayer,
    loadOverlayByUrl,
    setOverlayOpacity,
    clearOverlay,
  } from "./warpedOverlay";
  import type { WarpedMapLayer } from "@allmaps/openlayers";

  export let primaryMap: OlMap;
  export let basemap: string = "g-streets";
  export let showOverlay: boolean = true;
  export let overlayOpacity: number = 0.8;
  /** maps.allmaps_id — the Allmaps service credential needed for tile loading. */
  export let activeAllmapsId: string = "";
  /** Bindable — exposes the created OL Map to the parent */
  export let map: OlMap | null = null;

  let container: HTMLDivElement;
  let secondaryMap: OlMap | null = null;
  let basemapLayers: Map<string, BaseLayer> = new Map();
  let warpedLayer: WarpedMapLayer | null = null;
  let currentOverlayId: string | null = null;

  function applyBasemap(key: string) {
    basemapLayers.forEach((layer, k) => {
      layer.setVisible(k === key);
    });
  }

  // React to basemap prop changes
  $: if (secondaryMap) {
    applyBasemap(basemap);
  }

  // Expose to parent
  $: map = secondaryMap;

  // React to overlay visibility
  $: if (warpedLayer) {
    const canvas = warpedLayer.getCanvas();
    if (canvas) {
      canvas.style.display = showOverlay ? "" : "none";
    }
  }

  // React to opacity changes
  $: if (warpedLayer && secondaryMap) {
    setOverlayOpacity(warpedLayer, secondaryMap, overlayOpacity);
  }

  // React to activeAllmapsId changes (must be Allmaps hex ID, not UUID)
  $: if (secondaryMap && warpedLayer) {
    if (activeAllmapsId && activeAllmapsId !== currentOverlayId) {
      loadOverlay(activeAllmapsId);
    } else if (!activeAllmapsId && currentOverlayId) {
      clearOverlay(warpedLayer, secondaryMap ?? undefined);
      currentOverlayId = null;
    }
  }

  async function loadOverlay(id: string) {
    if (!warpedLayer || !secondaryMap) return;
    currentOverlayId = id;
    try {
      await loadOverlayByUrl(warpedLayer, secondaryMap, id, overlayOpacity);
      const canvas = warpedLayer.getCanvas();
      if (canvas) canvas.style.display = showOverlay ? "" : "none";
      secondaryMap.render();
    } catch (err) {
      console.warn("[DualMapPane] Failed to load overlay:", err);
    }
  }

  onMount(() => {
    // Create basemap layers
    for (const def of BASEMAP_DEFS) {
      const layer = def.layer();
      basemapLayers.set(def.key, layer as unknown as BaseLayer);
    }

    // Create secondary map sharing the primary's View
    secondaryMap = new OlMap({
      target: container,
      layers: Array.from(basemapLayers.values()),
      view: primaryMap.getView(),
      controls: defaultControls({
        attribution: false,
        rotate: false,
        zoom: false,
      }),
    });

    applyBasemap(basemap);

    // OL needs a valid size — force updateSize after layout settles
    // Double-RAF ensures the browser has completed layout
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        secondaryMap?.updateSize();
        secondaryMap?.render();
      });
    });

    // Create warped layer for overlay
    warpedLayer = createWarpedLayer(secondaryMap);

    // Load initial overlay if present
    if (activeAllmapsId) {
      loadOverlay(activeAllmapsId);
    }
  });

  onDestroy(() => {
    if (warpedLayer) {
      destroyWarpedLayer(warpedLayer);
      warpedLayer = null;
    }
    if (secondaryMap) {
      secondaryMap.setTarget(undefined);
      secondaryMap = null;
    }
    basemapLayers.clear();
    currentOverlayId = null;
  });
</script>

<div class="dual-pane-root">
  <div bind:this={container} class="dual-pane-map"></div>
</div>

<style>
  .dual-pane-root {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .dual-pane-map {
    position: absolute;
    inset: 0;
  }
</style>
