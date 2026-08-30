/**
 * annotationCommands.ts — the history-recording layer between DrawTool's
 * OpenLayers interactions and the annotation stores.
 *
 * Everything that mutates `annotationSource` and wants to be undoable goes
 * through here: snapshot capture, the `record*` helpers that push a
 * HistoryEntry, and `applyHistoryEntry` which replays one in either direction.
 * DrawTool keeps the OL wiring (Draw / Modify / Select, layers, zoom) and calls
 * into this module; nothing here touches an `ol/Map`.
 */
import type VectorSource from 'ol/source/Vector';
import type Feature from 'ol/Feature';
import type { Geometry } from 'ol/geom';
import type GeoJSON from 'ol/format/GeoJSON';

import { ensureAnnotationDefaults, toAnnotationSummary } from './olAnnotations';
import {
  captureFeatureSnapshot as snapshotFeature,
  restoreFeatureFromSnapshot as restoreSnapshot,
  type FeatureSnapshot,
  type HistoryEntry,
  type AnnotationField,
  type AnnotationHistoryStore,
} from './annotationHistory';
import type { AnnotationStateStore } from './annotationState';

export interface AnnotationCommandsOptions {
  source: VectorSource<Feature<Geometry>>;
  history: AnnotationHistoryStore;
  state: AnnotationStateStore;
  geoJson: GeoJSON;
}

export interface AnnotationCommands {
  /** Re-derives the sidebar summary list from the current source contents. */
  updateSummaries(): void;
  snapshot(feature: Feature<Geometry>): FeatureSnapshot;
  addSnapshotToSource(snapshot: FeatureSnapshot): Feature<Geometry> | null;
  removeFeatureById(id: string): Feature<Geometry> | null;
  /** Pushes an entry unless a history replay is in progress. */
  push(entry: HistoryEntry): void;
  recordAdd(feature: Feature<Geometry>): void;
  recordDelete(feature: Feature<Geometry>): void;
  recordFieldChange(
    feature: Feature<Geometry>,
    field: AnnotationField,
    before: unknown,
    after: unknown
  ): void;
  recordClear(features: Feature<Geometry>[]): void;
  recordBulkAdd(features: Feature<Geometry>[]): void;
  undo(): void;
  redo(): void;
}

export function createAnnotationCommands(opts: AnnotationCommandsOptions): AnnotationCommands {
  const { source, history, state, geoJson } = opts;

  // Set while replaying a history entry so the mutations below don't record
  // themselves back onto the stack.
  let suppressHistory = false;

  function updateSummaries() {
    state.setList(source.getFeatures().map((f) => toAnnotationSummary(f)));
  }

  function snapshot(feature: Feature<Geometry>): FeatureSnapshot {
    ensureAnnotationDefaults(feature);
    return snapshotFeature(feature, { geoJson });
  }

  function restore(snap: FeatureSnapshot): Feature<Geometry> {
    const restored = restoreSnapshot(snap, { geoJson });
    ensureAnnotationDefaults(restored);
    return restored;
  }

  function addSnapshotToSource(snap: FeatureSnapshot): Feature<Geometry> | null {
    const existing = source.getFeatureById(snap.id);
    if (existing) source.removeFeature(existing as Feature<Geometry>);
    const restored = restore(snap);
    source.addFeature(restored);
    return restored;
  }

  function removeFeatureById(id: string): Feature<Geometry> | null {
    const feature = source.getFeatureById(id) as Feature<Geometry> | null;
    if (feature) source.removeFeature(feature);
    return feature;
  }

  function push(entry: HistoryEntry) {
    if (suppressHistory) return;
    history.push(entry);
  }

  function recordAdd(feature: Feature<Geometry>) {
    push({ kind: 'annotation-add', snapshot: snapshot(feature) });
  }

  function recordDelete(feature: Feature<Geometry>) {
    push({ kind: 'annotation-delete', snapshot: snapshot(feature) });
  }

  function recordFieldChange(
    feature: Feature<Geometry>,
    field: AnnotationField,
    before: unknown,
    after: unknown
  ) {
    if (before === after) return;
    push({
      kind: 'annotation-update',
      id: String(feature.getId()),
      changes: [{ field, before, after }],
    });
  }

  function recordClear(features: Feature<Geometry>[]) {
    if (!features.length) return;
    push({ kind: 'annotation-clear', snapshots: features.map((f) => snapshot(f)) });
  }

  function recordBulkAdd(features: Feature<Geometry>[]) {
    if (!features.length) return;
    push({ kind: 'annotation-bulk-add', snapshots: features.map((f) => snapshot(f)) });
  }

  function applyHistoryEntry(entry: HistoryEntry, direction: 'undo' | 'redo') {
    switch (entry.kind) {
      case 'annotation-add':
        if (direction === 'undo') {
          removeFeatureById(entry.snapshot.id);
          state.clearSelectionIfMatches(entry.snapshot.id);
        } else {
          const added = addSnapshotToSource(entry.snapshot);
          if (added) state.setSelected(entry.snapshot.id);
        }
        break;
      case 'annotation-delete':
        if (direction === 'undo') {
          const added = addSnapshotToSource(entry.snapshot);
          if (added) state.setSelected(entry.snapshot.id);
        } else {
          removeFeatureById(entry.snapshot.id);
          state.clearSelectionIfMatches(entry.snapshot.id);
        }
        break;
      case 'annotation-update': {
        const feature = source.getFeatureById(entry.id) as Feature<Geometry> | null;
        if (!feature) break;
        entry.changes.forEach((change) => {
          const value = direction === 'undo' ? change.before : change.after;
          feature.set(change.field, change.field === 'hidden' ? Boolean(value) : value);
        });
        feature.changed?.();
        break;
      }
      case 'annotation-geometry': {
        const snap = direction === 'undo' ? entry.before : entry.after;
        addSnapshotToSource(snap);
        state.setSelected(snap.id);
        break;
      }
      case 'annotation-clear':
        if (direction === 'undo') {
          source.clear();
          entry.snapshots.forEach((s) => addSnapshotToSource(s));
        } else {
          source.clear();
          state.clearSelection();
        }
        break;
      case 'annotation-bulk-add':
        if (direction === 'undo') {
          entry.snapshots.forEach((s) => {
            removeFeatureById(s.id);
            state.clearSelectionIfMatches(s.id);
          });
        } else {
          entry.snapshots.forEach((s) => addSnapshotToSource(s));
        }
        break;
    }
    updateSummaries();
  }

  function replay(entry: HistoryEntry | null | undefined, direction: 'undo' | 'redo') {
    if (!entry) return;
    suppressHistory = true;
    applyHistoryEntry(entry, direction);
    suppressHistory = false;
  }

  return {
    updateSummaries,
    snapshot,
    addSnapshotToSource,
    removeFeatureById,
    push,
    recordAdd,
    recordDelete,
    recordFieldChange,
    recordClear,
    recordBulkAdd,
    undo: () => replay(history.undo(), 'undo'),
    redo: () => replay(history.redo(), 'redo'),
  };
}
