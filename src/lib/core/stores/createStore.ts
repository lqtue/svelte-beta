/**
 * Standardized store factory with optional persistence
 */

import { writable, type Readable, type Writable } from 'svelte/store';
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

/**
 * Creates a store with custom actions
 *
 * @example
 * ```ts
 * const counter = createStoreWithActions(
 *   { defaultValue: 0 },
 *   (store) => ({
 *     increment: () => store.update(n => n + 1),
 *     decrement: () => store.update(n => n - 1),
 *     setTo: (value: number) => store.set(value)
 *   })
 * );
 *
 * counter.increment();
 * counter.setTo(10);
 * $counter // reactive value
 * ```
 */
export function createStoreWithActions<T, Actions extends Record<string, unknown>>(
	options: StoreOptions<T>,
	createActions: (store: Store<T>) => Actions
): Store<T> & Actions {
	const store = createStore(options);
	const actions = createActions(store);
	return Object.assign(store, actions);
}

/**
 * Creates a selection store pattern (commonly used for UI state)
 *
 * @example
 * ```ts
 * interface Item { id: string; name: string; }
 * const selection = createSelectionStore<Item>();
 *
 * selection.setItems([...]);
 * selection.select('item-1');
 * selection.clearSelection();
 * ```
 */
export interface SelectionStoreValue<T extends { id: string }> {
	items: T[];
	selectedId: string | null;
}

export interface SelectionStore<T extends { id: string }> extends Readable<SelectionStoreValue<T>> {
	setItems(items: T[]): void;
	select(id: string | null): void;
	clearSelection(): void;
	reset(): void;
}

export function createSelectionStore<T extends { id: string }>(): SelectionStore<T> {
	const defaultValue: SelectionStoreValue<T> = {
		items: [],
		selectedId: null
	};

	const { subscribe, update, set } = writable<SelectionStoreValue<T>>(defaultValue);

	function ensureValidSelection(items: T[], selectedId: string | null): string | null {
		if (!selectedId) return null;
		return items.some((item) => item.id === selectedId) ? selectedId : null;
	}

	return {
		subscribe,
		setItems(items: T[]) {
			update((state) => ({
				items,
				selectedId: ensureValidSelection(items, state.selectedId)
			}));
		},
		select(id: string | null) {
			update((state) => ({
				...state,
				selectedId: id
			}));
		},
		clearSelection() {
			update((state) => ({
				...state,
				selectedId: null
			}));
		},
		reset() {
			set(defaultValue);
		}
	};
}

/**
 * Creates an undo/redo history store
 *
 * @example
 * ```ts
 * type MyEntry = { action: string; data: unknown };
 * const history = createHistoryStore<MyEntry>({ limit: 50 });
 *
 * history.push({ action: 'update', data: newData });
 * const undone = history.undo();
 * const redone = history.redo();
 * ```
 */
export interface HistoryStoreValue<T> {
	past: T[];
	future: T[];
}

export interface HistoryStore<T> extends Readable<HistoryStoreValue<T>> {
	push(entry: T): void;
	undo(): T | null;
	redo(): T | null;
	canUndo(): boolean;
	canRedo(): boolean;
	reset(): void;
	readonly limit: number;
}

export function createHistoryStore<T>(options: { limit?: number } = {}): HistoryStore<T> {
	const limit = options.limit ?? 100;
	const defaultValue: HistoryStoreValue<T> = {
		past: [],
		future: []
	};

	const { subscribe, update, set } = writable<HistoryStoreValue<T>>(defaultValue);

	let currentState: HistoryStoreValue<T> = defaultValue;

	// Keep a local copy for synchronous reads
	const unsubscribe = subscribe((state) => {
		currentState = state;
	});

	return {
		subscribe,
		limit,
		push(entry: T) {
			update((state) => ({
				past: [...state.past.slice(-(limit - 1)), entry],
				future: []
			}));
		},
		undo() {
			let undone: T | null = null;
			update((state) => {
				if (!state.past.length) return state;
				undone = state.past[state.past.length - 1];
				return {
					past: state.past.slice(0, -1),
					future: [...state.future, undone]
				};
			});
			return undone;
		},
		redo() {
			let redone: T | null = null;
			update((state) => {
				if (!state.future.length) return state;
				redone = state.future[state.future.length - 1];
				return {
					past: [...state.past, redone],
					future: state.future.slice(0, -1)
				};
			});
			return redone;
		},
		canUndo() {
			return currentState.past.length > 0;
		},
		canRedo() {
			return currentState.future.length > 0;
		},
		reset() {
			set(defaultValue);
		}
	};
}
