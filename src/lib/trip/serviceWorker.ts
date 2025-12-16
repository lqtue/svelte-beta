/**
 * Service Worker registration and management for map caching
 */

export interface CacheStats {
	size: number;
	formattedSize: string;
}

/**
 * Register the service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
	if (!('serviceWorker' in navigator)) {
		console.warn('[ServiceWorker] Not supported in this browser');
		return null;
	}

	try {
		const registration = await navigator.serviceWorker.register('/sw.js', {
			scope: '/'
		});

		console.log('[ServiceWorker] Registered successfully:', registration.scope);

		// Handle updates
		registration.addEventListener('updatefound', () => {
			const newWorker = registration.installing;
			if (newWorker) {
				newWorker.addEventListener('statechange', () => {
					if (newWorker.state === 'activated') {
						console.log('[ServiceWorker] Updated and activated');
					}
				});
			}
		});

		return registration;
	} catch (error) {
		console.error('[ServiceWorker] Registration failed:', error);
		return null;
	}
}

/**
 * Unregister the service worker
 */
export async function unregisterServiceWorker(): Promise<boolean> {
	if (!('serviceWorker' in navigator)) {
		return false;
	}

	try {
		const registration = await navigator.serviceWorker.getRegistration();
		if (registration) {
			const success = await registration.unregister();
			console.log('[ServiceWorker] Unregistered:', success);
			return success;
		}
		return false;
	} catch (error) {
		console.error('[ServiceWorker] Unregistration failed:', error);
		return false;
	}
}

/**
 * Clear all cached data
 */
export async function clearCache(): Promise<boolean> {
	if (!('serviceWorker' in navigator)) {
		return false;
	}

	try {
		const registration = await navigator.serviceWorker.getRegistration();
		if (registration?.active) {
			return new Promise((resolve) => {
				const messageChannel = new MessageChannel();
				messageChannel.port1.onmessage = (event) => {
					resolve(event.data.success || false);
				};

				if (registration.active) {
					registration.active.postMessage(
						{ type: 'CLEAR_CACHE' },
						[messageChannel.port2]
					);
				} else {
					resolve(false);
				}
			});
		}
		return false;
	} catch (error) {
		console.error('[ServiceWorker] Clear cache failed:', error);
		return false;
	}
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<CacheStats | null> {
	if (!('serviceWorker' in navigator)) {
		return null;
	}

	try {
		const registration = await navigator.serviceWorker.getRegistration();
		if (registration?.active) {
			return new Promise((resolve) => {
				const messageChannel = new MessageChannel();
				messageChannel.port1.onmessage = (event) => {
					const size = event.data.size || 0;
					resolve({
						size,
						formattedSize: formatBytes(size)
					});
				};

				if (registration.active) {
					registration.active.postMessage(
						{ type: 'GET_CACHE_SIZE' },
						[messageChannel.port2]
					);
				} else {
					resolve(null);
				}
			});
		}
		return null;
	} catch (error) {
		console.error('[ServiceWorker] Get cache stats failed:', error);
		return null;
	}
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 Bytes';

	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Check if service worker is ready
 */
export async function isServiceWorkerReady(): Promise<boolean> {
	if (!('serviceWorker' in navigator)) {
		return false;
	}

	const registration = await navigator.serviceWorker.getRegistration();
	return !!(registration && registration.active);
}
