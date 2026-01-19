/**
 * Core module - shared abstractions for the application
 *
 * This module provides:
 * - Persistence: localStorage and IndexedDB adapters
 * - Stores: standardized store factories and patterns
 * - Utils: common utility functions (ID generation, debounce, CSV)
 * - Errors: unified notification system
 */

// Persistence
export {
	createPersistedStore,
	createIndexedDbAdapter
} from './persistence';
export type {
	PersistedStore,
	PersistedStoreOptions,
	IndexedDbAdapter,
	IndexedDbOptions,
	CachedData
} from './persistence';

// Stores
export {
	createStore,
	createStoreWithActions,
	createSelectionStore,
	createHistoryStore
} from './stores';
export type {
	Store,
	StoreOptions,
	SelectionStore,
	SelectionStoreValue,
	HistoryStore,
	HistoryStoreValue
} from './stores';

// Utils
export {
	randomId,
	shortId,
	isUuid,
	timestampId,
	debounce,
	throttle,
	createDelayedAction,
	parseCSV,
	parseCSVTyped,
	csvEscape,
	toCSV
} from './utils';
export type {
	DebouncedFunction,
	ThrottledFunction,
	CsvParseOptions,
	CsvRow
} from './utils';

// Errors
export {
	createNoticeStore,
	filterNotices,
	getNoticeStore
} from './errors';
export type {
	Notice,
	NoticeLevel,
	NoticeStore,
	NoticeStoreValue
} from './errors';
