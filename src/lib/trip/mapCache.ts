/**
 * IndexedDB cache for map catalog and annotations
 */

import type { MapListItem } from '$lib/viewer/types';

const DB_NAME = 'allmaps-cache';
const DB_VERSION = 1;
const CATALOG_STORE = 'catalog';
const ANNOTATIONS_STORE = 'annotations';

interface CachedData<T> {
	data: T;
	timestamp: number;
	expiresAt: number;
}

/**
 * Open IndexedDB connection
 */
function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;

			// Create object stores if they don't exist
			if (!db.objectStoreNames.contains(CATALOG_STORE)) {
				db.createObjectStore(CATALOG_STORE);
			}

			if (!db.objectStoreNames.contains(ANNOTATIONS_STORE)) {
				db.createObjectStore(ANNOTATIONS_STORE);
			}
		};
	});
}

/**
 * Get data from IndexedDB
 */
async function getFromDB<T>(
	storeName: string,
	key: string
): Promise<CachedData<T> | null> {
	try {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(storeName, 'readonly');
			const store = transaction.objectStore(storeName);
			const request = store.get(key);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				const result = request.result as CachedData<T> | undefined;
				resolve(result || null);
			};
		});
	} catch (error) {
		console.error('[MapCache] Error reading from IndexedDB:', error);
		return null;
	}
}

/**
 * Save data to IndexedDB
 */
async function saveToDB<T>(
	storeName: string,
	key: string,
	data: T,
	ttl: number
): Promise<boolean> {
	try {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(storeName, 'readwrite');
			const store = transaction.objectStore(storeName);

			const cachedData: CachedData<T> = {
				data,
				timestamp: Date.now(),
				expiresAt: Date.now() + ttl
			};

			const request = store.put(cachedData, key);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(true);
		});
	} catch (error) {
		console.error('[MapCache] Error writing to IndexedDB:', error);
		return false;
	}
}

/**
 * Cache map catalog
 */
export async function cacheMapCatalog(maps: MapListItem[]): Promise<void> {
	const ttl = 24 * 60 * 60 * 1000; // 24 hours
	await saveToDB(CATALOG_STORE, 'maps', maps, ttl);
	console.log('[MapCache] Cached map catalog:', maps.length, 'maps');
}

/**
 * Get cached map catalog
 */
export async function getCachedMapCatalog(): Promise<MapListItem[] | null> {
	const cached = await getFromDB<MapListItem[]>(CATALOG_STORE, 'maps');

	if (!cached) {
		return null;
	}

	// Check if expired
	if (Date.now() > cached.expiresAt) {
		console.log('[MapCache] Catalog cache expired');
		return null;
	}

	console.log('[MapCache] Using cached catalog:', cached.data.length, 'maps');
	return cached.data;
}

/**
 * Cache annotation data
 */
export async function cacheAnnotation(mapId: string, annotation: any): Promise<void> {
	const ttl = 7 * 24 * 60 * 60 * 1000; // 7 days
	await saveToDB(ANNOTATIONS_STORE, mapId, annotation, ttl);
	console.log('[MapCache] Cached annotation:', mapId);
}

/**
 * Get cached annotation
 */
export async function getCachedAnnotation(mapId: string): Promise<any | null> {
	const cached = await getFromDB<any>(ANNOTATIONS_STORE, mapId);

	if (!cached) {
		return null;
	}

	// Check if expired
	if (Date.now() > cached.expiresAt) {
		console.log('[MapCache] Annotation cache expired:', mapId);
		return null;
	}

	console.log('[MapCache] Using cached annotation:', mapId);
	return cached.data;
}

/**
 * Clear all cached data
 */
export async function clearAllCache(): Promise<void> {
	try {
		const db = await openDB();

		// Clear catalog store
		await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(CATALOG_STORE, 'readwrite');
			const store = transaction.objectStore(CATALOG_STORE);
			const request = store.clear();

			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});

		// Clear annotations store
		await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(ANNOTATIONS_STORE, 'readwrite');
			const store = transaction.objectStore(ANNOTATIONS_STORE);
			const request = store.clear();

			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});

		console.log('[MapCache] All cache cleared');
	} catch (error) {
		console.error('[MapCache] Error clearing cache:', error);
	}
}

/**
 * Get cache statistics
 */
export async function getCacheInfo(): Promise<{
	catalogCount: number;
	annotationCount: number;
}> {
	try {
		const db = await openDB();

		const catalogCount = await new Promise<number>((resolve) => {
			const transaction = db.transaction(CATALOG_STORE, 'readonly');
			const store = transaction.objectStore(CATALOG_STORE);
			const request = store.count();
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => resolve(0);
		});

		const annotationCount = await new Promise<number>((resolve) => {
			const transaction = db.transaction(ANNOTATIONS_STORE, 'readonly');
			const store = transaction.objectStore(ANNOTATIONS_STORE);
			const request = store.count();
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => resolve(0);
		});

		return { catalogCount, annotationCount };
	} catch (error) {
		console.error('[MapCache] Error getting cache info:', error);
		return { catalogCount: 0, annotationCount: 0 };
	}
}
