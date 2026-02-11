/**
 * Central map view state — single source of truth for map position.
 *
 * Every mode (studio, trip, explorer, lab) reads/writes the same store
 * so that deep-link handoffs preserve the exact camera position.
 */

import { writable, derived, get, type Readable } from 'svelte/store';
import { fromLonLat, toLonLat } from 'ol/proj';

// ── Types ────────────────────────────────────────────────────────────

export interface MapViewState {
	/** EPSG:4326 longitude */
	lng: number;
	/** EPSG:4326 latitude */
	lat: number;
	zoom: number;
	/** Radians, clockwise from north */
	rotation: number;
}

export interface MapStoreValue extends MapViewState {
	/** Currently loaded historical map overlay id (null = none) */
	activeMapId: string | null;
}

export interface MapStore extends Readable<MapStoreValue> {
	setView(view: Partial<MapViewState>): void;
	setActiveMap(id: string | null): void;
	setAll(value: Partial<MapStoreValue>): void;
	reset(): void;
}

// ── Defaults (Saigon, Vietnam) ───────────────────────────────────────

const DEFAULTS: MapStoreValue = {
	lng: 106.70098,
	lat: 10.77653,
	zoom: 14,
	rotation: 0,
	activeMapId: null
};

// ── Factory ──────────────────────────────────────────────────────────

export function createMapStore(initial?: Partial<MapStoreValue>): MapStore {
	const { subscribe, update, set } = writable<MapStoreValue>({
		...DEFAULTS,
		...initial
	});

	return {
		subscribe,

		setView(view: Partial<MapViewState>) {
			update((s) => ({ ...s, ...view }));
		},

		setActiveMap(id: string | null) {
			update((s) => ({ ...s, activeMapId: id }));
		},

		setAll(value: Partial<MapStoreValue>) {
			update((s) => ({ ...s, ...value }));
		},

		reset() {
			set({ ...DEFAULTS });
		}
	};
}

// ── Derived helpers ──────────────────────────────────────────────────

/** Derive an EPSG:3857 coordinate pair from mapStore (for OL View) */
export function deriveOlCenter(store: Readable<MapStoreValue>): Readable<[number, number]> {
	return derived(store, ($s) => fromLonLat([$s.lng, $s.lat]) as [number, number]);
}

/** Read the current OL center synchronously */
export function getOlCenter(store: MapStore): [number, number] {
	const $s = get(store);
	return fromLonLat([$s.lng, $s.lat]) as [number, number];
}

/** Convert an OL EPSG:3857 coordinate back to lng/lat */
export function fromOlCoordinate(coord: [number, number]): { lng: number; lat: number } {
	const [lng, lat] = toLonLat(coord);
	return { lng, lat };
}
