/**
 * IndexedDB cache for map catalog and annotations
 *
 * Uses the core IndexedDB adapter for consistent persistence patterns.
 */

import { createIndexedDbAdapter } from '$lib/core/persistence';
import type { MapListItem } from '$lib/viewer/types';

const DB_NAME = 'allmaps-cache';
const CATALOG_STORE = 'catalog';
const ANNOTATIONS_STORE = 'annotations';

// TTL values in milliseconds
const CATALOG_TTL = 24 * 60 * 60 * 1000; // 24 hours
const ANNOTATIONS_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// Create a singleton adapter instance
const dbAdapter = createIndexedDbAdapter({
	dbName: DB_NAME,
	version: 1,
	stores: [CATALOG_STORE, ANNOTATIONS_STORE]
});

/**
 * Cache map catalog
 */
export async function cacheMapCatalog(maps: MapListItem[]): Promise<void> {
	await dbAdapter.set(CATALOG_STORE, 'maps', maps, CATALOG_TTL);
	console.log('[MapCache] Cached map catalog:', maps.length, 'maps');
}

/**
 * Get cached map catalog
 */
export async function getCachedMapCatalog(): Promise<MapListItem[] | null> {
	const cached = await dbAdapter.getIfValid<MapListItem[]>(CATALOG_STORE, 'maps');

	if (!cached) {
		console.log('[MapCache] Catalog cache miss or expired');
		return null;
	}

	console.log('[MapCache] Using cached catalog:', cached.length, 'maps');
	return cached;
}

/**
 * Cache annotation data
 */
export async function cacheAnnotation(mapId: string, annotation: unknown): Promise<void> {
	await dbAdapter.set(ANNOTATIONS_STORE, mapId, annotation, ANNOTATIONS_TTL);
	console.log('[MapCache] Cached annotation:', mapId);
}

/**
 * Get cached annotation
 */
export async function getCachedAnnotation(mapId: string): Promise<unknown | null> {
	const cached = await dbAdapter.getIfValid(ANNOTATIONS_STORE, mapId);

	if (!cached) {
		console.log('[MapCache] Annotation cache miss or expired:', mapId);
		return null;
	}

	console.log('[MapCache] Using cached annotation:', mapId);
	return cached;
}

/**
 * Clear all cached data
 */
export async function clearAllCache(): Promise<void> {
	await dbAdapter.clearAll();
	console.log('[MapCache] All cache cleared');
}

/**
 * Get cache statistics
 */
export async function getCacheInfo(): Promise<{
	catalogCount: number;
	annotationCount: number;
}> {
	const catalogCount = await dbAdapter.count(CATALOG_STORE);
	const annotationCount = await dbAdapter.count(ANNOTATIONS_STORE);

	return { catalogCount, annotationCount };
}
