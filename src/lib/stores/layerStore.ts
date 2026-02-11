/**
 * Layer visibility store — controls which basemap is active
 * and overlay display settings.
 *
 * Basemap keys match BASEMAP_DEFS in viewer/constants.ts:
 *   'g-streets' | 'g-satellite'
 *
 * The MapShell component subscribes here and toggles OL layer visibility.
 */

import { writable, type Readable } from 'svelte/store';
import type { ViewMode } from '$lib/viewer/types';

// ── Types ────────────────────────────────────────────────────────────

export interface LayerStoreValue {
	/** Key of the active basemap (from BASEMAP_DEFS) */
	basemap: string;
	/** Overlay opacity 0-1 */
	overlayOpacity: number;
	/** Whether the historical overlay is visible */
	overlayVisible: boolean;
	/** View comparison mode */
	viewMode: ViewMode;
	/** Side-by-side split ratio (0.01 – 0.99) */
	sideRatio: number;
	/** Spy-glass lens radius in px */
	lensRadius: number;
}

export interface LayerStore extends Readable<LayerStoreValue> {
	setBasemap(key: string): void;
	setOverlayOpacity(opacity: number): void;
	setOverlayVisible(visible: boolean): void;
	setViewMode(mode: ViewMode): void;
	setSideRatio(ratio: number): void;
	setLensRadius(radius: number): void;
	setAll(value: Partial<LayerStoreValue>): void;
	reset(): void;
}

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULTS: LayerStoreValue = {
	basemap: 'g-streets',
	overlayOpacity: 0.8,
	overlayVisible: true,
	viewMode: 'overlay',
	sideRatio: 0.5,
	lensRadius: 150
};

// ── Factory ──────────────────────────────────────────────────────────

export function createLayerStore(initial?: Partial<LayerStoreValue>): LayerStore {
	const { subscribe, update, set } = writable<LayerStoreValue>({
		...DEFAULTS,
		...initial
	});

	return {
		subscribe,

		setBasemap(key: string) {
			update((s) => ({ ...s, basemap: key }));
		},

		setOverlayOpacity(opacity: number) {
			const clamped = Math.max(0, Math.min(1, opacity));
			update((s) => ({ ...s, overlayOpacity: clamped }));
		},

		setOverlayVisible(visible: boolean) {
			update((s) => ({ ...s, overlayVisible: visible }));
		},

		setViewMode(mode: ViewMode) {
			update((s) => ({ ...s, viewMode: mode }));
		},

		setSideRatio(ratio: number) {
			const clamped = Math.max(0.01, Math.min(0.99, ratio));
			update((s) => ({ ...s, sideRatio: clamped }));
		},

		setLensRadius(radius: number) {
			const clamped = Math.max(20, radius);
			update((s) => ({ ...s, lensRadius: clamped }));
		},

		setAll(value: Partial<LayerStoreValue>) {
			update((s) => ({ ...s, ...value }));
		},

		reset() {
			set({ ...DEFAULTS });
		}
	};
}
