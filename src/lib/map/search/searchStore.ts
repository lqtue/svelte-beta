/**
 * Search state management for location search
 */

import { writable, type Readable } from 'svelte/store';
import type { SearchResult } from '$lib/viewer/types';

export type SearchNoticeType = 'info' | 'error' | 'success';

export interface SearchState {
	query: string;
	results: SearchResult[];
	loading: boolean;
	notice: string | null;
	noticeType: SearchNoticeType;
}

export interface SearchStore extends Readable<SearchState> {
	setQuery(query: string): void;
	setResults(results: SearchResult[]): void;
	setLoading(loading: boolean): void;
	setNotice(message: string | null, type?: SearchNoticeType): void;
	clear(): void;
	clearResults(): void;
}

const DEFAULT_STATE: SearchState = {
	query: '',
	results: [],
	loading: false,
	notice: null,
	noticeType: 'info'
};

/**
 * Creates a search state store
 */
export function createSearchStore(): SearchStore {
	const { subscribe, update, set } = writable<SearchState>(DEFAULT_STATE);

	return {
		subscribe,
		setQuery(query: string) {
			update((state) => ({ ...state, query }));
		},
		setResults(results: SearchResult[]) {
			update((state) => ({ ...state, results }));
		},
		setLoading(loading: boolean) {
			update((state) => ({ ...state, loading }));
		},
		setNotice(message: string | null, type: SearchNoticeType = 'info') {
			update((state) => ({ ...state, notice: message, noticeType: type }));
		},
		clear() {
			set(DEFAULT_STATE);
		},
		clearResults() {
			update((state) => ({
				...state,
				results: [],
				notice: null,
				noticeType: 'info',
				loading: false
			}));
		}
	};
}
