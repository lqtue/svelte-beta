<!--
  LabelCanvas.svelte — IIIF image viewer with point placement and polygon tracing.
  Uses a separate OL instance with IIIF tile source (pixel coordinates, not geo).
  Mode "pin": click to place named point.
  Mode "trace": draw polygon footprint. Ctrl+Z = undo last point, Escape = cancel.
  Mode "select": click to select, drag vertices to edit, Delete to remove.
-->
<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import OlMap from "ol/Map";
  import View from "ol/View";
  import TileLayer from "ol/layer/Tile";
  import IIIF from "ol/source/IIIF";
  import IIIFInfo from "ol/format/IIIFInfo";
  import VectorSource from "ol/source/Vector";
  import VectorLayer from "ol/layer/Vector";
  import VectorImageLayer from "ol/layer/VectorImage";
  import Feature from "ol/Feature";
  import Point from "ol/geom/Point";
  import Polygon from "ol/geom/Polygon";
  import LineString from "ol/geom/LineString";
  import Draw from "ol/interaction/Draw";
  import Snap from "ol/interaction/Snap";
  import Select from "ol/interaction/Select";
  import Modify from "ol/interaction/Modify";
  import Style from "ol/style/Style";
  import Fill from "ol/style/Fill";
  import Stroke from "ol/style/Stroke";
  import CircleStyle from "ol/style/Circle";
  import Text from "ol/style/Text";
  import { Zoom } from "ol/control";
  import { defaults as defaultControls } from "ol/control/defaults";
  import { click as clickCondition } from "ol/events/condition";
  import "ol/ol.css";

  import type { LabelPin, FootprintSubmission, PixelCoord } from "./types";
  import { geometryKind } from "./types";

  const dispatch = createEventDispatcher<{
    placePin: { pixelX: number; pixelY: number };
    movePin: { pinId: string; pixelX: number; pixelY: number };
    removePin: { pinId: string };
    drawPolygon: { pixelPolygon: PixelCoord[] };
    removeFootprint: { footprintId: string };
    modifyFootprint: { footprintId: string; pixelPolygon: PixelCoord[] };
    ready: void;
    error: { message: string };
  }>();

  export let iiifInfoUrl: string | null = null;
  export let legendItems: any[] = [];
  export let pins: LabelPin[] = [];
  export let footprints: FootprintSubmission[] = [];
  export let placingEnabled = false;
  export let selectedLabel: string | null = null;
  /** 'pin' = point placement, 'trace' = draw polygon/line, 'select' = edit shapes, 'pin-edit' = move/delete pins */
  export let drawMode: 'pin' | 'trace' | 'select' | 'pin-edit' = 'pin';
  /** Geometry to draw — user picks Polygon or LineString directly */
  export let geometryMode: 'Polygon' | 'LineString' = 'Polygon';
  export let taskId: string | null = null;
  export let myUserId: string | null = null;

  let mapContainer: HTMLDivElement;
  let map: OlMap | null = null;
  let pinSource: VectorSource | null = null;
  let footprintSource: VectorSource | null = null;
  // Temporary source used only during active drawing — never touches footprintSource
  let drawSource: VectorSource | null = null;
  // Keep a reference so Select interaction can filter to this layer
  let fpLayer: VectorLayer | null = null;
  let pinLayer: VectorImageLayer | null = null;
  let tileLayer: TileLayer | null = null;
  let drawInteraction: Draw | null = null;
  let snapInteraction: Snap | null = null;
  let selectInteraction: Select | null = null;
  let modifyInteraction: Modify | null = null;
  let loadingImage = false;
  let loadError = "";
  let isDrawing = false;
  let drawingPointCount = 0;

  // Color palette for different labels
  const labelColors: Record<string, string> = {};
  const palette = [
    "#d4af37", "#e06c75", "#61afef", "#98c379",
    "#c678dd", "#e5c07b", "#56b6c2", "#be5046", "#d19a66", "#abb2bf",
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

  function createSelectedStyle(feature: any): Style {
    const label = feature.get('label') || '';
    const geomType = feature.getGeometry()?.getType();
    const isLine = geomType === 'LineString';
    return new Style({
      stroke: new Stroke({ color: '#ff6b35', width: isLine ? 3 : 2.5 }),
      fill: isLine ? undefined : new Fill({ color: 'rgba(255, 107, 53, 0.2)' }),
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: '#ff6b35' }),
        stroke: new Stroke({ color: '#fff', width: 2 }),
      }),
      text: label ? new Text({
        text: label,
        font: 'bold 10px "Be Vietnam Pro", sans-serif',
        fill: new Fill({ color: '#2b2520' }),
        stroke: new Stroke({ color: '#fff', width: 3 }),
        overflow: true,
      }) : undefined,
    });
  }

  function pinDisplayName(pin: LabelPin): string {
    if (pin.data?.originalName) return pin.data.originalName;
    const item = legendItems.find((i: any) => (typeof i === 'string' ? i : i.val) === pin.label);
    if (item && typeof item !== 'string') return item.label;
    return pin.label;
  }

  function syncPins() {
    if (!pinSource) return;
    pinSource.clear();
    for (const pin of pins) {
      const feature = new Feature({
        geometry: new Point([pin.pixelX, -pin.pixelY]),
        label: pinDisplayName(pin),
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
        // Ensure ring is closed for OL
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

  // Reference pins/footprints directly so Svelte tracks them as dependencies,
  // not just footprintSource (which never changes after mount).
  $: pins, pinSource && syncPins();
  $: footprints, footprintSource && syncFootprints();

  // Task isolation: abort any in-progress draw when task changes
  let _prevTaskId = taskId;
  $: if (taskId !== _prevTaskId) {
    _prevTaskId = taskId;
    if (drawInteraction) drawInteraction.abortDrawing();
    if (drawSource) drawSource.clear();
    isDrawing = false;
    drawingPointCount = 0;
  }

  // Rebuild interactions whenever mode, enabled, or geometryMode changes
  $: if (map) updateInteractions(drawMode, placingEnabled, geometryMode);

  // Zoom the map view to a specific footprint by ID (callable via bind:this on parent)
  export function zoomToFootprint(footprintId: string) {
    const feature = footprintSource?.getFeatureById(footprintId);
    const extent = (feature?.getGeometry() as any)?.getExtent?.();
    if (extent) map?.getView().fit(extent, { padding: [80, 80, 80, 80], duration: 400 });
  }

  function clearInteractions() {
    if (!map) return;
    if (drawInteraction) { map.removeInteraction(drawInteraction); drawInteraction = null; }
    if (snapInteraction) { map.removeInteraction(snapInteraction); snapInteraction = null; }
    if (selectInteraction) { map.removeInteraction(selectInteraction); selectInteraction = null; }
    if (modifyInteraction) { map.removeInteraction(modifyInteraction); modifyInteraction = null; }
    isDrawing = false;
    drawingPointCount = 0;
  }

  function updateInteractions(mode: 'pin' | 'trace' | 'select' | 'pin-edit', enabled: boolean, _gm?: string) {
    if (!map) return;
    clearInteractions();

    if (mode === 'trace' && enabled && drawSource) {
      const drawType = geometryMode;
      drawInteraction = new Draw({
        source: drawSource,
        type: drawType,
        style: new Style({
          stroke: new Stroke({ color: '#f59e0b', width: 2, lineDash: [6, 4] }),
          fill: new Fill({ color: 'rgba(245, 158, 11, 0.15)' }),
          image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#f59e0b' }) }),
        }),
      });

      drawInteraction.on('drawstart', (evt: any) => {
        isDrawing = true;
        drawingPointCount = 0;
        evt.feature.getGeometry().on('change', (geomEvt: any) => {
          const g = geomEvt.target;
          if (g instanceof Polygon) {
            drawingPointCount = Math.max(0, g.getCoordinates()[0].length - 1);
          }
        });
      });

      drawInteraction.on('drawabort', () => {
        isDrawing = false;
        drawingPointCount = 0;
        drawSource?.clear();
      });

      drawInteraction.on('drawend', (evt: any) => {
        isDrawing = false;
        drawingPointCount = 0;
        // OL adds the feature to drawSource *after* drawend fires, so clear async
        const src = drawSource;
        setTimeout(() => src?.clear(), 0);
        const geom = evt.feature.getGeometry();
        let pixelCoords: PixelCoord[];
        if (geom instanceof Polygon) {
          const ring = geom.getCoordinates()[0];
          pixelCoords = ring.map(([x, y]: number[]) => [x, -y] as PixelCoord);
          pixelCoords.pop(); // remove repeated closing point
        } else {
          // LineString (road, waterway)
          pixelCoords = (geom as LineString).getCoordinates().map(([x, y]: number[]) => [x, -y] as PixelCoord);
        }
        dispatch('drawPolygon', { pixelPolygon: pixelCoords });
      });

      // Snap to existing footprint vertices for easier alignment
      snapInteraction = new Snap({ source: footprintSource ?? undefined });

      map.addInteraction(drawInteraction);
      map.addInteraction(snapInteraction);
    }

    if (mode === 'select' && footprintSource && fpLayer) {
      const targetLayer = fpLayer;

      selectInteraction = new Select({
        condition: clickCondition,
        layers: (layer) => layer === targetLayer,
        style: createSelectedStyle,
      });

      modifyInteraction = new Modify({
        features: selectInteraction.getFeatures(),
        style: new Style({
          image: new CircleStyle({
            radius: 7,
            fill: new Fill({ color: '#ff6b35' }),
            stroke: new Stroke({ color: '#fff', width: 2 }),
          }),
        }),
      });

      modifyInteraction.on('modifyend', (evt: any) => {
        evt.features.forEach((feature: any) => {
          const footprintId = feature.get('footprintId');
          const userId = feature.get('userId');
          // Only dispatch for current user's footprints
          if (!footprintId || (myUserId && userId !== myUserId)) return;
          const geom = feature.getGeometry();
          let pixelPolygon: PixelCoord[];
          if (geom instanceof Polygon) {
            const ring = geom.getCoordinates()[0];
            pixelPolygon = ring.map(([x, y]) => [x, -y] as PixelCoord);
            pixelPolygon.pop();
          } else if (geom instanceof LineString) {
            pixelPolygon = geom.getCoordinates().map(([x, y]) => [x, -y] as PixelCoord);
          } else {
            return;
          }
          dispatch('modifyFootprint', { footprintId, pixelPolygon });
        });
      });

      map.addInteraction(selectInteraction);
      map.addInteraction(modifyInteraction);
    }

    // Pin-edit mode: select and drag pins on pinLayer
    if (mode === 'pin-edit' && pinSource && pinLayer) {
      const targetPinLayer = pinLayer;

      selectInteraction = new Select({
        condition: clickCondition,
        layers: (layer) => layer === targetPinLayer,
        style: (feature: any) => {
          const label = feature.get("label") || "";
          return new Style({
            image: new CircleStyle({
              radius: 12,
              fill: new Fill({ color: '#ff6b35' }),
              stroke: new Stroke({ color: '#fff', width: 3 }),
            }),
            text: new Text({
              text: label,
              offsetY: -22,
              font: 'bold 11px "Be Vietnam Pro", sans-serif',
              fill: new Fill({ color: '#ff6b35' }),
              stroke: new Stroke({ color: '#fff', width: 3.5 }),
              textAlign: "center",
            }),
          });
        },
      });

      modifyInteraction = new Modify({
        features: selectInteraction.getFeatures(),
        style: new Style({
          image: new CircleStyle({
            radius: 8,
            fill: new Fill({ color: '#ff6b35' }),
            stroke: new Stroke({ color: '#fff', width: 2 }),
          }),
        }),
      });

      modifyInteraction.on('modifyend', (evt: any) => {
        evt.features.forEach((feature: any) => {
          const pinId = feature.get('pinId');
          if (!pinId) return;
          const geom = feature.getGeometry();
          if (!(geom instanceof Point)) return;
          const [x, rawY] = geom.getCoordinates();
          dispatch('movePin', { pinId, pixelX: x, pixelY: -rawY });
        });
      });

      map.addInteraction(selectInteraction);
      map.addInteraction(modifyInteraction);
    }
  }

  function handleKeydown(evt: KeyboardEvent) {
    // Don't capture keyboard in input elements
    const tag = (evt.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    // Ctrl/Cmd+Z: undo last point during drawing
    if ((evt.ctrlKey || evt.metaKey) && evt.key === 'z') {
      if (drawInteraction && isDrawing) {
        evt.preventDefault();
        drawInteraction.removeLastPoint();
      }
      return;
    }

    // Enter: finish the current drawing
    if (evt.key === 'Enter') {
      if (drawInteraction && isDrawing && drawingPointCount >= 2) {
        evt.preventDefault();
        drawInteraction.finishDrawing();
      }
      return;
    }

    // Escape: cancel drawing or deselect
    if (evt.key === 'Escape') {
      if (drawInteraction && isDrawing) {
        drawInteraction.abortDrawing();
        isDrawing = false;
        drawingPointCount = 0;
      }
      if (selectInteraction) {
        selectInteraction.getFeatures().clear();
      }
      return;
    }

    // Delete/Backspace: remove selected footprint or pin
    if (evt.key === 'Delete' || evt.key === 'Backspace') {
      if (selectInteraction && drawMode === 'select') {
        const features = selectInteraction.getFeatures().getArray().slice();
        for (const feature of features) {
          const footprintId = feature.get('footprintId');
          const userId = feature.get('userId');
          if (!footprintId) continue;
          if (myUserId && userId !== myUserId) continue;
          dispatch('removeFootprint', { footprintId });
        }
        selectInteraction.getFeatures().clear();
      }
      if (selectInteraction && drawMode === 'pin-edit') {
        const features = selectInteraction.getFeatures().getArray().slice();
        for (const feature of features) {
          const pinId = feature.get('pinId');
          if (!pinId) continue;
          dispatch('removePin', { pinId });
        }
        selectInteraction.getFeatures().clear();
      }
    }
  }

  $: if (iiifInfoUrl && map) loadIIIFImage(iiifInfoUrl);

  async function loadIIIFImage(infoUrl: string) {
    if (!map) return;
    loadingImage = true;
    loadError = "";
    try {
      const response = await fetch(infoUrl);
      if (!response.ok) throw new Error(`Failed to fetch IIIF info: ${response.status}`);
      const info = await response.json();
      const iiifParser = new IIIFInfo(info);
      const options = iiifParser.getTileSourceOptions();
      if (!options) throw new Error("Could not parse IIIF tile source options");
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
      console.error("[LabelCanvas] IIIF load error:", err);
      loadError = err.message || "Failed to load image";
      loadingImage = false;
      dispatch("error", { message: loadError });
    }
  }

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

    // Temporary layer for in-progress Draw commits (never persisted until confirmed)
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

    map.on("click", (event) => {
      if (drawMode !== 'pin') return;
      if (!placingEnabled || !selectedLabel) return;
      const [pixelX, rawY] = event.coordinate;
      dispatch("placePin", { pixelX, pixelY: -rawY });
    });

    window.addEventListener('keydown', handleKeydown);
    dispatch("ready");
    syncPins();
    syncFootprints();
    if (iiifInfoUrl) loadIIIFImage(iiifInfoUrl);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
    if (map) { map.setTarget(undefined); map = null; }
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

  <!-- Status bar: drawing feedback or mode hint -->
  {#if drawMode === 'trace' && placingEnabled}
    {#if isDrawing}
      <div class="status-bar drawing">
        <span class="status-pts">{drawingPointCount} pt{drawingPointCount !== 1 ? 's' : ''}</span>
        <span class="status-hint">
          Drawing polygon
          &nbsp;·&nbsp; <kbd>Enter</kbd> or double-click to finish
          &nbsp;·&nbsp; <kbd>Ctrl+Z</kbd> undo
          &nbsp;·&nbsp; <kbd>Esc</kbd> cancel
        </span>
      </div>
    {:else if placingEnabled && selectedLabel}
      <div class="placing-indicator">
        Drawing <strong>{geometryMode === 'LineString' ? 'line' : 'polygon'}</strong> — click to start
      </div>
    {:else if placingEnabled && !selectedLabel}
      <div class="placing-indicator warn">Select a label from the sidebar first</div>
    {/if}
  {:else if drawMode === 'pin-edit'}
    <div class="placing-indicator select">
      Click a pin to select &nbsp;·&nbsp; drag to move &nbsp;·&nbsp; <kbd>Delete</kbd> to remove
    </div>
  {:else if drawMode === 'select'}
    <div class="placing-indicator select">
      Click a shape to select &nbsp;·&nbsp; drag vertices to edit &nbsp;·&nbsp; <kbd>Delete</kbd> to remove &nbsp;·&nbsp; or use sidebar
    </div>
  {:else if drawMode === 'pin'}
    {#if placingEnabled && selectedLabel}
      <div class="placing-indicator">
        Placing: <strong>{selectedLabel}</strong> — click on the image
      </div>
    {:else if placingEnabled && !selectedLabel}
      <div class="placing-indicator warn">Select a label from the sidebar first</div>
    {/if}
  {/if}
</div>

<style>
  .canvas-container {
    position: absolute;
    inset: 0;
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

  .canvas-overlay.error { color: #f87171; }

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

  .placing-indicator {
    position: absolute;
    top: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.35rem 0.8rem;
    background: linear-gradient(160deg, rgba(244,232,216,0.95) 0%, rgba(232,213,186,0.95) 100%);
    border: 1px solid #d4af37;
    border-radius: 3px;
    font-size: 0.75rem;
    font-family: "Be Vietnam Pro", sans-serif;
    color: #4a3f35;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 50;
    pointer-events: none;
    white-space: nowrap;
  }

  .placing-indicator.warn { border-color: #f59e0b; color: #92400e; }
  .placing-indicator.select { border-color: #ff6b35; color: #7c2d12; }

  /* Drawing status bar — full width bottom strip */
  .status-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.4rem 0.75rem;
    font-size: 0.75rem;
    font-family: "Be Vietnam Pro", sans-serif;
    z-index: 50;
    pointer-events: none;
  }

  .status-bar.drawing {
    background: rgba(245, 158, 11, 0.92);
    color: #451a03;
  }

  .status-pts {
    font-weight: 800;
    font-size: 0.8rem;
    background: rgba(0,0,0,0.12);
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .status-hint {
    flex: 1;
    text-align: center;
  }

  kbd {
    font-family: monospace;
    font-size: 0.7rem;
    background: rgba(0,0,0,0.15);
    padding: 0.05rem 0.3rem;
    border-radius: 2px;
    border: 1px solid rgba(0,0,0,0.2);
  }
</style>
