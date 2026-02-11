<!--
  MapShell.svelte — The ONE map.

  Responsibilities:
    1. Create and own the single OL Map instance
    2. Manage basemap tile layers (switch via layerStore)
    3. Expose the map + stores via Svelte context
    4. Sync OL View ↔ mapStore (bidirectional)
    5. Start/stop URL hash sync
    6. Render children (modes, panels, toolbars) in a slot on top of the map

  Usage:
    <MapShell {mapStore} {layerStore}>
      <HistoricalOverlay overlayId="abc" />
      <StudioMode />
    </MapShell>
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { writable, get } from "svelte/store";
  import OlMap from "ol/Map";
  import View from "ol/View";
  import BaseLayer from "ol/layer/Base";
  import { Attribution, Rotate, ScaleLine, Zoom } from "ol/control";
  import { defaults as defaultControls } from "ol/control/defaults";
  import DragRotate from "ol/interaction/DragRotate";
  import PinchRotate from "ol/interaction/PinchRotate";
  import { fromLonLat, toLonLat } from "ol/proj";
  import "ol/ol.css";

  import { BASEMAP_DEFS } from "$lib/viewer/constants";
  import type { MapStore } from "$lib/stores/mapStore";
  import { getOlCenter, fromOlCoordinate } from "$lib/stores/mapStore";
  import type { LayerStore } from "$lib/stores/layerStore";
  import { initUrlSync } from "$lib/stores/urlStore";
  import { setShellContext } from "./context";

  // ── Props ────────────────────────────────────────────────────────

  export let mapStore: MapStore;
  export let layerStore: LayerStore;

  export let disableUrlSync = false;

  /** Read-only binding to the OL Map instance */
  export let map: OlMap | null = null;

  // ── Internal state ───────────────────────────────────────────────

  let mapContainer: HTMLDivElement;
  let olMap: OlMap | null = null;
  const mapWritable = writable<OlMap | null>(null);

  /** Basemap OL layers keyed by BASEMAP_DEFS key */
  let basemapLayers: Map<string, BaseLayer> = new Map();

  /** Suppress store→OL sync while OL is writing to the store */
  let suppressStoreToOl = false;

  let urlTeardown: (() => void) | null = null;
  let layerUnsub: (() => void) | null = null;
  let mapStoreUnsub: (() => void) | null = null;

  // ── Context ──────────────────────────────────────────────────────

  setShellContext({
    map: mapWritable,
    mapStore,
    layerStore,
  });

  // ── Basemap switching ────────────────────────────────────────────

  function applyBasemap(key: string) {
    basemapLayers.forEach((layer, k) => {
      layer.setVisible(k === key);
    });
  }

  // ── OL View ↔ mapStore sync ──────────────────────────────────────

  function olViewToStore() {
    if (!olMap) return;
    const view = olMap.getView();
    const center = view.getCenter();
    if (!center) return;

    const [lng, lat] = toLonLat(center);
    const zoom = view.getZoom() ?? 14;
    const rotation = view.getRotation();

    suppressStoreToOl = true;
    mapStore.setView({ lng, lat, zoom, rotation });

    // Release suppression after the store subscription has fired
    requestAnimationFrame(() => {
      suppressStoreToOl = false;
    });
  }

  function storeToOlView() {
    if (suppressStoreToOl || !olMap) return;

    const current = get(mapStore);
    const view = olMap.getView();
    const targetCenter = fromLonLat([current.lng, current.lat]);
    view.setCenter(targetCenter);
    view.setZoom(current.zoom);
    view.setRotation(current.rotation);
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  onMount(() => {
    // 1. Create basemap layers
    for (const def of BASEMAP_DEFS) {
      const layer = def.layer();
      basemapLayers.set(def.key, layer as unknown as BaseLayer);
    }

    // 2. Build controls
    const controls = defaultControls({
      attribution: false,
      rotate: false,
      zoom: false,
    }).extend([
      new Attribution({ collapsible: false }),
      new Rotate({ autoHide: false }),
      new Zoom(),
      new ScaleLine(),
    ]);

    // 3. Create the map
    const center = getOlCenter(mapStore);
    const initial = get(mapStore);

    olMap = new OlMap({
      target: mapContainer,
      layers: Array.from(basemapLayers.values()),
      view: new View({
        center,
        zoom: initial.zoom,
        rotation: initial.rotation,
        enableRotation: true,
      }),
      controls,
    });

    // Sync to prop
    map = olMap;

    // 4. Rotation interactions
    const dragRotate = new DragRotate({
      condition: (event) =>
        event.originalEvent.ctrlKey || event.originalEvent.metaKey,
    });
    olMap.addInteraction(dragRotate);
    olMap.addInteraction(new PinchRotate());

    // 5. Expose via context writable
    mapWritable.set(olMap);

    // 6. OL → store sync on moveend
    olMap.on("moveend", olViewToStore);

    // 7. Store → OL sync on store change
    mapStoreUnsub = mapStore.subscribe(() => storeToOlView());

    // 8. Layer store → basemap switching
    layerUnsub = layerStore.subscribe(($l) => applyBasemap($l.basemap));

    // 9. URL sync
    if (!disableUrlSync) {
      urlTeardown = initUrlSync({ mapStore, layerStore });
    }
  });

  onDestroy(() => {
    urlTeardown?.();
    layerUnsub?.();
    mapStoreUnsub?.();

    if (olMap) {
      olMap.setTarget(undefined);
      olMap = null;
    }

    mapWritable.set(null);
    basemapLayers.clear();
  });
</script>

<div class="shell">
  <div bind:this={mapContainer} class="shell-map"></div>
  <div class="shell-overlay">
    <slot />
  </div>
</div>

<style>
  .shell {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .shell-map {
    position: absolute;
    inset: 0;
  }

  .shell-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 10;
  }

  /* Allow interactive children to capture pointer events */
  .shell-overlay :global(*) {
    pointer-events: auto;
  }
</style>
