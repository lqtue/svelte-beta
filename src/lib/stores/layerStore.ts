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
import type { ViewMode } from '$lib/map/types';

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
	/** Custom XYZ tile URL template (when basemap === 'g-custom') */
	customBaseUrl: string | null;
}

export interface LayerStore extends Readable<LayerStoreValue> {
	setBasemap(key: string): void;
	setOverlayOpacity(opacity: number): void;
	setOverlayVisible(visible: boolean): void;
	setViewMode(mode: ViewMode): void;
	setSideRatio(ratio: number): void;
	setLensRadius(radius: number): void;
	setCustomBaseUrl(url: string | null): void;
	setAll(value: Partial<LayerStoreValue>): void;
	reset(): void;
}

const CUSTOM_URL_KEY = 'vma-custom-base-url';

function loadCustomBaseUrl(): string | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		return localStorage.getItem(CUSTOM_URL_KEY);
	} catch {
		return null;
	}
}

function saveCustomBaseUrl(url: string | null): void {
	if (typeof localStorage === 'undefined') return;
	try {
		if (url) localStorage.setItem(CUSTOM_URL_KEY, url);
		else localStorage.removeItem(CUSTOM_URL_KEY);
	} catch {
		/* ignore */
	}
}

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULTS: LayerStoreValue = {
	basemap: 'g-streets',
	overlayOpacity: 0.8,
	overlayVisible: true,
	viewMode: 'overlay',
	sideRatio: 0.5,
	lensRadius: 150,
	customBaseUrl: null
};

// ── Factory ──────────────────────────────────────────────────────────

export function createLayerStore(initial?: Partial<LayerStoreValue>): LayerStore {
	const { subscribe, update, set } = writable<LayerStoreValue>({
		...DEFAULTS,
		customBaseUrl: loadCustomBaseUrl(),
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

		setCustomBaseUrl(url: string | null) {
			const v = url && url.trim() ? url.trim() : null;
			saveCustomBaseUrl(v);
			update((s) => ({ ...s, customBaseUrl: v }));
		},

		setAll(value: Partial<LayerStoreValue>) {
			update((s) => ({ ...s, ...value }));
		},

		reset() {
			set({ ...DEFAULTS });
		}
	};
}
