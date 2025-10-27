<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
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
  import { fromLonLat } from 'ol/proj';
  import GeoJSON from 'ol/format/GeoJSON';
  import { unByKey } from 'ol/Observable';
  import Feature from 'ol/Feature';
  import type { Geometry } from 'ol/geom';
  import Point from 'ol/geom/Point';
  import type { EventsKey } from 'ol/events';
  import type { Feature as GeoJsonFeature, Geometry as GeoJsonGeometry } from 'geojson';
  import { WarpedMapLayer } from '@allmaps/openlayers';
  import { IIIF } from '@allmaps/iiif-parser';
  import { fetchAnnotationsFromApi } from '@allmaps/stdlib';
  import 'ol/ol.css';

  import {
    DATASET_URL,
    DEFAULT_ANNOTATION_COLOR,
    APP_STATE_KEY,
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
    TabKey,
    DrawingMode,
    MapListItem,
    AnnotationSummary,
    SearchResult,
    PersistedAppState
  } from '$lib/viewer/types';

  const geoJsonFormat = new GeoJSON();

  let mapContainer: HTMLDivElement;
  let dividerXEl: HTMLDivElement;
  let dividerYEl: HTMLDivElement;
  let dividerHandleXEl: HTMLButtonElement;
  let dividerHandleYEl: HTMLButtonElement;
  let lensEl: HTMLDivElement;
  let lensHandleEl: HTMLButtonElement;

  let basemapSelection = 'esri-imagery';
  let mapTypeSelection = 'all';
  let selectedMapId = '';
  let statusMessage = 'Select a map from the list.';
  let mapList: MapListItem[] = [];
  let filteredMapList: MapListItem[] = [];
  let panelCollapsed = false;
  let statusError = false;
  let loading = false;
  let opacity = 0.8;

  let activeTab: TabKey = 'map';
  let drawingMode: DrawingMode | null = null;

  let annotations: AnnotationSummary[] = [];
  let selectedAnnotationId: string | null = null;
  let searchQuery = '';
  let searchResults: SearchResult[] = [];
  let searchLoading = false;
  let searchNotice: string | null = null;
  let searchNoticeType: 'info' | 'error' | 'success' = 'info';

  let searchDebounce: ReturnType<typeof setTimeout> | null = null;
  let stateSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let searchAbortController: AbortController | null = null;
  let annotationsNotice: string | null = null;
  let annotationsNoticeType: 'info' | 'error' | 'success' = 'info';
  let stateLoaded = false;

  let geoJsonInputEl: HTMLInputElement | null = null;

  let map: Map | null = null;
  let warpedLayer: WarpedMapLayer | null = null;
  let annotationLayer: VectorImageLayer<VectorSource> | null = null;
  let annotationSource: VectorSource | null = null;
  let searchLayer: VectorImageLayer<VectorSource> | null = null;
  let searchSource: VectorSource | null = null;
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
  let viewMode: ViewMode = 'overlay';
  let sideRatio = 0.5;
  let lensRadius = 150;

  $: basemapLabel = BASEMAP_DEFS.find((base) => base.key === basemapSelection)?.label ?? 'Basemap';
  $: selectedMapLabel = mapList.find((m) => m.id === selectedMapId)?.name ?? 'Select a map';
  $: opacityPercent = Math.round(opacity * 100);

  function setStatus(message: string, isError = false) {
    statusMessage = message;
    statusError = isError;
  }

  function setLoading(value: boolean) {
    loading = value;
  }

  function updateAnnotationSummaries() {
    const list = annotationSource
      ? annotationSource.getFeatures().map((feature) => toAnnotationSummary(feature))
      : [];
    annotations = list;
    if (selectedAnnotationId && !list.some((item) => item.id === selectedAnnotationId)) {
      selectedAnnotationId = null;
    }
  }

  function getAnnotationFeature(id: string) {
    return annotationSource?.getFeatureById(id) ?? null;
  }

  function setAnnotationsNotice(message: string | null, tone: 'info' | 'error' | 'success' = 'info') {
    annotationsNotice = message;
    annotationsNoticeType = tone;
  }

  function saveAppState() {
    if (typeof window === 'undefined' || !stateLoaded) return;
    const view = map?.getView();
    const state: PersistedAppState = {
      basemapSelection,
      selectedMapId: selectedMapId || undefined,
      overlayId: loadedOverlayId || undefined,
      view: {
        mode: viewMode,
        sideRatio,
        lensRadius,
        opacity
      }
    };
    if (view) {
      const center = view.getCenter();
      const zoom = view.getZoom();
      const rotation = view.getRotation();
      if (center && typeof zoom === 'number' && typeof rotation === 'number') {
        state.mapView = {
          center: center as [number, number],
          zoom,
          rotation
        };
      }
    }
    if (annotationSource) {
      const features = annotationSource.getFeatures();
      if (features.length) {
        state.annotations = geoJsonFormat.writeFeaturesObject(features, {
          featureProjection: 'EPSG:3857',
          dataProjection: 'EPSG:4326'
        });
      }
    }
    try {
      window.localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('Unable to save viewer state', error);
    }
  }

  function queueSaveState() {
    if (typeof window === 'undefined' || !stateLoaded) return;
    if (stateSaveTimer) window.clearTimeout(stateSaveTimer);
    stateSaveTimer = window.setTimeout(saveAppState, 500);
  }

  async function loadAppState() {
    if (typeof window === 'undefined') {
      stateLoaded = true;
      return;
    }
    const raw = window.localStorage.getItem(APP_STATE_KEY);
    if (!raw) {
      stateLoaded = true;
      return;
    }
    try {
      stateLoaded = false;
      const saved = JSON.parse(raw) as PersistedAppState;

      if (saved.basemapSelection && BASEMAP_DEFS.some((item) => item.key === saved.basemapSelection)) {
        basemapSelection = saved.basemapSelection;
      }

      if (saved.view) {
        viewMode = saved.view.mode ?? viewMode;
        sideRatio = saved.view.sideRatio ?? sideRatio;
        lensRadius = saved.view.lensRadius ?? lensRadius;
        opacity = saved.view.opacity ?? opacity;
      }

      if (annotationSource && saved.annotations) {
        try {
          const features = geoJsonFormat.readFeatures(saved.annotations, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
          }) as Feature<Geometry>[];
          annotationSource.clear();
          features.forEach((feature) => ensureAnnotationDefaults(feature));
          annotationSource.addFeatures(features);
          updateAnnotationSummaries();
        } catch (error) {
          console.warn('Could not restore saved annotations', error);
          annotationSource.clear();
        }
      }

      const view = map?.getView();
      if (view && saved.mapView) {
        const { center, zoom, rotation } = saved.mapView;
        if (center) view.setCenter(center);
        if (typeof zoom === 'number') view.setZoom(zoom);
        if (typeof rotation === 'number') view.setRotation(rotation);
      }

      const overlayId = saved.overlayId ?? saved.selectedMapId;
      if (overlayId && mapList.some((item) => item.id === overlayId)) {
        selectedMapId = overlayId;
        await loadOverlaySource(overlayId);
      } else if (saved.selectedMapId && mapList.some((item) => item.id === saved.selectedMapId)) {
        selectedMapId = saved.selectedMapId;
      }
    } catch (error) {
      console.warn('Failed to load saved viewer state', error);
    } finally {
      stateLoaded = true;
    }
  }

  function clearSavedState() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(APP_STATE_KEY);
    } catch (error) {
      console.warn('Failed to clear saved state', error);
    }
    window.location.reload();
  }

  function applyBasemap(name: string) {
    if (!map) return;
    map
      .getLayers()
      .getArray()
      .forEach((layer) => {
        const props = layer.getProperties();
        if (props.base) {
          layer.setVisible(props.name === name);
        }
      });
  }

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
        const x = w * sideRatio - 8;
        dividerHandleXEl.style.left = `${x}px`;
        dividerHandleXEl.style.top = `${h / 2 - 8}px`;
      }
    }
    if (dividerYEl) {
      dividerYEl.style.display = showY ? 'block' : 'none';
      if (showY) {
        const y = h * sideRatio;
        dividerYEl.style.top = `${y}px`;
        dividerYEl.style.width = `${w}px`;
      }
    }
    if (dividerHandleYEl) {
      dividerHandleYEl.style.display = showY ? 'block' : 'none';
      if (showY) {
        const y = h * sideRatio - 8;
        dividerHandleYEl.style.left = `${w / 2 - 8}px`;
        dividerHandleYEl.style.top = `${y}px`;
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

  function refreshDecorations() {
    updateClipMask();
    updateDividersAndHandles();
    updateLens();
  }

  function setViewMode(next: ViewMode) {
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
      const ratio = Math.max(0.01, Math.min(x / w, 0.99));
      sideRatio = ratio;
      updateDividersAndHandles();
    } else if (dragging.sideY) {
      const ratio = Math.max(0.01, Math.min(y / h, 0.99));
      sideRatio = ratio;
      updateDividersAndHandles();
    } else if (dragging.lensR) {
      const dx = x - w / 2;
      const dy = y - h / 2;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const maxRadius = Math.min(w, h) / 2;
      lensRadius = Math.max(20, Math.min(radius, maxRadius));
      updateLens();
    }
    updateClipMask();
  }

  function stopPointerDrag() {
    if (!dragging.sideX && !dragging.sideY && !dragging.lensR) return;
    queueSaveState();
    dragging = { sideX: false, sideY: false, lensR: false };
  }

  function zoomToOverlayExtent() {
    if (!map || !warpedLayer) return;
    const extent = warpedLayer.getExtent();
    if (!extent) return;
    map.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 18, duration: 500 });
  }

  async function loadDataset() {
    try {
      setStatus('Loading map list…');
      const response = await fetch(DATASET_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const lines = text.trim().split(/\r?\n/);
      if (!lines.length) throw new Error('No rows.');
      const header = (lines.shift() ?? '')
        .split(',')
        .map((h) => h.trim().toLowerCase());
      const nameIndex = header.indexOf('name');
      const idIndex = header.indexOf('id');
      const typeIndex = header.indexOf('type');
      if (nameIndex === -1 || idIndex === -1) throw new Error("Missing 'name' or 'id' column.");
      const items: MapListItem[] = lines
        .map((line) => line.match(/(".*?"|[^",\r\n]+)(?=\s*,|\s*$)/g) || [])
        .map((cols) => {
          const name = (cols[nameIndex] || '').replace(/"/g, '').trim();
          const id = (cols[idIndex] || '').replace(/"/g, '').trim();
          const type =
            typeIndex > -1 ? (cols[typeIndex] || '').replace(/"/g, '').trim() || 'Uncategorized' : 'Uncategorized';
          return name && id ? { id, name, type } : null;
        })
        .filter((item): item is MapListItem => !!item);
      mapList = items;
      setStatus('Select a map from the list.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`Failed to load map list: ${message}`, true);
      mapList = [];
    }
  }

  $: filteredMapList =
    mapTypeSelection === 'all'
      ? mapList
      : mapList.filter((item) => item.type.toLowerCase() === mapTypeSelection.toLowerCase());

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
      try {
        parsed = IIIF.parse(iiifJson);
      } catch (error) {
        throw new Error(`Failed to parse IIIF: ${(error as Error).message}`);
      }
      let annotations: unknown[] = [];
      let lookupError: Error | null = null;
      try {
        annotations = await fetchAnnotationsFromApi(parsed);
      } catch (error) {
        lookupError = error instanceof Error ? error : new Error('Unknown Allmaps API error.');
      }
      if (!annotations.length) {
        try {
          const fallbackUrl = `https://annotations.allmaps.org/?url=${encodeURIComponent(source)}`;
          const fallbackResponse = await fetch(fallbackUrl, { signal });
          if (fallbackResponse.ok) {
            const fallbackJson = await fallbackResponse.json();
            if (Array.isArray(fallbackJson)) {
              annotations = fallbackJson;
            } else if (fallbackJson && Array.isArray(fallbackJson.annotations)) {
              annotations = fallbackJson.annotations;
            }
          } else {
            const text = await fallbackResponse.text();
            lookupError ??= new Error(`Fallback lookup failed (HTTP ${fallbackResponse.status}): ${text || 'No body'}`);
          }
        } catch (error) {
          if (!lookupError) {
            lookupError = error instanceof Error ? error : new Error('Unknown fallback lookup error.');
          }
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

  async function loadOverlaySource(source: string) {
    if (!warpedLayer) return;
    const trimmed = source.trim();
    if (!trimmed) return;
    if (currentLoadAbort) currentLoadAbort.abort();
    const abortController = new AbortController();
    currentLoadAbort = abortController;
    const { signal } = abortController;

    const cacheKey = trimmed;

    if (cacheKey === loadedOverlayId && currentMapId) {
      try {
        warpedLayer.setMapOpacity(currentMapId, opacity);
      } catch {
        /* no-op */
      }
      return;
    }

    if (currentMapId) {
      try {
        warpedLayer.setMapOpacity(currentMapId, 0);
      } catch {
        /* no-op */
      }
    }

    setLoading(true);
    setStatus('Loading map…');

    try {
      let mapIds: string[] = [];

      if (cacheKey in mapCache) {
        mapIds = mapCache[cacheKey].mapIds;
      } else {
        const { annotations } = await resolveAnnotations(cacheKey, signal);
        if (signal.aborted) return;
        mapIds = await addAnnotationsToLayer(annotations, signal);
        if (!mapIds.length) {
          throw new Error('Map could not be added to the viewer.');
        }
        mapCache[cacheKey] = { mapIds };
      }

      const primaryMapId = mapIds[0];

      if (!primaryMapId) throw new Error('Could not determine map identifier.');

      currentMapId = primaryMapId;
      loadedOverlayId = cacheKey;

      try {
        for (const id of mapIds) {
          warpedLayer.setMapOpacity(id, opacity);
        }
      } catch {
        /* no-op */
      }

      setStatus('Map loaded. Tiles may take a moment to appear.');
      refreshDecorations();
      queueSaveState();
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`Failed to load map: ${message}`, true);
    } finally {
      if (!signal.aborted) {
        setLoading(false);
        currentLoadAbort = null;
      }
    }
  }

  function handleSelectChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    selectedMapId = value;
    if (value) {
      loadOverlaySource(value);
    } else {
      queueSaveState();
    }
  }

  function handleOpacityInput(event: Event) {
    const value = Number((event.target as HTMLInputElement).value);
    opacity = value;
    if (currentMapId && warpedLayer) {
      try {
        warpedLayer.setMapOpacity(currentMapId, opacity);
      } catch {
        /* no-op */
      }
    }
    queueSaveState();
  }

  function handleModeClick(mode: ViewMode) {
    setViewMode(mode);
    queueSaveState();
  }

  function togglePanel() {
    panelCollapsed = !panelCollapsed;
  }

  function removeDrawInteraction() {
    if (!map || !drawInteraction) return;
    map.removeInteraction(drawInteraction);
    drawInteraction = null;
  }

  function applyDrawInteraction() {
    if (!map || !annotationSource) return;
    removeDrawInteraction();
    if (!drawingMode) return;
    const drawType = DRAW_TYPE_MAP[drawingMode];
    const draw = new Draw({
      source: annotationSource,
      type: drawType
    });
    draw.on('drawstart', () => {
      selectInteraction?.getFeatures().clear();
    });
    draw.on('drawend', (event) => {
      const feature = event.feature as Feature<Geometry>;
      ensureAnnotationDefaults(feature);
      selectedAnnotationId = feature.getId() as string;
      updateAnnotationSummaries();
      queueSaveState();
      setAnnotationsNotice('Annotation added.', 'success');
    });
    drawInteraction = draw;
    map.addInteraction(draw);
  }

  function deactivateDrawing() {
    drawingMode = null;
    removeDrawInteraction();
  }

  function setDrawingMode(mode: DrawingMode) {
    if (drawingMode === mode) {
      deactivateDrawing();
    } else {
      drawingMode = mode;
      applyDrawInteraction();
    }
  }

  function updateAnnotationLabel(id: string, label: string) {
    const feature = getAnnotationFeature(id);
    if (!feature) return;
    feature.set('label', label);
    updateAnnotationSummaries();
    queueSaveState();
  }

  function updateAnnotationColor(id: string, color: string) {
    const feature = getAnnotationFeature(id);
    if (!feature) return;
    feature.set('color', color);
    updateAnnotationSummaries();
    queueSaveState();
  }

  function toggleAnnotationVisibility(id: string) {
    const feature = getAnnotationFeature(id);
    if (!feature) return;
    const hidden = Boolean(feature.get('hidden'));
    feature.set('hidden', !hidden);
    updateAnnotationSummaries();
    queueSaveState();
  }

  function zoomToAnnotation(id: string) {
    if (!map) return;
    const feature = getAnnotationFeature(id);
    const geometry = feature?.getGeometry();
    if (!geometry) return;
    if (geometry.getType() === 'Point') {
      const coords = (geometry as Point).getCoordinates() as [number, number];
      map.getView().animate({
        center: coords,
        zoom: Math.max(map.getView().getZoom() ?? 16, 17),
        duration: 350
      });
    } else {
      map.getView().fit(geometry.getExtent(), { padding: [80, 80, 80, 80], duration: 400, maxZoom: 18 });
    }
  }

  function deleteAnnotation(id: string) {
    const feature = getAnnotationFeature(id);
    if (!feature || !annotationSource) return;
    annotationSource.removeFeature(feature);
    if (selectedAnnotationId === id) {
      selectedAnnotationId = null;
    }
    updateAnnotationSummaries();
    queueSaveState();
  }

  function clearAnnotations() {
    annotationSource?.clear();
    selectedAnnotationId = null;
    annotations = [];
    queueSaveState();
    setAnnotationsNotice('All annotations cleared.', 'info');
  }

  function clearSearchResults() {
    searchResults = [];
    searchNotice = null;
    searchNoticeType = 'info';
    searchLoading = false;
  }

  function featureFromSearchResult(result: SearchResult): Feature<Geometry> | null {
    try {
      if (result.geojson) {
        const feature = geoJsonFormat.readFeature(
          {
            type: 'Feature',
            geometry: result.geojson as GeoJsonGeometry,
            properties: {}
          } as GeoJsonFeature,
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
    } catch (error) {
      console.warn('Unable to create feature from search result', error);
    }
    return null;
  }

  async function runSearch(query: string) {
    const trimmed = query.trim();
    searchQuery = query;
    if (!trimmed) {
      clearSearchResults();
      searchSource?.clear();
      searchAbortController?.abort();
      searchAbortController = null;
      return;
    }
    searchAbortController?.abort();
    searchAbortController = new AbortController();
    searchLoading = true;
    searchNotice = null;
    searchNoticeType = 'info';
    try {
      const params = new URLSearchParams({
        format: 'jsonv2',
        q: trimmed,
        addressdetails: '1',
        polygon_geojson: '1',
        limit: '10'
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        signal: searchAbortController.signal,
        headers: {
          Accept: 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as SearchResult[];
      searchResults = data;
      if (!data.length) {
        searchNotice = 'No results found.';
        searchNoticeType = 'info';
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      searchNotice = 'Search failed. Please try again.';
      searchNoticeType = 'error';
      console.error('Search error:', error);
      searchResults = [];
    } finally {
      searchLoading = false;
    }
  }

  function queueSearch(query: string) {
    searchQuery = query;
    if (searchDebounce) clearTimeout(searchDebounce);
    const delay = 1000;
    searchDebounce = window.setTimeout(() => {
      runSearch(query);
    }, delay);
  }

  function zoomToSearchResult(result: SearchResult) {
    if (!map || !searchSource) return;
    const feature = featureFromSearchResult(result);
    if (!feature) return;
    searchSource.clear();
    searchSource.addFeature(feature);
    const geometry = feature.getGeometry();
    if (!geometry) return;
    if (geometry.getType() === 'Point') {
      const coords = (geometry as Point).getCoordinates() as [number, number];
      map.getView().animate({
        center: coords,
        zoom: Math.max(map.getView().getZoom() ?? 12, 16),
        duration: 400
      });
    } else {
      map.getView().fit(geometry.getExtent(), { padding: [80, 80, 80, 80], duration: 400, maxZoom: 18 });
    }
  }

  function addSearchResultToAnnotations(result: SearchResult) {
    if (!annotationSource) return;
    const feature = featureFromSearchResult(result);
    if (!feature) return;
    ensureAnnotationDefaults(feature);
    annotationSource.addFeature(feature);
    selectedAnnotationId = feature.getId() as string;
    updateAnnotationSummaries();
    queueSaveState();
    clearSearchResults();
    searchNotice = 'Feature added to annotations.';
    searchNoticeType = 'success';
    searchSource?.clear();
    searchQuery = '';
    setAnnotationsNotice('Annotation added from search.', 'success');
  }

  function clearSearch() {
    searchQuery = '';
    clearSearchResults();
    searchSource?.clear();
    searchAbortController?.abort();
    searchAbortController = null;
    searchNotice = null;
    searchNoticeType = 'info';
  }

  function locateUser() {
    const currentMap = map;
    const currentSearchSource = searchSource;
    if (!currentMap || !currentSearchSource) return;
    if (!('geolocation' in navigator)) {
      searchNotice = 'Geolocation is not available.';
      searchNoticeType = 'error';
      return;
    }
    searchLoading = true;
    searchNotice = null;
    searchNoticeType = 'info';
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const coords = fromLonLat([longitude, latitude]);
        currentSearchSource.clear();
        const feature = new Feature({ geometry: new Point(coords) });
        feature.set('label', 'Current location');
        currentSearchSource.addFeature(feature);
        const view = currentMap.getView();
        view.animate({ center: coords, zoom: Math.max(view.getZoom() ?? 12, 16), duration: 450 });
        searchLoading = false;
        searchNotice = 'Centered on your location.';
        searchNoticeType = 'success';
      },
      (error) => {
        searchLoading = false;
        searchNotice = `Could not get location: ${error.message}`;
        searchNoticeType = 'error';
      }
    );
  }

  function downloadBlob(content: Blob, filename: string) {
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportAnnotationsAsGeoJSON() {
    if (!annotationSource) return;
    const features = annotationSource.getFeatures();
    if (!features.length) {
      setAnnotationsNotice('Nothing to export — the annotation list is empty.', 'info');
      return;
    }
    const collection = geoJsonFormat.writeFeaturesObject(features, {
      featureProjection: 'EPSG:3857',
      dataProjection: 'EPSG:4326'
    });
    const blob = new Blob([JSON.stringify(collection, null, 2)], {
      type: 'application/geo+json;charset=utf-8;'
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob(blob, `annotations-${stamp}.geojson`);
    setAnnotationsNotice('GeoJSON downloaded.', 'success');
  }

  function csvEscape(value: unknown) {
    if (value == null) return '';
    const str = String(value);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  }

  async function importGeoJsonText(text: string) {
    if (!annotationSource) return;
    try {
      const json = JSON.parse(text);
      const features = geoJsonFormat.readFeatures(json, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857'
      }) as Feature<Geometry>[];
      features.forEach((feature) => ensureAnnotationDefaults(feature));
      annotationSource.addFeatures(features);
      updateAnnotationSummaries();
      setAnnotationsNotice(`Imported ${features.length} feature${features.length !== 1 ? 's' : ''}.`, 'success');
      queueSaveState();
    } catch (error) {
      console.error('GeoJSON import failed', error);
      setAnnotationsNotice('Failed to import GeoJSON file.', 'error');
    }
  }

  async function handleGeoJsonFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const [file] = input.files ?? [];
    if (!file) return;
    try {
      await importGeoJsonText(await file.text());
    } finally {
      input.value = '';
    }
  }


  onMount(() => {
    const basemapLayers = BASEMAP_DEFS.map((def) => def.layer());
    warpedLayer = new WarpedMapLayer();
    warpedLayer.setZIndex(10);
    warpedLayer.setProperties({ name: 'allmaps-overlay' });
    const warpedCompat = warpedLayer as unknown as {
      getDeclutter?: () => boolean;
      renderDeferred?: (...args: unknown[]) => boolean;
    };
    if (!warpedCompat.getDeclutter) {
      warpedCompat.getDeclutter = () => false;
    }
    if (!warpedCompat.renderDeferred) {
      warpedCompat.renderDeferred = () => false;
    }
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
      style: (_feature) => searchResultStyle
    });
    searchSource = searchLayer.getSource() ?? new VectorSource();

    const controls = defaultControls({ attribution: false, rotate: false, zoom: false }).extend([
      new Attribution({ collapsible: false }),
      new Rotate({ autoHide: false }),
      new Zoom(),
      new ScaleLine()
    ]);

    const mapLayers: BaseLayer[] = [
      ...basemapLayers,
      annotationLayer as unknown as BaseLayer,
      searchLayer as unknown as BaseLayer
    ];

    map = new Map({
      target: mapContainer,
      layers: mapLayers,
      view: new View({
        center: INITIAL_CENTER,
        zoom: 14,
        enableRotation: true
      }),
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
      modifyInteraction.on('modifyend', () => {
        updateAnnotationSummaries();
        queueSaveState();
      });

      selectInteraction = new Select({
        condition: click,
        layers: (layer) => layer === annotationLayer
      });
      map.addInteraction(selectInteraction);
      selectInteraction.on('select', (event) => {
        const feature = event.selected[0] ?? null;
        selectedAnnotationId = feature ? (feature.getId() as string) : null;
      });

      annotationListenerKeys = [
        annotationSource.on('addfeature', () => {
          updateAnnotationSummaries();
          queueSaveState();
        }),
        annotationSource.on('removefeature', () => {
          updateAnnotationSummaries();
          queueSaveState();
        }),
        annotationSource.on('changefeature', () => {
          updateAnnotationSummaries();
          queueSaveState();
        }),
        annotationSource.on('clear', () => {
          updateAnnotationSummaries();
          queueSaveState();
        })
      ];
    }

    map.on('moveend', () => {
      refreshDecorations();
      queueSaveState();
    });
    map.on('change:size', refreshDecorations);

    applyBasemap(basemapSelection);
    loadDataset()
      .then(() => loadAppState())
      .catch((error) => {
        console.error('Failed to initialise dataset', error);
        stateLoaded = true;
      });

    window.addEventListener('pointermove', handlePointerDrag);
    window.addEventListener('pointerup', stopPointerDrag);
    window.addEventListener('pointercancel', stopPointerDrag);
  });

  onDestroy(() => {
    currentLoadAbort?.abort();
    searchAbortController?.abort();
    window.removeEventListener('pointermove', handlePointerDrag);
    window.removeEventListener('pointerup', stopPointerDrag);
    window.removeEventListener('pointercancel', stopPointerDrag);
    annotationListenerKeys.forEach((key) => unByKey(key));
    annotationListenerKeys = [];
    removeDrawInteraction();
    if (map && modifyInteraction) {
      map.removeInteraction(modifyInteraction);
    }
    if (map && selectInteraction) {
      map.removeInteraction(selectInteraction);
    }
    map?.setTarget(undefined);
    map = null;
    warpedLayer = null;
    annotationLayer = null;
    annotationSource = null;
    searchLayer = null;
    searchSource = null;
    modifyInteraction = null;
    selectInteraction = null;
  });

  $: applyBasemap(basemapSelection);
  $: refreshDecorations();
</script>

<div class="viewer">
  <div class="map-wrapper">
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

  <div class="control-bar">
    <div class="control-panel" class:collapsed={panelCollapsed}>
      <div class="panel-header">
      <div class="panel-summary">
        <span class="panel-title">{selectedMapLabel}</span>
        <span class="panel-sub">{basemapLabel} · {opacityPercent}%</span>
      </div>
      <button
          type="button"
          class="collapse-toggle"
          on:click={togglePanel}
          aria-expanded={!panelCollapsed}
        >
          {panelCollapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {#if panelCollapsed}
        <div class="collapsed-content">
          <div class="mini-modes">
            <button
              type="button"
              class:selected={viewMode === 'overlay'}
              on:click={() => handleModeClick('overlay')}
            >
              Overlay
            </button>
            <button type="button" class:selected={viewMode === 'side-x'} on:click={() => handleModeClick('side-x')}>
              Side X
            </button>
            <button type="button" class:selected={viewMode === 'side-y'} on:click={() => handleModeClick('side-y')}>
              Side Y
            </button>
            <button type="button" class:selected={viewMode === 'spy'} on:click={() => handleModeClick('spy')}>
              Spyglass
            </button>
          </div>
        </div>
      {:else}
        <div class="tab-switcher">
          <button
            type="button"
            class:selected={activeTab === 'map'}
            on:click={() => (activeTab = 'map')}
          >
            Map
          </button>
          <button
            type="button"
            class:selected={activeTab === 'annotations'}
            on:click={() => (activeTab = 'annotations')}
          >
            Annotations
          </button>
        </div>

        {#if activeTab === 'map'}
          <div class="tab-panel map-tab">
            <div class="control-row wrap">
              <label class="control-group">
                <span class="control-label">Basemap</span>
                <select bind:value={basemapSelection} on:change={queueSaveState}>
                  {#each BASEMAP_DEFS as basemap}
                    <option value={basemap.key}>{basemap.label}</option>
                  {/each}
                </select>
              </label>

              <label class="control-group">
                <span class="control-label">Type</span>
                <select bind:value={mapTypeSelection}>
                  <option value="all">All ({mapList.length})</option>
                  {#each [...new Set(mapList.map((item) => item.type))].sort() as type}
                    <option value={type}>{type}</option>
                  {/each}
                </select>
              </label>

              <label class="control-group grow">
                <span class="control-label">Map</span>
                <select bind:value={selectedMapId} on:change={handleSelectChange}>
                  <option value="" disabled selected>Select…</option>
                  {#each filteredMapList as item}
                    <option value={item.id}>{item.name}</option>
                  {/each}
                </select>
              </label>
            </div>

            <div class="control-row slider-row">
              <div class="control-group slider-group">
                <span class="control-label">Opacity</span>
                <div class="slider">
                  <input type="range" min="0" max="1" step="0.05" bind:value={opacity} on:input={handleOpacityInput} />
                  <span>{opacityPercent}%</span>
                </div>
              </div>
            </div>

            <div class="mode-row">
              <div class="mode-buttons">
                <button
                  type="button"
                  class:selected={viewMode === 'overlay'}
                  on:click={() => handleModeClick('overlay')}
                >
                  Overlay
                </button>
                <button type="button" class:selected={viewMode === 'side-x'} on:click={() => handleModeClick('side-x')}>
                  Side X
                </button>
                <button type="button" class:selected={viewMode === 'side-y'} on:click={() => handleModeClick('side-y')}>
                  Side Y
                </button>
                <button type="button" class:selected={viewMode === 'spy'} on:click={() => handleModeClick('spy')}>
                  Spyglass
                </button>
              </div>
            </div>

            <div class="panel-footer">
              <div class="footer-actions">
                <button type="button" class="btn footer" on:click={zoomToOverlayExtent} disabled={!currentMapId}>
                  Zoom
                </button>
                <button type="button" class="btn footer ghost" on:click={clearSavedState}>
                  Clear cache
                </button>
              </div>
              <div class="status-row">
                {#if loading}
                  <span class="spinner" aria-hidden="true"></span>
                {/if}
                <p class:errored={statusError}>{statusMessage}</p>
              </div>
            </div>
          </div>
        {:else}
          <div class="tab-panel annotations-tab">
            <div class="annotation-section">
              <div class="control-label block">Search</div>
              <div class="search-row">
                <input
                  type="text"
                  placeholder="Search for a place or address…"
                  bind:value={searchQuery}
                  on:input={(event) => queueSearch((event.target as HTMLInputElement).value)}
                />
                <button type="button" class="chip" on:click={() => runSearch(searchQuery)} disabled={searchLoading}>
                  Find
                </button>
                <button type="button" class="chip" on:click={locateUser} disabled={searchLoading}>
                  Locate
                </button>
                <button type="button" class="chip ghost" on:click={clearSearch}>
                  Clear
                </button>
              </div>
              <div class="search-status">
                {#if searchLoading}
                  <span>Searching…</span>
                {:else if searchNotice}
                  <span
                    class:errored={searchNoticeType === 'error'}
                    class:success={searchNoticeType === 'success'}
                  >
                    {searchNotice}
                  </span>
                {:else}
                  <span>Tip: click a result to zoom, “Add” to save it.</span>
                {/if}
              </div>
              <div class="search-results">
                {#if searchResults.length}
                  {#each searchResults as result (result.display_name)}
                    <div class="search-result">
                      <button type="button" on:click={() => zoomToSearchResult(result)}>
                        <span class="result-title">{result.display_name}</span>
                        {#if result.type}
                          <span class="result-type">{result.type}</span>
                        {/if}
                      </button>
                      <button type="button" class="chip add" on:click={() => addSearchResultToAnnotations(result)}>
                        Add
                      </button>
                    </div>
                  {/each}
                {:else}
                  <p class="search-placeholder">Results will appear here.</p>
                {/if}
              </div>
            </div>

            <div class="annotation-section">
              <div class="control-label block">Draw</div>
              <div class="draw-buttons">
                <button type="button" class:selected={drawingMode === 'point'} on:click={() => setDrawingMode('point')}>
                  Point
                </button>
                <button type="button" class:selected={drawingMode === 'line'} on:click={() => setDrawingMode('line')}>
                  Line
                </button>
                <button
                  type="button"
                  class:selected={drawingMode === 'polygon'}
                  on:click={() => setDrawingMode('polygon')}
                >
                  Polygon
                </button>
                <button type="button" class="ghost" on:click={deactivateDrawing} disabled={!drawingMode}>
                  Done
                </button>
              </div>
              <p class="hint">
                Click on the map to draw. Press Enter to finish, Esc to cancel the current shape.
              </p>
            </div>

            <div class="annotation-section">
              <div class="annotation-header">
                <span class="control-label block">Current annotations ({annotations.length})</span>
                <button type="button" class="chip ghost" on:click={clearAnnotations} disabled={!annotations.length}>
                  Clear all
                </button>
              </div>
              {#if annotationsNotice}
                <p
                  class="annotations-notice"
                  class:errored={annotationsNoticeType === 'error'}
                  class:success={annotationsNoticeType === 'success'}
                >
                  {annotationsNotice}
                </p>
              {/if}
              {#if annotations.length}
                <div class="annotation-list custom-scrollbar">
                  {#each annotations as annotation (annotation.id)}
                    <div class="annotation-item" class:selected={annotation.id === selectedAnnotationId}>
                      <div class="item-main">
                        <button
                          type="button"
                          class="item-label"
                          on:click={() => {
                            selectedAnnotationId = annotation.id;
                            zoomToAnnotation(annotation.id);
                          }}
                        >
                          <span class="text">{annotation.label || 'Untitled'}</span>
                          <span class="meta">{annotation.type}</span>
                        </button>
                        <div class="item-actions">
                          <input
                            type="color"
                            value={annotation.color}
                            title="Change colour"
                            on:input={(event) =>
                              updateAnnotationColor(annotation.id, (event.target as HTMLInputElement).value)}
                          />
                          <button type="button" class="chip ghost" on:click={() => toggleAnnotationVisibility(annotation.id)}>
                            {annotation.hidden ? 'Show' : 'Hide'}
                          </button>
                          <button type="button" class="chip danger" on:click={() => deleteAnnotation(annotation.id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                      <input
                        class="item-input"
                        type="text"
                        value={annotation.label}
                        placeholder="Annotation label"
                        on:input={(event) =>
                          updateAnnotationLabel(annotation.id, (event.target as HTMLInputElement).value)}
                      />
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="empty-state">
                  Draw on the map or add a search result to create your first annotation.
                </p>
              {/if}
            </div>

            <div class="annotation-section">
              <span class="control-label block">Data</span>
              <div class="data-actions">
                <button type="button" class="chip" on:click={exportAnnotationsAsGeoJSON}>
                  Export GeoJSON
                </button>
                <button type="button" class="chip ghost" on:click={() => geoJsonInputEl?.click()}>
                  Import GeoJSON
                </button>
              </div>
              <input
                bind:this={geoJsonInputEl}
                type="file"
                accept=".geojson,.json,application/geo+json,application/json"
                class="sr-only"
                on:change={handleGeoJsonFileChange}
              />
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .viewer {
    position: relative;
    height: 100dvh;
    background: #0f172a;
    color: #f9fafb;
    font-family: system-ui, sans-serif;
    overflow: hidden;
  }

  .map-wrapper {
    position: absolute;
    inset: 0;
  }

  .map {
    position: absolute;
    inset: 0;
  }

  .control-bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: center;
    padding: 0.3rem 0.4rem calc(env(safe-area-inset-bottom) + 0.3rem);
    pointer-events: none;
    background: linear-gradient(180deg, rgba(15, 23, 42, 0) 0%, rgba(15, 23, 42, 0.55) 45%, rgba(15, 23, 42, 0.95) 100%);
  }

  .control-panel {
    width: min(960px, 100%);
    background: rgba(17, 24, 39, 0.92);
    border-radius: 0.85rem 0.85rem 0.5rem 0.5rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
    padding: 0.55rem 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    pointer-events: auto;
    backdrop-filter: blur(16px);
    max-height: min(75vh, 520px);
    overflow-y: auto;
  }

  .control-panel::-webkit-scrollbar {
    width: 6px;
  }

  .control-panel::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.6);
    border-radius: 999px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .panel-summary {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .panel-title {
    font-size: 0.78rem;
    font-weight: 600;
    color: #f9fafb;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .panel-sub {
    font-size: 0.65rem;
    color: rgba(203, 213, 225, 0.8);
  }

  .collapse-toggle {
    border: 1px solid rgba(148, 163, 184, 0.35);
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.8);
    color: inherit;
    padding: 0.35rem 0.75rem;
    font-size: 0.7rem;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .collapse-toggle:hover {
    background: rgba(129, 140, 248, 0.35);
    border-color: rgba(129, 140, 248, 0.75);
  }

  .control-panel.collapsed {
    gap: 0.35rem;
    padding: 0.45rem 0.5rem;
  }

  .control-panel.collapsed .panel-summary {
    gap: 0.05rem;
  }

  .collapsed-content {
    padding-top: 0.15rem;
  }

  .mini-modes {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  .mini-modes button {
    padding: 0.3rem 0.55rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(15, 23, 42, 0.75);
    color: inherit;
    font-size: 0.68rem;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .mini-modes button.selected {
    background: rgba(129, 140, 248, 0.32);
    border-color: rgba(129, 140, 248, 0.85);
  }

  .control-row {
    display: flex;
    gap: 0.55rem;
  }

  .control-row.wrap {
    flex-wrap: wrap;
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 0.22rem;
    min-width: 130px;
  }

  .control-group.grow {
    flex: 1 1 200px;
  }

  .control-label {
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #cbd5f5;
  }

  select,
  input[type='range'],
  button {
    font: inherit;
  }

  select {
    width: 100%;
    padding: 0.42rem 0.55rem;
    border-radius: 0.58rem;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(15, 23, 42, 0.85);
    color: inherit;
  }

  select:focus {
    outline: 2px solid rgba(129, 140, 248, 0.5);
    outline-offset: 1px;
  }

  .btn {
    padding: 0.45rem 0.8rem;
    border-radius: 0.68rem;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(55, 65, 81, 0.85);
    color: inherit;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
    white-space: nowrap;
    min-height: 2.25rem;
  }

  .btn:hover {
    background: rgba(129, 140, 248, 0.35);
    border-color: rgba(129, 140, 248, 0.75);
    transform: translateY(-1px);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .mode-buttons {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .mode-buttons button {
    padding: 0.38rem 0.7rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(17, 24, 39, 0.8);
    color: inherit;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .mode-buttons button.selected {
    background: rgba(129, 140, 248, 0.3);
    border-color: rgba(129, 140, 248, 0.9);
  }

  .tab-switcher {
    display: flex;
    gap: 0.35rem;
    background: rgba(15, 23, 42, 0.7);
    border-radius: 0.65rem;
    padding: 0.18rem;
  }

  .tab-switcher button {
    flex: 1;
    padding: 0.35rem 0.6rem;
    border-radius: 0.55rem;
    border: 1px solid transparent;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-weight: 600;
    letter-spacing: 0.02em;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .tab-switcher button.selected {
    background: rgba(129, 140, 248, 0.25);
    border-color: rgba(129, 140, 248, 0.8);
  }

  .tab-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 0.6rem;
  }

  .annotations-tab {
    gap: 0.65rem;
  }

  .annotation-section {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    background: rgba(15, 23, 42, 0.55);
    border: 1px solid rgba(129, 140, 248, 0.12);
    border-radius: 0.7rem;
    padding: 0.55rem 0.65rem;
  }

  .search-row {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }

  .search-row input {
    flex: 1;
    padding: 0.4rem 0.55rem;
    border-radius: 0.65rem;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(17, 24, 39, 0.85);
    color: inherit;
  }

  .search-row input:focus {
    outline: 2px solid rgba(129, 140, 248, 0.45);
    outline-offset: 1px;
  }

  .chip {
    padding: 0.36rem 0.7rem;
    border-radius: 999px;
    border: 1px solid rgba(129, 140, 248, 0.35);
    background: rgba(129, 140, 248, 0.2);
    color: inherit;
    cursor: pointer;
    font-size: 0.68rem;
    font-weight: 600;
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
  }

  .chip:hover:not(:disabled) {
    background: rgba(129, 140, 248, 0.35);
    border-color: rgba(129, 140, 248, 0.8);
    transform: translateY(-1px);
  }

  .chip:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .chip.ghost {
    background: transparent;
    border-color: rgba(148, 163, 184, 0.35);
  }

  .chip.add {
    background: rgba(22, 163, 74, 0.25);
    border-color: rgba(22, 163, 74, 0.55);
  }

  .chip.add:hover {
    background: rgba(22, 163, 74, 0.4);
    border-color: rgba(22, 163, 74, 0.8);
  }

  .chip.danger {
    background: rgba(248, 113, 113, 0.25);
    border-color: rgba(248, 113, 113, 0.55);
  }

  .search-status {
    font-size: 0.7rem;
    color: rgba(148, 163, 184, 0.85);
  }

  .search-status .errored {
    color: #fca5a5;
  }

  .search-status .success {
    color: #86efac;
  }

  .search-results {
    max-height: 180px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .search-result {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.45rem;
    border-radius: 0.55rem;
    background: rgba(15, 23, 42, 0.55);
    border: 1px solid rgba(129, 140, 248, 0.12);
  }

  .search-result > button:first-child {
    flex: 1;
    text-align: left;
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.18rem;
  }

  .result-title {
    font-size: 0.75rem;
    font-weight: 600;
  }

  .result-type {
    font-size: 0.62rem;
    color: rgba(148, 163, 184, 0.85);
  }

  .search-placeholder {
    font-size: 0.7rem;
    color: rgba(148, 163, 184, 0.75);
    text-align: center;
  }

  .draw-buttons {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .draw-buttons button {
    padding: 0.38rem 0.7rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(17, 24, 39, 0.8);
    color: inherit;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .draw-buttons button.selected {
    background: rgba(129, 140, 248, 0.35);
    border-color: rgba(129, 140, 248, 0.8);
  }

  .draw-buttons .ghost {
    background: transparent;
    border-color: rgba(148, 163, 184, 0.35);
  }

  .hint {
    font-size: 0.68rem;
    color: rgba(148, 163, 184, 0.8);
  }

  .annotation-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.35rem;
  }

  .annotation-list {
    max-height: 220px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .annotation-item {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.45rem 0.55rem;
    border-radius: 0.65rem;
    background: rgba(30, 41, 59, 0.6);
    border: 1px solid transparent;
  }

  .annotation-item.selected {
    border-color: rgba(129, 140, 248, 0.5);
    box-shadow: 0 0 0 1px rgba(129, 140, 248, 0.35);
  }

  .item-main {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }

  .item-label {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    text-align: left;
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
  }

  .item-label .text {
    font-size: 0.78rem;
    font-weight: 600;
  }

  .item-label .meta {
    font-size: 0.62rem;
    color: rgba(148, 163, 184, 0.75);
  }

  .item-actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .item-actions input[type='color'] {
    margin: 0;
    padding: 0;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
  }

  .item-input {
    width: 100%;
    padding: 0.38rem 0.5rem;
    border-radius: 0.55rem;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(15, 23, 42, 0.85);
    color: inherit;
  }

  .item-input:focus {
    outline: 2px solid rgba(129, 140, 248, 0.4);
    outline-offset: 1px;
  }

  .empty-state {
    font-size: 0.72rem;
    color: rgba(148, 163, 184, 0.8);
    text-align: center;
    padding: 0.5rem 0;
  }

  .annotations-notice {
    font-size: 0.68rem;
    color: rgba(129, 140, 248, 0.85);
  }

  .annotations-notice.errored {
    color: #fca5a5;
  }

  .annotations-notice.success {
    color: #86efac;
  }

  .data-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .data-actions .chip {
    flex: 1 1 160px;
    text-align: center;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .slider-group {
    flex: 1 1 180px;
  }

  .slider {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .slider input[type='range'] {
    flex: 1;
  }

  .slider-row {
    margin-top: 0.1rem;
  }

  .mode-row {
    display: flex;
    justify-content: center;
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.78rem;
  }

  .status-row p {
    margin: 0;
  }

  .status-row p.errored {
    color: #f87171;
  }

  .panel-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 0.35rem;
  }

  .footer-actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }

  .btn.footer {
    min-width: 90px;
  }

  .btn.ghost {
    background: transparent;
    border-color: rgba(148, 163, 184, 0.35);
  }

  .btn.ghost:hover {
    border-color: rgba(148, 163, 184, 0.65);
    background: rgba(148, 163, 184, 0.18);
  }

  .spinner {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 3px solid rgba(209, 213, 219, 0.25);
    border-top-color: rgba(129, 140, 248, 0.9);
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .divider {
    position: absolute;
    pointer-events: none;
    z-index: 30;
    display: none;
    border-style: dashed;
    border-color: rgba(255, 255, 255, 0.45);
  }

  .divider.vertical {
    border-left-width: 2px;
    top: 0;
    bottom: 0;
  }

  .divider.horizontal {
    border-top-width: 2px;
    left: 0;
    right: 0;
  }

  .handle {
    position: absolute;
    width: 16px;
    height: 16px;
    border-radius: 9999px;
    background: #f9fafb;
    border: 2px solid rgba(31, 41, 55, 0.75);
    box-shadow: 0 6px 15px rgba(15, 23, 42, 0.25);
    z-index: 35;
    display: none;
  }

  .handle.vertical {
    cursor: ew-resize;
  }

  .handle.horizontal {
    cursor: ns-resize;
  }

  .lens {
    position: absolute;
    pointer-events: none;
    border-radius: 9999px;
    border: 2px solid rgba(15, 23, 42, 0.7);
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.75) inset;
    z-index: 30;
    display: none;
  }

  .lens-handle {
    position: absolute;
    width: 16px;
    height: 16px;
    border-radius: 9999px;
    background: #f9fafb;
    border: 2px solid rgba(31, 41, 55, 0.75);
    box-shadow: 0 6px 15px rgba(15, 23, 42, 0.25);
    cursor: nwse-resize;
    z-index: 35;
    display: none;
  }

  @media (max-width: 680px) {
    .control-panel {
      border-radius: 0.8rem 0.8rem 0 0;
      padding: 0.4rem 0.45rem calc(env(safe-area-inset-bottom) + 0.25rem);
      gap: 0.4rem;
      max-height: none;
      overflow: visible;
    }

    .panel-header {
      align-items: flex-start;
    }

    .control-group {
      min-width: 100%;
      flex: 1 1 auto;
    }

    .btn {
      width: 100%;
      min-height: 2.1rem;
    }

    .slider-group {
      width: 100%;
      gap: 0.18rem;
    }

    .mode-buttons {
      width: 100%;
      justify-content: space-between;
    }

    .status-row {
      font-size: 0.75rem;
    }

    .slider span {
      min-width: 2.2rem;
      text-align: right;
    }

    .panel-footer {
      flex-direction: column;
      align-items: stretch;
      gap: 0.35rem;
    }
  }

  @media (min-width: 1024px) {
    .control-panel {
      max-height: min(60vh, 420px);
    }

    .map-tab {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 0.6rem;
      align-items: stretch;
    }

    .map-tab .control-row,
    .map-tab .slider-row {
      margin-top: 0;
    }

    .map-tab .mode-row,
    .map-tab .panel-footer {
      grid-column: 1 / -1;
    }

    .panel-footer {
      margin-top: 0;
    }

    .annotations-tab {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 0.6rem;
      align-items: start;
    }

    .annotation-section {
      height: 100%;
    }
  }
</style>
