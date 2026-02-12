<!--
  LabelCanvas.svelte — IIIF image viewer with point placement for Label Studio.
  Uses a separate OL instance with IIIF tile source (pixel coordinates, not geo).
-->
<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import OlMap from "ol/Map";
  import View from "ol/View";
  import TileLayer from "ol/layer/Tile";
  import IIIF from "ol/source/IIIF";
  import IIIFInfo from "ol/format/IIIFInfo";
  import VectorSource from "ol/source/Vector";
  import VectorImageLayer from "ol/layer/VectorImage";
  import Feature from "ol/Feature";
  import Point from "ol/geom/Point";
  import Style from "ol/style/Style";
  import Fill from "ol/style/Fill";
  import Stroke from "ol/style/Stroke";
  import CircleStyle from "ol/style/Circle";
  import Text from "ol/style/Text";
  import { Zoom } from "ol/control";
  import { defaults as defaultControls } from "ol/control/defaults";
  import "ol/ol.css";

  import type { LabelPin } from "./types";

  const dispatch = createEventDispatcher<{
    placePin: { pixelX: number; pixelY: number };
    ready: void;
    error: { message: string };
  }>();

  export let iiifInfoUrl: string | null = null;
  export let pins: LabelPin[] = [];
  export let placingEnabled = false;
  export let selectedLabel: string | null = null;

  let mapContainer: HTMLDivElement;
  let map: OlMap | null = null;
  let pinSource: VectorSource | null = null;
  let tileLayer: TileLayer | null = null;
  let loadingImage = false;
  let loadError = "";

  // Color palette for different labels
  const labelColors: Record<string, string> = {};
  const palette = [
    "#d4af37",
    "#e06c75",
    "#61afef",
    "#98c379",
    "#c678dd",
    "#e5c07b",
    "#56b6c2",
    "#be5046",
    "#d19a66",
    "#abb2bf",
  ];
  let colorIdx = 0;

  function getLabelColor(label: string): string {
    if (!labelColors[label]) {
      labelColors[label] = palette[colorIdx % palette.length];
      colorIdx++;
    }
    return labelColors[label];
  }

  function createPinStyle(feature: any): Style {
    const label = feature.get("label") || "";
    const color = getLabelColor(label);
    return new Style({
      image: new CircleStyle({
        radius: 10,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: "#fff", width: 2.5 }),
      }),
      text: new Text({
        text: label,
        offsetY: -20,
        font: 'bold 11px "Be Vietnam Pro", sans-serif',
        fill: new Fill({ color: "#2b2520" }),
        stroke: new Stroke({ color: "#fff", width: 3.5 }),
        textAlign: "center",
      }),
    });
  }

  function syncPins() {
    if (!pinSource) return;
    pinSource.clear();
    for (const pin of pins) {
      const feature = new Feature({
        geometry: new Point([pin.pixelX, -pin.pixelY]),
        label: pin.label,
        pinId: pin.id,
      });
      feature.setId(pin.id);
      pinSource.addFeature(feature);
    }
  }

  $: if (pinSource) syncPins();

  // React to iiifInfoUrl changes
  $: if (iiifInfoUrl && map) {
    loadIIIFImage(iiifInfoUrl);
  }

  async function loadIIIFImage(infoUrl: string) {
    if (!map) return;
    loadingImage = true;
    loadError = "";

    try {
      const response = await fetch(infoUrl);
      if (!response.ok)
        throw new Error(`Failed to fetch IIIF info: ${response.status}`);
      const info = await response.json();

      const iiifParser = new IIIFInfo(info);
      const options = iiifParser.getTileSourceOptions();

      if (!options) {
        throw new Error("Could not parse IIIF tile source options");
      }

      // Remove old tile layer
      if (tileLayer) {
        map.removeLayer(tileLayer);
      }

      const iiifSource = new IIIF(options);
      tileLayer = new TileLayer({ source: iiifSource, zIndex: 0 });
      map.getLayers().insertAt(0, tileLayer);

      // Fit view to the IIIF image extent
      const tileGrid = iiifSource.getTileGrid();
      if (tileGrid) {
        map.getView().fit(tileGrid.getExtent(), {
          padding: [40, 40, 40, 40],
          duration: 300,
        });
      }

      loadingImage = false;
    } catch (err: any) {
      console.error("[LabelCanvas] IIIF load error:", err);
      loadError = err.message || "Failed to load image";
      loadingImage = false;
      dispatch("error", { message: loadError });
    }
  }

  onMount(() => {
    // Create pin layer
    pinSource = new VectorSource();
    const pinLayer = new VectorImageLayer({
      source: pinSource,
      zIndex: 10,
      style: createPinStyle,
    });

    map = new OlMap({
      target: mapContainer,
      layers: [pinLayer],
      view: new View({
        center: [0, 0],
        zoom: 1,
        showFullExtent: true,
      }),
      controls: defaultControls({
        attribution: false,
        rotate: false,
        zoom: false,
      }).extend([new Zoom()]),
    });

    // Handle clicks for pin placement
    map.on("click", (event) => {
      if (!placingEnabled || !selectedLabel) return;
      const [pixelX, rawY] = event.coordinate;
      dispatch("placePin", { pixelX, pixelY: -rawY });
    });

    dispatch("ready");
    syncPins();

    // If iiifInfoUrl already set, load it
    if (iiifInfoUrl) {
      loadIIIFImage(iiifInfoUrl);
    }
  });

  onDestroy(() => {
    if (map) {
      map.setTarget(undefined);
      map = null;
    }
  });
</script>

<div class="canvas-container">
  <div bind:this={mapContainer} class="canvas-map"></div>

  {#if loadingImage}
    <div class="canvas-overlay">
      <div class="loading-spinner"></div>
      <span>Loading IIIF image...</span>
    </div>
  {/if}

  {#if loadError}
    <div class="canvas-overlay error">
      <span>⚠️ {loadError}</span>
    </div>
  {/if}

  {#if !iiifInfoUrl && !loadingImage}
    <div class="canvas-overlay">
      <span class="empty-msg">No task selected</span>
    </div>
  {/if}

  {#if placingEnabled && selectedLabel}
    <div class="placing-indicator">
      Placing: <strong>{selectedLabel}</strong> — click on the image
    </div>
  {:else if placingEnabled && !selectedLabel}
    <div class="placing-indicator warn">
      Select a label from the sidebar first
    </div>
  {/if}
</div>

<style>
  .canvas-container {
    position: relative;
    width: 100%;
    height: 100%;
    background: #1a1612;
  }

  .canvas-map {
    width: 100%;
    height: 100%;
  }

  .canvas-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    background: rgba(26, 22, 18, 0.7);
    z-index: 20;
    font-family: "Be Vietnam Pro", sans-serif;
    font-size: 0.85rem;
    color: #e8d5ba;
    pointer-events: none;
  }

  .canvas-overlay.error {
    color: #f87171;
  }

  .empty-msg {
    color: #8b7355;
  }

  .loading-spinner {
    width: 28px;
    height: 28px;
    border: 3px solid rgba(212, 175, 55, 0.3);
    border-top-color: #d4af37;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .placing-indicator {
    position: absolute;
    top: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.35rem 0.8rem;
    background: linear-gradient(
      160deg,
      rgba(244, 232, 216, 0.95) 0%,
      rgba(232, 213, 186, 0.95) 100%
    );
    border: 1px solid #d4af37;
    border-radius: 3px;
    font-size: 0.75rem;
    font-family: "Be Vietnam Pro", sans-serif;
    color: #4a3f35;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 50;
    pointer-events: none;
  }

  .placing-indicator.warn {
    border-color: #f59e0b;
    color: #92400e;
  }
</style>
