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
	/** View comparison mode */
	viewMode: ViewMode;
	/** ponytail: fixed at 0.5 — no drag handle ships yet. Add setSideRatio when one does. */
	sideRatio: number;
	/** Spy-glass lens radius in px */
	lensRadius: number;
	/** Custom XYZ tile URL template (when basemap === 'g-custom') */
	customBaseUrl: string | null;
}

export interface LayerStore extends Readable<LayerStoreValue> {
	setBasemap(key: string): void;
	setViewMode(mode: ViewMode): void;
	setLensRadius(radius: number): void;
	setCustomBaseUrl(url: string | null): void;
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
	viewMode: 'overlay',
	sideRatio: 0.5,
	lensRadius: 150,
	customBaseUrl: null
};

// ── Factory ──────────────────────────────────────────────────────────

export function createLayerStore(initial?: Partial<LayerStoreValue>): LayerStore {
	const { subscribe, update } = writable<LayerStoreValue>({
		...DEFAULTS,
		customBaseUrl: loadCustomBaseUrl(),
		...initial
	});

	return {
		subscribe,

		setBasemap(key: string) {
			update((s) => ({ ...s, basemap: key }));
		},

		setViewMode(mode: ViewMode) {
			update((s) => ({ ...s, viewMode: mode }));
		},

		setLensRadius(radius: number) {
			update((s) => ({ ...s, lensRadius: Math.max(20, radius) }));
		},

		setCustomBaseUrl(url: string | null) {
			const v = url && url.trim() ? url.trim() : null;
			saveCustomBaseUrl(v);
			update((s) => ({ ...s, customBaseUrl: v }));
		}
	};
}
