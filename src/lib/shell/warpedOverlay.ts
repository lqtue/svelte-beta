/**
 * Shared WarpedMapLayer lifecycle utilities.
 *
 * Extracted from StudioMap + TripTracker so every mode
 * (shell, studio, trip, lab) uses the same proven code.
 */

import { WarpedMapLayer } from '@allmaps/openlayers';
import type Map from 'ol/Map';

// ── Create / destroy ─────────────────────────────────────────────

/**
 * Creates a WarpedMapLayer with the required OL polyfills
 * and attaches it to the map via setMap().
 */
export function createWarpedLayer(map: Map): WarpedMapLayer {
	const layer = new WarpedMapLayer();
	layer.setZIndex(10);
	layer.setProperties({ name: 'allmaps-overlay' });

	// Polyfills required by some OL versions
	const compat = layer as unknown as {
		getDeclutter?: () => boolean;
		renderDeferred?: (...args: unknown[]) => boolean;
	};
	if (!compat.getDeclutter) compat.getDeclutter = () => false;
	if (!compat.renderDeferred) compat.renderDeferred = () => false;

	// Must use setMap(), not the layers array
	const cast = layer as unknown as { setMap?: (m: unknown) => void };
	cast.setMap?.(map as unknown);

	return layer;
}

/**
 * Detaches a WarpedMapLayer from the map.
 */
export function destroyWarpedLayer(layer: WarpedMapLayer): void {
	const cast = layer as unknown as { setMap?: (m: unknown) => void };
	cast.setMap?.(null);
}

// ── Load overlay ─────────────────────────────────────────────────

/**
 * Builds the Allmaps annotation URL for a given source.
 *
 * - Bare hex IDs → `https://annotations.allmaps.org/images/{id}`
 * - Full URLs passed through as-is
 */
export function annotationUrlForSource(source: string): string {
	const trimmed = source.trim();
	try {
		const url = new URL(trimmed);
		if (url.protocol === 'http:' || url.protocol === 'https:') return trimmed;
	} catch {
		// not a URL — treat as Allmaps image ID
	}
	return `https://annotations.allmaps.org/images/${trimmed}`;
}

/**
 * Loads an overlay into a WarpedMapLayer using `addGeoreferenceAnnotationByUrl`.
 *
 * Same approach as TripTracker. The WarpedMapLayer handles fetching + parsing.
 * Calls `map.render()` after load to force a repaint (critical).
 */
export async function loadOverlayByUrl(
	layer: WarpedMapLayer,
	map: Map,
	source: string,
	opacity = 0.8
): Promise<void> {
	// Clear any previous overlay
	layer.clear();

	const url = annotationUrlForSource(source);
	await layer.addGeoreferenceAnnotationByUrl(url);

	// Apply opacity directly on the layer (same as TripTracker)
	(layer as any).setOpacity(opacity);

	// Force repaint — without this the tiles won't appear
	map.render();
}

// ── Opacity ──────────────────────────────────────────────────────

/**
 * Sets opacity directly on the WarpedMapLayer.
 * Uses layer.setOpacity() which is the approach that works in TripTracker.
 */
export function setOverlayOpacity(
	layer: WarpedMapLayer,
	map: Map,
	opacity: number
): void {
	(layer as any).setOpacity(opacity);
	map.render();
}

export function clearOverlay(layer: WarpedMapLayer): void {
	layer.clear();
}

// ── View mode clip mask ──────────────────────────────────────────

export type ViewModeClip = 'overlay' | 'side-x' | 'side-y' | 'spy';

/**
 * Applies a CSS clip-path on the WarpedMapLayer canvas to implement
 * side-by-side and spy-glass comparison modes.
 *
 * This is the exact same logic from StudioMap.updateClipMask().
 */
export function applyClipMask(
	layer: WarpedMapLayer,
	map: Map,
	mode: ViewModeClip,
	sideRatio: number,
	lensRadius: number
): void {
	const canvas = layer.getCanvas();
	if (!canvas) return;

	const size = map.getSize();
	if (!size) return;
	const [w, h] = size;

	switch (mode) {
		case 'side-x': {
			const x = w * sideRatio;
			canvas.style.clipPath = `polygon(${x}px 0, ${w}px 0, ${w}px ${h}px, ${x}px ${h}px)`;
			break;
		}
		case 'side-y': {
			const y = h * sideRatio;
			canvas.style.clipPath = `polygon(0 ${y}px, ${w}px ${y}px, ${w}px ${h}px, 0 ${h}px)`;
			break;
		}
		case 'spy': {
			canvas.style.clipPath = `circle(${lensRadius}px at ${w / 2}px ${h / 2}px)`;
			break;
		}
		default:
			canvas.style.clipPath = '';
	}
}
// ── Metadata fetching ────────────────────────────────────────────

/**
 * Fetches the Allmaps annotation for a source and returns its bbox.
 * Returns null if fetch fails or no bbox found.
 * 
 * BBox format: [minLon, minLat, maxLon, maxLat]
 */
export async function fetchMapBounds(source: string): Promise<[number, number, number, number] | null> {
	try {
		const url = annotationUrlForSource(source);
		const resp = await fetch(url);
		if (!resp.ok) return null;

		const json = await resp.json();

		// Map (annotation) -> maps (or body.maps) -> bbox
		let maps: any[] = [];

		if (Array.isArray(json)) {
			maps = json;
		} else if (json.body && json.body.maps) {
			// Standard Georeference Annotation
			maps = json.body.maps;
		} else if (json.maps) {
			maps = json.maps;
		} else if (json.items) {
			maps = json.items;
		}

		if (maps.length > 0 && maps[0].bbox) {
			return maps[0].bbox;
		}

		return null;
	} catch (err) {
		console.warn('[Warper] Failed to fetch bounds:', err);
		return null;
	}
}
