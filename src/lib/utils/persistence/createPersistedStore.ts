/**
 * Unified persistence layer for localStorage with debounce support
 */

import { writable, type Writable } from 'svelte/store';

export interface PersistedStoreOptions<T> {
	key: string;
	defaultValue: T;
	debounceMs?: number;
	storage?: Storage;
}

export interface PersistedStore<T> extends Writable<T> {
	reset: () => void;
}

/**
 * Checks if we're in a browser environment
 */
function isBrowser(): boolean {
	return typeof window !== 'undefined';
}

/**
 * Creates a debounced function
 */
function debounce<T>(fn: (value: T) => void, ms: number): (value: T) => void {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	return (value: T) => {
		if (timeoutId !== undefined) {
			clearTimeout(timeoutId);
		}
		timeoutId = setTimeout(() => {
			fn(value);
			timeoutId = undefined;
		}, ms);
	};
}

/**
 * Loads value from storage
 */
function loadFromStorage<T>(key: string, defaultValue: T, storage?: Storage): T {
	if (!isBrowser()) {
		return defaultValue;
	}

	const store = storage ?? window.localStorage;

	try {
		const stored = store.getItem(key);
		if (stored) {
			const parsed = JSON.parse(stored) as Partial<T>;
			// Merge with defaults for backwards compatibility
			if (typeof defaultValue === 'object' && defaultValue !== null && !Array.isArray(defaultValue)) {
				return { ...defaultValue, ...parsed };
			}
			return parsed as T;
		}
	} catch (error) {
		console.warn(`[PersistedStore] Failed to load "${key}":`, error);
	}

	return defaultValue;
}

/**
 * Saves value to storage
 */
function saveToStorage<T>(key: string, value: T, storage?: Storage): void {
	if (!isBrowser()) {
		return;
	}

	const store = storage ?? window.localStorage;

	try {
		store.setItem(key, JSON.stringify(value));
	} catch (error) {
		console.warn(`[PersistedStore] Failed to save "${key}":`, error);
	}
}

/**
 * Creates a Svelte store that automatically persists to localStorage
 *
 * @example
 * ```ts
 * const preferences = createPersistedStore({
 *   key: 'app-preferences-v1',
 *   defaultValue: { theme: 'light', fontSize: 14 },
 *   debounceMs: 300
 * });
 *
 * // Use like any writable store
 * preferences.set({ theme: 'dark', fontSize: 16 });
 * preferences.update(p => ({ ...p, theme: 'dark' }));
 * preferences.reset(); // Reset to defaults
 * ```
 */
export function createPersistedStore<T>(options: PersistedStoreOptions<T>): PersistedStore<T> {
	const { key, defaultValue, debounceMs = 0, storage } = options;

	const initialValue = loadFromStorage(key, defaultValue, storage);
	const { subscribe, set: _set, update: _update } = writable<T>(initialValue);

	const save = debounceMs > 0
		? debounce((value: T) => saveToStorage(key, value, storage), debounceMs)
		: (value: T) => saveToStorage(key, value, storage);

	function set(value: T): void {
		_set(value);
		save(value);
	}

	function update(updater: (value: T) => T): void {
		_update((current) => {
			const newValue = updater(current);
			save(newValue);
			return newValue;
		});
	}

	function reset(): void {
		set(defaultValue);
	}

	return {
		subscribe,
		set,
		update,
		reset
	};
}
