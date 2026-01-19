// Trip preferences and user state management with localStorage persistence

import { createPersistedStore } from '$lib/core/persistence';

const TRIP_PREFERENCES_KEY = 'vma-trip-preferences-v1';

export interface TripPreferences {
	hasSeenWelcome: boolean;
	hasCompletedTutorial: boolean;
	hasSeenMapHint: boolean;
	autoStartLocation: boolean;
	lastKnownPosition: { lat: number; lon: number } | null;
}

const defaultPreferences: TripPreferences = {
	hasSeenWelcome: false,
	hasCompletedTutorial: false,
	hasSeenMapHint: false,
	autoStartLocation: false,
	lastKnownPosition: null
};

export interface TripPreferencesStore {
	subscribe: (run: (value: TripPreferences) => void) => () => void;
	setHasSeenWelcome: (value: boolean) => void;
	setHasCompletedTutorial: (value: boolean) => void;
	setHasSeenMapHint: (value: boolean) => void;
	setAutoStartLocation: (value: boolean) => void;
	setLastKnownPosition: (position: { lat: number; lon: number } | null) => void;
	reset: () => void;
}

/**
 * Creates a trip preferences store with localStorage persistence
 *
 * Uses the unified persistence layer from core module.
 */
export function createTripStateStore(): TripPreferencesStore {
	const store = createPersistedStore({
		key: TRIP_PREFERENCES_KEY,
		defaultValue: defaultPreferences,
		debounceMs: 100
	});

	return {
		subscribe: store.subscribe,

		setHasSeenWelcome: (value: boolean) => {
			store.update((state) => ({ ...state, hasSeenWelcome: value }));
		},

		setHasCompletedTutorial: (value: boolean) => {
			store.update((state) => ({ ...state, hasCompletedTutorial: value }));
		},

		setHasSeenMapHint: (value: boolean) => {
			store.update((state) => ({ ...state, hasSeenMapHint: value }));
		},

		setAutoStartLocation: (value: boolean) => {
			store.update((state) => ({ ...state, autoStartLocation: value }));
		},

		setLastKnownPosition: (position: { lat: number; lon: number } | null) => {
			store.update((state) => ({ ...state, lastKnownPosition: position }));
		},

		reset: () => {
			store.reset();
		}
	};
}
