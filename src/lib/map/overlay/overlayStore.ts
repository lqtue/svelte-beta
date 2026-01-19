/**
 * Overlay state management for warped map layers
 */

import { writable, type Readable } from 'svelte/store';

export interface OverlayState {
	loadedId: string | null;
	currentMapId: string | null;
	loading: boolean;
	error: string | null;
}

export interface OverlayStore extends Readable<OverlayState> {
	setLoaded(id: string | null, mapId: string | null): void;
	setLoading(loading: boolean): void;
	setError(error: string | null): void;
	clear(): void;
}

const DEFAULT_STATE: OverlayState = {
	loadedId: null,
	currentMapId: null,
	loading: false,
	error: null
};

/**
 * Creates an overlay state store
 */
export function createOverlayStore(): OverlayStore {
	const { subscribe, update, set } = writable<OverlayState>(DEFAULT_STATE);

	return {
		subscribe,
		setLoaded(id: string | null, mapId: string | null) {
			update((state) => ({
				...state,
				loadedId: id,
				currentMapId: mapId,
				error: null
			}));
		},
		setLoading(loading: boolean) {
			update((state) => ({ ...state, loading }));
		},
		setError(error: string | null) {
			update((state) => ({ ...state, error, loading: false }));
		},
		clear() {
			set(DEFAULT_STATE);
		}
	};
}

/**
 * Cache for map IDs associated with overlay sources
 */
export interface OverlayCache {
	get(key: string): string[] | null;
	set(key: string, mapIds: string[]): void;
	has(key: string): boolean;
	clear(): void;
}

export function createOverlayCache(): OverlayCache {
	const cache: Record<string, { mapIds: string[] }> = {};

	return {
		get(key: string): string[] | null {
			return cache[key]?.mapIds ?? null;
		},
		set(key: string, mapIds: string[]): void {
			cache[key] = { mapIds };
		},
		has(key: string): boolean {
			return key in cache;
		},
		clear(): void {
			for (const key of Object.keys(cache)) {
				delete cache[key];
			}
		}
	};
}
