<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import VectorSource from 'ol/source/Vector';
  import VectorImageLayer from 'ol/layer/VectorImage';
  import Draw from 'ol/interaction/Draw';
  import Modify from 'ol/interaction/Modify';
  import Select from 'ol/interaction/Select';
  import GeoJSON from 'ol/format/GeoJSON';
  import Feature from 'ol/Feature';
  import Point from 'ol/geom/Point';
  import type { Geometry } from 'ol/geom';
  import type { EventsKey } from 'ol/events';
  import { fromLonLat } from 'ol/proj';
  import Style from 'ol/style/Style';
  import Stroke from 'ol/style/Stroke';
  import Fill from 'ol/style/Fill';
  import CircleStyle from 'ol/style/Circle';
  import Text from 'ol/style/Text';

  import type { DrawingMode, SearchResult } from '$lib/map/types';
  import { DRAW_TYPE_MAP } from '$lib/map/constants';
  import {
    ensureAnnotationDefaults,
    createAnnotationStyle,
    searchResultStyle,
  } from '$lib/map/olAnnotations';
  import type { FeatureSnapshot } from '$lib/map/annotationHistory';
  import { createAnnotationCommands } from '$lib/map/annotationCommands';
  import { getShellContext } from './context';
  import { getAnnotationContext } from '$lib/map/annotationContext';

  export let drawingMode: DrawingMode | null = null;
  export let editingEnabled = true;

  const geoJsonFormat = new GeoJSON();
  const dispatch = createEventDispatcher();
  const { map: mapWritable } = getShellContext();
  const { history: annotationHistory, state: annotationState } = getAnnotationContext();

  let map: import('ol/Map').default | null = null;
  let unsubs: (() => void)[] = [];
  let initialized = false;

  export let annotationSource = new VectorSource<Feature<Geometry>>({ wrapX: false });
  let annotationLayer = new VectorImageLayer({
    source: annotationSource,
    style: createAnnotationStyle,
    zIndex: 100,
  });

  let searchSource = new VectorSource<Feature<Geometry>>({ wrapX: false });
  let searchLayer = new VectorImageLayer({
    source: searchSource,
    style: searchResultStyle,
    zIndex: 110,
  });

  let drawInteraction: Draw | null = null;
  let modifyInteraction: Modify | null = null;
  let selectInteraction: Select | null = null;

  // All history-recording mutation of annotationSource goes through here.
  const commands = createAnnotationCommands({
    source: annotationSource,
    history: annotationHistory,
    state: annotationState,
    geoJson: geoJsonFormat,
  });

  // React to drawing mode changes
  $: if (initialized && map) {
    applyDrawInteraction(drawingMode);
  }

  // React to editing enabled
  $: if (initialized && map && modifyInteraction) {
    const hasModify = map.getInteractions().getArray().includes(modifyInteraction);
    if (editingEnabled && !hasModify) map.addInteraction(modifyInteraction);
    else if (!editingEnabled && hasModify) map.removeInteraction(modifyInteraction);
  }

  // --- Interactions ---

  function applyDrawInteraction(mode: DrawingMode | null) {
    if (!map) return;
    if (drawInteraction) {
      map.removeInteraction(drawInteraction);
      drawInteraction = null;
    }
    if (!mode) return;

    const drawType = DRAW_TYPE_MAP[mode];
    drawInteraction = new Draw({ source: annotationSource, type: drawType });
    drawInteraction.on('drawstart', () => selectInteraction?.getFeatures().clear());
    drawInteraction.on('drawend', (event) => {
      const feature = event.feature as Feature<Geometry>;
      ensureAnnotationDefaults(feature);
      annotationState.setSelected(String(feature.getId()));
      commands.updateSummaries();
      commands.recordAdd(feature);
    });
    map.addInteraction(drawInteraction);
  }

  export function deactivateDrawing() {
    drawingMode = null;
  }

  // --- External API ---

  export function getAnnotationFeature(id: string) {
    return annotationSource.getFeatureById(id) ?? null;
  }

  export function updateAnnotationLabel(id: string, label: string) {
    const feature = getAnnotationFeature(id) as Feature<Geometry> | null;
    if (!feature) return;
    const previous = feature.get('label') ?? '';
    if (previous === label) return;
    feature.set('label', label);
    commands.recordFieldChange(feature, 'label', previous, label);
    commands.updateSummaries();
  }

  export function updateAnnotationDetails(id: string, details: string) {
    const feature = getAnnotationFeature(id) as Feature<Geometry> | null;
    if (!feature) return;
    const previous = feature.get('details') ?? '';
    if (previous === details) return;
    feature.set('details', details);
    commands.recordFieldChange(feature, 'details', previous, details);
    commands.updateSummaries();
  }

  export function updateAnnotationColor(id: string, color: string) {
    const feature = getAnnotationFeature(id) as Feature<Geometry> | null;
    if (!feature) return;
    const previous = feature.get('color') ?? '';
    if (previous === color) return;
    feature.set('color', color);
    commands.recordFieldChange(feature, 'color', previous, color);
    commands.updateSummaries();
  }

  export function toggleAnnotationVisibility(id: string) {
    const feature = getAnnotationFeature(id) as Feature<Geometry> | null;
    if (!feature) return;
    const hidden = Boolean(feature.get('hidden'));
    feature.set('hidden', !hidden);
    commands.recordFieldChange(feature, 'hidden', hidden, !hidden);
    commands.updateSummaries();
  }

  export function zoomToAnnotation(id: string) {
    if (!map) return;
    const feature = getAnnotationFeature(id) as Feature<Geometry> | null;
    const geometry = feature?.getGeometry();
    if (!geometry) return;
    if (geometry.getType() === 'Point') {
      const coords = (geometry as Point).getCoordinates() as [number, number];
      map.getView().animate({
        center: coords,
        zoom: Math.max(map.getView().getZoom() ?? 16, 17),
        duration: 350,
      });
    } else {
      map
        .getView()
        .fit(geometry.getExtent(), { padding: [80, 80, 80, 80], duration: 400, maxZoom: 18 });
    }
  }

  export function deleteAnnotation(id: string) {
    const feature = getAnnotationFeature(id) as Feature<Geometry> | null;
    if (!feature) return;
    commands.recordDelete(feature);
    annotationSource.removeFeature(feature);
    annotationState.clearSelectionIfMatches(id);
    commands.updateSummaries();
  }

  export function clearAnnotations() {
    const features = annotationSource.getFeatures();
    commands.recordClear(features);
    annotationSource.clear();
    annotationState.reset();
  }

  export function exportAnnotationsAsGeoJSON() {
    const features = annotationSource.getFeatures();
    if (!features.length) return;
    const collection = geoJsonFormat.writeFeaturesObject(features, {
      featureProjection: 'EPSG:3857',
      dataProjection: 'EPSG:4326',
    });
    const blob = new Blob([JSON.stringify(collection, null, 2)], {
      type: 'application/geo+json;charset=utf-8;',
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `annotations-${stamp}.geojson`;
    link.click();
    URL.revokeObjectURL(url);
  }

  export function exportAnnotationsAsGeoJsonObject() {
    const features = annotationSource.getFeatures();
    return geoJsonFormat.writeFeaturesObject(features, {
      featureProjection: 'EPSG:3857',
      dataProjection: 'EPSG:4326',
    });
  }

  export async function importGeoJsonText(text: string) {
    const json = JSON.parse(text);
    const features = geoJsonFormat.readFeatures(json, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    }) as Feature<Geometry>[];
    features.forEach((f) => ensureAnnotationDefaults(f));
    annotationSource.addFeatures(features);
    commands.recordBulkAdd(features);
    commands.updateSummaries();
    return features.length;
  }

  export function undoLastAction() {
    commands.undo();
  }

  export function redoLastAction() {
    commands.redo();
  }

  // --- Search api ---
  export function featureFromSearchResult(result: SearchResult): Feature<Geometry> | null {
    try {
      if (result.geojson) {
        const feature = geoJsonFormat.readFeature(
          { type: 'Feature', geometry: result.geojson as any, properties: {} },
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
    if (!map) return;
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
        duration: 400,
      });
    } else {
      map
        .getView()
        .fit(geometry.getExtent(), { padding: [80, 80, 80, 80], duration: 400, maxZoom: 18 });
    }
  }

  export function addSearchResultToAnnotations(result: SearchResult) {
    const feature = featureFromSearchResult(result);
    if (!feature) return;
    ensureAnnotationDefaults(feature);
    annotationSource.addFeature(feature);
    commands.recordAdd(feature);
    annotationState.setSelected(String(feature.getId()));
    commands.updateSummaries();
  }

  export function clearSearchLayer() {
    searchSource.clear();
  }

  // --- Hook to map ---

  onMount(() => {
    unsubs.push(
      mapWritable.subscribe(($map) => {
        if (!$map || initialized) return;
        initialized = true;
        map = $map;

        map.addLayer(searchLayer);
        map.addLayer(annotationLayer);

        modifyInteraction = new Modify({ source: annotationSource });
        modifyInteraction.on('modifystart', (e) => {
          const tempSnapshots = new Map<string, FeatureSnapshot>();
          e.features.forEach((f) =>
            tempSnapshots.set(String(f.getId()), commands.snapshot(f as Feature<Geometry>))
          );
          (modifyInteraction as any)._tempSnapshots = tempSnapshots;
        });
        modifyInteraction.on('modifyend', (e) => {
          const tempSnapshots = (modifyInteraction as any)._tempSnapshots as Map<
            string,
            FeatureSnapshot
          >;
          if (!tempSnapshots) return;
          e.features.forEach((f) => {
            const id = String(f.getId());
            const before = tempSnapshots.get(id);
            if (before) {
              const after = commands.snapshot(f as Feature<Geometry>);
              commands.push({ kind: 'annotation-geometry', before, after });
              commands.updateSummaries();
            }
          });
        });

        if (editingEnabled) map.addInteraction(modifyInteraction);
      })
    );
  });

  onDestroy(() => {
    unsubs.forEach((u) => u());
    if (map) {
      if (drawInteraction) map.removeInteraction(drawInteraction);
      if (modifyInteraction) map.removeInteraction(modifyInteraction);
      if (selectInteraction) map.removeInteraction(selectInteraction);
      map.removeLayer(annotationLayer);
      map.removeLayer(searchLayer);
    }
  });
</script>
