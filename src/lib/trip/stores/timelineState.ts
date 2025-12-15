// Timeline and time slider state management

import { writable } from 'svelte/store';

export interface TimelineState {
	currentYear: number;
	availableYears: number[];
	activeMapId: string | null;
	isTransitioning: boolean;
}

const defaultState: TimelineState = {
	currentYear: new Date().getFullYear(),
	availableYears: [],
	activeMapId: null,
	isTransitioning: false
};

export interface TimelineStateStore {
	subscribe: (run: (value: TimelineState) => void) => () => void;
	setCurrentYear: (year: number) => void;
	setAvailableYears: (years: number[]) => void;
	setActiveMap: (mapId: string | null) => void;
	setIsTransitioning: (value: boolean) => void;
	reset: () => void;
}

/**
 * Creates a timeline state store for managing the time slider
 */
export function createTimelineStateStore(): TimelineStateStore {
	const { subscribe, set, update } = writable<TimelineState>(defaultState);

	return {
		subscribe,

		setCurrentYear: (year: number) => {
			update((state) => ({ ...state, currentYear: year }));
		},

		setAvailableYears: (years: number[]) => {
			update((state) => {
				// Sort years in ascending order
				const sorted = [...years].sort((a, b) => a - b);

				// If we have years, set current year to the most recent
				const currentYear = sorted.length > 0
					? Math.max(...sorted)
					: state.currentYear;

				return {
					...state,
					availableYears: sorted,
					currentYear
				};
			});
		},

		setActiveMap: (mapId: string | null) => {
			update((state) => ({ ...state, activeMapId: mapId }));
		},

		setIsTransitioning: (value: boolean) => {
			update((state) => ({ ...state, isTransitioning: value }));
		},

		reset: () => {
			set(defaultState);
		}
	};
}
