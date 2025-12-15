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
import { fromLonLat, toLonLat } from 'ol/proj';
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
  import {
    createAnnotationHistoryStore,
    captureFeatureSnapshot as snapshotFeature,
    restoreFeatureFromSnapshot as restoreSnapshot,
    type FeatureSnapshot,
    type HistoryEntry,
    type AnnotationField
  } from '$lib/map/stores/annotationHistory';
  import { createAnnotationStateStore } from '$lib/map/stores/annotationState';
  import { setAnnotationContext } from '$lib/map/context/annotationContext';

  const geoJsonFormat = new GeoJSON();
  const STORY_DELAY_MIN = 1;
  const STORY_DELAY_MAX = 60;
  const STORY_DEFAULT_DELAY = 5;
  const HISTORY_LIMIT = 100;

  let mapContainer: HTMLDivElement;
  let dividerXEl: HTMLDivElement;
  let dividerYEl: HTMLDivElement;
  let dividerHandleXEl: HTMLButtonElement;
  let dividerHandleYEl: HTMLButtonElement;
  let lensEl: HTMLDivElement;
  let lensHandleEl: HTMLButtonElement;

  export let initialMode: 'explore' | 'create' = 'explore';
  export let showWelcomeOverlay = true;

  let selectedMap: MapListItem | null = null;
  let mapTypes: string[] = [];
  let viewerFeaturedMaps: MapListItem[] = [];
  let viewerAllMaps: MapListItem[] = [];
  let metadataOverlayOpen = false;
  let searchOverlayOpen = false;
  let creatorLeftCollapsed = false;
  let creatorRightCollapsed = false;
  let toolbarSettingsOpen = false;

  let basemapSelection = 'g-streets';
  let mapTypeSelection = 'all';
  let selectedMapId = '';
  let statusMessage = 'Select a map from the list.';
  let mapList: MapListItem[] = [];
  let filteredMapList: MapListItem[] = [];
  let statusError = false;
  let loading = false;
  let opacity = 0.8;
  let showWelcome = showWelcomeOverlay;
  let appMode: 'explore' | 'create' = initialMode;
  let isMobile = false;
  let isCreatorCompact = false;
  let isCreatorNarrow = false;
  let activeViewerSection: 'map' | 'control' | 'story' | 'info' = 'map';
  let viewerPanelOpen = false;
  let creatorRightPane: 'annotations' | 'story' = 'annotations';
  let drawMenuOpen = false;
  let openAnnotationMenu: string | null = null;
  let openStoryMenu: string | null = null;
  let captureModalOpen = false;
  let captureForm = { title: '', details: '', delay: STORY_DEFAULT_DELAY, annotations: [] as string[] };
  let shareCopied = false;
  let shareResetTimer: ReturnType<typeof setTimeout> | null = null;
  let editingEnabled = true;
  let workspaceStyle: string | undefined;
  const annotationHistory = createAnnotationHistoryStore(HISTORY_LIMIT);
  const annotationState = createAnnotationStateStore();
  setAnnotationContext({ history: annotationHistory, state: annotationState });
  let suppressHistory = false;
  let pendingGeometrySnapshots: globalThis.Map<string, FeatureSnapshot> = new globalThis.Map();

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
  let metadataOverlayEl: HTMLDivElement | null = null;
  let searchOverlayEl: HTMLDivElement | null = null;
  let searchInputEl: HTMLInputElement | null = null;

  const mapCache: Record<string, { mapIds: string[] }> = {};
  let currentMapId: string | null = null;
  let loadedOverlayId: string | null = null;
  let currentLoadAbort: AbortController | null = null;

  let dragging = { sideX: false, sideY: false, lensR: false };
  let viewMode: ViewMode = 'overlay';
  let sideRatio = 0.5;
  let lensRadius = 150;
  let responsiveCleanup: (() => void) | null = null;
  let pendingResizeHandle: number | null = null;
  let keydownHandler: ((event: KeyboardEvent) => void) | null = null;

  $: basemapLabel = BASEMAP_DEFS.find((base) => base.key === basemapSelection)?.label ?? 'Basemap';
  $: opacityPercent = Math.round(opacity * 100);
  $: modeLabel = appMode === 'explore' ? 'Exploring' : 'Creating';
  $: selectedMap = mapList.find((m) => m.id === selectedMapId) ?? null;
  $: mapTypes = Array.from(new Set(mapList.map((item) => item.type || 'Uncategorized')))
    .filter((type) => type && type.trim().length)
    .sort((a, b) => a.localeCompare(b));
  $: viewerFeaturedMaps = (() => {
    const featured = mapList.filter((item) => item.isFeatured);
    const source = featured.length ? featured : mapList;
    return source.slice(0, 4);
  })();
  $: viewerAllMaps = filteredMapList;
  $: if (creatorRightPane !== 'annotations') openAnnotationMenu = null;
  $: if (creatorRightPane !== 'story') openStoryMenu = null;
  $: canUndo = $annotationHistory.history.length > 0;
  $: canRedo = $annotationHistory.future.length > 0;
  $: annotations = $annotationState.list;
  $: selectedAnnotationId = $annotationState.selectedId;
  $: if (showWelcome) metadataOverlayOpen = false;
  $: if (!selectedMap) metadataOverlayOpen = false;
  $: if (showWelcome) searchOverlayOpen = false;
  $: if (appMode !== 'create') {
    creatorLeftCollapsed = false;
    creatorRightCollapsed = false;
    searchOverlayOpen = false;
    toolbarSettingsOpen = false;
  }
  $: if (searchOverlayOpen && searchInputEl) {
    queueMicrotask(() => searchInputEl?.focus());
  }
  $: if (metadataOverlayOpen && metadataOverlayEl) {
    metadataOverlayEl.focus();
  }
  $: workspaceStyle =
    !isMobile && appMode === 'create'
      ? `grid-template-columns: ${panelColumnSize(creatorLeftCollapsed)} minmax(0, ${mapColumnFraction(
          creatorLeftCollapsed,
          creatorRightCollapsed
        )}fr) ${panelColumnSize(creatorRightCollapsed)}; gap: ${
          isCreatorNarrow ? '1rem' : isCreatorCompact ? '1.1rem' : '1.2rem'
        }; padding: ${isCreatorNarrow ? '1rem' : isCreatorCompact ? '1.2rem' : '1.4rem'};`
      : undefined;

  $: if (map) {
    appMode;
    creatorLeftCollapsed;
    creatorRightCollapsed;
    showWelcome;
    viewerPanelOpen;
    isMobile;
    scheduleMapResize();
  }

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
    annotationState.setList(list);
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
    const searchParams = new URLSearchParams(window.location.search);
    const shareParamKeys = ['map', 'view', 'lat', 'lon', 'zoom', 'rotation', 'basemap'];
    const hasSharedParams = shareParamKeys.some((key) => searchParams.has(key));
    let sharedStateApplied = false;
    const raw = window.localStorage.getItem(APP_STATE_KEY);
    if (!raw) {
      if (hasSharedParams) {
        const applied = await applySharedParams(searchParams);
        if (applied) {
          refreshDecorations();
          sharedStateApplied = true;
        }
      }
      stateLoaded = true;
      if (sharedStateApplied) queueSaveState();
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

      if (hasSharedParams) {
        const appliedShareState = await applySharedParams(searchParams);
        if (appliedShareState) {
          refreshDecorations();
          sharedStateApplied = true;
        }
      }
    } catch (error) {
      console.warn('Failed to load saved viewer state', error);
    } finally {
      stateLoaded = true;
      if (sharedStateApplied) queueSaveState();
      scheduleMapResize();
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
    if (existing) {
      annotationSource.removeFeature(existing);
    }
    const restored = restoreFeatureFromSnapshot(snapshot);
    annotationSource.addFeature(restored);
    return restored;
  }

  function removeFeatureById(id: string): Feature<Geometry> | null {
    if (!annotationSource) return null;
    const feature = annotationSource.getFeatureById(id) as Feature<Geometry> | null;
    if (feature) {
      annotationSource.removeFeature(feature);
    }
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
    const snapshots = features.map((feature) => captureFeatureSnapshot(feature));
    pushHistoryEntry({ kind: 'annotation-clear', snapshots });
  }

  function recordAnnotationBulkAdd(features: Feature<Geometry>[]) {
    if (!features.length) return;
    const snapshots = features.map((feature) => captureFeatureSnapshot(feature));
    pushHistoryEntry({ kind: 'annotation-bulk-add', snapshots });
  }

  function recordAnnotationGeometryChange(before: FeatureSnapshot, after: FeatureSnapshot) {
    pushHistoryEntry({ kind: 'annotation-geometry', before, after });
  }

  function applyHistoryEntry(entry: HistoryEntry, direction: 'undo' | 'redo') {
    switch (entry.kind) {
      case 'annotation-add': {
        if (direction === 'undo') {
          removeFeatureById(entry.snapshot.id);
          annotationState.clearSelectionIfMatches(entry.snapshot.id);
        } else {
          const added = addSnapshotToSource(entry.snapshot);
          if (added) {
            annotationState.setSelected(entry.snapshot.id);
          }
        }
        break;
      }
      case 'annotation-delete': {
        if (direction === 'undo') {
          const added = addSnapshotToSource(entry.snapshot);
          if (added) {
            annotationState.setSelected(entry.snapshot.id);
          }
        } else {
          removeFeatureById(entry.snapshot.id);
          annotationState.clearSelectionIfMatches(entry.snapshot.id);
        }
        break;
      }
      case 'annotation-update': {
        const feature = annotationSource?.getFeatureById(entry.id) as Feature<Geometry> | null;
        if (!feature) break;
        entry.changes.forEach((change) => {
          const value = direction === 'undo' ? change.before : change.after;
          if (change.field === 'hidden') {
            feature.set('hidden', Boolean(value));
          } else {
            feature.set(change.field, value);
          }
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
      case 'annotation-clear': {
        if (direction === 'undo') {
          annotationSource?.clear();
          entry.snapshots.forEach((snapshot) => addSnapshotToSource(snapshot));
        } else {
          annotationSource?.clear();
          annotationState.clearSelection();
        }
        break;
      }
      case 'annotation-bulk-add': {
        if (direction === 'undo') {
          entry.snapshots.forEach((snapshot) => {
            removeFeatureById(snapshot.id);
            annotationState.clearSelectionIfMatches(snapshot.id);
          });
        } else {
          entry.snapshots.forEach((snapshot) => addSnapshotToSource(snapshot));
        }
        break;
      }
      default:
        break;
    }
    updateAnnotationSummaries();
  }

  function undoLastAction() {
    const entry = annotationHistory.undo();
    if (!entry) return;
    suppressHistory = true;
    applyHistoryEntry(entry, 'undo');
    suppressHistory = false;
    setAnnotationsNotice('Undid last action.', 'info');
    queueSaveState();
  }

  function redoLastAction() {
    const entry = annotationHistory.redo();
    if (!entry) return;
    suppressHistory = true;
    applyHistoryEntry(entry, 'redo');
    suppressHistory = false;
    setAnnotationsNotice('Redid last action.', 'info');
    queueSaveState();
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
      const summaryIndex = header.indexOf('summary');
      const descriptionIndex =
        header.indexOf('description') !== -1
          ? header.indexOf('description')
          : header.indexOf('details') !== -1
            ? header.indexOf('details')
            : header.indexOf('detail');
      const thumbnailIndex =
        header.indexOf('thumbnail') !== -1
          ? header.indexOf('thumbnail')
          : header.indexOf('image');
      const featuredIndex =
        header.indexOf('featured') !== -1
          ? header.indexOf('featured')
          : header.indexOf('is_featured');
      if (nameIndex === -1 || idIndex === -1) throw new Error("Missing 'name' or 'id' column.");
      const items: MapListItem[] = lines
        .map((line) => line.match(/(".*?"|[^",\r\n]+)(?=\s*,|\s*$)/g) || [])
        .map((cols) => {
          const name = (cols[nameIndex] || '').replace(/"/g, '').trim();
          const id = (cols[idIndex] || '').replace(/"/g, '').trim();
          const type =
            typeIndex > -1 ? (cols[typeIndex] || '').replace(/"/g, '').trim() || 'Uncategorized' : 'Uncategorized';
          const summary = summaryIndex > -1 ? (cols[summaryIndex] || '').replace(/"/g, '').trim() : '';
          const description =
            descriptionIndex > -1 ? (cols[descriptionIndex] || '').replace(/"/g, '').trim() : '';
          const thumbnail =
            thumbnailIndex > -1 ? (cols[thumbnailIndex] || '').replace(/"/g, '').trim() : '';
          const featuredValue = featuredIndex > -1 ? (cols[featuredIndex] || '').replace(/"/g, '').trim() : '';
          const isFeatured = /^y(es)?$/i.test(featuredValue) || /^true$/i.test(featuredValue) || featuredValue === '1';
          if (!name || !id) return null;
          const entry: MapListItem = { id, name, type };
          if (summary) entry.summary = summary;
          if (description) entry.description = description;
          if (thumbnail) entry.thumbnail = thumbnail;
          if (isFeatured) entry.isFeatured = true;
          return entry;
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

  async function selectMapById(mapId: string) {
    const value = mapId?.trim() ?? '';
    selectedMapId = value;
    if (value) {
      await loadOverlaySource(value);
    } else {
      clearOverlay();
      queueSaveState();
    }
  }

  function handleSelectChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    void selectMapById(value);
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
    if (isMobile) {
      mode = 'explore';
    }
    appMode = mode;
    viewerPanelOpen = mode === 'create' ? viewerPanelOpen : false;
    if (mode === 'explore') {
      deactivateDrawing();
      storyEditingIndex = null;
      stopStoryPresentation();
    } else {
      drawMenuOpen = false;
      creatorRightPane = 'annotations';
    }
    showWelcome = false;
    scheduleMapResize();
  }

  function handleModeClick(mode: ViewMode) {
    setViewMode(mode);
    queueSaveState();
    scheduleMapResize();
  }

  function toggleAppMode() {
    const next = appMode === 'explore' ? 'create' : 'explore';
    chooseAppMode(next);
  }

  function scheduleMapResize() {
    if (!map) return;
    if (pendingResizeHandle !== null) {
      cancelAnimationFrame(pendingResizeHandle);
    }
    pendingResizeHandle = requestAnimationFrame(() => {
      pendingResizeHandle = null;
      map?.updateSize();
      refreshDecorations();
    });
  }

  function panelColumnSize(collapsed: boolean): string {
    if (collapsed) return '0px';
    if (isCreatorNarrow) return 'minmax(200px, 0.24fr)';
    if (isCreatorCompact) return 'minmax(220px, 0.25fr)';
    return 'minmax(260px, 0.25fr)';
  }

  function mapColumnFraction(leftCollapsed: boolean, rightCollapsed: boolean): string {
    const bothCollapsed = 1;
    const singleCollapsed = isCreatorNarrow ? 0.82 : isCreatorCompact ? 0.78 : 0.75;
    const bothOpen = isCreatorNarrow ? 0.56 : isCreatorCompact ? 0.53 : 0.5;
    if (leftCollapsed && rightCollapsed) return bothCollapsed.toString();
    if (leftCollapsed || rightCollapsed) return singleCollapsed.toString();
    return bothOpen.toString();
  }

  function handleClearState() {
    clearSavedState();
  }

  function handleViewerTabClick(section: 'map' | 'control' | 'story' | 'info') {
    if (activeViewerSection === section) {
      viewerPanelOpen = !viewerPanelOpen;
    } else {
      activeViewerSection = section;
      viewerPanelOpen = true;
    }
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
      annotationState.setSelected(String(feature.getId()));
      updateAnnotationSummaries();
      recordAnnotationAdd(feature);
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

  function toggleEditing() {
    if (!map || !modifyInteraction) return;
    editingEnabled = !editingEnabled;
    const interactions = map.getInteractions();
    const hasModify = interactions.getArray().includes(modifyInteraction);
    if (editingEnabled) {
      if (!hasModify) {
        map.addInteraction(modifyInteraction);
      }
    } else if (hasModify) {
      map.removeInteraction(modifyInteraction);
    }
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
    const previous = feature.get('label') ?? '';
    if (previous === label) return;
    feature.set('label', label);
    recordAnnotationFieldChange(feature, 'label', previous, label);
    updateAnnotationSummaries();
    queueSaveState();
  }

  function updateAnnotationDetails(id: string, details: string) {
    const feature = getAnnotationFeature(id);
    if (!feature) return;
    const previous = feature.get('details') ?? '';
    if (previous === details) return;
    feature.set('details', details);
    recordAnnotationFieldChange(feature, 'details', previous, details);
    updateAnnotationSummaries();
    queueSaveState();
  }

  function updateAnnotationColor(id: string, color: string) {
    const feature = getAnnotationFeature(id);
    if (!feature) return;
    const previous = feature.get('color') ?? '';
    if (previous === color) return;
    feature.set('color', color);
    recordAnnotationFieldChange(feature, 'color', previous, color);
    updateAnnotationSummaries();
    queueSaveState();
  }

  function toggleAnnotationVisibility(id: string) {
    const feature = getAnnotationFeature(id);
    if (!feature) return;
    const hidden = Boolean(feature.get('hidden'));
    feature.set('hidden', !hidden);
    recordAnnotationFieldChange(feature, 'hidden', hidden, !hidden);
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
    recordAnnotationDelete(feature);
    annotationSource.removeFeature(feature);
    annotationState.clearSelectionIfMatches(id);
    updateAnnotationSummaries();
    queueSaveState();
  }

  function clearAnnotations() {
    if (!annotationSource) return;
    const features = annotationSource.getFeatures();
    recordAnnotationClear(features);
    annotationSource.clear();
    annotationState.reset();
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

  function applyStorySceneByIndex(index: number) {
    handleStoryApply({ detail: { index } } as CustomEvent<{ index: number }>);
  }

  function duplicateStoryScene(index: number) {
    handleStoryDuplicate({ detail: { index } } as CustomEvent<{ index: number }>);
  }

  function toggleStorySceneVisibility(index: number) {
    handleStoryToggleHidden({ detail: { index } } as CustomEvent<{ index: number }>);
  }

  function deleteStoryScene(index: number) {
    handleStoryDelete({ detail: { index } } as CustomEvent<{ index: number }>);
  }

  function openCaptureModal(options: { editIndex?: number } = {}) {
    const { editIndex } = options;
    const defaultSelection = defaultAnnotationIds();
    if (typeof editIndex === 'number' && editIndex >= 0 && editIndex < storyScenes.length) {
      const scene = storyScenes[editIndex];
      storyEditingIndex = editIndex;
      captureForm = {
        title: scene.title,
        details: scene.details,
        delay: clampStoryDelay(scene.delay),
        annotations: scene.visibleAnnotations.length ? [...scene.visibleAnnotations] : defaultSelection
      };
    } else {
      storyEditingIndex = null;
      captureForm = {
        title: '',
        details: '',
        delay: STORY_DEFAULT_DELAY,
        annotations: defaultSelection
      };
    }
    captureModalOpen = true;
  }

  function closeCaptureModal() {
    captureModalOpen = false;
    drawMenuOpen = false;
    storyEditingIndex = null;
    captureForm = {
      title: '',
      details: '',
      delay: STORY_DEFAULT_DELAY,
      annotations: defaultAnnotationIds()
    };
  }

  function toggleCaptureAnnotation(id: string) {
    const exists = captureForm.annotations.includes(id);
    captureForm = {
      ...captureForm,
      annotations: exists
        ? captureForm.annotations.filter((value) => value !== id)
        : [...captureForm.annotations, id]
    };
  }

  function submitCaptureForm() {
    const delay = clampStoryDelay(Number(captureForm.delay));
    handleStoryCapture({
      detail: {
        title: captureForm.title,
        details: captureForm.details,
        delay,
        annotations: captureForm.annotations
      }
    } as CustomEvent<{ title: string; details: string; delay: number; annotations: string[] }>);
    captureModalOpen = false;
    captureForm = {
      title: '',
      details: '',
      delay: STORY_DEFAULT_DELAY,
      annotations: defaultAnnotationIds()
    };
  }

  function buildShareUrl(): string {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    const shareMapId = loadedOverlayId ?? selectedMapId;
    if (shareMapId) {
      url.searchParams.set('map', shareMapId);
    } else {
      url.searchParams.delete('map');
    }
    url.searchParams.set('view', viewMode);
    url.searchParams.set('basemap', basemapSelection);
    const view = map?.getView();
    if (view) {
      const center = view.getCenter();
      if (center) {
        const [lon, lat] = toLonLat(center);
        url.searchParams.set('lat', lat.toFixed(6));
        url.searchParams.set('lon', lon.toFixed(6));
      } else {
        url.searchParams.delete('lat');
        url.searchParams.delete('lon');
      }
      const zoom = view.getZoom();
      if (typeof zoom === 'number' && Number.isFinite(zoom)) {
        url.searchParams.set('zoom', zoom.toFixed(2));
      } else {
        url.searchParams.delete('zoom');
      }
      const rotation = view.getRotation() ?? 0;
      if (Math.abs(rotation) > 0.0001) {
        url.searchParams.set('rotation', rotation.toFixed(3));
      } else {
        url.searchParams.delete('rotation');
      }
    } else {
      url.searchParams.delete('lat');
      url.searchParams.delete('lon');
      url.searchParams.delete('zoom');
      url.searchParams.delete('rotation');
    }
    return url.toString();
  }

    async function copyShareLink() {
    console.log('copyShareLink called');
    if (typeof window === 'undefined') return;
    const url = buildShareUrl() || window.location.href;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const element = document.createElement('textarea');
        element.value = url;
        element.setAttribute('readonly', 'true');
        element.style.position = 'absolute';
        element.style.left = '-9999px';
        document.body.appendChild(element);
        element.select();
        document.execCommand('copy');
        document.body.removeChild(element);
      }
      shareCopied = true;
      if (shareResetTimer) {
        clearTimeout(shareResetTimer);
      }
      shareResetTimer = window.setTimeout(() => {
        shareCopied = false;
      }, 2000);
    } catch (error) {
      console.warn('Failed to copy link', error);
      shareCopied = false;
    }
  }

  async function applySharedParams(params: URLSearchParams) {
    if (!params.size) return false;
    let applied = false;

    const basemapParam = params.get('basemap');
    if (basemapParam && BASEMAP_DEFS.some((item) => item.key === basemapParam)) {
      basemapSelection = basemapParam;
      applyBasemap(basemapParam);
      applied = true;
    }

    const viewParam = params.get('view');
    if (viewParam && ['overlay', 'side-x', 'side-y', 'spy'].includes(viewParam)) {
      setViewMode(viewParam as ViewMode);
      applied = true;
    }

    const overlayParam = params.get('map');
    if (overlayParam && mapList.some((item) => item.id === overlayParam)) {
      selectedMapId = overlayParam;
      await loadOverlaySource(overlayParam);
      applied = true;
    }

    const view = map?.getView();
    if (view) {
      const latParam = params.get('lat');
      const lonParam = params.get('lon');
      const zoomParam = params.get('zoom');
      const rotationParam = params.get('rotation');

      const lat = latParam ? Number(latParam) : NaN;
      const lon = lonParam ? Number(lonParam) : NaN;
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        view.setCenter(fromLonLat([lon, lat]));
        applied = true;
      }

      if (zoomParam) {
        const zoom = Number(zoomParam);
        if (Number.isFinite(zoom)) {
          view.setZoom(zoom);
          applied = true;
        }
      }

      if (rotationParam) {
        const rotation = Number(rotationParam);
        if (Number.isFinite(rotation)) {
          view.setRotation(rotation);
          applied = true;
        }
      }
    }

    return applied;
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
    recordAnnotationAdd(feature);
    annotationState.setSelected(String(feature.getId()));
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
      recordAnnotationBulkAdd(features);
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
    scheduleMapResize();

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
        event.features.forEach((feature) => {
          const target = feature as Feature<Geometry>;
          const id = target.getId();
          if (!id) return;
          pendingGeometrySnapshots.set(String(id), captureFeatureSnapshot(target));
        });
      });
      modifyInteraction.on('modifyend', (event) => {
        event.features.forEach((feature) => {
          const target = feature as Feature<Geometry>;
          const id = target.getId();
          if (!id) return;
          const before = pendingGeometrySnapshots.get(String(id));
          const after = captureFeatureSnapshot(target);
          if (!before) return;
          const beforeGeom = JSON.stringify(before.feature.geometry ?? null);
          const afterGeom = JSON.stringify(after.feature.geometry ?? null);
          if (beforeGeom !== afterGeom) {
            recordAnnotationGeometryChange(before, after);
          }
        });
        pendingGeometrySnapshots.clear();
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
        annotationState.setSelected(feature ? String(feature.getId()) : null);
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

    const mobileQuery = window.matchMedia('(max-width: 900px)');
    const compactQuery = window.matchMedia('(max-width: 1400px)');
    const narrowQuery = window.matchMedia('(max-width: 1180px)');
    const updateResponsiveFlags = () => {
      isMobile = mobileQuery.matches;
      if (isMobile) {
        appMode = 'explore';
        showWelcome = false;
      }
      isCreatorCompact = compactQuery.matches;
      isCreatorNarrow = narrowQuery.matches;
    };
    updateResponsiveFlags();
    mobileQuery.addEventListener('change', updateResponsiveFlags);
    compactQuery.addEventListener('change', updateResponsiveFlags);
    narrowQuery.addEventListener('change', updateResponsiveFlags);
    responsiveCleanup = () => {
      mobileQuery.removeEventListener('change', updateResponsiveFlags);
      compactQuery.removeEventListener('change', updateResponsiveFlags);
      narrowQuery.removeEventListener('change', updateResponsiveFlags);
    };

    applyBasemap(basemapSelection);
    loadDataset()
      .then(() => loadAppState())
      .catch((error) => {
        console.error('Failed to initialise dataset', error);
        stateLoaded = true;
      });
    scheduleMapResize();

    window.addEventListener('pointermove', handlePointerDrag);
    window.addEventListener('pointerup', stopPointerDrag);
    window.addEventListener('pointercancel', stopPointerDrag);
    window.addEventListener('resize', scheduleMapResize);

    keydownHandler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName))) {
        return;
      }
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      const shift = event.shiftKey;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (shift) {
          redoLastAction();
        } else {
          undoLastAction();
        }
      } else if (key === 'y') {
        event.preventDefault();
        redoLastAction();
      }
    };
    window.addEventListener('keydown', keydownHandler);
  });

  onDestroy(() => {
    currentLoadAbort?.abort();
    searchAbortController?.abort();
    responsiveCleanup?.();
    responsiveCleanup = null;
    window.removeEventListener('pointermove', handlePointerDrag);
    window.removeEventListener('pointerup', stopPointerDrag);
    window.removeEventListener('pointercancel', stopPointerDrag);
    window.removeEventListener('resize', scheduleMapResize);
    if (keydownHandler) {
      window.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }
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
    if (shareResetTimer) {
      clearTimeout(shareResetTimer);
      shareResetTimer = null;
    }
    if (pendingResizeHandle !== null) {
      cancelAnimationFrame(pendingResizeHandle);
      pendingResizeHandle = null;
    }
  });

  $: applyBasemap(basemapSelection);
  $: refreshDecorations();
  $: if (annotationLayer) {
    annotationLayer.setVisible(appMode === 'create');
  }
</script>

<div class="viewer" class:mobile={isMobile} class:creator={appMode === 'create'}>
  {#if !isMobile && showWelcome}
    <div class="welcome-overlay">
      <div class="welcome-card">
        <h1>Welcome to the VMA studio</h1>
        <p>
          Choose how you want to start. Viewer lets you explore; Creator unlocks annotation and storytelling tools.
        </p>
        <div class="welcome-actions">
          <button
            type="button"
            class="chip ghost"
            class:active={appMode === 'explore'}
            on:click={() => chooseAppMode('explore')}
          >
            Viewer
          </button>
          <button
            type="button"
            class="chip"
            class:active={appMode === 'create'}
            on:click={() => chooseAppMode('create')}
          >
            Creator
          </button>
        </div>
      </div>
    </div>
  {/if}

  <div class="workspace" style={workspaceStyle}>
    {#if !isMobile && appMode === 'create'}
      {#if creatorLeftCollapsed}
        <button type="button" class="panel-toggle left" on:click={() => (creatorLeftCollapsed = false)}>
          Show tools
        </button>
      {/if}
      {#if !creatorLeftCollapsed}
        <aside class="creator-panel left">
          <button
            type="button"
            class="panel-collapse"
            on:click={() => (creatorLeftCollapsed = true)}
            aria-expanded="true"
          >
            Hide tools
          </button>
          <div class="panel-scroll custom-scrollbar">
            <section class="panel-card">
              <header class="panel-card-header">
                <h2>View control</h2>
              </header>
              <section class="panel-card-section">
                <span class="section-title">View mode</span>
                <div class="button-group wrap">
                  <button type="button" class:selected={viewMode === 'overlay'} on:click={() => handleModeClick('overlay')}>
                    Overlay
                  </button>
                  <button type="button" class:selected={viewMode === 'side-x'} on:click={() => handleModeClick('side-x')}>
                    Side-X
                  </button>
                  <button type="button" class:selected={viewMode === 'side-y'} on:click={() => handleModeClick('side-y')}>
                    Side-Y
                  </button>
                  <button type="button" class:selected={viewMode === 'spy'} on:click={() => handleModeClick('spy')}>
                    Glass
                  </button>
                </div>
              </section>
              <section class="panel-card-section">
                <span class="section-title">Overlay opacity</span>
                <div class="slider">
                  <input type="range" min="0" max="1" step="0.05" bind:value={opacity} on:input={handleOpacityInput} />
                  <span>{opacityPercent}%</span>
                </div>
              </section>
            </section>

            <section class="panel-card">
              <header class="panel-card-header">
                <h2>Historical maps</h2>
              </header>
              {#if viewerFeaturedMaps.length}
                <section class="panel-card-section">
                  <span class="section-title">Featured</span>
                  <div class="history-featured">
                    {#each viewerFeaturedMaps as item (item.id)}
                      <button
                        type="button"
                        class="history-featured-card"
                        class:selected={item.id === selectedMapId}
                        on:click={() => void selectMapById(item.id)}
                      >
                        <span class="history-title">{item.name}</span>
                        {#if item.summary}
                          <span class="history-meta">{item.summary}</span>
                        {/if}
                      </button>
                    {/each}
                  </div>
                </section>
              {/if}
              <section class="panel-card-section">
                <label class="history-filter">
                  <span>Filter by type</span>
                  <select bind:value={mapTypeSelection}>
                    <option value="all">All maps ({mapList.length})</option>
                    {#each mapTypes as type}
                      <option value={type}>{type}</option>
                    {/each}
                  </select>
                </label>
              </section>
              <div class="history-list custom-scrollbar">
                {#if viewerAllMaps.length}
                  {#each viewerAllMaps as item (item.id)}
                    <button
                      type="button"
                      class="history-item"
                      class:selected={item.id === selectedMapId}
                      on:click={() => void selectMapById(item.id)}
                    >
                      <span class="history-title">{item.name}</span>
                      <span class="history-meta">{item.summary || item.type}</span>
                    </button>
                  {/each}
                {:else}
                  <p class="empty-state">Map catalog is loading…</p>
                {/if}
              </div>
            </section>

            <section class="panel-card">
              <header class="panel-card-header">
                <h2>Basemap</h2>
              </header>
              <section class="panel-card-section">
                <div class="button-group wrap">
                  {#each BASEMAP_DEFS as base}
                    <button
                      type="button"
                      class:selected={basemapSelection === base.key}
                      on:click={() => {
                        basemapSelection = base.key;
                        queueSaveState();
                      }}
                    >
                      {base.label}
                    </button>
                  {/each}
                </div>
              </section>
            </section>
          </div>
        </aside>
      {/if}
    {/if}

    <div class="map-stage">
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

      {#if storyPresenting && currentStoryScene}
        <div class="story-presenter">
          <div class="story-presenter-content">
            <div class="story-presenter-nav">
              <span class="counter">
                {currentStoryVisiblePosition || 1} / {Math.max(visibleStoryScenes.length, 1)}
              </span>
              <button type="button" class="chip ghost" on:click={previousStoryScene} disabled={visibleStoryScenes.length < 2}>
                ◀ Prev
              </button>
              <button type="button" class="chip" class:active={storyAutoplay} on:click={toggleStoryAutoplay}>
                {storyAutoplay ? 'Pause' : 'Play'}
              </button>
              <button type="button" class="chip ghost" on:click={nextStoryScene} disabled={visibleStoryScenes.length < 2}>
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

      {#if appMode === 'create'}
        <div class="creator-toolbar">
          <div class="toolbar-cluster">
            <button
              type="button"
              on:click={() => (searchOverlayOpen = true)}
              title="Search places"
              aria-label="Search places"
            >
              <span class="toolbar-icon">🔍</span>
            </button>
          </div>
          <div class="toolbar-cluster">
            <button
              type="button"
              class:selected={!drawingMode}
              on:click={deactivateDrawing}
              title="Pan the map"
              aria-label="Pan the map"
            >
              <span class="toolbar-icon">🖐</span>
            </button>
            <div class="toolbar-group">
              <button
                type="button"
                class:selected={drawMenuOpen || !!drawingMode}
                on:click={() => (drawMenuOpen = !drawMenuOpen)}
                title="Draw annotations"
                aria-label="Draw annotations"
                aria-haspopup="true"
                aria-expanded={drawMenuOpen}
              >
                <span class="toolbar-icon">✏️</span>
              </button>
              {#if drawMenuOpen}
                <div class="toolbar-menu">
                  <button type="button" class:selected={drawingMode === 'point'} on:click={() => { setDrawingMode('point'); drawMenuOpen = false; }}>
                    Point
                  </button>
                  <button type="button" class:selected={drawingMode === 'line'} on:click={() => { setDrawingMode('line'); drawMenuOpen = false; }}>
                    Line
                  </button>
                  <button type="button" class:selected={drawingMode === 'polygon'} on:click={() => { setDrawingMode('polygon'); drawMenuOpen = false; }}>
                    Polygon
                  </button>
                  <button type="button" class:selected={editingEnabled} on:click={() => { toggleEditing(); drawMenuOpen = false; }}>
                    {editingEnabled ? 'Disable edit' : 'Enable edit'}
                  </button>
                  <button type="button" on:click={() => { deactivateDrawing(); drawMenuOpen = false; }}>
                    Finish drawing
                  </button>
                </div>
              {/if}
            </div>
            <button
              type="button"
              title="Undo"
              aria-label="Undo"
              on:click={undoLastAction}
              disabled={!canUndo}
            >
              <span class="toolbar-icon">↺</span>
            </button>
            <button
              type="button"
              title="Redo"
              aria-label="Redo"
              on:click={redoLastAction}
              disabled={!canRedo}
            >
              <span class="toolbar-icon">↻</span>
            </button>
          </div>
          <div class="toolbar-cluster">
            <button
              type="button"
              on:click={() => openCaptureModal()}
              title="Capture current view"
              aria-label="Capture scene"
            >
              <span class="toolbar-icon">📷</span>
            </button>
            <button
              type="button"
              on:click={() => startStoryPresentation(0)}
              title="Present story"
              aria-label="Present story"
              disabled={!visibleStoryScenes.length}
            >
              <span class="toolbar-icon">🎞</span>
            </button>
          </div>
          <div class="toolbar-cluster">
            <div class="toolbar-group">
              <button
                type="button"
                class:selected={toolbarSettingsOpen}
                on:click={() => (toolbarSettingsOpen = !toolbarSettingsOpen)}
                title="Settings"
                aria-label="Settings"
                aria-haspopup="true"
                aria-expanded={toolbarSettingsOpen}
              >
                <span class="toolbar-icon">⚙️</span>
              </button>
              {#if toolbarSettingsOpen}
                <div class="toolbar-menu">
                  <button type="button" on:click={() => { toggleAppMode(); toolbarSettingsOpen = false; }}>
                    Switch to Viewer
                  </button>
                  <button type="button" on:click={() => { handleClearState(); toolbarSettingsOpen = false; }}>
                    Clear cached state
                  </button>
                </div>
              {/if}
            </div>
          </div>
        </div>
      {:else if !showWelcome}
        <div class="viewer-panel" class:collapsed={!viewerPanelOpen}>
          <div class="viewer-tabs">
            <button
              type="button"
              class:selected={activeViewerSection === 'map'}
              on:click={() => handleViewerTabClick('map')}
              aria-expanded={activeViewerSection === 'map' && viewerPanelOpen}
            >
              Map
            </button>
            <button
              type="button"
              class:selected={activeViewerSection === 'control'}
              on:click={() => handleViewerTabClick('control')}
              aria-expanded={activeViewerSection === 'control' && viewerPanelOpen}
            >
              Controls
            </button>
            <button
              type="button"
              class:selected={activeViewerSection === 'story'}
              on:click={() => handleViewerTabClick('story')}
              aria-expanded={activeViewerSection === 'story' && viewerPanelOpen}
            >
              Story
            </button>
            <button
              type="button"
              class:selected={activeViewerSection === 'info'}
              on:click={() => handleViewerTabClick('info')}
              aria-expanded={activeViewerSection === 'info' && viewerPanelOpen}
            >
              Share & Settings
            </button>
          </div>
          {#if viewerPanelOpen}
          <div class="viewer-section custom-scrollbar">
            {#if activeViewerSection === 'map'}
              <div class="section-group">
                <div class="section-block">
                  <h3>Featured historical maps</h3>
                  <div class="map-grid">
                    {#if viewerFeaturedMaps.length}
                      {#each viewerFeaturedMaps as item (item.id)}
                        <button
                          type="button"
                          class="map-card"
                          class:active={item.id === selectedMapId}
                          on:click={() => void selectMapById(item.id)}
                        >
                          {#if item.thumbnail}
                            <img src={item.thumbnail} alt={`Preview of ${item.name}`} loading="lazy" />
                          {/if}
                          <div class="map-card-body">
                            <span class="map-card-title">{item.name}</span>
                            <span class="map-card-meta">{item.summary || item.type}</span>
                          </div>
                        </button>
                      {/each}
                    {:else}
                      <p class="empty-state">No featured maps yet.</p>
                    {/if}
                  </div>
                </div>
                <div class="section-block">
                  <h3>Metadata</h3>
                  {#if selectedMap}
                    <p class="muted">View additional information about {selectedMap.name}.</p>
                    <button type="button" class="chip ghost" on:click={() => (metadataOverlayOpen = true)}>
                      Open metadata
                    </button>
                  {:else}
                    <p class="empty-state">Select a map to view its metadata.</p>
                  {/if}
                </div>
                <div class="section-block">
                  <h3>Basemap</h3>
                  <div class="button-group">
                    {#each BASEMAP_DEFS as base}
                      <button
                        type="button"
                        class:selected={basemapSelection === base.key}
                        on:click={() => {
                          basemapSelection = base.key;
                          queueSaveState();
                        }}
                      >
                        {base.label}
                      </button>
                    {/each}
                  </div>
                </div>
                <div class="section-block">
                  <h3>More historical maps</h3>
                  <details class="map-accordion">
                    <summary>Browse catalog ({viewerAllMaps.length})</summary>
                    <div class="catalog-filter">
                      <label>
                        <span>Filter by type</span>
                        <select bind:value={mapTypeSelection}>
                          <option value="all">All maps ({mapList.length})</option>
                          {#each mapTypes as type}
                            <option value={type}>{type}</option>
                          {/each}
                        </select>
                      </label>
                    </div>
                    <div class="catalog-list custom-scrollbar">
                      {#if viewerAllMaps.length}
                        {#each viewerAllMaps as item (item.id)}
                          <button
                            type="button"
                            class="catalog-item"
                            class:active={item.id === selectedMapId}
                            on:click={() => void selectMapById(item.id)}
                          >
                            {#if item.thumbnail}
                              <img src={item.thumbnail} alt={`Preview of ${item.name}`} loading="lazy" />
                            {/if}
                            <div class="catalog-text">
                              <span class="catalog-title">{item.name}</span>
                              <span class="catalog-meta">{item.summary || item.type}</span>
                            </div>
                          </button>
                        {/each}
                      {:else}
                        <p class="empty-state">Map catalog is loading…</p>
                      {/if}
                    </div>
                  </details>
                </div>
              </div>
            {:else if activeViewerSection === 'control'}
              <div class="section-group">
            <div class="section-block">
              <h3>View mode</h3>
              <div class="button-group wrap">
                <button type="button" class:selected={viewMode === 'overlay'} on:click={() => handleModeClick('overlay')}>
                  Overlay
                </button>
                <button type="button" class:selected={viewMode === 'side-x'} on:click={() => handleModeClick('side-x')}>
                  Side-X
                </button>
                <button type="button" class:selected={viewMode === 'side-y'} on:click={() => handleModeClick('side-y')}>
                  Side-Y
                </button>
                <button type="button" class:selected={viewMode === 'spy'} on:click={() => handleModeClick('spy')}>
                  Glass
                </button>
              </div>
            </div>
            <div class="section-block">
              <h3>Opacity</h3>
              <div class="slider">
                <input type="range" min="0" max="1" step="0.05" bind:value={opacity} on:input={handleOpacityInput} />
                <span>{opacityPercent}%</span>
              </div>
            </div>
                <div class="section-block">
                  <h3>Search</h3>
                  <div class="search-row">
                <input
                  type="text"
                  placeholder="Search for a place or address"
                  value={searchQuery}
                  on:input={(event) => queueSearch((event.target as HTMLInputElement).value)}
                />
                <button type="button" class="chip ghost" on:click={locateUser} disabled={searchLoading}>
                  Locate
                </button>
                <button type="button" class="chip ghost" on:click={clearSearch} disabled={!searchQuery && !searchResults.length}>
                  Clear
                </button>
              </div>
              {#if searchLoading}
                <p class="muted">Searching…</p>
              {:else if searchNotice}
                <p class:errored={searchNoticeType === 'error'} class:success={searchNoticeType === 'success'}>
                  {searchNotice}
                </p>
              {/if}
              {#if searchResults.length}
                <div class="search-results custom-scrollbar">
                  {#each searchResults as result (result.display_name)}
                    <div class="search-result">
                      <button type="button" class="result-main" on:click={() => zoomToSearchResult(result)}>
                        <span class="result-title">{result.display_name}</span>
                        {#if result.type}
                          <span class="result-type">{result.type}</span>
                        {/if}
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
            {:else if activeViewerSection === 'story'}
              <div class="section-group">
                <div class="section-block">
                  <h3>Feature stories</h3>
                  <div class="story-grid">
                    {#if visibleStoryScenes.length}
                      {#each visibleStoryScenes.slice(0, 2) as scene, index (scene.id)}
                        <div class="story-card">
                          <h4>{scene.title}</h4>
                          <p>{scene.details || 'No description yet.'}</p>
                          <div class="story-card-actions">
                            <button type="button" class="chip" on:click={() => goToStoryScene(index)}>
                              View
                            </button>
                          </div>
                        </div>
                      {/each}
                    {:else}
                      <p class="empty-state">No stories captured yet. Switch to Creator to add one.</p>
                    {/if}
                  </div>
                </div>
                <div class="section-block">
                  <div class="section-header">
                    <h3>View all stories</h3>
                    {#if visibleStoryScenes.length}
                      <button type="button" class="chip ghost" on:click={() => startStoryPresentation(0)}>
                        Present
                      </button>
                    {/if}
                  </div>
                  <div class="story-list custom-scrollbar">
                    {#if visibleStoryScenes.length}
                      {#each visibleStoryScenes as scene, index (scene.id)}
                        <div class="story-row">
                          <div class="story-info">
                            <span class="story-title">{scene.title}</span>
                            <span class="story-meta">{scene.details || 'No description provided.'}</span>
                          </div>
                          <div class="story-row-actions">
                            <button type="button" class="chip ghost" on:click={() => goToStoryScene(index)}>
                              View
                            </button>
                            <button type="button" class="chip ghost" on:click={() => startStoryPresentation(index)}>
                              Play
                            </button>
                          </div>
                        </div>
                      {/each}
                    {:else}
                      <p class="empty-state">No story slides yet.</p>
                    {/if}
                  </div>
                </div>
              </div>
            {:else}
              <div class="section-group">
                <div class="section-block">
                  <h3>Share</h3>
                  <p class="muted">Copy a link to this view to share it with your team.</p>
                  <button type="button" class="chip" on:click={copyShareLink}>
                    {shareCopied ? 'Copied!' : 'Copy link'}
                  </button>
                </div>
                <div class="section-block">
                  <h3>Status</h3>
                  <p class:errored={statusError}>{statusMessage}</p>
                </div>
                <div class="section-block">
                  <h3>Settings</h3>
                  <div class="button-stack">
                    <button type="button" class="chip ghost" on:click={toggleAppMode}>
                      Switch to {appMode === 'explore' ? 'Creator' : 'Viewer'}
                    </button>
                    <button type="button" class="chip danger" on:click={handleClearState}>
                      Clear cached state
                    </button>
                  </div>
                </div>
              </div>
            {/if}
            </div>
          {/if}
        </div>
      {:else}
        <!-- Viewer panel hidden while welcome overlay is visible -->
      {/if}
    </div>

    {#if !isMobile && appMode === 'create'}
      {#if creatorRightCollapsed}
        <button type="button" class="panel-toggle right" on:click={() => (creatorRightCollapsed = false)}>
          Show panel
        </button>
      {/if}
      {#if !creatorRightCollapsed}
        <aside class="creator-panel right">
          <header class="creator-right-header">
            <button
              type="button"
              class="panel-collapse"
              on:click={() => (creatorRightCollapsed = !creatorRightCollapsed)}
              aria-expanded={!creatorRightCollapsed}
            >
              Hide panel
            </button>
            <div class="creator-right-controls">
              <div class="toggle-group">
                <button type="button" class:selected={creatorRightPane === 'annotations'} on:click={() => (creatorRightPane = 'annotations')}>
                  Annotations
                </button>
                <button type="button" class:selected={creatorRightPane === 'story'} on:click={() => (creatorRightPane = 'story')}>
                  Story slides
                </button>
              </div>
              <div class="right-actions">
                <button type="button" class="chip ghost" on:click={clearAnnotations} disabled={!annotations.length}>
                  Clear
                </button>
                <button type="button" class="chip ghost" on:click={exportAnnotationsAsGeoJSON} disabled={!annotations.length}>
                  Export
                </button>
                <label class="chip ghost upload">
                  Import
                  <input type="file" accept="application/geo+json,.geojson,.json" on:change={handleGeoJsonFileChange} bind:this={geoJsonInputEl} />
                </label>
              </div>
            </div>
          </header>
          <div class="creator-right-body custom-scrollbar">
            {#if creatorRightPane === 'annotations'}
              {#if annotationsNotice}
              <p class="notice" class:errored={annotationsNoticeType === 'error'} class:success={annotationsNoticeType === 'success'}>
                {annotationsNotice}
              </p>
            {/if}
            {#if annotations.length}
              {#each annotations as annotation (annotation.id)}
                <div class="list-card" class:selected={annotation.id === selectedAnnotationId}>
                  <div class="list-card-header">
                    <input
                      type="text"
                      value={annotation.label}
                      placeholder="Annotation name"
                      on:input={(event) => updateAnnotationLabel(annotation.id, (event.target as HTMLInputElement).value)}
                    />
                    <div class="list-card-actions">
                      <input
                        type="color"
                        value={annotation.color}
                        title="Annotation colour"
                        on:input={(event) => updateAnnotationColor(annotation.id, (event.target as HTMLInputElement).value)}
                      />
                      <button type="button" class="chip ghost" on:click={() => toggleAnnotationVisibility(annotation.id)}>
                        {annotation.hidden ? 'Show' : 'Hide'}
                      </button>
                      <button type="button" class="chip danger" on:click={() => deleteAnnotation(annotation.id)}>
                        Delete
                      </button>
                      <button
                        type="button"
                        class="icon-button"
                        on:click={() => (openAnnotationMenu = openAnnotationMenu === annotation.id ? null : annotation.id)}
                        aria-label="Annotation actions"
                      >
                        ☰
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows="2"
                    value={annotation.details}
                    placeholder="Annotation details"
                    on:input={(event) => updateAnnotationDetails(annotation.id, (event.target as HTMLTextAreaElement).value)}
                  ></textarea>
                  {#if openAnnotationMenu === annotation.id}
                    <div class="card-menu">
                      <button type="button" on:click={() => { zoomToAnnotation(annotation.id); openAnnotationMenu = null; }}>
                        Zoom to
                      </button>
                      <button type="button" on:click={() => { annotationState.setSelected(annotation.id); openAnnotationMenu = null; }}>
                        Select
                      </button>
                    </div>
                  {/if}
                </div>
              {/each}
            {:else}
              <p class="empty-state">Draw or import annotations to see them here.</p>
            {/if}
          {:else}
            <div class="story-list-panel">
              {#if storyScenes.length}
                {#each storyScenes as scene, index (scene.id)}
                  <div class="list-card" class:hidden={scene.hidden}>
                    <div class="list-card-header">
                      <input
                        type="text"
                        value={scene.title}
                        placeholder="Scene title"
                        on:input={(event) => {
                          const value = (event.target as HTMLInputElement).value;
                          storyScenes = storyScenes.map((existing, i) => (i === index ? { ...existing, title: value } : existing));
                          queueSaveState();
                        }}
                      />
                      <div class="list-card-actions">
                        <button type="button" class="chip ghost" on:click={() => goToStoryScene(index)}>
                          Go to
                        </button>
                        <button type="button" class="chip ghost" on:click={() => openCaptureModal({ editIndex: index })}>
                          Edit
                        </button>
                        <button type="button" class="chip ghost" on:click={() => duplicateStoryScene(index)}>
                          Duplicate
                        </button>
                        <button type="button" class="icon-button" on:click={() => (openStoryMenu = openStoryMenu === scene.id ? null : scene.id)}>
                          ☰
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows="2"
                      value={scene.details}
                      placeholder="Scene details"
                      on:input={(event) => {
                        const value = (event.target as HTMLTextAreaElement).value;
                        storyScenes = storyScenes.map((existing, i) => (i === index ? { ...existing, details: value } : existing));
                        queueSaveState();
                      }}
                    ></textarea>
                    {#if openStoryMenu === scene.id}
                      <div class="card-menu">
                        <button type="button" on:click={() => { applyStorySceneByIndex(index); openStoryMenu = null; }}>
                          Apply view
                        </button>
                        <button type="button" on:click={() => { toggleStorySceneVisibility(index); openStoryMenu = null; }}>
                          {scene.hidden ? 'Show slide' : 'Hide slide'}
                        </button>
                        <button type="button" on:click={() => { deleteStoryScene(index); openStoryMenu = null; }}>
                          Delete
                        </button>
                      </div>
                    {/if}
                  </div>
                {/each}
              {:else}
                <p class="empty-state">Capture scenes to build your story.</p>
              {/if}
              </div>
            {/if}
          </div>
        </aside>
      {/if}
    {/if}
  </div>

  {#if metadataOverlayOpen}
    <div
      class="metadata-overlay"
      role="dialog"
      aria-modal="true"
      tabindex="0"
      bind:this={metadataOverlayEl}
      on:keydown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          metadataOverlayOpen = false;
        }
        if ((event.key === 'Enter' || event.key === ' ') && event.target === metadataOverlayEl) {
          event.preventDefault();
          metadataOverlayOpen = false;
        }
      }}
    >
      <div class="metadata-card">
        <header>
          <h2>Map metadata</h2>
          <button type="button" class="chip ghost" on:click={() => (metadataOverlayOpen = false)}>
            Close
          </button>
        </header>
        {#if selectedMap}
          <section class="metadata-section">
            <h3>{selectedMap.name}</h3>
            <dl>
              <div>
                <dt>Type</dt>
                <dd>{selectedMap.type}</dd>
              </div>
              {#if selectedMap.summary}
                <div>
                  <dt>Summary</dt>
                  <dd>{selectedMap.summary}</dd>
                </div>
              {/if}
              {#if selectedMap.description}
                <div>
                  <dt>Details</dt>
                  <dd>{selectedMap.description}</dd>
                </div>
              {/if}
            </dl>
          </section>
        {:else}
          <p class="empty-state">Select a map to view its metadata.</p>
        {/if}
      </div>
    </div>
  {/if}

  {#if searchOverlayOpen}
    <div
      class="search-dialog"
      role="dialog"
      aria-modal="true"
      tabindex="0"
      bind:this={searchOverlayEl}
      on:keydown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          searchOverlayOpen = false;
        }
        if ((event.key === 'Enter' || event.key === ' ') && event.target === searchOverlayEl) {
          event.preventDefault();
          searchOverlayOpen = false;
        }
      }}
    >
      <button type="button" class="dialog-backdrop" aria-label="Dismiss search" on:click={() => (searchOverlayOpen = false)}></button>
      <div class="search-card">
        <header>
          <h2>Search</h2>
          <button type="button" class="chip ghost" on:click={() => (searchOverlayOpen = false)}>
            Close
          </button>
        </header>
        <div class="search-form">
          <input
            type="text"
            placeholder="Search for a place or address"
            bind:value={searchQuery}
            bind:this={searchInputEl}
            on:input={(event) => queueSearch((event.target as HTMLInputElement).value)}
          />
          <div class="search-form-actions">
            <button type="button" class="chip ghost" on:click={locateUser} disabled={searchLoading}>
              Locate me
            </button>
            <button type="button" class="chip ghost" on:click={clearSearch} disabled={!searchQuery && !searchResults.length}>
              Clear
            </button>
          </div>
        </div>
        {#if searchLoading}
          <p class="muted">Searching…</p>
        {:else if searchNotice}
          <p class:errored={searchNoticeType === 'error'} class:success={searchNoticeType === 'success'}>
            {searchNotice}
          </p>
        {/if}
        {#if searchResults.length}
          <div class="search-results-list custom-scrollbar">
            {#each searchResults as result (result.display_name)}
              <div class="search-result-item">
                <button
                  type="button"
                  class="search-result-main"
                  on:click={() => {
                    zoomToSearchResult(result);
                    searchOverlayOpen = false;
                  }}
                >
                  <span class="result-title">{result.display_name}</span>
                  {#if result.type}
                    <span class="result-type">{result.type}</span>
                  {/if}
                </button>
                {#if appMode === 'create'}
                  <div class="search-result-actions">
                    <button type="button" class="chip ghost" on:click={() => addSearchResultToAnnotations(result)}>
                      Add to annotations
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if captureModalOpen}
    <div class="modal-backdrop">
      <div class="modal-card">
        <header>
          <h2>{storyEditingIndex !== null ? 'Update story scene' : 'Capture story scene'}</h2>
        </header>
        <div class="modal-body">
          <label>
            <span>Title</span>
            <input type="text" bind:value={captureForm.title} placeholder="Scene title" />
          </label>
          <label>
            <span>Details</span>
            <textarea rows="3" bind:value={captureForm.details} placeholder="What should viewers know?"></textarea>
          </label>
          <label>
            <span>Delay (seconds)</span>
            <input type="number" min={STORY_DELAY_MIN} max={STORY_DELAY_MAX} bind:value={captureForm.delay} />
          </label>
          <fieldset>
            <legend>Visible annotations</legend>
            {#if annotations.length}
              <div class="modal-chip-group">
                {#each annotations as annotation (annotation.id)}
                  <button
                    type="button"
                    class:selected={captureForm.annotations.includes(annotation.id)}
                    on:click={() => toggleCaptureAnnotation(annotation.id)}
                  >
                    {annotation.label}
                  </button>
                {/each}
              </div>
            {:else}
              <p class="muted">No annotations yet.</p>
            {/if}
          </fieldset>
        </div>
        <footer class="modal-footer">
          <button type="button" class="ghost" on:click={closeCaptureModal}>Cancel</button>
          <button type="button" on:click={submitCaptureForm}>
            {storyEditingIndex !== null ? 'Update scene' : 'Add scene'}
          </button>
        </footer>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0f172a;
    color: #e2e8f0;
  }

  .viewer {
    position: relative;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: radial-gradient(circle at top left, rgba(30, 64, 175, 0.25), transparent 55%), #0f172a;
  }

  .viewer.creator {
    background: radial-gradient(circle at top, rgba(30, 64, 175, 0.35), transparent 60%), #0f172a;
  }

  .workspace {
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'map';
  }

  .viewer.creator .workspace {
    position: relative;
    display: grid;
    grid-template-columns: minmax(260px, 0.25fr) minmax(0, 0.5fr) minmax(260px, 0.25fr);
    grid-template-rows: minmax(0, 1fr);
    gap: 1.2rem;
    padding: 1.4rem;
    align-items: stretch;
    height: 100%;
  }

  .creator-panel.left,
  .creator-panel.right {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 1rem;
    padding: 0.9rem;
    box-shadow: 0 24px 48px rgba(2, 6, 23, 0.45);
    backdrop-filter: blur(18px);
    height: 100%;
    max-height: none;
    overflow: hidden;
    min-width: 0;
  }

  .viewer.creator .creator-panel.left {
    grid-column: 1;
  }

  .viewer.creator .creator-panel.right {
    grid-column: 3;
  }

  .panel-collapse {
    align-self: flex-start;
    border: none;
    background: rgba(15, 23, 42, 0.7);
    border-radius: 999px;
    color: inherit;
    font-size: 0.72rem;
    padding: 0.25rem 0.8rem;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .panel-collapse:hover,
  .panel-collapse:focus-visible {
    background: rgba(99, 102, 241, 0.35);
    outline: none;
  }

  .panel-toggle {
    position: absolute;
    top: 1rem;
    border: none;
    background: rgba(15, 23, 42, 0.75);
    border-radius: 999px;
    color: inherit;
    font-size: 0.74rem;
    padding: 0.4rem 0.9rem;
    cursor: pointer;
    box-shadow: 0 14px 28px rgba(2, 6, 23, 0.45);
    backdrop-filter: blur(12px);
    transition: background 0.15s ease;
    z-index: 95;
  }

  .panel-toggle.left {
    left: 1rem;
  }

  .panel-toggle.right {
    right: 1rem;
  }

  .panel-toggle:hover,
  .panel-toggle:focus-visible {
    background: rgba(99, 102, 241, 0.45);
    outline: none;
  }

  .panel-scroll {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
    padding-right: 0.25rem;
    margin-top: 0.25rem;
  }

  .creator-right-header {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .creator-right-header .panel-collapse {
    align-self: flex-start;
  }

  .creator-right-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
    justify-content: space-between;
  }

  .creator-right-body {
    margin-top: 0.75rem;
    padding-right: 0.2rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .map-stage {
    position: relative;
    min-height: calc(100vh - 3rem);
    border-radius: 1.1rem;
    overflow: visible;
    background: #020617;
  }

  .viewer.creator .map-stage {
    grid-column: 2;
    min-height: 0;
    height: 100%;
    min-width: 0;
  }

  .viewer:not(.creator) .map-stage {
    border-radius: 0;
  }

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
    background: rgba(14, 116, 144, 0.65);
    z-index: 10;
  }

  .divider.vertical {
    width: 2px;
    top: 0;
    bottom: 0;
  }

  .divider.horizontal {
    height: 2px;
    left: 0;
    right: 0;
  }

  .handle {
    position: absolute;
    z-index: 11;
    width: 16px;
    height: 16px;
    background: rgba(148, 163, 184, 0.85);
    border: none;
    border-radius: 999px;
    cursor: grab;
  }

  .handle.vertical {
    top: 50%;
    transform: translateY(-50%);
  }

  .handle.horizontal {
    left: 50%;
    transform: translateX(-50%);
  }

  .lens {
    position: absolute;
    border: 3px solid rgba(148, 163, 184, 0.9);
    border-radius: 999px;
    pointer-events: none;
    z-index: 12;
  }

  .lens-handle {
    position: absolute;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 999px;
    background: rgba(37, 99, 235, 0.9);
    color: #0f172a;
    cursor: grab;
    z-index: 13;
  }

  .viewer-panel {
    position: fixed;
    left: 50%;
    bottom: calc(env(safe-area-inset-bottom) + 1.4rem);
    transform: translateX(-50%);
    width: min(720px, calc(100% - 2rem));
    background: rgba(15, 23, 42, 0.88);
    border-radius: 1.2rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    backdrop-filter: blur(18px);
    box-shadow: 0 24px 48px rgba(2, 6, 23, 0.55);
    display: flex;
    flex-direction: column;
    z-index: 130;
    pointer-events: auto;
  }

  .viewer-panel.collapsed {
    padding-bottom: 0.75rem;
  }

  .viewer-tabs {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.35rem;
    padding: 0.75rem 0.85rem 0;
  }

  .viewer-tabs button,
  .button-group button,
  .toggle-group button,
  .panel-card-section button,
  .story-card-actions button,
  .story-row-actions button,
  .modal-chip-group button,
  .toolbar-menu button {
    border: none;
    border-radius: 0.75rem;
    background: rgba(30, 64, 175, 0.28);
    color: inherit;
    padding: 0.55rem 0.75rem;
    font-size: 0.82rem;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.15s ease;
  }

  .viewer-tabs button.selected,
  .button-group button.selected,
  .toggle-group button.selected,
  .toolbar-menu button.selected {
    background: rgba(79, 70, 229, 0.85);
    box-shadow: 0 12px 32px rgba(67, 56, 202, 0.35);
  }

  .viewer-tabs button:hover,
  .button-group button:hover,
  .toggle-group button:hover,
  .toolbar-menu button:hover {
    transform: translateY(-1px);
  }

  .viewer-section {
    padding: 0.8rem 1rem 1rem;
    max-height: 420px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .section-group {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .section-block {
    background: rgba(15, 23, 42, 0.65);
    border-radius: 0.95rem;
    padding: 0.85rem 1rem;
    border: 1px solid rgba(148, 163, 184, 0.18);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .section-block h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
  }

  .button-group {
    display: flex;
    gap: 0.5rem;
    flex-wrap: nowrap;
  }

  .button-group.wrap {
    flex-wrap: wrap;
  }

  .slider {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .slider input[type='range'] {
    flex: 1 1 auto;
  }

  .map-grid {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  }

  .map-card {
    display: flex;
    flex-direction: column;
    border-radius: 0.85rem;
    background: rgba(30, 41, 59, 0.75);
    border: 1px solid transparent;
    overflow: hidden;
    text-align: left;
    gap: 0.45rem;
  }

  .map-card.active {
    border-color: rgba(99, 102, 241, 0.85);
    box-shadow: 0 16px 32px rgba(59, 130, 246, 0.35);
  }

  .map-card img {
    width: 100%;
    height: 110px;
    object-fit: cover;
  }

  .map-card-body {
    padding: 0 0.75rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .catalog-list {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    max-height: 240px;
    padding-right: 0.2rem;
  }

  .catalog-item {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    border-radius: 0.85rem;
    border: 1px solid transparent;
    background: rgba(15, 23, 42, 0.55);
    padding: 0.55rem 0.65rem;
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .catalog-item:hover,
  .catalog-item:focus-visible {
    border-color: rgba(99, 102, 241, 0.5);
    outline: none;
  }

  .catalog-item.active {
    border-color: rgba(99, 102, 241, 0.8);
    box-shadow: 0 12px 24px rgba(67, 56, 202, 0.35);
  }

  .catalog-item img {
    width: 48px;
    height: 48px;
    object-fit: cover;
    border-radius: 0.6rem;
    flex-shrink: 0;
  }

  .catalog-text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .catalog-title {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .catalog-meta {
    font-size: 0.72rem;
    color: rgba(148, 163, 184, 0.78);
  }

  .map-card-title {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .map-card-meta {
    font-size: 0.75rem;
    color: rgba(148, 163, 184, 0.85);
  }

  .search-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .search-row input {
    flex: 1 1 200px;
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    padding: 0.55rem 0.75rem;
    background: rgba(15, 23, 42, 0.75);
    color: inherit;
  }

  .search-results {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    max-height: 220px;
    overflow-y: auto;
  }

  .search-result {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.65rem 0.75rem;
    border-radius: 0.8rem;
    background: rgba(30, 41, 59, 0.75);
  }

  .result-main {
    flex: 1 1 auto;
    text-align: left;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .result-title {
    font-size: 0.82rem;
    font-weight: 500;
  }

  .result-type {
    font-size: 0.72rem;
    color: rgba(148, 163, 184, 0.8);
  }

  .story-grid {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .story-card {
    border-radius: 0.85rem;
    background: rgba(30, 41, 59, 0.75);
    padding: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .story-card h4 {
    margin: 0;
  }

  .story-card p {
    margin: 0;
    font-size: 0.78rem;
    color: rgba(148, 163, 184, 0.85);
  }

  .story-card-actions {
    margin-top: auto;
    display: flex;
    gap: 0.4rem;
  }

  .story-list {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    max-height: 220px;
    overflow-y: auto;
  }

  .story-row {
    display: flex;
    gap: 0.45rem;
    padding: 0.65rem 0.75rem;
    border-radius: 0.8rem;
    background: rgba(30, 41, 59, 0.75);
    align-items: center;
  }

  .history-featured {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .history-featured-card {
    border: 1px solid transparent;
    border-radius: 0.75rem;
    background: rgba(30, 41, 59, 0.7);
    padding: 0.55rem 0.65rem;
    text-align: left;
    color: inherit;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .history-featured-card.selected {
    border-color: rgba(99, 102, 241, 0.75);
    box-shadow: 0 12px 24px rgba(67, 56, 202, 0.35);
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    max-height: 18rem;
    overflow-y: auto;
    padding-right: 0.2rem;
  }

  .history-item {
    border-radius: 0.75rem;
    border: 1px solid transparent;
    background: rgba(15, 23, 42, 0.55);
    padding: 0.55rem 0.65rem;
    text-align: left;
    color: inherit;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .history-item:hover,
  .history-item:focus-visible {
    border-color: rgba(99, 102, 241, 0.5);
    outline: none;
  }

  .history-item.selected {
    border-color: rgba(99, 102, 241, 0.8);
    box-shadow: 0 12px 24px rgba(67, 56, 202, 0.35);
  }

  .history-title {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .history-meta {
    font-size: 0.72rem;
    color: rgba(148, 163, 184, 0.78);
  }

  .history-filter {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .history-filter select {
    padding: 0.35rem 0.55rem;
    border-radius: 0.5rem;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(15, 23, 42, 0.65);
    color: inherit;
  }

  .story-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .story-title {
    font-weight: 500;
  }

  .story-meta {
    font-size: 0.72rem;
    color: rgba(148, 163, 184, 0.8);
  }

  .story-row-actions {
    display: flex;
    gap: 0.4rem;
  }

  .panel-card {
    background: rgba(15, 23, 42, 0.85);
    border-radius: 1.1rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
    padding: 1rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    backdrop-filter: blur(18px);
  }

  .panel-card-header h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
  }

  .panel-card-section {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .section-title {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(148, 163, 184, 0.8);
  }

  .creator-toolbar {
    position: fixed;
    left: 50%;
    bottom: calc(env(safe-area-inset-bottom) + 1.2rem);
    transform: translateX(-50%);
    background: rgba(15, 23, 42, 0.88);
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.25);
    padding: 0.45rem 0.75rem;
    display: flex;
    gap: 0.6rem;
    align-items: center;
    box-shadow: 0 16px 32px rgba(2, 6, 23, 0.55);
    backdrop-filter: blur(16px);
    z-index: 120;
    pointer-events: auto;
  }

  .toolbar-cluster {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .creator-toolbar button {
    border: none;
    background: none;
    color: inherit;
    border-radius: 0.75rem;
    padding: 0.45rem 0.6rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .creator-toolbar button:hover,
  .creator-toolbar button:focus-visible,
  .creator-toolbar button.selected {
    background: rgba(79, 70, 229, 0.55);
    outline: none;
  }

  .creator-toolbar button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .toolbar-group {
    position: relative;
  }

  .toolbar-menu {
    position: absolute;
    bottom: calc(100% + 0.4rem);
    left: 50%;
    transform: translateX(-50%);
    background: rgba(15, 23, 42, 0.95);
    border-radius: 0.8rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    box-shadow: 0 16px 32px rgba(2, 6, 23, 0.45);
    display: flex;
    flex-direction: column;
    min-width: 160px;
    padding: 0.45rem;
    z-index: 95;
  }

  .toolbar-menu button {
    width: 100%;
    background: none;
    padding: 0.45rem 0.6rem;
    border-radius: 0.65rem;
    font-size: 0.78rem;
    text-align: left;
  }

  .toolbar-menu button:hover,
  .toolbar-menu button:focus-visible {
    background: rgba(79, 70, 229, 0.35);
    outline: none;
  }

  .toolbar-icon {
    font-size: 1.05rem;
    line-height: 1;
  }

  .toggle-group {
    display: inline-flex;
    gap: 0.35rem;
    background: rgba(15, 23, 42, 0.8);
    border-radius: 999px;
    padding: 0.2rem;
  }

  .toggle-group button {
    font-size: 0.78rem;
    padding: 0.45rem 0.75rem;
  }

  .right-actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }

  .icon-button {
    border: none;
    background: rgba(15, 23, 42, 0.65);
    border-radius: 0.7rem;
    padding: 0.35rem 0.5rem;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .list-card {
    position: relative;
    border-radius: 0.95rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(15, 23, 42, 0.7);
    padding: 0.75rem 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .list-card.selected {
    border-color: rgba(99, 102, 241, 0.8);
    box-shadow: 0 16px 32px rgba(79, 70, 229, 0.35);
  }

  .list-card.hidden {
    opacity: 0.6;
  }

  .list-card-header {
    display: flex;
    gap: 0.55rem;
    align-items: center;
  }

  .list-card-header input {
    flex: 1 1 auto;
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.75);
    color: inherit;
    padding: 0.45rem 0.6rem;
  }

  .list-card textarea {
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.7);
    color: inherit;
    padding: 0.45rem 0.6rem;
    resize: vertical;
    min-height: 60px;
    font-family: inherit;
  }

  .list-card-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .card-menu {
    position: absolute;
    top: calc(100% - 0.4rem);
    right: 0.85rem;
    background: rgba(15, 23, 42, 0.95);
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
    box-shadow: 0 16px 32px rgba(2, 6, 23, 0.45);
    padding: 0.35rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    z-index: 60;
  }

  .card-menu button {
    background: none;
    border: none;
    color: inherit;
    padding: 0.4rem 0.6rem;
    text-align: left;
    border-radius: 0.6rem;
    font-size: 0.78rem;
    cursor: pointer;
  }

  .story-list-panel {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .empty-state {
    margin: 0;
    font-size: 0.78rem;
    color: rgba(148, 163, 184, 0.8);
  }

  .muted {
    color: rgba(148, 163, 184, 0.8);
    font-size: 0.78rem;
  }

  .notice {
    margin: 0;
    font-size: 0.78rem;
    color: rgba(148, 163, 184, 0.85);
  }

  .errored {
    color: #fca5a5;
  }

  .success {
    color: #86efac;
  }

  .welcome-overlay {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background: rgba(15, 23, 42, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 140;
    backdrop-filter: blur(14px);
  }

  .welcome-card {
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(129, 140, 248, 0.25);
    border-radius: 1.2rem;
    padding: 2.2rem 2.6rem;
    max-width: 520px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    box-shadow: 0 32px 64px rgba(30, 41, 59, 0.45);
  }

  .welcome-card h1 {
    margin: 0;
    font-size: 2rem;
  }

  .welcome-card p {
    margin: 0;
    color: rgba(191, 219, 254, 0.85);
  }

  .welcome-actions {
    display: inline-flex;
    gap: 0.75rem;
    justify-content: center;
  }

  .welcome-actions .chip {
    min-width: 120px;
    font-size: 1rem;
    padding: 0.75rem 1.5rem;
  }

  .welcome-actions .chip.active {
    box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.4);
  }

  .map-accordion {
    border-radius: 0.85rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.5);
    padding: 0.6rem 0.75rem;
  }

  .map-accordion summary {
    cursor: pointer;
    font-weight: 600;
    list-style: none;
  }

  .map-accordion summary::-webkit-details-marker {
    display: none;
  }

  .map-accordion[open] summary {
    margin-bottom: 0.6rem;
  }

  .catalog-filter {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 0.75rem;
  }

  .catalog-filter label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .catalog-filter select {
    padding: 0.35rem 0.55rem;
    border-radius: 0.5rem;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(15, 23, 42, 0.65);
    color: inherit;
  }

  .metadata-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.78);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 110;
    padding: 1.5rem;
  }

  .metadata-card {
    width: min(420px, 100%);
    background: rgba(15, 23, 42, 0.92);
    border-radius: 1rem;
    border: 1px solid rgba(129, 140, 248, 0.3);
    box-shadow: 0 32px 64px rgba(2, 6, 23, 0.6);
    padding: 1.1rem 1.3rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .metadata-card header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .metadata-card h2 {
    margin: 0;
    font-size: 1.25rem;
  }

  .metadata-section h3 {
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
  }

  .metadata-section dl {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .metadata-section dt {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(148, 163, 184, 0.8);
  }

  .metadata-section dd {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.4;
  }

  .metadata-card .chip {
    align-self: flex-end;
  }

  .search-dialog {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.78);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 110;
    padding: 1.5rem;
  }

  .dialog-backdrop {
    position: absolute;
    inset: 0;
    border: none;
    background: transparent;
    cursor: default;
  }

  .dialog-backdrop:focus-visible {
    outline: 2px solid rgba(129, 140, 248, 0.45);
  }

  .search-card {
    width: min(520px, 100%);
    background: rgba(15, 23, 42, 0.92);
    border-radius: 1rem;
    border: 1px solid rgba(129, 140, 248, 0.3);
    box-shadow: 0 32px 64px rgba(2, 6, 23, 0.55);
    padding: 1.15rem 1.3rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    position: relative;
    z-index: 1;
  }

  .search-card header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .search-card h2 {
    margin: 0;
    font-size: 1.25rem;
  }

  .search-form {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  .search-form input {
    padding: 0.65rem 0.75rem;
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(15, 23, 42, 0.85);
    color: inherit;
    font-size: 0.85rem;
  }

  .search-form-actions {
    display: flex;
    gap: 0.5rem;
  }

  .search-results-list {
    max-height: 260px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .search-result-item {
    background: rgba(30, 41, 59, 0.75);
    border: 1px solid transparent;
    border-radius: 0.75rem;
    padding: 0.65rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .search-result-item:hover,
  .search-result-item:focus-within {
    border-color: rgba(99, 102, 241, 0.5);
    box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.2);
    outline: none;
  }

  .search-result-main {
    text-align: left;
    background: transparent;
    border: none;
    padding: 0;
    color: inherit;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    cursor: pointer;
  }

  .search-result-main:focus-visible {
    outline: 2px solid rgba(99, 102, 241, 0.6);
    border-radius: 0.5rem;
    outline-offset: 2px;
  }

  .search-result-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 120;
    backdrop-filter: blur(12px);
    padding: 1rem;
  }

  .modal-card {
    background: rgba(15, 23, 42, 0.92);
    border-radius: 1rem;
    border: 1px solid rgba(129, 140, 248, 0.25);
    width: min(420px, 100%);
    padding: 1.2rem 1.4rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .modal-body label,
  .modal-body fieldset {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    font-size: 0.82rem;
  }

  .modal-body input,
  .modal-body textarea {
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.75);
    color: inherit;
    padding: 0.5rem 0.65rem;
    font-family: inherit;
  }

  .modal-body textarea {
    resize: vertical;
  }

  .modal-chip-group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
  }

  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(148, 163, 184, 0.55) transparent;
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.55);
    border-radius: 999px;
  }

  @media (max-width: 768px) {
    .viewer {
      border-radius: 0;
    }

    .workspace {
      padding-bottom: 90px;
    }

    .viewer-panel {
      border-radius: 1rem;
    }

    .section-block {
      padding: 0.75rem 0.85rem;
    }

    .map-grid {
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    }
  }
</style>
