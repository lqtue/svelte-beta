/**
 * Standardized store factory with optional persistence
 */

import { writable, type Readable } from 'svelte/store';
import { createPersistedStore, type PersistedStoreOptions } from '../persistence/createPersistedStore';

export interface StoreOptions<T> {
	defaultValue: T;
	persist?: {
		key: string;
		debounceMs?: number;
	};
}

export interface Store<T> extends Readable<T> {
	set(value: T): void;
	update(updater: (value: T) => T): void;
	reset(): void;
}

/**
 * Creates a standardized store with optional localStorage persistence
 *
 * @example
 * ```ts
 * // Simple store without persistence
 * const counter = createStore({ defaultValue: 0 });
 *
 * // Store with persistence
 * const settings = createStore({
 *   defaultValue: { theme: 'light', fontSize: 14 },
 *   persist: { key: 'app-settings-v1', debounceMs: 300 }
 * });
 * ```
 */
export function createStore<T>(options: StoreOptions<T>): Store<T> {
	const { defaultValue, persist } = options;

	if (persist) {
		const persistedOptions: PersistedStoreOptions<T> = {
			key: persist.key,
			defaultValue,
			debounceMs: persist.debounceMs
		};
		return createPersistedStore(persistedOptions);
	}

	const { subscribe, set, update } = writable<T>(defaultValue);

	return {
		subscribe,
		set,
		update,
		reset: () => set(defaultValue)
	};
}
