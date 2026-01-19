/**
 * View mode state management for map overlay visualization
 *
 * Supports four modes:
 * - overlay: Full overlay with opacity control
 * - side-x: Vertical split (left/right comparison)
 * - side-y: Horizontal split (top/bottom comparison)
 * - spy: Circular lens (magnifying glass effect)
 */

import { writable, type Readable } from 'svelte/store';

export type ViewMode = 'overlay' | 'side-x' | 'side-y' | 'spy';

export interface ViewModeState {
	mode: ViewMode;
	sideRatio: number;
	lensRadius: number;
	opacity: number;
}

export interface ViewModeStore extends Readable<ViewModeState> {
	setMode(mode: ViewMode): void;
	setSideRatio(ratio: number): void;
	setLensRadius(radius: number): void;
	setOpacity(opacity: number): void;
	reset(): void;
}

const DEFAULT_STATE: ViewModeState = {
	mode: 'overlay',
	sideRatio: 0.5,
	lensRadius: 150,
	opacity: 0.8
};

/**
 * Creates a view mode store for managing map overlay visualization
 */
export function createViewModeStore(initialState: Partial<ViewModeState> = {}): ViewModeStore {
	const { subscribe, update, set } = writable<ViewModeState>({
		...DEFAULT_STATE,
		...initialState
	});

	return {
		subscribe,
		setMode(mode: ViewMode) {
			update((state) => ({ ...state, mode }));
		},
		setSideRatio(ratio: number) {
			const clamped = Math.max(0.01, Math.min(0.99, ratio));
			update((state) => ({ ...state, sideRatio: clamped }));
		},
		setLensRadius(radius: number) {
			const clamped = Math.max(20, radius);
			update((state) => ({ ...state, lensRadius: clamped }));
		},
		setOpacity(opacity: number) {
			const clamped = Math.max(0, Math.min(1, opacity));
			update((state) => ({ ...state, opacity: clamped }));
		},
		reset() {
			set(DEFAULT_STATE);
		}
	};
}

/**
 * Validates and normalizes a view mode string
 */
export function normalizeViewMode(value: unknown): ViewMode {
	if (value === 'side-x' || value === 'side-y' || value === 'spy') {
		return value;
	}
	return 'overlay';
}
