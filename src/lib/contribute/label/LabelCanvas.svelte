<!--
  LabelCanvas.svelte — IIIF image viewer with point placement for Label Studio.
  Uses a separate OL instance with IIIF tile source (pixel coordinates, not geo).
-->
<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import OlMap from 'ol/Map';
  import View from 'ol/View';
  import TileLayer from 'ol/layer/Tile';
  import XYZ from 'ol/source/XYZ';
  import VectorSource from 'ol/source/Vector';
  import VectorImageLayer from 'ol/layer/VectorImage';
  import Feature from 'ol/Feature';
  import Point from 'ol/geom/Point';
  import Style from 'ol/style/Style';
  import Fill from 'ol/style/Fill';
  import Stroke from 'ol/style/Stroke';
  import CircleStyle from 'ol/style/Circle';
  import Text from 'ol/style/Text';
  import { Zoom } from 'ol/control';
  import { defaults as defaultControls } from 'ol/control/defaults';
  import 'ol/ol.css';

  import type { LabelPin } from './types';

  const dispatch = createEventDispatcher<{
    placePin: { pixelX: number; pixelY: number };
    ready: void;
  }>();

  export let imageUrl: string | null = null;
  export let imageWidth = 4000;
  export let imageHeight = 3000;
  export let pins: LabelPin[] = [];
  export let placingEnabled = false;
  export let selectedLabel: string | null = null;

  let mapContainer: HTMLDivElement;
  let map: OlMap | null = null;
  let pinSource: VectorSource | null = null;

  function createPinStyle(feature: any): Style {
    const label = feature.get('label') || '';
    return new Style({
      image: new CircleStyle({
        radius: 8,
        fill: new Fill({ color: '#d4af37' }),
        stroke: new Stroke({ color: '#fff', width: 2 })
      }),
      text: new Text({
        text: label,
        offsetY: -16,
        font: '12px "Be Vietnam Pro", sans-serif',
        fill: new Fill({ color: '#2b2520' }),
        stroke: new Stroke({ color: '#fff', width: 3 }),
        textAlign: 'center'
      })
    });
  }

  function syncPins() {
    if (!pinSource) return;
    pinSource.clear();
    for (const pin of pins) {
      const feature = new Feature({
        geometry: new Point([pin.pixelX, -pin.pixelY]),
        label: pin.label,
        pinId: pin.id
      });
      feature.setId(pin.id);
      pinSource.addFeature(feature);
    }
  }

  $: if (pinSource) syncPins();

  onMount(() => {
    // Create pin layer
    pinSource = new VectorSource();
    const pinLayer = new VectorImageLayer({
      source: pinSource,
      zIndex: 10,
      style: createPinStyle
    });

    // Create a simple image layer using XYZ with the IIIF image
    // For now, uses a simple static approach
    const extent = [0, -imageHeight, imageWidth, 0];

    map = new OlMap({
      target: mapContainer,
      layers: [pinLayer],
      view: new View({
        center: [imageWidth / 2, -imageHeight / 2],
        zoom: 1,
        extent,
        showFullExtent: true,
        projection: undefined
      }),
      controls: defaultControls({ attribution: false, rotate: false, zoom: false }).extend([
        new Zoom()
      ])
    });

    // Handle clicks for pin placement
    map.on('click', (event) => {
      if (!placingEnabled || !selectedLabel) return;
      const [pixelX, pixelY] = event.coordinate;
      dispatch('placePin', { pixelX, pixelY: -pixelY });
    });

    dispatch('ready');
    syncPins();
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

  .placing-indicator {
    position: absolute;
    top: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.35rem 0.8rem;
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.95) 0%, rgba(232, 213, 186, 0.95) 100%);
    border: 1px solid #d4af37;
    border-radius: 3px;
    font-size: 0.75rem;
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
