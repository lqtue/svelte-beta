/**
 * layersStore — single source of truth for what the map renders.
 *
 *   base   = exactly one layer at the bottom (modern basemap OR historical map)
 *   overlays = 0..N historical maps on top, each with own opacity + visibility
 *
 * Conventions:
 *   - overlays array is TOP-OF-STACK FIRST (overlays[0] = topmost, displayed at top of UI list)
 *   - z-index when rendering: base = 0, overlays[N-1] = 10, overlays[N-2] = 11, … overlays[0] = 10 + (N-1)
 */
import { writable, derived, get, type Readable } from 'svelte/store';
import { browser } from '$app/environment';
import { randomId } from '$lib/utils/id';
import { readJson, writeJson } from '$lib/utils/persistence/storage';

export type BasemapRef = { kind: 'basemap'; key: string };
export type HistoricalRef = {
  kind: 'historical';
  mapId: string; // maps.id (uuid)
  allmapsId: string; // annotation source (allmaps id or annotation url)
  name?: string;
  thumbnail?: string;
};
export type LayerRef = BasemapRef | HistoricalRef;

/** Build a HistoricalRef from a catalogue row. `annotation_url` (R2 mirror) wins over the bare Allmaps id. */
export function toHistoricalRef(map: {
  id: string;
  allmaps_id?: string | null;
  annotation_url?: string | null;
  name?: string | null;
  thumbnail?: string | null;
}): HistoricalRef {
  return {
    kind: 'historical',
    mapId: map.id,
    allmapsId: map.annotation_url ?? map.allmaps_id ?? '',
    name: map.name ?? undefined,
    thumbnail: map.thumbnail ?? undefined,
  };
}

export interface OverlayLayer {
  /** Stable local id (for keyed iteration; survives reorder). */
  id: string;
  ref: HistoricalRef; // overlays can only be historical for now
  opacity: number; // 0..1
  visible: boolean;
}

export interface LayersState {
  base: LayerRef;
  overlays: OverlayLayer[]; // index 0 = topmost
}

const STORAGE_KEY = 'vma-layers-v1';
const DEFAULT_BASE: BasemapRef = { kind: 'basemap', key: 'g-streets' };
const DEFAULT: LayersState = { base: DEFAULT_BASE, overlays: [] };
const MAX_OVERLAYS = 10;

function load(): LayersState {
  if (!browser) return { base: DEFAULT_BASE, overlays: [] };
  const parsed = readJson<Partial<LayersState> | null>(STORAGE_KEY, null);
  if (!parsed) return { base: DEFAULT_BASE, overlays: [] };
  const base: LayerRef =
    parsed.base?.kind === 'historical' || parsed.base?.kind === 'basemap'
      ? parsed.base
      : DEFAULT_BASE;
  const overlays: OverlayLayer[] = Array.isArray(parsed.overlays)
    ? parsed.overlays
        .filter((o: any) => o?.ref?.kind === 'historical' && o.ref.mapId && o.ref.allmapsId)
        .slice(0, MAX_OVERLAYS)
        .map((o: any) => ({
          id: String(o.id ?? makeId()),
          ref: o.ref,
          opacity: clamp01(typeof o.opacity === 'number' ? o.opacity : 1),
          visible: o.visible !== false,
        }))
    : [];
  return { base, overlays };
}

function persist(s: LayersState) {
  if (browser) writeJson(STORAGE_KEY, s);
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
const makeId = () => randomId('layer');

function create() {
  const inner = writable<LayersState>(load());
  const { subscribe, update } = inner;

  return {
    subscribe,

    setBase(ref: LayerRef) {
      update((s) => {
        const next = { ...s, base: ref };
        persist(next);
        return next;
      });
    },

    /** Add as topmost overlay. Returns the new layer id; no-op if already present. */
    addOverlay(ref: HistoricalRef, opts: { opacity?: number } = {}): string {
      let id = '';
      update((s) => {
        if (s.overlays.some((o) => o.ref.mapId === ref.mapId)) return s;
        if (s.overlays.length >= MAX_OVERLAYS) return s;
        id = makeId();
        const layer: OverlayLayer = {
          id,
          ref,
          opacity: clamp01(opts.opacity ?? 1),
          visible: true,
        };
        const next = { ...s, overlays: [layer, ...s.overlays] };
        persist(next);
        return next;
      });
      return id;
    },

    removeOverlay(id: string) {
      update((s) => {
        const next = { ...s, overlays: s.overlays.filter((o) => o.id !== id) };
        persist(next);
        return next;
      });
    },

    removeOverlayByMapId(mapId: string) {
      update((s) => {
        const next = { ...s, overlays: s.overlays.filter((o) => o.ref.mapId !== mapId) };
        persist(next);
        return next;
      });
    },

    setOpacity(id: string, opacity: number) {
      update((s) => {
        const next = {
          ...s,
          overlays: s.overlays.map((o) => (o.id === id ? { ...o, opacity: clamp01(opacity) } : o)),
        };
        persist(next);
        return next;
      });
    },

    setVisible(id: string, visible: boolean) {
      update((s) => {
        const next = {
          ...s,
          overlays: s.overlays.map((o) => (o.id === id ? { ...o, visible } : o)),
        };
        persist(next);
        return next;
      });
    },

    /** Move overlay at index `from` to index `to`. */
    reorderOverlay(from: number, to: number) {
      update((s) => {
        if (from < 0 || from >= s.overlays.length) return s;
        const arr = s.overlays.slice();
        const [item] = arr.splice(from, 1);
        arr.splice(Math.max(0, Math.min(arr.length, to)), 0, item);
        const next = { ...s, overlays: arr };
        persist(next);
        return next;
      });
    },

    clearOverlays() {
      update((s) => {
        const next = { ...s, overlays: [] };
        persist(next);
        return next;
      });
    },

    isOverlay(mapId: string): boolean {
      return get(inner).overlays.some((o) => o.ref.mapId === mapId);
    },
  };
}

export const layersStore = create();
export const MAX_OVERLAY_LAYERS = MAX_OVERLAYS;

// ── Derived: top overlay ──
// `createGeoMapStores()` mirrors this into the per-instance mapStore's
// activeMapId/activeAllmapsId, which the URL hash + story playback read.
/**
 * Add the map to the overlay stack, or remove it if it's already on.
 * No-op for maps without an annotation source, or when the stack is full.
 * Returns the resulting membership (true = now an overlay).
 */
export function toggleOverlayFor(map: Parameters<typeof toHistoricalRef>[0]): boolean {
  const ref = toHistoricalRef(map);
  if (!ref.allmapsId) return layersStore.isOverlay(ref.mapId);
  if (layersStore.isOverlay(ref.mapId)) {
    layersStore.removeOverlayByMapId(ref.mapId);
    return false;
  }
  if (get(layersStore).overlays.length >= MAX_OVERLAYS) return false;
  layersStore.addOverlay(ref);
  return true;
}

export const topOverlay: Readable<HistoricalRef | null> = derived(
  layersStore,
  ($l) => $l.overlays[0]?.ref ?? null
);
