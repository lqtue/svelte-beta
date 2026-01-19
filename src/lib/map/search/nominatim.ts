/**
 * Nominatim (OpenStreetMap) geocoding API client
 */

import type { SearchResult } from '$lib/viewer/types';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

export interface NominatimSearchOptions {
	query: string;
	limit?: number;
	signal?: AbortSignal;
}

/**
 * Searches for locations using the Nominatim geocoding API
 */
export async function searchNominatim(options: NominatimSearchOptions): Promise<SearchResult[]> {
	const { query, limit = 10, signal } = options;

	const trimmed = query.trim();
	if (!trimmed) {
		return [];
	}

	const params = new URLSearchParams({
		format: 'jsonv2',
		q: trimmed,
		addressdetails: '1',
		polygon_geojson: '1',
		limit: String(limit)
	});

	const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
		signal,
		headers: {
			Accept: 'application/json'
		}
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}

	return response.json() as Promise<SearchResult[]>;
}

/**
 * Creates a debounced search function with abort handling
 */
export function createDebouncedSearch(
	onResults: (results: SearchResult[]) => void,
	onError: (error: Error) => void,
	options: { debounceMs?: number } = {}
) {
	const { debounceMs = 1000 } = options;

	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	let abortController: AbortController | null = null;

	function search(query: string): void {
		// Clear any pending search
		if (timeoutId !== undefined) {
			clearTimeout(timeoutId);
			timeoutId = undefined;
		}

		// Abort any in-flight request
		abortController?.abort();
		abortController = null;

		const trimmed = query.trim();
		if (!trimmed) {
			onResults([]);
			return;
		}

		timeoutId = setTimeout(async () => {
			abortController = new AbortController();

			try {
				const results = await searchNominatim({
					query: trimmed,
					signal: abortController.signal
				});
				onResults(results);
			} catch (error) {
				if ((error as Error).name === 'AbortError') {
					return;
				}
				onError(error as Error);
			}
		}, debounceMs);
	}

	function cancel(): void {
		if (timeoutId !== undefined) {
			clearTimeout(timeoutId);
			timeoutId = undefined;
		}
		abortController?.abort();
		abortController = null;
	}

	return { search, cancel };
}
