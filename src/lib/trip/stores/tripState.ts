// Trip preferences and user state management with localStorage persistence

import { writable } from 'svelte/store';

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
 * Loads trip preferences from localStorage
 */
function loadPreferences(): TripPreferences {
	if (typeof window === 'undefined') {
		return defaultPreferences;
	}

	try {
		const stored = window.localStorage.getItem(TRIP_PREFERENCES_KEY);
		if (stored) {
			const parsed = JSON.parse(stored) as Partial<TripPreferences>;
			return {
				...defaultPreferences,
				...parsed
			};
		}
	} catch (error) {
		console.warn('Failed to load trip preferences:', error);
	}

	return defaultPreferences;
}

/**
 * Saves trip preferences to localStorage
 */
function savePreferences(preferences: TripPreferences): void {
	if (typeof window === 'undefined') {
		return;
	}

	try {
		window.localStorage.setItem(TRIP_PREFERENCES_KEY, JSON.stringify(preferences));
	} catch (error) {
		console.warn('Failed to save trip preferences:', error);
	}
}

/**
 * Creates a trip preferences store with localStorage persistence
 */
export function createTripStateStore(): TripPreferencesStore {
	const { subscribe, set, update } = writable<TripPreferences>(loadPreferences());

	return {
		subscribe,

		setHasSeenWelcome: (value: boolean) => {
			update((state) => {
				const newState = { ...state, hasSeenWelcome: value };
				savePreferences(newState);
				return newState;
			});
		},

		setHasCompletedTutorial: (value: boolean) => {
			update((state) => {
				const newState = { ...state, hasCompletedTutorial: value };
				savePreferences(newState);
				return newState;
			});
		},

		setHasSeenMapHint: (value: boolean) => {
			update((state) => {
				const newState = { ...state, hasSeenMapHint: value };
				savePreferences(newState);
				return newState;
			});
		},

		setAutoStartLocation: (value: boolean) => {
			update((state) => {
				const newState = { ...state, autoStartLocation: value };
				savePreferences(newState);
				return newState;
			});
		},

		setLastKnownPosition: (position: { lat: number; lon: number } | null) => {
			update((state) => {
				const newState = { ...state, lastKnownPosition: position };
				savePreferences(newState);
				return newState;
			});
		},

		reset: () => {
			set(defaultPreferences);
			savePreferences(defaultPreferences);
		}
	};
}
