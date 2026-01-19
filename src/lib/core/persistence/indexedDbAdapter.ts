/**
 * IndexedDB persistence adapter with TTL support
 */

export interface CachedData<T> {
	data: T;
	timestamp: number;
	expiresAt: number;
}

export interface IndexedDbOptions {
	dbName: string;
	version?: number;
	stores: string[];
}

/**
 * Creates an IndexedDB connection manager
 */
export function createIndexedDbAdapter(options: IndexedDbOptions) {
	const { dbName, version = 1, stores } = options;

	let dbPromise: Promise<IDBDatabase> | null = null;

	/**
	 * Opens or creates the IndexedDB connection
	 */
	function openDB(): Promise<IDBDatabase> {
		if (dbPromise) {
			return dbPromise;
		}

		dbPromise = new Promise((resolve, reject) => {
			const request = indexedDB.open(dbName, version);

			request.onerror = () => {
				dbPromise = null;
				reject(request.error);
			};

			request.onsuccess = () => {
				resolve(request.result);
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;

				// Create object stores if they don't exist
				for (const storeName of stores) {
					if (!db.objectStoreNames.contains(storeName)) {
						db.createObjectStore(storeName);
					}
				}
			};
		});

		return dbPromise;
	}

	/**
	 * Gets data from a store by key
	 */
	async function get<T>(storeName: string, key: string): Promise<CachedData<T> | null> {
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
			console.error(`[IndexedDB] Error reading from ${storeName}:`, error);
			return null;
		}
	}

	/**
	 * Gets data only if not expired
	 */
	async function getIfValid<T>(storeName: string, key: string): Promise<T | null> {
		const cached = await get<T>(storeName, key);

		if (!cached) {
			return null;
		}

		if (Date.now() > cached.expiresAt) {
			return null;
		}

		return cached.data;
	}

	/**
	 * Saves data to a store with TTL
	 */
	async function set<T>(
		storeName: string,
		key: string,
		data: T,
		ttlMs: number
	): Promise<boolean> {
		try {
			const db = await openDB();
			return new Promise((resolve, reject) => {
				const transaction = db.transaction(storeName, 'readwrite');
				const store = transaction.objectStore(storeName);

				const cachedData: CachedData<T> = {
					data,
					timestamp: Date.now(),
					expiresAt: Date.now() + ttlMs
				};

				const request = store.put(cachedData, key);

				request.onerror = () => reject(request.error);
				request.onsuccess = () => resolve(true);
			});
		} catch (error) {
			console.error(`[IndexedDB] Error writing to ${storeName}:`, error);
			return false;
		}
	}

	/**
	 * Removes data from a store
	 */
	async function remove(storeName: string, key: string): Promise<boolean> {
		try {
			const db = await openDB();
			return new Promise((resolve, reject) => {
				const transaction = db.transaction(storeName, 'readwrite');
				const store = transaction.objectStore(storeName);
				const request = store.delete(key);

				request.onerror = () => reject(request.error);
				request.onsuccess = () => resolve(true);
			});
		} catch (error) {
			console.error(`[IndexedDB] Error deleting from ${storeName}:`, error);
			return false;
		}
	}

	/**
	 * Clears all data from a store
	 */
	async function clear(storeName: string): Promise<boolean> {
		try {
			const db = await openDB();
			return new Promise((resolve, reject) => {
				const transaction = db.transaction(storeName, 'readwrite');
				const store = transaction.objectStore(storeName);
				const request = store.clear();

				request.onerror = () => reject(request.error);
				request.onsuccess = () => resolve(true);
			});
		} catch (error) {
			console.error(`[IndexedDB] Error clearing ${storeName}:`, error);
			return false;
		}
	}

	/**
	 * Clears all stores
	 */
	async function clearAll(): Promise<void> {
		for (const storeName of stores) {
			await clear(storeName);
		}
	}

	/**
	 * Gets count of items in a store
	 */
	async function count(storeName: string): Promise<number> {
		try {
			const db = await openDB();
			return new Promise((resolve) => {
				const transaction = db.transaction(storeName, 'readonly');
				const store = transaction.objectStore(storeName);
				const request = store.count();

				request.onsuccess = () => resolve(request.result);
				request.onerror = () => resolve(0);
			});
		} catch {
			return 0;
		}
	}

	return {
		openDB,
		get,
		getIfValid,
		set,
		remove,
		clear,
		clearAll,
		count
	};
}

export type IndexedDbAdapter = ReturnType<typeof createIndexedDbAdapter>;
