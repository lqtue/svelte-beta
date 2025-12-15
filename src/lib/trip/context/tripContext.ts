// Trip context for dependency injection

import { getContext, setContext } from 'svelte';
import type { TripPreferencesStore } from '../stores/tripState';
import type { TimelineStateStore } from '../stores/timelineState';

const TRIP_CONTEXT_KEY = Symbol('trip-context');

export interface TripContext {
	preferences: TripPreferencesStore;
	timeline: TimelineStateStore;
}

/**
 * Sets the trip context for child components
 */
export function setTripContext(context: TripContext): void {
	setContext(TRIP_CONTEXT_KEY, context);
}

/**
 * Gets the trip context from a parent component
 * Throws an error if context is not available
 */
export function getTripContext(): TripContext {
	const context = getContext<TripContext>(TRIP_CONTEXT_KEY);

	if (!context) {
		throw new Error(
			'Trip context not found. Make sure setTripContext() is called in a parent component.'
		);
	}

	return context;
}
