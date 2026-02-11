/**
 * Bidirectional URL ↔ mapStore + layerStore sync.
 *
 * Hash format:  #@<lat>,<lng>,<zoom>z,<rotation>r&map=<id>&base=<key>
 *
 * Examples:
 *   #@10.7765,106.7010,14z,0r
 *   #@10.7765,106.7010,14z,0r&map=abc123&base=g-satellite
 *
 * Design:
 *   - Store → URL: debounced (300ms) to avoid history spam
 *   - URL → Store: on popstate (back/forward) and on init
 *   - A suppression flag prevents infinite loops
 *   - Call `initUrlSync()` once in your root shell component's onMount
 *   - Call the returned teardown function in onDestroy
 */

import { get } from 'svelte/store';
import { replaceState, pushState } from '$app/navigation';
import { page } from '$app/stores';
import type { MapStore, MapStoreValue } from './mapStore';
import type { LayerStore, LayerStoreValue } from './layerStore';

// ── Precision helpers ────────────────────────────────────────────────

function round(n: number, decimals: number): number {
	const f = Math.pow(10, decimals);
	return Math.round(n * f) / f;
}

// ── Serialisation ────────────────────────────────────────────────────

interface UrlState {
	lat?: number;
	lng?: number;
	zoom?: number;
	rotation?: number;
	activeMapId?: string | null;
	basemap?: string;
}

function stateToHash(map: MapStoreValue, layer: LayerStoreValue): string {
	const lat = round(map.lat, 5);
	const lng = round(map.lng, 5);
	const zoom = round(map.zoom, 2);
	const rot = round(map.rotation, 4);

	let hash = `@${lat},${lng},${zoom}z,${rot}r`;

	if (map.activeMapId) {
		hash += `&map=${encodeURIComponent(map.activeMapId)}`;
	}

	if (layer.basemap !== 'g-streets') {
		hash += `&base=${encodeURIComponent(layer.basemap)}`;
	}

	return hash;
}

function hashToState(hash: string): UrlState {
	const result: UrlState = {};
	if (!hash || hash === '#') return result;

	const raw = hash.startsWith('#') ? hash.slice(1) : hash;

	// Split on first '&' to separate camera from params
	const ampIdx = raw.indexOf('&');
	const cameraPart = ampIdx >= 0 ? raw.slice(0, ampIdx) : raw;
	const paramsPart = ampIdx >= 0 ? raw.slice(ampIdx + 1) : '';

	// Parse camera: @lat,lng,zoomz,rotationr
	if (cameraPart.startsWith('@')) {
		const body = cameraPart.slice(1); // remove @
		const segments = body.split(',');

		if (segments.length >= 2) {
			const lat = parseFloat(segments[0]);
			const lng = parseFloat(segments[1]);
			if (isFinite(lat) && isFinite(lng)) {
				result.lat = lat;
				result.lng = lng;
			}
		}

		if (segments.length >= 3) {
			const zoom = parseFloat(segments[2].replace('z', ''));
			if (isFinite(zoom)) result.zoom = zoom;
		}

		if (segments.length >= 4) {
			const rotation = parseFloat(segments[3].replace('r', ''));
			if (isFinite(rotation)) result.rotation = rotation;
		}
	}

	// Parse key=value params
	if (paramsPart) {
		const pairs = paramsPart.split('&');
		for (const pair of pairs) {
			const eqIdx = pair.indexOf('=');
			if (eqIdx < 0) continue;
			const key = pair.slice(0, eqIdx);
			const val = decodeURIComponent(pair.slice(eqIdx + 1));
			if (key === 'map') result.activeMapId = val || null;
			if (key === 'base') result.basemap = val;
		}
	}

	return result;
}

// ── Sync engine ──────────────────────────────────────────────────────

export interface UrlSyncOptions {
	mapStore: MapStore;
	layerStore: LayerStore;
	/** Debounce interval for store→URL writes (ms). Default 300. */
	debounceMs?: number;
	/** Use replaceState instead of pushState for camera moves. Default true. */
	replaceOnMove?: boolean;
}

/**
 * Starts bidirectional sync between stores and the URL hash.
 *
 * Returns a teardown function to call on component destroy.
 *
 * Usage:
 * ```svelte
 * <script>
 *   import { onMount, onDestroy } from 'svelte';
 *   import { initUrlSync } from '$lib/stores/urlStore';
 *
 *   let teardown;
 *   onMount(() => { teardown = initUrlSync({ mapStore, layerStore }); });
 *   onDestroy(() => teardown?.());
 * </script>
 * ```
 */
export function initUrlSync(options: UrlSyncOptions): () => void {
	const { mapStore, layerStore, debounceMs = 300, replaceOnMove = true } = options;

	let suppressStoreToUrl = false;
	let suppressUrlToStore = false;
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	// ── URL → Stores (on init + popstate) ────────────────────────────

	function applyHashToStores() {
		const parsed = hashToState(window.location.hash);
		if (Object.keys(parsed).length === 0) return;

		suppressStoreToUrl = true;

		const mapPatch: Partial<MapStoreValue> = {};
		if (parsed.lat !== undefined) mapPatch.lat = parsed.lat;
		if (parsed.lng !== undefined) mapPatch.lng = parsed.lng;
		if (parsed.zoom !== undefined) mapPatch.zoom = parsed.zoom;
		if (parsed.rotation !== undefined) mapPatch.rotation = parsed.rotation;
		if (parsed.activeMapId !== undefined) mapPatch.activeMapId = parsed.activeMapId;

		if (Object.keys(mapPatch).length > 0) {
			mapStore.setAll(mapPatch);
		}

		if (parsed.basemap) {
			layerStore.setBasemap(parsed.basemap);
		}

		// Release suppression on next tick so the store subscription fires
		// but we catch it before it writes back to the URL
		requestAnimationFrame(() => {
			suppressStoreToUrl = false;
		});
	}

	function onPopState() {
		applyHashToStores();
	}

	// ── Stores → URL (debounced) ─────────────────────────────────────

	function writeHashFromStores() {
		if (suppressStoreToUrl) return;

		suppressUrlToStore = true;

		const mapVal = get(mapStore);
		const layerVal = get(layerStore);
		const hash = '#' + stateToHash(mapVal, layerVal);

		if (hash !== window.location.hash) {
			// Use SvelteKit's navigation helpers to avoid router conflicts
			const url = new URL(window.location.href);
			url.hash = hash;
			if (replaceOnMove) {
				replaceState(url, {});
			} else {
				pushState(url, {});
			}
		}

		suppressUrlToStore = false;
	}

	function scheduleWrite() {
		if (suppressStoreToUrl) return;
		if (debounceTimer !== undefined) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(writeHashFromStores, debounceMs);
	}

	// ── Subscribe to stores ──────────────────────────────────────────

	const unsubMap = mapStore.subscribe(() => scheduleWrite());
	const unsubLayer = layerStore.subscribe(() => scheduleWrite());

	// ── Initialise from URL ──────────────────────────────────────────

	if (typeof window !== 'undefined') {
		applyHashToStores();
		window.addEventListener('popstate', onPopState);
	}

	// ── Teardown ─────────────────────────────────────────────────────

	return () => {
		unsubMap();
		unsubLayer();
		if (debounceTimer !== undefined) clearTimeout(debounceTimer);
		if (typeof window !== 'undefined') {
			window.removeEventListener('popstate', onPopState);
		}
	};
}
