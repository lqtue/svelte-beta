<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import Map from 'ol/Map';
  import View from 'ol/View';
  import VectorSource from 'ol/source/Vector';
  import VectorImageLayer from 'ol/layer/VectorImage';
  import BaseLayer from 'ol/layer/Base';
  import { Attribution, Rotate, ScaleLine, Zoom } from 'ol/control';
  import { defaults as defaultControls } from 'ol/control/defaults';
  import DragRotate from 'ol/interaction/DragRotate';
  import PinchRotate from 'ol/interaction/PinchRotate';
  import Draw from 'ol/interaction/Draw';
  import Modify from 'ol/interaction/Modify';
  import Select from 'ol/interaction/Select';
  import { click } from 'ol/events/condition';
  import { fromLonLat, toLonLat } from 'ol/proj';
  import LineString from 'ol/geom/LineString';
  import GeoJSON from 'ol/format/GeoJSON';
  import Feature from 'ol/Feature';
  import type { Geometry } from 'ol/geom';
  import Point from 'ol/geom/Point';
  import type { EventsKey } from 'ol/events';
  import { unByKey } from 'ol/Observable';
  import { WarpedMapLayer } from '@allmaps/openlayers';
  import { IIIF } from '@allmaps/iiif-parser';
  import { fetchAnnotationsFromApi } from '@allmaps/stdlib';
  import 'ol/ol.css';

  import {
    DEFAULT_ANNOTATION_COLOR,
    DRAW_TYPE_MAP,
    BASEMAP_DEFS,
    INITIAL_CENTER
  } from '$lib/viewer/constants';
  import {
    ensureAnnotationDefaults,
    toAnnotationSummary,
    createAnnotationStyle,
    searchResultStyle
  } from '$lib/viewer/annotations';
  import type {
    ViewMode,
    DrawingMode,
    AnnotationSummary,
    SearchResult
  } from '$lib/viewer/types';
  import {
    captureFeatureSnapshot as snapshotFeature,
    restoreFeatureFromSnapshot as restoreSnapshot,
    type FeatureSnapshot,
    type HistoryEntry,
    type AnnotationField
  } from '$lib/map/stores/annotationHistory';
  import { getAnnotationContext } from '$lib/map/context/annotationContext';
  import type { Feature as GeoJsonFeature, Geometry as GeoJsonGeometry, GeoJsonObject } from 'geojson';
  import Style from 'ol/style/Style';
  import Fill from 'ol/style/Fill';
  import Stroke from 'ol/style/Stroke';
  import CircleStyle from 'ol/style/Circle';
  import Text from 'ol/style/Text';
  import type { HuntStop } from '$lib/hunt/types';

  const dispatch = createEventDispatcher<{
    mapReady: { map: Map };
    statusChange: { message: string; error: boolean };
    mapClick: { coordinate: [number, number] };
  }>();

  const { history: annotationHistory, state: annotationState } = getAnnotationContext();

  const geoJsonFormat = new GeoJSON();

  export let basemapSelection = 'g-streets';
  export let viewMode: ViewMode = 'overlay';
  export let sideRatio = 0.5;
  export let lensRadius = 150;
  export let opacity = 0.8;
  export let drawingMode: DrawingMode | null = null;
  export let editingEnabled = true;

  let mapContainer: HTMLDivElement;
  let dividerXEl: HTMLDivElement;
  let dividerYEl: HTMLDivElement;
  let dividerHandleXEl: HTMLButtonElement;
  let dividerHandleYEl: HTMLButtonElement;
  let lensEl: HTMLDivElement;
  let lensHandleEl: HTMLButtonElement;

  let map: Map | null = null;
  let warpedLayer: WarpedMapLayer | null = null;
  let annotationLayer: VectorImageLayer<VectorSource> | null = null;
  let annotationSource: VectorSource | null = null;
  let searchLayer: VectorImageLayer<VectorSource> | null = null;
  let searchSource: VectorSource | null = null;
  let huntLayer: VectorImageLayer<VectorSource> | null = null;
  let huntSource: VectorSource | null = null;
  let positionLayer: VectorImageLayer<VectorSource> | null = null;
  let positionSource: VectorSource | null = null;
  let drawInteraction: Draw | null = null;
  let modifyInteraction: Modify | null = null;
  let selectInteraction: Select | null = null;
  let dragRotate: DragRotate | null = null;
  let pinchRotate: PinchRotate | null = null;
  let annotationListenerKeys: EventsKey[] = [];

  const mapCache: Record<string, { mapIds: string[] }> = {};
  let currentMapId: string | null = null;
  let loadedOverlayId: string | null = null;
  let currentLoadAbort: AbortController | null = null;

  let dragging = { sideX: false, sideY: false, lensR: false };
  let pendingResizeHandle: number | null = null;
  let suppressHistory = false;
  let pendingGeometrySnapshots: globalThis.Map<string, FeatureSnapshot> = new globalThis.Map();

  function setStatus(message: string, isError = false) {
    dispatch('statusChange', { message, error: isError });
  }

  function updateAnnotationSummaries() {
    const list = annotationSource
      ? annotationSource.getFeatures().map((f) => toAnnotationSummary(f))
      : [];
    annotationState.setList(list);
  }

  function captureFeatureSnapshot(feature: Feature<Geometry>): FeatureSnapshot {
    ensureAnnotationDefaults(feature);
    return snapshotFeature(feature, { geoJson: geoJsonFormat });
  }

  function restoreFeatureFromSnapshot(snapshot: FeatureSnapshot): Feature<Geometry> {
    const restored = restoreSnapshot(snapshot, { geoJson: geoJsonFormat });
    ensureAnnotationDefaults(restored);
    return restored;
  }

  function addSnapshotToSource(snapshot: FeatureSnapshot): Feature<Geometry> | null {
    if (!annotationSource) return null;
    const existing = annotationSource.getFeatureById(snapshot.id) as Feature<Geometry> | null;
    if (existing) annotationSource.removeFeature(existing);
    const restored = restoreFeatureFromSnapshot(snapshot);
    annotationSource.addFeature(restored);
    return restored;
  }

  function removeFeatureById(id: string): Feature<Geometry> | null {
    if (!annotationSource) return null;
    const feature = annotationSource.getFeatureById(id) as Feature<Geometry> | null;
    if (feature) annotationSource.removeFeature(feature);
    return feature;
  }

  function pushHistoryEntry(entry: HistoryEntry) {
    if (suppressHistory) return;
    annotationHistory.push(entry);
  }

  function recordAnnotationAdd(feature: Feature<Geometry>) {
    pushHistoryEntry({ kind: 'annotation-add', snapshot: captureFeatureSnapshot(feature) });
  }

  function recordAnnotationDelete(feature: Feature<Geometry>) {
    pushHistoryEntry({ kind: 'annotation-delete', snapshot: captureFeatureSnapshot(feature) });
  }

  function recordAnnotationFieldChange(feature: Feature<Geometry>, field: AnnotationField, before: unknown, after: unknown) {
    if (before === after) return;
    pushHistoryEntry({ kind: 'annotation-update', id: String(feature.getId()), changes: [{ field, before, after }] });
  }

  function recordAnnotationClear(features: Feature<Geometry>[]) {
    if (!features.length) return;
    const snapshots = features.map((f) => captureFeatureSnapshot(f));
    pushHistoryEntry({ kind: 'annotation-clear', snapshots });
  }

  function recordAnnotationBulkAdd(features: Feature<Geometry>[]) {
    if (!features.length) return;
    const snapshots = features.map((f) => captureFeatureSnapshot(f));
    pushHistoryEntry({ kind: 'annotation-bulk-add', snapshots });
  }

  function recordAnnotationGeometryChange(before: FeatureSnapshot, after: FeatureSnapshot) {
    pushHistoryEntry({ kind: 'annotation-geometry', before, after });
  }

  // --- View mode decorations ---

  function ensureOverlayCanvas(): HTMLCanvasElement | null {
    return warpedLayer?.getCanvas() ?? null;
  }

  function updateClipMask() {
    const canvas = ensureOverlayCanvas();
    if (!canvas || !map) return;
    const size = map.getSize();
    if (!size) return;
    const [w, h] = size;
    if (viewMode === 'overlay') {
      canvas.style.clipPath = '';
    } else if (viewMode === 'side-x') {
      const x = w * sideRatio;
      canvas.style.clipPath = `polygon(${x}px 0, ${w}px 0, ${w}px ${h}px, ${x}px ${h}px)`;
    } else if (viewMode === 'side-y') {
      const y = h * sideRatio;
      canvas.style.clipPath = `polygon(0 ${y}px, ${w}px ${y}px, ${w}px ${h}px, 0 ${h}px)`;
    } else if (viewMode === 'spy') {
      const r = lensRadius;
      canvas.style.clipPath = `circle(${r}px at ${w / 2}px ${h / 2}px)`;
    }
  }

  function updateDividersAndHandles() {
    if (!map) return;
    const size = map.getSize();
    if (!size) return;
    const [w, h] = size;
    const showX = viewMode === 'side-x';
    const showY = viewMode === 'side-y';
    if (dividerXEl) {
      dividerXEl.style.display = showX ? 'block' : 'none';
      if (showX) {
        const x = w * sideRatio;
        dividerXEl.style.left = `${x}px`;
        dividerXEl.style.height = `${h}px`;
      }
    }
    if (dividerHandleXEl) {
      dividerHandleXEl.style.display = showX ? 'block' : 'none';
      if (showX) {
        dividerHandleXEl.style.left = `${w * sideRatio - 8}px`;
        dividerHandleXEl.style.top = `${h / 2 - 8}px`;
      }
    }
    if (dividerYEl) {
      dividerYEl.style.display = showY ? 'block' : 'none';
      if (showY) {
        dividerYEl.style.top = `${h * sideRatio}px`;
        dividerYEl.style.width = `${w}px`;
      }
    }
    if (dividerHandleYEl) {
      dividerHandleYEl.style.display = showY ? 'block' : 'none';
      if (showY) {
        dividerHandleYEl.style.left = `${w / 2 - 8}px`;
        dividerHandleYEl.style.top = `${h * sideRatio - 8}px`;
      }
    }
  }

  function updateLens() {
    if (!map) return;
    const size = map.getSize();
    if (!size) return;
    const [w, h] = size;
    const show = viewMode === 'spy';
    if (lensEl) {
      lensEl.style.display = show ? 'block' : 'none';
      if (show) {
        const diameter = Math.max(20, lensRadius * 2);
        lensEl.style.width = `${diameter}px`;
        lensEl.style.height = `${diameter}px`;
        lensEl.style.left = `${w / 2 - lensRadius}px`;
        lensEl.style.top = `${h / 2 - lensRadius}px`;
      }
    }
    if (lensHandleEl) {
      lensHandleEl.style.display = show ? 'block' : 'none';
      if (show) {
        lensHandleEl.style.left = `${w / 2 + lensRadius - 8}px`;
        lensHandleEl.style.top = `${h / 2 - 8}px`;
      }
    }
  }

  export function refreshDecorations() {
    updateClipMask();
    updateDividersAndHandles();
    updateLens();
  }

  export function setViewMode(next: ViewMode) {
    viewMode = next;
    applyRotationLock(next !== 'overlay');
    refreshDecorations();
  }

  function applyRotationLock(lock: boolean) {
    if (!map || !dragRotate || !pinchRotate) return;
    const interactions = map.getInteractions();
    const hasDrag = interactions.getArray().includes(dragRotate);
    const hasPinch = interactions.getArray().includes(pinchRotate);
    if (lock) {
      if (hasDrag) map.removeInteraction(dragRotate);
      if (hasPinch) map.removeInteraction(pinchRotate);
      map.getView().setRotation(0);
    } else {
      if (!hasDrag) map.addInteraction(dragRotate);
      if (!hasPinch) map.addInteraction(pinchRotate);
    }
  }

  function handlePointerDrag(event: PointerEvent) {
    if (!map) return;
    if (!dragging.sideX && !dragging.sideY && !dragging.lensR) return;
    const rect = mapContainer.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const size = map.getSize();
    if (!size) return;
    const [w, h] = size;
    if (dragging.sideX) {
      sideRatio = Math.max(0.01, Math.min(x / w, 0.99));
      updateDividersAndHandles();
    } else if (dragging.sideY) {
      sideRatio = Math.max(0.01, Math.min(y / h, 0.99));
      updateDividersAndHandles();
    } else if (dragging.lensR) {
      const dx = x - w / 2;
      const dy = y - h / 2;
      lensRadius = Math.max(20, Math.min(Math.sqrt(dx * dx + dy * dy), Math.min(w, h) / 2));
      updateLens();
    }
    updateClipMask();
  }

  function stopPointerDrag() {
    if (!dragging.sideX && !dragging.sideY && !dragging.lensR) return;
    dragging = { sideX: false, sideY: false, lensR: false };
  }

  // --- Basemap ---

  export function applyBasemap(name: string) {
    if (!map) return;
    map.getLayers().getArray().forEach((layer) => {
      const props = layer.getProperties();
      if (props.base) layer.setVisible(props.name === name);
    });
  }

  // --- Overlay loading ---

  function isHttpUrl(value: string) {
    if (!value) return false;
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  async function resolveAnnotations(source: string, signal: AbortSignal) {
    if (isHttpUrl(source)) {
      const response = await fetch(source, { signal });
      if (!response.ok) throw new Error(`IIIF resource not accessible (HTTP ${response.status})`);
      const iiifJson = await response.json();
      if (signal.aborted) return { annotations: [], cacheKey: source };
      let parsed;
      try { parsed = IIIF.parse(iiifJson); } catch (e) { throw new Error(`Failed to parse IIIF: ${(e as Error).message}`); }
      let annotations: unknown[] = [];
      let lookupError: Error | null = null;
      try { annotations = await fetchAnnotationsFromApi(parsed); } catch (e) { lookupError = e instanceof Error ? e : new Error('Unknown Allmaps API error.'); }
      if (!annotations.length) {
        try {
          const fallbackUrl = `https://annotations.allmaps.org/?url=${encodeURIComponent(source)}`;
          const fallbackResponse = await fetch(fallbackUrl, { signal });
          if (fallbackResponse.ok) {
            const fallbackJson = await fallbackResponse.json();
            if (Array.isArray(fallbackJson)) annotations = fallbackJson;
            else if (fallbackJson && Array.isArray(fallbackJson.annotations)) annotations = fallbackJson.annotations;
          } else {
            const text = await fallbackResponse.text();
            lookupError ??= new Error(`Fallback lookup failed (HTTP ${fallbackResponse.status}): ${text || 'No body'}`);
          }
        } catch (e) {
          if (!lookupError) lookupError = e instanceof Error ? e : new Error('Unknown fallback lookup error.');
        }
      }
      if (!annotations.length) {
        const details = lookupError ? ` ${lookupError.message}` : '';
        throw new Error(`No Allmaps annotations found for that IIIF resource.${details ? ` ${details}` : ''}`);
      }
      return { annotations, cacheKey: source };
    } else {
      const annotationUrl = `https://annotations.allmaps.org/images/${source}`;
      const response = await fetch(annotationUrl, { signal });
      if (!response.ok) throw new Error(`Annotation not found (HTTP ${response.status})`);
      const annotation = await response.json();
      return { annotations: [annotation], cacheKey: source };
    }
  }

  async function addAnnotationsToLayer(annotations: unknown[], signal: AbortSignal) {
    if (!warpedLayer) return [];
    const collectedIds: string[] = [];
    for (const annotation of annotations) {
      if (signal.aborted) return collectedIds;
      const result = await warpedLayer.addGeoreferenceAnnotation(annotation);
      if (signal.aborted) return collectedIds;
      if (!result || !result.length) continue;
      for (const entry of result) {
        if (entry instanceof Error) throw entry;
        collectedIds.push(entry);
      }
    }
    return collectedIds;
  }

  export async function loadOverlaySource(source: string) {
    if (!warpedLayer) return;
    const trimmed = source.trim();
    if (!trimmed) return;
    if (currentLoadAbort) currentLoadAbort.abort();
    const abortController = new AbortController();
    currentLoadAbort = abortController;
    const { signal } = abortController;
    const cacheKey = trimmed;

    if (cacheKey === loadedOverlayId && currentMapId) {
      try { warpedLayer.setMapOpacity(currentMapId, opacity); } catch { /* no-op */ }
      return;
    }
    if (currentMapId) {
      try { warpedLayer.setMapOpacity(currentMapId, 0); } catch { /* no-op */ }
    }

    setStatus('Loading map\u2026');
    try {
      let mapIds: string[] = [];
      if (cacheKey in mapCache) {
        mapIds = mapCache[cacheKey].mapIds;
      } else {
        const { annotations } = await resolveAnnotations(cacheKey, signal);
        if (signal.aborted) return;
        mapIds = await addAnnotationsToLayer(annotations, signal);
        if (!mapIds.length) throw new Error('Map could not be added to the viewer.');
        mapCache[cacheKey] = { mapIds };
      }
      const primaryMapId = mapIds[0];
      if (!primaryMapId) throw new Error('Could not determine map identifier.');
      currentMapId = primaryMapId;
      loadedOverlayId = cacheKey;
      try { for (const id of mapIds) warpedLayer.setMapOpacity(id, opacity); } catch { /* no-op */ }
      setStatus('Map loaded. Tiles may take a moment to appear.');
      refreshDecorations();
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      setStatus(`Failed to load map: ${error instanceof Error ? error.message : 'Unknown error'}`, true);
    } finally {
      if (!signal.aborted) currentLoadAbort = null;
    }
  }

  export function clearOverlay() {
    if (warpedLayer && currentMapId) {
      try { warpedLayer.setMapOpacity(currentMapId, 0); } catch { /* no-op */ }
    }
    currentMapId = null;
    loadedOverlayId = null;
  }

  export function zoomToOverlayExtent() {
    if (!map || !warpedLayer) return;
    const extent = warpedLayer.getExtent();
    if (!extent) return;
    map.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 18, duration: 500 });
  }

  export function setMapOpacity(value: number) {
    if (currentMapId && warpedLayer) {
      try { warpedLayer.setMapOpacity(currentMapId, value); } catch { /* no-op */ }
    }
  }

  // --- Drawing interactions ---

  function removeDrawInteraction() {
    if (!map || !drawInteraction) return;
    map.removeInteraction(drawInteraction);
    drawInteraction = null;
  }

  export function applyDrawInteraction() {
    if (!map || !annotationSource) return;
    removeDrawInteraction();
    if (!drawingMode) return;
    const drawType = DRAW_TYPE_MAP[drawingMode];
    const draw = new Draw({ source: annotationSource, type: drawType });
    draw.on('drawstart', () => selectInteraction?.getFeatures().clear());
    draw.on('drawend', (event) => {
      const feature = event.feature as Feature<Geometry>;
      ensureAnnotationDefaults(feature);
      annotationState.setSelected(String(feature.getId()));
      updateAnnotationSummaries();
      recordAnnotationAdd(feature);
    });
    drawInteraction = draw;
    map.addInteraction(draw);
  }

  export function deactivateDrawing() {
    drawingMode = null;
    removeDrawInteraction();
  }

  export function toggleEditing() {
    if (!map || !modifyInteraction) return;
    editingEnabled = !editingEnabled;
    const interactions = map.getInteractions();
    const hasModify = interactions.getArray().includes(modifyInteraction);
    if (editingEnabled && !hasModify) map.addInteraction(modifyInteraction);
    else if (!editingEnabled && hasModify) map.removeInteraction(modifyInteraction);
  }

  // --- Annotation CRUD ---

  export function getAnnotationFeature(id: string) {
    return annotationSource?.getFeatureById(id) ?? null;
  }

  export function updateAnnotationLabel(id: string, label: string) {
    const feature = getAnnotationFeature(id);
    if (!feature) return;
    const previous = feature.get('label') ?? '';
    if (previous === label) return;
    feature.set('label', label);
    recordAnnotationFieldChange(feature, 'label', previous, label);
    updateAnnotationSummaries();
  }

  export function updateAnnotationDetails(id: string, details: string) {
    const feature = getAnnotationFeature(id);
    if (!feature) return;
    const previous = feature.get('details') ?? '';
    if (previous === details) return;
    feature.set('details', details);
    recordAnnotationFieldChange(feature, 'details', previous, details);
    updateAnnotationSummaries();
  }

  export function updateAnnotationColor(id: string, color: string) {
    const feature = getAnnotationFeature(id);
    if (!feature) return;
    const previous = feature.get('color') ?? '';
    if (previous === color) return;
    feature.set('color', color);
    recordAnnotationFieldChange(feature, 'color', previous, color);
    updateAnnotationSummaries();
  }

  export function toggleAnnotationVisibility(id: string) {
    const feature = getAnnotationFeature(id);
    if (!feature) return;
    const hidden = Boolean(feature.get('hidden'));
    feature.set('hidden', !hidden);
    recordAnnotationFieldChange(feature, 'hidden', hidden, !hidden);
    updateAnnotationSummaries();
  }

  export function zoomToAnnotation(id: string) {
    if (!map) return;
    const feature = getAnnotationFeature(id);
    const geometry = feature?.getGeometry();
    if (!geometry) return;
    if (geometry.getType() === 'Point') {
      const coords = (geometry as Point).getCoordinates() as [number, number];
      map.getView().animate({ center: coords, zoom: Math.max(map.getView().getZoom() ?? 16, 17), duration: 350 });
    } else {
      map.getView().fit(geometry.getExtent(), { padding: [80, 80, 80, 80], duration: 400, maxZoom: 18 });
    }
  }

  export function deleteAnnotation(id: string) {
    const feature = getAnnotationFeature(id);
    if (!feature || !annotationSource) return;
    recordAnnotationDelete(feature);
    annotationSource.removeFeature(feature);
    annotationState.clearSelectionIfMatches(id);
    updateAnnotationSummaries();
  }

  export function clearAnnotations() {
    if (!annotationSource) return;
    const features = annotationSource.getFeatures();
    recordAnnotationClear(features);
    annotationSource.clear();
    annotationState.reset();
  }

  export function exportAnnotationsAsGeoJSON() {
    if (!annotationSource) return;
    const features = annotationSource.getFeatures();
    if (!features.length) return;
    const collection = geoJsonFormat.writeFeaturesObject(features, {
      featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326'
    });
    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/geo+json;charset=utf-8;' });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `annotations-${stamp}.geojson`;
    link.click();
    URL.revokeObjectURL(url);
  }

  export async function importGeoJsonText(text: string) {
    if (!annotationSource) return;
    const json = JSON.parse(text);
    const features = geoJsonFormat.readFeatures(json, {
      dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'
    }) as Feature<Geometry>[];
    features.forEach((f) => ensureAnnotationDefaults(f));
    annotationSource.addFeatures(features);
    recordAnnotationBulkAdd(features);
    updateAnnotationSummaries();
    return features.length;
  }

  // --- Undo / Redo ---

  function applyHistoryEntry(entry: HistoryEntry, direction: 'undo' | 'redo') {
    switch (entry.kind) {
      case 'annotation-add':
        if (direction === 'undo') {
          removeFeatureById(entry.snapshot.id);
          annotationState.clearSelectionIfMatches(entry.snapshot.id);
        } else {
          const added = addSnapshotToSource(entry.snapshot);
          if (added) annotationState.setSelected(entry.snapshot.id);
        }
        break;
      case 'annotation-delete':
        if (direction === 'undo') {
          const added = addSnapshotToSource(entry.snapshot);
          if (added) annotationState.setSelected(entry.snapshot.id);
        } else {
          removeFeatureById(entry.snapshot.id);
          annotationState.clearSelectionIfMatches(entry.snapshot.id);
        }
        break;
      case 'annotation-update': {
        const feature = annotationSource?.getFeatureById(entry.id) as Feature<Geometry> | null;
        if (!feature) break;
        entry.changes.forEach((change) => {
          const value = direction === 'undo' ? change.before : change.after;
          feature.set(change.field, change.field === 'hidden' ? Boolean(value) : value);
        });
        feature.changed?.();
        break;
      }
      case 'annotation-geometry': {
        const snapshot = direction === 'undo' ? entry.before : entry.after;
        addSnapshotToSource(snapshot);
        annotationState.setSelected(snapshot.id);
        break;
      }
      case 'annotation-clear':
        if (direction === 'undo') {
          annotationSource?.clear();
          entry.snapshots.forEach((s) => addSnapshotToSource(s));
        } else {
          annotationSource?.clear();
          annotationState.clearSelection();
        }
        break;
      case 'annotation-bulk-add':
        if (direction === 'undo') {
          entry.snapshots.forEach((s) => { removeFeatureById(s.id); annotationState.clearSelectionIfMatches(s.id); });
        } else {
          entry.snapshots.forEach((s) => addSnapshotToSource(s));
        }
        break;
    }
    updateAnnotationSummaries();
  }

  export function undoLastAction() {
    const entry = annotationHistory.undo();
    if (!entry) return;
    suppressHistory = true;
    applyHistoryEntry(entry, 'undo');
    suppressHistory = false;
  }

  export function redoLastAction() {
    const entry = annotationHistory.redo();
    if (!entry) return;
    suppressHistory = true;
    applyHistoryEntry(entry, 'redo');
    suppressHistory = false;
  }

  // --- Search ---

  export function featureFromSearchResult(result: SearchResult): Feature<Geometry> | null {
    try {
      if (result.geojson) {
        const feature = geoJsonFormat.readFeature(
          { type: 'Feature', geometry: result.geojson as GeoJsonGeometry, properties: {} } as GeoJsonFeature,
          { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }
        ) as Feature<Geometry>;
        feature.set('label', result.display_name ?? result.type ?? 'Search result');
        return feature;
      }
      if (result.lon && result.lat) {
        const point = new Point(fromLonLat([Number(result.lon), Number(result.lat)]));
        const feature = new Feature({ geometry: point });
        feature.set('label', result.display_name ?? result.type ?? 'Search result');
        return feature;
      }
    } catch (e) {
      console.warn('Unable to create feature from search result', e);
    }
    return null;
  }

  export function zoomToSearchResult(result: SearchResult) {
    if (!map || !searchSource) return;
    const feature = featureFromSearchResult(result);
    if (!feature) return;
    searchSource.clear();
    searchSource.addFeature(feature);
    const geometry = feature.getGeometry();
    if (!geometry) return;
    if (geometry.getType() === 'Point') {
      const coords = (geometry as Point).getCoordinates() as [number, number];
      map.getView().animate({ center: coords, zoom: Math.max(map.getView().getZoom() ?? 12, 16), duration: 400 });
    } else {
      map.getView().fit(geometry.getExtent(), { padding: [80, 80, 80, 80], duration: 400, maxZoom: 18 });
    }
  }

  export function addSearchResultToAnnotations(result: SearchResult) {
    if (!annotationSource) return;
    const feature = featureFromSearchResult(result);
    if (!feature) return;
    ensureAnnotationDefaults(feature);
    annotationSource.addFeature(feature);
    recordAnnotationAdd(feature);
    annotationState.setSelected(String(feature.getId()));
    updateAnnotationSummaries();
  }

  export function clearSearchLayer() {
    searchSource?.clear();
  }

  export function locateUser() {
    if (!map || !searchSource) return;
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const coords = fromLonLat([longitude, latitude]);
        searchSource!.clear();
        const feature = new Feature({ geometry: new Point(coords) });
        feature.set('label', 'Current location');
        searchSource!.addFeature(feature);
        map!.getView().animate({ center: coords, zoom: Math.max(map!.getView().getZoom() ?? 12, 16), duration: 450 });
      },
      () => { /* silent */ }
    );
  }

  // --- Hunt stops layer ---

  function createHuntStopStyle(feature: Feature<Geometry>): Style | Style[] | undefined {
    const geomType = feature.getGeometry()?.getType();
    if (geomType === 'LineString') {
      return new Style({
        stroke: new Stroke({ color: 'rgba(212, 175, 55, 0.6)', width: 3, lineDash: [10, 8] })
      });
    }
    const completed = Boolean(feature.get('completed'));
    const active = Boolean(feature.get('active'));
    const order = feature.get('order') as number | undefined;
    const radius = active ? 14 : 10;
    const bgColor = completed ? '#2d7a4f' : '#d4af37';
    const label = completed ? '\u2713' : (order !== undefined ? String(order + 1) : '');
    return new Style({
      image: new CircleStyle({
        radius,
        fill: new Fill({ color: bgColor }),
        stroke: new Stroke({ color: '#ffffff', width: 3 })
      }),
      text: new Text({
        text: label,
        font: `bold ${active ? 14 : 12}px "Be Vietnam Pro", system-ui, sans-serif`,
        fill: new Fill({ color: '#ffffff' }),
        offsetY: 1
      })
    });
  }

  function createPositionStyle(): Style {
    return new Style({
      image: new CircleStyle({
        radius: 8,
        fill: new Fill({ color: '#ffffff' }),
        stroke: new Stroke({ color: '#ea580c', width: 3 })
      })
    });
  }

  export function setHuntStops(stops: HuntStop[]) {
    if (!huntSource) return;
    huntSource.clear();
    stops.forEach((stop) => {
      const point = new Point(fromLonLat(stop.coordinates));
      const feature = new Feature({ geometry: point });
      feature.setId(stop.id);
      feature.set('order', stop.order);
      feature.set('stopId', stop.id);
      feature.set('completed', false);
      feature.set('active', false);
      huntSource!.addFeature(feature);
    });
    if (stops.length >= 2) {
      const coords = stops.map((s) => fromLonLat(s.coordinates));
      const routeLine = new Feature({ geometry: new LineString(coords) });
      routeLine.setId('hunt-route');
      huntSource.addFeature(routeLine);
    }
  }

  export function updateHuntStopState(stopId: string, state: { completed?: boolean; active?: boolean }) {
    if (!huntSource) return;
    const feature = huntSource.getFeatureById(stopId) as Feature<Geometry> | null;
    if (!feature) return;
    if (state.completed !== undefined) feature.set('completed', state.completed);
    if (state.active !== undefined) feature.set('active', state.active);
    feature.changed?.();
  }

  export function clearHuntStops() {
    huntSource?.clear();
  }

  export function updatePlayerPosition(lonLat: [number, number]) {
    if (!positionSource) return;
    positionSource.clear();
    const point = new Point(fromLonLat(lonLat));
    const feature = new Feature({ geometry: point });
    feature.setId('player-position');
    positionSource.addFeature(feature);
  }

  export function clearPlayerPosition() {
    positionSource?.clear();
  }

  export function zoomToHuntStops() {
    if (!map || !huntSource) return;
    const extent = huntSource.getExtent();
    if (!extent || extent.every((v) => !isFinite(v))) return;
    map.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 17, duration: 500 });
  }

  export function zoomToHuntStop(stopId: string) {
    if (!map || !huntSource) return;
    const feature = huntSource.getFeatureById(stopId) as Feature<Geometry> | null;
    const geometry = feature?.getGeometry();
    if (!geometry || geometry.getType() !== 'Point') return;
    const coords = (geometry as Point).getCoordinates() as [number, number];
    map.getView().animate({ center: coords, zoom: Math.max(map.getView().getZoom() ?? 16, 17), duration: 350 });
  }

  // --- State persistence helpers ---

  export function getMapInstance() { return map; }
  export function getLoadedOverlayId() { return loadedOverlayId; }
  export function getAnnotationSource() { return annotationSource; }
  export function getGeoJsonFormat() { return geoJsonFormat; }

  export function scheduleMapResize() {
    if (!map) return;
    if (pendingResizeHandle !== null) cancelAnimationFrame(pendingResizeHandle);
    pendingResizeHandle = requestAnimationFrame(() => {
      pendingResizeHandle = null;
      map?.updateSize();
      refreshDecorations();
    });
  }

  export function restoreAnnotations(geojson: object) {
    if (!annotationSource) return;
    try {
      const features = geoJsonFormat.readFeatures(geojson, {
        dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'
      }) as Feature<Geometry>[];
      annotationSource.clear();
      features.forEach((f) => ensureAnnotationDefaults(f));
      annotationSource.addFeatures(features);
      updateAnnotationSummaries();
    } catch (e) {
      console.warn('Could not restore saved annotations', e);
      annotationSource.clear();
    }
  }

  export function getAnnotationsGeoJSON() {
    if (!annotationSource) return null;
    const features = annotationSource.getFeatures();
    if (!features.length) return null;
    return geoJsonFormat.writeFeaturesObject(features, {
      featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326'
    });
  }

  // --- Reactive statements ---

  $: applyBasemap(basemapSelection);
  $: refreshDecorations();
  $: if (drawingMode !== undefined) applyDrawInteraction();
  $: if (currentMapId && warpedLayer && opacity !== undefined) {
    try { warpedLayer.setMapOpacity(currentMapId, opacity); } catch { /* no-op */ }
  }

  // --- Lifecycle ---

  onMount(() => {
    const basemapLayers = BASEMAP_DEFS.map((def) => def.layer());
    warpedLayer = new WarpedMapLayer();
    warpedLayer.setZIndex(10);
    warpedLayer.setProperties({ name: 'allmaps-overlay' });
    const warpedCompat = warpedLayer as unknown as {
      getDeclutter?: () => boolean;
      renderDeferred?: (...args: unknown[]) => boolean;
    };
    if (!warpedCompat.getDeclutter) warpedCompat.getDeclutter = () => false;
    if (!warpedCompat.renderDeferred) warpedCompat.renderDeferred = () => false;

    annotationLayer = new VectorImageLayer({
      source: new VectorSource(),
      zIndex: 20,
      properties: { name: 'annotations' },
      declutter: true
    });
    annotationLayer.setStyle(createAnnotationStyle);
    annotationSource = annotationLayer.getSource() ?? new VectorSource();

    searchLayer = new VectorImageLayer({
      source: new VectorSource(),
      zIndex: 25,
      properties: { name: 'search' },
      style: () => searchResultStyle
    });
    searchSource = searchLayer.getSource() ?? new VectorSource();

    huntLayer = new VectorImageLayer({
      source: new VectorSource(),
      zIndex: 22,
      properties: { name: 'hunt-stops' }
    });
    huntLayer.setStyle((f) => createHuntStopStyle(f as Feature<Geometry>));
    huntSource = huntLayer.getSource() ?? new VectorSource();

    positionLayer = new VectorImageLayer({
      source: new VectorSource(),
      zIndex: 30,
      properties: { name: 'player-position' },
      style: () => createPositionStyle()
    });
    positionSource = positionLayer.getSource() ?? new VectorSource();

    const controls = defaultControls({ attribution: false, rotate: false, zoom: false }).extend([
      new Attribution({ collapsible: false }),
      new Rotate({ autoHide: false }),
      new Zoom(),
      new ScaleLine()
    ]);

    const mapLayers: BaseLayer[] = [
      ...basemapLayers,
      annotationLayer as unknown as BaseLayer,
      huntLayer as unknown as BaseLayer,
      searchLayer as unknown as BaseLayer,
      positionLayer as unknown as BaseLayer
    ];

    map = new Map({
      target: mapContainer,
      layers: mapLayers,
      view: new View({ center: INITIAL_CENTER, zoom: 14, enableRotation: true }),
      controls
    });

    const warped = warpedLayer as unknown as { setMap?: (map: unknown) => void };
    warped.setMap?.(map as unknown);

    dragRotate = new DragRotate({ condition: (event) => event.originalEvent.ctrlKey || event.originalEvent.metaKey });
    pinchRotate = new PinchRotate();
    map.addInteraction(dragRotate);
    map.addInteraction(pinchRotate);

    if (annotationSource) {
      modifyInteraction = new Modify({ source: annotationSource });
      map.addInteraction(modifyInteraction);
      modifyInteraction.on('modifystart', (event) => {
        pendingGeometrySnapshots.clear();
        event.features.forEach((f) => {
          const target = f as Feature<Geometry>;
          const id = target.getId();
          if (!id) return;
          pendingGeometrySnapshots.set(String(id), captureFeatureSnapshot(target));
        });
      });
      modifyInteraction.on('modifyend', (event) => {
        event.features.forEach((f) => {
          const target = f as Feature<Geometry>;
          const id = target.getId();
          if (!id) return;
          const before = pendingGeometrySnapshots.get(String(id));
          const after = captureFeatureSnapshot(target);
          if (!before) return;
          if (JSON.stringify(before.feature.geometry ?? null) !== JSON.stringify(after.feature.geometry ?? null)) {
            recordAnnotationGeometryChange(before, after);
          }
        });
        pendingGeometrySnapshots.clear();
        updateAnnotationSummaries();
      });

      selectInteraction = new Select({
        condition: click,
        layers: (layer) => layer === annotationLayer
      });
      map.addInteraction(selectInteraction);
      selectInteraction.on('select', (event) => {
        const feature = event.selected[0] ?? null;
        annotationState.setSelected(feature ? String(feature.getId()) : null);
      });

      annotationListenerKeys = [
        annotationSource.on('addfeature', () => updateAnnotationSummaries()),
        annotationSource.on('removefeature', () => updateAnnotationSummaries()),
        annotationSource.on('changefeature', () => updateAnnotationSummaries()),
        annotationSource.on('clear', () => updateAnnotationSummaries())
      ];
    }

    map.on('moveend', () => refreshDecorations());
    map.on('change:size', refreshDecorations);

    applyBasemap(basemapSelection);
    scheduleMapResize();

    window.addEventListener('pointermove', handlePointerDrag);
    window.addEventListener('pointerup', stopPointerDrag);
    window.addEventListener('pointercancel', stopPointerDrag);
    window.addEventListener('resize', scheduleMapResize);

    map.on('singleclick', (event) => {
      const lonLat = toLonLat(event.coordinate) as [number, number];
      dispatch('mapClick', { coordinate: lonLat });
    });

    dispatch('mapReady', { map });
  });

  onDestroy(() => {
    currentLoadAbort?.abort();
    window.removeEventListener('pointermove', handlePointerDrag);
    window.removeEventListener('pointerup', stopPointerDrag);
    window.removeEventListener('pointercancel', stopPointerDrag);
    window.removeEventListener('resize', scheduleMapResize);
    annotationListenerKeys.forEach((key) => unByKey(key));
    annotationListenerKeys = [];
    removeDrawInteraction();
    if (map && modifyInteraction) map.removeInteraction(modifyInteraction);
    if (map && selectInteraction) map.removeInteraction(selectInteraction);
    map?.setTarget(undefined);
    map = null;
    warpedLayer = null;
    annotationLayer = null;
    annotationSource = null;
    searchLayer = null;
    searchSource = null;
    huntLayer = null;
    huntSource = null;
    positionLayer = null;
    positionSource = null;
    modifyInteraction = null;
    selectInteraction = null;
    if (pendingResizeHandle !== null) {
      cancelAnimationFrame(pendingResizeHandle);
      pendingResizeHandle = null;
    }
  });
</script>

<div class="map-surface">
  <div bind:this={mapContainer} class="map"></div>
  <div bind:this={dividerXEl} class="divider vertical" aria-hidden="true"></div>
  <div bind:this={dividerYEl} class="divider horizontal" aria-hidden="true"></div>
  <button
    bind:this={dividerHandleXEl}
    class="handle vertical"
    type="button"
    aria-label="Drag vertical split"
    title="Drag vertical split"
    on:pointerdown={(event) => {
      if (viewMode !== 'side-x') return;
      dragging = { sideX: true, sideY: false, lensR: false };
      (event.currentTarget as HTMLElement)?.setPointerCapture(event.pointerId);
      event.preventDefault();
    }}
  ></button>
  <button
    bind:this={dividerHandleYEl}
    class="handle horizontal"
    type="button"
    aria-label="Drag horizontal split"
    title="Drag horizontal split"
    on:pointerdown={(event) => {
      if (viewMode !== 'side-y') return;
      dragging = { sideX: false, sideY: true, lensR: false };
      (event.currentTarget as HTMLElement)?.setPointerCapture(event.pointerId);
      event.preventDefault();
    }}
  ></button>
  <div bind:this={lensEl} class="lens" aria-hidden="true"></div>
  <button
    bind:this={lensHandleEl}
    class="lens-handle"
    type="button"
    aria-label="Adjust spyglass radius"
    title="Adjust spyglass radius"
    on:pointerdown={(event) => {
      if (viewMode !== 'spy') return;
      dragging = { sideX: false, sideY: false, lensR: true };
      (event.currentTarget as HTMLElement)?.setPointerCapture(event.pointerId);
      event.preventDefault();
    }}
  ></button>
</div>

<style>
  .map-surface {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    overflow: hidden;
  }

  .map {
    position: absolute;
    inset: 0;
  }

  .divider {
    position: absolute;
    pointer-events: none;
    background: #d4af37;
    box-shadow: 0 0 8px rgba(0, 0, 0, 0.3);
    z-index: 10;
  }

  .divider.vertical {
    width: 3px;
    top: 0;
    bottom: 0;
  }

  .divider.horizontal {
    height: 3px;
    left: 0;
    right: 0;
  }

  .handle {
    position: absolute;
    z-index: 11;
    width: 16px;
    height: 16px;
    background: linear-gradient(135deg, #d4af37 0%, #b8942f 100%);
    border: 2px solid #f4e8d8;
    border-radius: 999px;
    cursor: grab;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    transition: transform 0.15s ease;
  }

  .handle:hover {
    transform: scale(1.2);
  }

  .handle.vertical {
    top: 50%;
    transform: translateY(-50%);
  }

  .handle.vertical:hover {
    transform: translateY(-50%) scale(1.2);
  }

  .handle.horizontal {
    left: 50%;
    transform: translateX(-50%);
  }

  .handle.horizontal:hover {
    transform: translateX(-50%) scale(1.2);
  }

  .lens {
    position: absolute;
    border: 3px solid #d4af37;
    border-radius: 999px;
    pointer-events: none;
    z-index: 12;
    box-shadow:
      0 0 0 2px rgba(244, 232, 216, 0.5),
      0 4px 16px rgba(0, 0, 0, 0.3),
      inset 0 0 20px rgba(212, 175, 55, 0.1);
  }

  .lens-handle {
    position: absolute;
    width: 16px;
    height: 16px;
    border: 2px solid #f4e8d8;
    border-radius: 999px;
    background: linear-gradient(135deg, #d4af37 0%, #b8942f 100%);
    cursor: nwse-resize;
    z-index: 13;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    transition: transform 0.15s ease;
  }

  .lens-handle:hover {
    transform: scale(1.2);
  }
</style>
