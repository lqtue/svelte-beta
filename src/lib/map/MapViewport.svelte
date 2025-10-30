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
  import { inAndOut } from 'ol/easing';
  import { unByKey } from 'ol/Observable';
  import Feature from 'ol/Feature';
  import type { Geometry } from 'ol/geom';
  import Point from 'ol/geom/Point';
  import type { EventsKey } from 'ol/events';
  import type { Feature as GeoJsonFeature, Geometry as GeoJsonGeometry, GeoJsonObject } from 'geojson';
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
  import SearchOverlay from '$lib/viewer/components/SearchOverlay.svelte';
  import BasemapButtons from '$lib/viewer/components/BasemapButtons.svelte';
  import StoryPanel from '$lib/viewer/components/StoryPanel.svelte';
  import {
    ensureAnnotationDefaults,
    toAnnotationSummary,
    createAnnotationStyle,
    searchResultStyle
  } from '$lib/viewer/annotations';
  import type {
    ViewMode,
    DrawingMode,
    MapListItem,
    AnnotationSummary,
    SearchResult,
    PersistedAppState,
    StoryScene
  } from '$lib/viewer/types';

  const geoJsonFormat = new GeoJSON();
  const STORY_DELAY_MIN = 1;
  const STORY_DELAY_MAX = 60;
  const STORY_DEFAULT_DELAY = 5;

  let mapContainer: HTMLDivElement;
  let dividerXEl: HTMLDivElement;
  let dividerYEl: HTMLDivElement;
  let dividerHandleXEl: HTMLButtonElement;
  let dividerHandleYEl: HTMLButtonElement;
  let lensEl: HTMLDivElement;
  let lensHandleEl: HTMLButtonElement;

  export let initialMode: 'explore' | 'create' = 'explore';
  export let showWelcomeOverlay = true;

  let basemapSelection = 'g-streets';
  let mapTypeSelection = 'all';
  let selectedMapId = '';
  let statusMessage = 'Select a map from the list.';
  let mapList: MapListItem[] = [];
  let filteredMapList: MapListItem[] = [];
  let panelCollapsed = false;
  let statusError = false;
  let loading = false;
  let opacity = 0.8;
  let showWelcome = showWelcomeOverlay;
  let appMode: 'explore' | 'create' = initialMode;
  let modeMenuOpen = false;

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

  let storyScenes: StoryScene[] = [];
  let storyEditingIndex: number | null = null;
  let storyPresenting = false;
  let storyActiveSceneIndex = 0;
  let storyAutoplay = false;
  let storyAutoplayTimer: ReturnType<typeof setTimeout> | null = null;
  let createPanelTab: 'map' | 'annotations' | 'story' = 'map';

  $: visibleStoryScenes = storyScenes.filter((scene) => !scene.hidden);
  $: currentStoryScene = storyScenes[storyActiveSceneIndex] ?? null;
  $: currentStoryVisiblePosition = currentStoryScene
    ? visibleStoryScenes.findIndex((scene) => scene.id === currentStoryScene.id) + 1
    : 0;

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
  let settingsButtonEl: HTMLButtonElement | null = null;
  let modeMenuEl: HTMLDivElement | null = null;
  let handleDocumentClick: ((event: MouseEvent) => void) | null = null;

  $: basemapLabel = BASEMAP_DEFS.find((base) => base.key === basemapSelection)?.label ?? 'Basemap';
  $: selectedMapLabel = mapList.find((m) => m.id === selectedMapId)?.name ?? 'Select a map';
  $: opacityPercent = Math.round(opacity * 100);
  $: modeLabel = appMode === 'explore' ? 'Exploring' : 'Creating';

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
    if (storyScenes.length) {
      state.storyScenes = storyScenes;
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

      if (Array.isArray(saved.storyScenes)) {
        storyScenes = saved.storyScenes.map((scene, index) => normalizeStoryScene(scene, index));
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

  function createSceneId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `scene-${crypto.randomUUID()}`;
    }
    const random = Math.random().toString(36).slice(2, 8);
    return `scene-${Date.now().toString(36)}-${random}`;
  }

  function clampStoryDelay(value: number) {
    if (!Number.isFinite(value)) return STORY_DEFAULT_DELAY;
    return Math.max(STORY_DELAY_MIN, Math.min(STORY_DELAY_MAX, Math.round(value)));
  }

  function defaultAnnotationIds() {
    return annotations.filter((item) => !item.hidden).map((item) => item.id);
  }

  function clearStoryAutoplayTimer() {
    if (storyAutoplayTimer) {
      window.clearTimeout(storyAutoplayTimer);
      storyAutoplayTimer = null;
    }
  }

  function normalizeStoryScene(scene: Partial<StoryScene>, index = 0): StoryScene {
    let center: [number, number] = [
      Number.isFinite(INITIAL_CENTER[0]) ? (INITIAL_CENTER[0] as number) : 0,
      Number.isFinite(INITIAL_CENTER[1]) ? (INITIAL_CENTER[1] as number) : 0
    ];
    if (Array.isArray(scene.center) && scene.center.length === 2) {
      const parsed = scene.center.map((value) => Number(value)) as [number, number];
      if (parsed.every((value) => Number.isFinite(value))) {
        center = parsed;
      }
    } else if (scene.center && typeof scene.center === 'object' && 'x' in scene.center && 'y' in scene.center) {
      const x = Number((scene.center as { x: unknown }).x);
      const y = Number((scene.center as { y: unknown }).y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        center = [x, y];
      }
    }

    const validBasemap =
      typeof scene.basemap === 'string' && BASEMAP_DEFS.some((item) => item.key === scene.basemap)
        ? scene.basemap
        : basemapSelection;

    const view = map?.getView();
    const zoomFallback = typeof scene.zoom === 'number' ? scene.zoom : view?.getZoom() ?? 14;
    const rotationFallback = typeof scene.rotation === 'number' ? scene.rotation : 0;

    const viewModeCandidate = scene.viewMode;
    const viewModeValue: ViewMode =
      viewModeCandidate === 'side-x' || viewModeCandidate === 'side-y' || viewModeCandidate === 'spy'
        ? viewModeCandidate
        : 'overlay';

    const annotationsList = Array.isArray(scene.visibleAnnotations)
      ? scene.visibleAnnotations.map((value) => String(value))
      : defaultAnnotationIds();

    return {
      id: typeof scene.id === 'string' ? scene.id : createSceneId(),
      title:
        typeof scene.title === 'string' && scene.title.trim().length ? scene.title : `Scene ${Number(index) + 1}`,
      details: typeof scene.details === 'string' ? scene.details : '',
      delay: clampStoryDelay(typeof scene.delay === 'number' ? scene.delay : STORY_DEFAULT_DELAY),
      center,
      zoom: zoomFallback,
      rotation: rotationFallback,
      basemap: validBasemap,
      overlayId: typeof scene.overlayId === 'string' && scene.overlayId.length ? scene.overlayId : null,
      opacity: typeof scene.opacity === 'number' ? scene.opacity : opacity,
      viewMode: viewModeValue,
      sideRatio: typeof scene.sideRatio === 'number' ? scene.sideRatio : 0.5,
      lensRadius: typeof scene.lensRadius === 'number' ? scene.lensRadius : 150,
      visibleAnnotations: annotationsList,
      hidden: Boolean(scene.hidden)
    };
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

  function chooseAppMode(mode: 'explore' | 'create') {
    appMode = mode;
    if (mode === 'explore') {
      deactivateDrawing();
      storyEditingIndex = null;
      stopStoryPresentation();
    }
    if (mode === 'create') {
      createPanelTab = 'map';
    }
    showWelcome = false;
    modeMenuOpen = false;
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

  function clearOverlay() {
    if (warpedLayer && currentMapId) {
      try {
        warpedLayer.setMapOpacity(currentMapId, 0);
      } catch {
        /* no-op */
      }
    }
    currentMapId = null;
    loadedOverlayId = null;
    selectedMapId = '';
  }

  async function applyStoryScene(scene: StoryScene, options: { animate?: boolean } = {}) {
    const animate = options.animate ?? true;
    const nextBasemap =
      scene.basemap && BASEMAP_DEFS.some((item) => item.key === scene.basemap) ? scene.basemap : basemapSelection;
    if (nextBasemap !== basemapSelection) {
      basemapSelection = nextBasemap;
    }
    applyBasemap(nextBasemap);

    if (scene.overlayId) {
      if (scene.overlayId !== loadedOverlayId) {
        await loadOverlaySource(scene.overlayId);
      } else if (currentMapId && warpedLayer) {
        try {
          warpedLayer.setMapOpacity(currentMapId, scene.opacity);
        } catch {
          /* no-op */
        }
      }
      selectedMapId = scene.overlayId;
    } else {
      clearOverlay();
    }

    opacity = scene.opacity;
    if (currentMapId && warpedLayer) {
      try {
        warpedLayer.setMapOpacity(currentMapId, opacity);
      } catch {
        /* no-op */
      }
    }

    setViewMode(scene.viewMode ?? 'overlay');
    sideRatio = scene.sideRatio ?? 0.5;
    lensRadius = scene.lensRadius ?? 150;
    refreshDecorations();

    const view = map?.getView();
    if (view) {
      const rotation = scene.viewMode === 'overlay' ? scene.rotation ?? 0 : 0;
      if (animate) {
        view.animate({
          center: scene.center,
          zoom: scene.zoom,
          rotation,
          duration: 900,
          easing: inAndOut
        });
      } else {
        view.setCenter(scene.center);
        view.setZoom(scene.zoom);
        view.setRotation(rotation);
      }
    }

    if (annotationSource) {
      const visibleIds = new Set(scene.visibleAnnotations ?? []);
      annotationSource.getFeatures().forEach((feature) => {
        const id = String(feature.getId() ?? '');
        feature.set('hidden', !visibleIds.has(id));
      });
      updateAnnotationSummaries();
    }
    queueSaveState();
  }

  function findFirstVisibleStoryIndex(startIndex = 0) {
    if (!storyScenes.length) return null;
    for (let i = 0; i < storyScenes.length; i += 1) {
      const index = (startIndex + i) % storyScenes.length;
      if (!storyScenes[index].hidden) {
        return index;
      }
    }
    return null;
  }

  function findNextVisibleStoryIndex(currentIndex: number, direction: 1 | -1) {
    if (!storyScenes.length) return null;
    for (let step = 1; step <= storyScenes.length; step += 1) {
      const index = (currentIndex + direction * step + storyScenes.length) % storyScenes.length;
      if (!storyScenes[index].hidden) {
        return index;
      }
    }
    return null;
  }

  async function goToStoryScene(index: number, options: { animate?: boolean } = {}) {
    const scene = storyScenes[index];
    if (!scene) return;
    storyActiveSceneIndex = index;
    await applyStoryScene(scene, options);
    if (storyAutoplay) {
      scheduleNextStoryScene();
    }
  }

  async function startStoryPresentation(startIndex = 0) {
    const targetIndex = findFirstVisibleStoryIndex(startIndex);
    if (targetIndex === null) {
      setStatus('Nothing to present — capture or show a scene first.', false);
      return;
    }
    storyPresenting = true;
    storyAutoplay = false;
    clearStoryAutoplayTimer();
    await goToStoryScene(targetIndex, { animate: false });
  }

  function stopStoryPresentation() {
    storyPresenting = false;
    storyAutoplay = false;
    clearStoryAutoplayTimer();
  }

  function scheduleNextStoryScene() {
    clearStoryAutoplayTimer();
    if (!storyAutoplay) return;
    const nextIndex = findNextVisibleStoryIndex(storyActiveSceneIndex, 1);
    if (nextIndex === null || nextIndex === storyActiveSceneIndex) {
      storyAutoplay = false;
      return;
    }
    const scene = storyScenes[storyActiveSceneIndex];
    const delayMs = clampStoryDelay(scene?.delay ?? STORY_DEFAULT_DELAY) * 1000;
    storyAutoplayTimer = window.setTimeout(() => {
      goToStoryScene(nextIndex).catch((error) => console.error('Failed to advance story scene', error));
    }, delayMs);
  }

  async function nextStoryScene() {
    const nextIndex = findNextVisibleStoryIndex(storyActiveSceneIndex, 1);
    if (nextIndex !== null && nextIndex !== storyActiveSceneIndex) {
      await goToStoryScene(nextIndex);
    }
  }

  async function previousStoryScene() {
    const prevIndex = findNextVisibleStoryIndex(storyActiveSceneIndex, -1);
    if (prevIndex !== null && prevIndex !== storyActiveSceneIndex) {
      await goToStoryScene(prevIndex);
    }
  }

  function toggleStoryAutoplay() {
    storyAutoplay = !storyAutoplay;
    if (storyAutoplay) {
      scheduleNextStoryScene();
    } else {
      clearStoryAutoplayTimer();
    }
  }

  function handleStoryCapture(event: CustomEvent<{ title: string; details: string; delay: number; annotations: string[] }>) {
    if (!map) return;
    const view = map.getView();
    const center = (view.getCenter() as [number, number]) ?? INITIAL_CENTER;
    const zoom = view.getZoom() ?? 14;
    const rotation = view.getRotation() ?? 0;
    const { title: rawTitle, details, delay: rawDelay, annotations: selectedAnnotations } = event.detail;
    const scene: StoryScene = {
      id: storyEditingIndex !== null ? storyScenes[storyEditingIndex]?.id ?? createSceneId() : createSceneId(),
      title: rawTitle.trim() || `Scene ${storyScenes.length + 1}`,
      details,
      delay: clampStoryDelay(rawDelay),
      center,
      zoom,
      rotation,
      basemap: basemapSelection,
      overlayId: loadedOverlayId,
      opacity,
      viewMode,
      sideRatio,
      lensRadius,
      visibleAnnotations: selectedAnnotations.length ? selectedAnnotations : defaultAnnotationIds(),
      hidden: storyEditingIndex !== null ? storyScenes[storyEditingIndex]?.hidden ?? false : false
    };
    if (storyEditingIndex !== null && storyEditingIndex >= 0 && storyEditingIndex < storyScenes.length) {
      storyScenes = storyScenes.map((existing, index) => (index === storyEditingIndex ? scene : existing));
      storyEditingIndex = null;
      setAnnotationsNotice('Scene updated.', 'success');
    } else {
      storyScenes = [...storyScenes, scene];
      setAnnotationsNotice('Scene captured.', 'success');
    }
    queueSaveState();
  }

  async function handleStoryEdit(event: CustomEvent<{ index: number }>) {
    const { index } = event.detail;
    const scene = storyScenes[index];
    if (!scene) return;
    storyEditingIndex = index;
    await applyStoryScene(scene, { animate: false });
  }

  function handleStoryCancelEdit() {
    storyEditingIndex = null;
  }

  async function handleStoryApply(event: CustomEvent<{ index: number }>) {
    const { index } = event.detail;
    await goToStoryScene(index);
  }

  function handleStoryDuplicate(event: CustomEvent<{ index: number }>) {
    const { index } = event.detail;
    const scene = storyScenes[index];
    if (!scene) return;
    const copy: StoryScene = {
      ...scene,
      id: createSceneId(),
      title: `${scene.title} (Copy)`
    };
    const updated = [...storyScenes];
    updated.splice(index + 1, 0, copy);
    storyScenes = updated;
    queueSaveState();
    setAnnotationsNotice('Scene duplicated.', 'success');
  }

  function handleStoryToggleHidden(event: CustomEvent<{ index: number }>) {
    const { index } = event.detail;
    const scene = storyScenes[index];
    if (!scene) return;
    storyScenes = storyScenes.map((existing, idx) =>
      idx === index ? { ...existing, hidden: !existing.hidden } : existing
    );
    if (storyPresenting) {
      const current = storyScenes[index];
      if (current && current.hidden && storyActiveSceneIndex === index) {
        const nextIndex = findFirstVisibleStoryIndex(index);
        if (nextIndex === null) {
          stopStoryPresentation();
        } else {
          goToStoryScene(nextIndex, { animate: false }).catch((error) =>
            console.error('Failed to advance story scene', error)
          );
        }
      }
    }
    queueSaveState();
  }

  function handleStoryDelete(event: CustomEvent<{ index: number }>) {
    const { index } = event.detail;
    if (index < 0 || index >= storyScenes.length) return;
    const updated = [...storyScenes];
    updated.splice(index, 1);
    storyScenes = updated;
    if (storyEditingIndex !== null) {
      if (storyEditingIndex === index) {
        storyEditingIndex = null;
      } else if (storyEditingIndex > index) {
        storyEditingIndex -= 1;
      }
    }
    if (storyPresenting) {
      const visibleIndex = findFirstVisibleStoryIndex(storyActiveSceneIndex);
      if (visibleIndex === null) {
        stopStoryPresentation();
      } else {
        storyActiveSceneIndex = visibleIndex;
        goToStoryScene(visibleIndex, { animate: false }).catch((error) =>
          console.error('Failed to advance story scene', error)
        );
      }
    }
    queueSaveState();
  }

  function handleStoryMove(event: CustomEvent<{ from: number; to: number }>) {
    const { from, to } = event.detail;
    if (from === to || from < 0 || to < 0 || from >= storyScenes.length || to >= storyScenes.length) return;
    const updated = [...storyScenes];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
    storyScenes = updated;
    if (storyEditingIndex !== null) {
      if (storyEditingIndex === from) {
        storyEditingIndex = to;
      } else if (storyEditingIndex > from && storyEditingIndex <= to) {
        storyEditingIndex -= 1;
      } else if (storyEditingIndex < from && storyEditingIndex >= to) {
        storyEditingIndex += 1;
      }
    }
    if (storyPresenting) {
      if (storyActiveSceneIndex === from) {
        storyActiveSceneIndex = to;
      } else if (storyActiveSceneIndex > from && storyActiveSceneIndex <= to) {
        storyActiveSceneIndex -= 1;
      } else if (storyActiveSceneIndex < from && storyActiveSceneIndex >= to) {
        storyActiveSceneIndex += 1;
      }
    }
    queueSaveState();
  }

  function handleStoryPresent(event: CustomEvent<{ startIndex?: number }>) {
    const { startIndex = 0 } = event.detail;
    startStoryPresentation(startIndex).catch((error) => console.error('Failed to start presentation', error));
  }

  function handleStoryExport() {
    if (!storyScenes.length) return;
    const features = annotationSource?.getFeatures() ?? [];
    const payload = {
      scenes: storyScenes,
      features: features.length
        ? geoJsonFormat.writeFeaturesObject(features, {
            featureProjection: 'EPSG:3857',
            dataProjection: 'EPSG:4326'
          })
        : null
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const element = document.createElement('a');
    element.href = url;
    element.download = `story-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    element.click();
    URL.revokeObjectURL(url);
  }

  async function handleStoryLoad(event: CustomEvent<{ file: File }>) {
    const { file } = event.detail;
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { scenes?: Partial<StoryScene>[]; features?: unknown };
      if (!parsed || !Array.isArray(parsed.scenes)) {
        setAnnotationsNotice('Invalid story file.', 'error');
        return;
      }

      if (annotationSource && parsed.features) {
        try {
          const features = geoJsonFormat.readFeatures(parsed.features as GeoJsonObject, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
          }) as Feature<Geometry>[];
          annotationSource.clear();
          features.forEach((feature) => ensureAnnotationDefaults(feature));
          annotationSource.addFeatures(features);
          updateAnnotationSummaries();
        } catch (error) {
          console.warn('Unable to load story features', error);
          setAnnotationsNotice('Story loaded without annotations.', 'info');
        }
      }

      storyScenes = parsed.scenes.map((scene, index) => normalizeStoryScene(scene, index));
      storyEditingIndex = null;
      stopStoryPresentation();
      queueSaveState();
      setAnnotationsNotice('Story loaded.', 'success');
    } catch (error) {
      console.error('Failed to load story file', error);
      setAnnotationsNotice('Failed to load story file.', 'error');
    }
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

    handleDocumentClick = (event: MouseEvent) => {
      if (!modeMenuOpen) return;
      const target = event.target as Node;
      if (modeMenuEl && modeMenuEl.contains(target)) return;
      if (settingsButtonEl && settingsButtonEl.contains(target)) return;
      modeMenuOpen = false;
    };
    document.addEventListener('click', handleDocumentClick);

    window.addEventListener('pointermove', handlePointerDrag);
    window.addEventListener('pointerup', stopPointerDrag);
    window.addEventListener('pointercancel', stopPointerDrag);
  });

  onDestroy(() => {
    currentLoadAbort?.abort();
    searchAbortController?.abort();
    if (handleDocumentClick) {
      document.removeEventListener('click', handleDocumentClick);
      handleDocumentClick = null;
    }
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
    clearStoryAutoplayTimer();
  });

  $: applyBasemap(basemapSelection);
  $: refreshDecorations();
</script>

<div class="viewer">
  {#if showWelcome}
    <div class="welcome-overlay">
      <div class="welcome-card">
        <h1>Welcome to the viewer</h1>
        <p>
          This experience lets you explore historic maps alongside the modern web. Pick how you want to get started.
        </p>
        <div class="welcome-actions">
          <button type="button" class:selected={appMode === 'explore'} on:click={() => chooseAppMode('explore')}>
            Exploring
          </button>
          <button
            type="button"
            class:selected={appMode === 'create'}
            on:click={() => chooseAppMode('create')}
          >
            Creating
          </button>
        </div>
      </div>
    </div>
  {/if}

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

  <SearchOverlay
    bind:searchQuery
    {panelCollapsed}
    {searchResults}
    {searchLoading}
    {searchNotice}
    {searchNoticeType}
    {appMode}
    queueSearch={queueSearch}
    locateUser={locateUser}
    clearSearch={clearSearch}
    zoomToSearchResult={zoomToSearchResult}
    addSearchResultToAnnotations={addSearchResultToAnnotations}
    presenting={storyPresenting}
  />

  {#if storyPresenting && currentStoryScene}
    <div class="story-presenter">
      <div class="story-presenter-content">
        <div class="story-presenter-nav">
          <span class="counter">
            {currentStoryVisiblePosition || 1} / {Math.max(visibleStoryScenes.length, 1)}
          </span>
          <button
            type="button"
            class="chip ghost"
            on:click={previousStoryScene}
            disabled={visibleStoryScenes.length < 2}
          >
            ◀ Prev
          </button>
          <button
            type="button"
            class="chip"
            class:active={storyAutoplay}
            on:click={toggleStoryAutoplay}
          >
            {storyAutoplay ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            class="chip ghost"
            on:click={nextStoryScene}
            disabled={visibleStoryScenes.length < 2}
          >
            Next ▶
          </button>
          <button type="button" class="chip danger" on:click={stopStoryPresentation}>
            Exit
          </button>
        </div>
        <div class="story-presenter-body">
          <h2>{currentStoryScene.title}</h2>
          {#if currentStoryScene.details?.trim().length}
            <p>{currentStoryScene.details}</p>
          {:else}
            <p class="muted">No additional details for this scene.</p>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <div class="control-bar" class:presenting={storyPresenting}>
    <div class="control-panel" class:collapsed={panelCollapsed} class:disabled={searchLoading || storyPresenting}>
      <div class="panel-header">
        <div class="panel-summary">
          <span class="panel-title">{selectedMapLabel}</span>
          <span class="panel-sub">{basemapLabel} · {opacityPercent}% · {modeLabel}</span>
        </div>
        <div class="panel-actions">
          <div class="mode-control">
            <button
              bind:this={settingsButtonEl}
              type="button"
              class="settings-button"
              on:click={() => (modeMenuOpen = !modeMenuOpen)}
              aria-haspopup="true"
              aria-expanded={modeMenuOpen}
            >
              Settings
            </button>
            {#if modeMenuOpen}
              <div bind:this={modeMenuEl} class="mode-menu" role="menu">
                <p class="menu-title">Choose mode</p>
                <div class="menu-options">
                  <button
                    type="button"
                    class:selected={appMode === 'explore'}
                    on:click={() => chooseAppMode('explore')}
                    role="menuitem"
                  >
                    Exploring
                  </button>
                  <button
                    type="button"
                    class:selected={appMode === 'create'}
                    on:click={() => chooseAppMode('create')}
                    role="menuitem"
                  >
                    Creating
                  </button>
                </div>
              </div>
            {/if}
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
      </div>

      {#if panelCollapsed}
        <div class="collapsed-content">
          <div class="collapsed-slider">
            <span class="control-label">Opacity</span>
            <div class="slider">
              <input type="range" min="0" max="1" step="0.05" bind:value={opacity} on:input={handleOpacityInput} />
              <span>{opacityPercent}%</span>
            </div>
          </div>
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
        <div class="panel-content">
          {#if appMode === 'create'}
            <div class="create-tabs" role="tablist" aria-label="Create mode sections">
              <button
                type="button"
                role="tab"
                class:selected={createPanelTab === 'map'}
                aria-selected={createPanelTab === 'map'}
                on:click={() => (createPanelTab = 'map')}
              >
                Map
              </button>
              <button
                type="button"
                role="tab"
                class:selected={createPanelTab === 'annotations'}
                aria-selected={createPanelTab === 'annotations'}
                on:click={() => (createPanelTab = 'annotations')}
              >
                Annotations
              </button>
              <button
                type="button"
                role="tab"
                class:selected={createPanelTab === 'story'}
                aria-selected={createPanelTab === 'story'}
                on:click={() => (createPanelTab = 'story')}
              >
                Storytelling
              </button>
            </div>
          {/if}

          {#if appMode !== 'create' || createPanelTab === 'map'}
            <section class="control-section">
              <p class="section-title">Base map</p>
              <div class="section-body">
                <div class="control-group">
                  <BasemapButtons
                    basemaps={BASEMAP_DEFS}
                    selected={basemapSelection}
                    on:select={(event) => {
                      basemapSelection = event.detail;
                      queueSaveState();
                    }}
                  />
                </div>
              </div>
            </section>

            <section class="control-section">
              <p class="section-title">Overlay map</p>
              <div class="section-body overlay-grid">
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
            </section>

            <section class="control-section">
              <p class="section-title">View Mode &amp; Opacity</p>
              <div class="view-grid">
                <div class="slider-group">
                  <span class="control-label">Opacity</span>
                  <div class="slider">
                    <input type="range" min="0" max="1" step="0.05" bind:value={opacity} on:input={handleOpacityInput} />
                    <span>{opacityPercent}%</span>
                  </div>
                </div>
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
            </section>
          {/if}

          {#if appMode === 'create' && createPanelTab === 'annotations'}
              <section class="control-section">
                <p class="section-title">Draw</p>
                <div class="annotation-section">
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
              </section>

              <section class="control-section">
                <p class="section-title">Annotations</p>
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
              </section>

              <section class="control-section">
                <p class="section-title">Data</p>
                <div class="annotation-section">
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
              </section>
          {/if}

          {#if appMode === 'create' && createPanelTab === 'story'}
              <StoryPanel
                scenes={storyScenes}
                annotations={annotations}
                editingIndex={storyEditingIndex}
                editingScene={storyEditingIndex !== null ? storyScenes[storyEditingIndex] : null}
                on:capture={handleStoryCapture}
                on:cancelEdit={handleStoryCancelEdit}
                on:edit={handleStoryEdit}
                on:apply={handleStoryApply}
                on:duplicate={handleStoryDuplicate}
                on:toggleHidden={handleStoryToggleHidden}
                on:delete={handleStoryDelete}
                on:move={handleStoryMove}
                on:present={handleStoryPresent}
                on:export={handleStoryExport}
                on:load={handleStoryLoad}
              />
          {/if}

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
      {/if}
    </div>
  </div>
</div>

<style>
  .viewer {
    --layout-max-width: min(960px, calc(100vw - 2rem));
    --layout-max-height: min(85vh, calc(100vh - 4rem));
    position: relative;
    width: 100%;
    min-height: 100vh;
    min-height: 100dvh;
    height: 100%;
    background: #0f172a;
    color: #f9fafb;
    font-family: system-ui, sans-serif;
    overflow: hidden;
  }

  .welcome-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background: rgba(15, 23, 42, 0.92);
    backdrop-filter: blur(10px);
    z-index: 60;
  }

  .welcome-card {
    max-width: 420px;
    width: 100%;
    background: rgba(17, 24, 39, 0.94);
    border-radius: 1rem;
    border: 1px solid rgba(148, 163, 184, 0.35);
    padding: 1.75rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    text-align: left;
    box-shadow: 0 18px 38px rgba(2, 6, 23, 0.6);
  }

  .welcome-card h1 {
    font-size: 1.4rem;
    font-weight: 600;
    margin: 0;
  }

  .welcome-card p {
    font-size: 0.95rem;
    line-height: 1.5;
    margin: 0;
    color: rgba(226, 232, 240, 0.9);
  }

  .welcome-actions {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .welcome-actions button {
    flex: 1 1 160px;
    padding: 0.65rem 0.85rem;
    border-radius: 0.75rem;
    border: 1px solid rgba(129, 140, 248, 0.4);
    background: rgba(30, 41, 59, 0.9);
    color: inherit;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
  }

  .welcome-actions button.selected {
    background: rgba(129, 140, 248, 0.3);
    border-color: rgba(129, 140, 248, 0.85);
  }

  .welcome-actions button:hover {
    background: rgba(99, 102, 241, 0.28);
    border-color: rgba(129, 140, 248, 0.9);
    transform: translateY(-1px);
  }

  .map-wrapper {
    position: absolute;
    inset: 0;
  }

  .map {
    position: absolute;
    inset: 0;
  }

  .story-presenter {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 2.5rem 1.25rem;
    pointer-events: none;
    z-index: 50;
    background: linear-gradient(180deg, rgba(15, 23, 42, 0) 40%, rgba(15, 23, 42, 0.65) 100%);
  }

  .story-presenter-content {
    width: min(var(--layout-max-width), 100%);
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    background: rgba(15, 23, 42, 0.92);
    border-radius: 0.85rem;
    border: 1px solid rgba(148, 163, 184, 0.35);
    padding: 1rem 1.1rem;
    box-shadow: 0 24px 48px rgba(2, 6, 23, 0.55);
    pointer-events: auto;
  }

  .story-presenter-nav {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .story-presenter-nav .chip {
    min-width: 90px;
  }

  .story-presenter-nav .chip:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .story-presenter-nav .chip.active {
    background: rgba(99, 102, 241, 0.65);
    border-color: rgba(129, 140, 248, 0.95);
    box-shadow: 0 12px 26px rgba(76, 29, 149, 0.35);
  }

  .story-presenter-nav .counter {
    margin-right: auto;
    font-size: 0.68rem;
    color: rgba(203, 213, 225, 0.8);
  }

  .story-presenter-body h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
  }

  .story-presenter-body p {
    margin: 0.35rem 0 0;
    font-size: 0.82rem;
    line-height: 1.5;
    color: rgba(226, 232, 240, 0.9);
    white-space: pre-wrap;
  }

  .story-presenter-body p.muted {
    color: rgba(148, 163, 184, 0.75);
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
    z-index: 40;
  }

  .control-bar.presenting {
    opacity: 0;
    pointer-events: none;
  }

  .control-panel {
    width: min(var(--layout-max-width), 100%);
    background: rgba(17, 24, 39, 0.92);
    border-radius: 0.85rem 0.85rem 0.5rem 0.5rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
    padding: 0.55rem 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    pointer-events: auto;
    backdrop-filter: blur(16px);
    max-height: var(--layout-max-height);
    overflow-y: auto;
  }

  .control-panel.disabled {
    pointer-events: none;
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

  .panel-actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .mode-control {
    position: relative;
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

  .settings-button {
    border: 1px solid rgba(148, 163, 184, 0.35);
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.8);
    color: inherit;
    padding: 0.35rem 0.75rem;
    font-size: 0.7rem;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .settings-button:hover {
    background: rgba(129, 140, 248, 0.35);
    border-color: rgba(129, 140, 248, 0.75);
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
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .collapsed-slider {
    display: flex;
    flex-direction: column;
    gap: 0.22rem;
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

  .mode-menu {
    position: absolute;
    top: calc(100% + 0.4rem);
    right: 0;
    min-width: 180px;
    padding: 0.7rem;
    border-radius: 0.75rem;
    background: rgba(17, 24, 39, 0.96);
    border: 1px solid rgba(129, 140, 248, 0.35);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
    z-index: 5;
  }

  .menu-title {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(203, 213, 225, 0.85);
    margin-bottom: 0.45rem;
  }

  .menu-options {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .menu-options button {
    padding: 0.4rem 0.65rem;
    border-radius: 0.55rem;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(15, 23, 42, 0.75);
    color: inherit;
    font-size: 0.72rem;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .menu-options button.selected {
    background: rgba(129, 140, 248, 0.35);
    border-color: rgba(129, 140, 248, 0.85);
  }

  .menu-options button:hover {
    background: rgba(99, 102, 241, 0.25);
    border-color: rgba(129, 140, 248, 0.75);
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

  .panel-content {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 0.6rem;
  }

  .control-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: rgba(15, 23, 42, 0.55);
    border: 1px solid rgba(129, 140, 248, 0.12);
    border-radius: 0.7rem;
    padding: 0.6rem 0.75rem;
  }

  .create-tabs {
    display: flex;
    gap: 0.45rem;
    background: rgba(15, 23, 42, 0.65);
    border: 1px solid rgba(129, 140, 248, 0.28);
    border-radius: 0.85rem;
    padding: 0.45rem;
    box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.35);
  }

  .create-tabs button {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0.55rem 0.85rem;
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(30, 41, 59, 0.65);
    color: rgba(226, 232, 240, 0.92);
    font-weight: 600;
    font-size: 0.74rem;
    letter-spacing: 0.03em;
    cursor: pointer;
    transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .create-tabs button:hover {
    background: rgba(67, 56, 202, 0.35);
    border-color: rgba(129, 140, 248, 0.75);
    box-shadow: 0 10px 24px rgba(67, 56, 202, 0.25);
    transform: translateY(-1px);
  }

  .create-tabs button.selected {
    background: rgba(99, 102, 241, 0.55);
    border-color: rgba(129, 140, 248, 0.95);
    color: #f9fafb;
    box-shadow: 0 16px 28px rgba(79, 70, 229, 0.35);
    transform: translateY(-1px);
  }

  .create-tabs button:focus-visible {
    outline: 2px solid rgba(129, 140, 248, 0.9);
    outline-offset: 3px;
  }

  .section-title {
    margin: 0;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(203, 213, 225, 0.9);
  }

  .section-body {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .overlay-grid {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .view-grid {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    align-items: center;
  }

  .view-grid .mode-buttons {
    justify-content: flex-start;
  }

  .annotation-section {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  :global(.chip) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0.5rem 1rem;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.4);
    background: rgba(30, 41, 59, 0.82);
    color: #f8fafc;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    cursor: pointer;
    transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }

  :global(.chip:hover:not(:disabled)) {
    background: rgba(79, 70, 229, 0.58);
    border-color: rgba(129, 140, 248, 0.9);
    box-shadow: 0 10px 22px rgba(30, 64, 175, 0.22);
    transform: translateY(-1px);
  }

  :global(.chip:focus-visible) {
    outline: 2px solid rgba(129, 140, 248, 0.8);
    outline-offset: 2px;
  }

  :global(.chip:disabled) {
    opacity: 0.55;
    cursor: not-allowed;
    box-shadow: none;
    transform: none;
  }

  :global(.chip.ghost) {
    background: rgba(15, 23, 42, 0.65);
    border-color: rgba(148, 163, 184, 0.45);
    color: rgba(226, 232, 240, 0.92);
  }

  :global(.chip.ghost:hover:not(:disabled)) {
    background: rgba(30, 41, 59, 0.9);
    border-color: rgba(191, 219, 254, 0.75);
  }

  :global(.chip.danger) {
    background: rgba(239, 68, 68, 0.22);
    border-color: rgba(252, 165, 165, 0.6);
    color: #fee2e2;
  }

  :global(.chip.danger:hover:not(:disabled)) {
    background: rgba(248, 113, 113, 0.35);
    border-color: rgba(248, 113, 113, 0.85);
  }

  :global(.chip.add) {
    background: rgba(34, 197, 94, 0.25);
    border-color: rgba(134, 239, 172, 0.55);
    color: #bbf7d0;
  }

  :global(.chip.add:hover:not(:disabled)) {
    background: rgba(34, 197, 94, 0.38);
    border-color: rgba(134, 239, 172, 0.85);
  }

  :global(.chip-icon) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    opacity: 0.85;
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
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
  }

  .slider {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .slider input[type='range'] {
    flex: 1;
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
    background: rgba(15, 23, 42, 0.55);
    border: 1px solid rgba(129, 140, 248, 0.12);
    border-radius: 0.7rem;
    padding: 0.6rem 0.75rem;
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
    z-index: 12;
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
    z-index: 18;
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
    z-index: 12;
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
    z-index: 18;
    display: none;
  }

  @media (max-width: 680px) {
    .control-panel {
      border-radius: 0.8rem 0.8rem 0 0;
      padding: 0.4rem 0.45rem calc(env(safe-area-inset-bottom) + 0.25rem);
      gap: 0.4rem;
      max-height: min(
        var(--layout-max-height),
        calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 1.5rem)
      );
      overflow-y: auto;
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
      max-height: min(var(--layout-max-height), 70vh);
    }

    .panel-content {
      gap: 0.9rem;
    }

    .view-grid {
      grid-template-columns: minmax(240px, 1fr) minmax(220px, auto);
    }

    .panel-footer {
      flex-direction: row;
    }
  }
</style>
