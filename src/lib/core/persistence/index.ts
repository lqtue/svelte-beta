/**
 * Persistence module - unified storage abstractions
 */

export { createPersistedStore } from './createPersistedStore';
export type { PersistedStore, PersistedStoreOptions } from './createPersistedStore';

export { createIndexedDbAdapter } from './indexedDbAdapter';
export type { IndexedDbAdapter, IndexedDbOptions, CachedData } from './indexedDbAdapter';
