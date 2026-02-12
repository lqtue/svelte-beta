/**
 * Core module - shared abstractions for the application
 *
 * This module provides:
 * - Persistence: localStorage adapter
 * - Stores: standardized store factory
 * - Utils: common utility functions (ID generation, debounce)
 */

// Persistence
export { createPersistedStore } from './persistence';
export type { PersistedStore, PersistedStoreOptions } from './persistence';

// Stores
export { createStore } from './stores';
export type { Store, StoreOptions } from './stores';

// Utils
export {
	randomId,
	shortId,
	isUuid,
	timestampId,
	debounce
} from './utils';
export type { DebouncedFunction } from './utils';
