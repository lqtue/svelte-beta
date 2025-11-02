import { writable, type Readable } from 'svelte/store';
import type Feature from 'ol/Feature';
import type { Geometry } from 'ol/geom';
import type { Feature as GeoJsonFeature, Geometry as GeoJsonGeometry } from 'geojson';
import GeoJSON from 'ol/format/GeoJSON';

export type AnnotationField = 'label' | 'color' | 'details' | 'hidden';

export interface FeatureSnapshot {
  id: string;
  feature: GeoJsonFeature<GeoJsonGeometry>;
}

export type HistoryEntry =
  | { kind: 'annotation-add'; snapshot: FeatureSnapshot }
  | { kind: 'annotation-delete'; snapshot: FeatureSnapshot }
  | { kind: 'annotation-update'; id: string; changes: Array<{ field: AnnotationField; before: unknown; after: unknown }> }
  | { kind: 'annotation-geometry'; before: FeatureSnapshot; after: FeatureSnapshot }
  | { kind: 'annotation-clear'; snapshots: FeatureSnapshot[] }
  | { kind: 'annotation-bulk-add'; snapshots: FeatureSnapshot[] };

export interface AnnotationHistoryState {
  history: HistoryEntry[];
  future: HistoryEntry[];
}

export interface AnnotationHistoryStore extends Readable<AnnotationHistoryState> {
  push(entry: HistoryEntry): void;
  undo(): HistoryEntry | null;
  redo(): HistoryEntry | null;
  reset(): void;
  readonly limit: number;
}

export interface SnapshotOptions {
  geoJson?: GeoJSON;
}

const DEFAULT_LIMIT = 100;

export function createAnnotationHistoryStore(limit = DEFAULT_LIMIT): AnnotationHistoryStore {
  const { subscribe, update, set } = writable<AnnotationHistoryState>({
    history: [],
    future: []
  });

  return {
    subscribe,
    limit,
    push(entry: HistoryEntry) {
      update((state) => {
        const history = [...state.history.slice(-limit + 1), entry];
        return {
          history,
          future: []
        };
      });
    },
    undo() {
      let undone: HistoryEntry | null = null;
      update((state) => {
        if (!state.history.length) return state;
        undone = state.history[state.history.length - 1];
        return {
          history: state.history.slice(0, -1),
          future: [...state.future, undone]
        };
      });
      return undone;
    },
    redo() {
      let restored: HistoryEntry | null = null;
      update((state) => {
        if (!state.future.length) return state;
        restored = state.future[state.future.length - 1];
        return {
          history: [...state.history, restored],
          future: state.future.slice(0, -1)
        };
      });
      return restored;
    },
    reset() {
      set({
        history: [],
        future: []
      });
    }
  };
}

export function captureFeatureSnapshot(feature: Feature<Geometry>, options: SnapshotOptions = {}): FeatureSnapshot {
  const { geoJson = new GeoJSON() } = options;
  const id = String(feature.getId());
  const geojson = geoJson.writeFeatureObject(feature, {
    featureProjection: 'EPSG:3857',
    dataProjection: 'EPSG:4326'
  }) as GeoJsonFeature<GeoJsonGeometry>;
  geojson.id = id;
  return { id, feature: geojson };
}

export function restoreFeatureFromSnapshot(snapshot: FeatureSnapshot, options: SnapshotOptions = {}): Feature<Geometry> {
  const { geoJson = new GeoJSON() } = options;
  const restored = geoJson.readFeature(snapshot.feature, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
  }) as Feature<Geometry>;
  restored.setId(snapshot.id);
  return restored;
}
