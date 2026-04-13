<!--
  ImageShell.svelte — Base IIIF image viewer using OpenLayers in pixel coordinates.

  Extracted from LabelCanvas.svelte. Provides:
  - OL Map with IIIF tile source (pixel space, no geographic projection)
  - Three vector layers: pinLayer (z10), footprintLayer (z5), drawLayer (z4)
  - syncPins / syncFootprints reactive to prop changes
  - loadIIIFImage() called whenever iiifInfoUrl changes
  - Context exposed via setImageShellContext() for child tools

  Tools (PinTool, TraceTool) are composed as children via slot and access
  map/sources through getImageShellContext().

  Props:
    iiifInfoUrl   — IIIF info.json URL to load (pass null to show empty state)
    pins          — LabelPin[] rendered on pinLayer
    footprints    — FootprintSubmission[] rendered on footprintLayer
    myUserId      — current user id (for ownership-gated interactions in tools)
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import OlMap from 'ol/Map';
  import View from 'ol/View';
  import TileLayer from 'ol/layer/Tile';
  import IIIF from 'ol/source/IIIF';
  import IIIFInfo from 'ol/format/IIIFInfo';
  import VectorSource from 'ol/source/Vector';
  import VectorLayer from 'ol/layer/Vector';
  import VectorImageLayer from 'ol/layer/VectorImage';
  import Feature from 'ol/Feature';
  import Point from 'ol/geom/Point';
  import Polygon from 'ol/geom/Polygon';
  import LineString from 'ol/geom/LineString';
  import Style from 'ol/style/Style';
  import Fill from 'ol/style/Fill';
  import Stroke from 'ol/style/Stroke';
  import CircleStyle from 'ol/style/Circle';
  import Text from 'ol/style/Text';
  import { Zoom } from 'ol/control';
  import { defaults as defaultControls } from 'ol/control/defaults';
  import 'ol/ol.css';

  import type { LabelPin, FootprintSubmission } from '$lib/contribute/label/types';
  import { geometryKind } from '$lib/contribute/label/types';
  import { createImageShellContext } from './imageContext';

  // Create context store synchronously during init so child tools can subscribe.
  const shellStore = createImageShellContext();

  export let iiifInfoUrl: string | null = null;
  export let pins: LabelPin[] = [];
  export let footprints: FootprintSubmission[] = [];
  export let myUserId: string | null = null;

  let mapContainer: HTMLDivElement;
  let map: OlMap | null = null;
  let pinSource: VectorSource | null = null;
  let footprintSource: VectorSource | null = null;
  let drawSource: VectorSource | null = null;
  let fpLayer: VectorLayer | null = null;
  let pinLayer: VectorImageLayer | null = null;
  let tileLayer: TileLayer | null = null;
  let loadingImage = false;
  let loadError = '';

  // ── Color palette ─────────────────────────────────────────────────────────
  const labelColors: Record<string, string> = {};
  const palette = [
    '#d4af37', '#e06c75', '#61afef', '#98c379',
    '#c678dd', '#e5c07b', '#56b6c2', '#be5046', '#d19a66', '#abb2bf',
  ];
  let colorIdx = 0;

  function getLabelColor(label: string): string {
    if (!labelColors[label]) {
      labelColors[label] = palette[colorIdx % palette.length];
      colorIdx++;
    }
    return labelColors[label];
  }

  // ── Style functions ────────────────────────────────────────────────────────
  function createPinStyle(feature: any): Style {
    const label = feature.get('label') || '';
    const color = getLabelColor(label);
    return new Style({
      image: new CircleStyle({
        radius: 10,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: '#fff', width: 2.5 }),
      }),
      text: new Text({
        text: label,
        offsetY: -20,
        font: 'bold 11px "Be Vietnam Pro", sans-serif',
        fill: new Fill({ color: '#2b2520' }),
        stroke: new Stroke({ color: '#fff', width: 3.5 }),
        textAlign: 'center',
      }),
    });
  }

  function createFootprintStyle(feature: any): Style {
    const label = feature.get('label') || '';
    const geomType = feature.getGeometry()?.getType();
    const isLine = geomType === 'LineString';
    const color = getLabelColor(label);
    return new Style({
      stroke: new Stroke({ color, width: isLine ? 3 : 2 }),
      fill: isLine ? undefined : new Fill({ color: color + '33' }),
      text: label ? new Text({
        text: label,
        font: 'bold 10px "Be Vietnam Pro", sans-serif',
        fill: new Fill({ color: '#2b2520' }),
        stroke: new Stroke({ color: '#fff', width: 3 }),
        overflow: true,
      }) : undefined,
    });
  }

  // ── Sync props → OL features ──────────────────────────────────────────────
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

  function syncFootprints() {
    if (!footprintSource) return;
    footprintSource.clear();
    for (const fp of footprints) {
      const coords = fp.pixelPolygon.map(([x, y]) => [x, -y]);
      const geomKind = geometryKind(fp.featureType);
      let feature: Feature;
      if (geomKind === 'LineString') {
        feature = new Feature({
          geometry: new LineString(coords),
          label: fp.name,
          footprintId: fp.id,
          userId: fp.userId,
        });
      } else {
        const ring = coords.length > 0 &&
          (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])
          ? [...coords, coords[0]]
          : coords;
        feature = new Feature({
          geometry: new Polygon([ring]),
          label: fp.name,
          footprintId: fp.id,
          userId: fp.userId,
        });
      }
      feature.setId(fp.id);
      footprintSource.addFeature(feature);
    }
  }

  $: pins, pinSource && syncPins();
  $: footprints, footprintSource && syncFootprints();
  $: if (iiifInfoUrl && map) loadIIIFImage(iiifInfoUrl);

  // ── IIIF loading ──────────────────────────────────────────────────────────
  async function loadIIIFImage(infoUrl: string) {
    if (!map) return;
    loadingImage = true;
    loadError = '';
    try {
      const response = await fetch(infoUrl);
      if (!response.ok) throw new Error(`Failed to fetch IIIF info: ${response.status}`);
      const info = await response.json();
      const iiifParser = new IIIFInfo(info);
      const options = iiifParser.getTileSourceOptions();
      if (!options) throw new Error('Could not parse IIIF tile source options');
      if (tileLayer) map.removeLayer(tileLayer);
      const iiifSource = new IIIF(options);
      tileLayer = new TileLayer({ source: iiifSource, zIndex: 0 });
      map.getLayers().insertAt(0, tileLayer);
      const tileGrid = iiifSource.getTileGrid();
      if (tileGrid) {
        map.getView().fit(tileGrid.getExtent(), { padding: [40, 40, 40, 40], duration: 300 });
      }
      loadingImage = false;
    } catch (err: any) {
      console.error('[ImageShell] IIIF load error:', err);
      loadError = err.message || 'Failed to load image';
      loadingImage = false;
    }
  }

  // ── Mount ─────────────────────────────────────────────────────────────────
  onMount(() => {
    pinSource = new VectorSource();
    pinLayer = new VectorImageLayer({
      source: pinSource,
      zIndex: 10,
      style: createPinStyle,
    });

    footprintSource = new VectorSource();
    fpLayer = new VectorLayer({
      source: footprintSource,
      zIndex: 5,
      style: createFootprintStyle,
    });

    drawSource = new VectorSource();
    const drawLayer = new VectorLayer({
      source: drawSource,
      zIndex: 4,
      style: createFootprintStyle,
    });

    map = new OlMap({
      target: mapContainer,
      layers: [drawLayer, fpLayer, pinLayer],
      view: new View({ center: [0, 0], zoom: 1, showFullExtent: true }),
      controls: defaultControls({ attribution: false, rotate: false, zoom: false }).extend([new Zoom()]),
    });

    shellStore.set({
      map,
      pinSource,
      footprintSource,
      drawSource,
      pinLayer,
      footprintLayer: fpLayer,
    });

    syncPins();
    syncFootprints();
    if (iiifInfoUrl) loadIIIFImage(iiifInfoUrl);
  });

  onDestroy(() => {
    shellStore.set(null);
    if (map) { map.setTarget(undefined); map = null; }
  });
</script>

<div class="image-shell">
  <div bind:this={mapContainer} class="image-map"></div>

  {#if loadingImage}
    <div class="shell-overlay">
      <div class="loading-spinner"></div>
      <span>Loading IIIF image…</span>
    </div>
  {/if}

  {#if loadError}
    <div class="shell-overlay error">
      <span>⚠️ {loadError}</span>
    </div>
  {/if}

  {#if !iiifInfoUrl && !loadingImage}
    <div class="shell-overlay">
      <span class="empty-msg">No image selected</span>
    </div>
  {/if}

  <!-- Tool overlays (PinTool, TraceTool, etc.) compose here -->
  <slot />
</div>

<style>
  .image-shell {
    position: absolute;
    inset: 0;
    background: #1a1612;
  }

  .image-map {
    width: 100%;
    height: 100%;
  }

  .shell-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    background: rgba(26, 22, 18, 0.75);
    z-index: 20;
    font-family: 'Be Vietnam Pro', sans-serif;
    font-size: 0.875rem;
    color: #e8d5ba;
    pointer-events: none;
  }

  .shell-overlay.error { color: #f87171; }
  .empty-msg { color: #8b7355; }

  .loading-spinner {
    width: 28px;
    height: 28px;
    border: 3px solid rgba(212, 175, 55, 0.3);
    border-top-color: #d4af37;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>
