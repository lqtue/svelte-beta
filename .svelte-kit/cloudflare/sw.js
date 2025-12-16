// Service Worker for caching map tiles and data
const CACHE_VERSION = 'v1';
const CACHE_NAME = `allmaps-cache-${CACHE_VERSION}`;

// Cache strategies
const CACHE_STRATEGIES = {
  // Map tiles - cache first, then network
  TILES: 'cache-first',
  // Annotations - network first with fallback
  ANNOTATIONS: 'network-first',
  // Static CSV catalog - stale while revalidate
  CATALOG: 'stale-while-revalidate'
};

// Cache duration (in milliseconds)
const CACHE_MAX_AGE = {
  TILES: 7 * 24 * 60 * 60 * 1000, // 7 days
  ANNOTATIONS: 24 * 60 * 60 * 1000, // 1 day
  CATALOG: 60 * 60 * 1000 // 1 hour
};

// URL patterns
const PATTERNS = {
  IIIF_IMAGE: /\/(full|square|pct:|[0-9]+,).*\/(full|max|pct:|[0-9]+,).*\/[0-9]+\/(default|color|gray|bitonal)\.(jpg|png|webp|gif)/,
  ALLMAPS_ANNOTATION: /annotations\.allmaps\.org/,
  DATASET_CSV: /docs\.google\.com\/spreadsheets/
};

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('allmaps-cache-') && name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Determine caching strategy
  if (PATTERNS.IIIF_IMAGE.test(url.pathname)) {
    // IIIF image tiles - cache first
    event.respondWith(cacheFirst(request, CACHE_MAX_AGE.TILES));
  } else if (PATTERNS.ALLMAPS_ANNOTATION.test(url.hostname)) {
    // Allmaps annotations - network first with cache fallback
    event.respondWith(networkFirst(request, CACHE_MAX_AGE.ANNOTATIONS));
  } else if (PATTERNS.DATASET_CSV.test(url.hostname)) {
    // CSV catalog - stale while revalidate
    event.respondWith(staleWhileRevalidate(request, CACHE_MAX_AGE.CATALOG));
  }
});

/**
 * Cache-first strategy: Check cache, fall back to network
 */
async function cacheFirst(request, maxAge) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    const cachedTime = new Date(cached.headers.get('sw-cached-time'));
    const age = Date.now() - cachedTime.getTime();

    // Return cached response if not expired
    if (!isNaN(age) && age < maxAge) {
      console.log('[SW] Cache hit (fresh):', request.url.substring(0, 100));
      return cached;
    }
  }

  try {
    const response = await fetch(request);

    // Cache successful responses
    if (response.ok) {
      const responseToCache = response.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cached-time', new Date().toISOString());

      const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });

      cache.put(request, cachedResponse);
      console.log('[SW] Cached from network:', request.url.substring(0, 100));
    }

    return response;
  } catch (error) {
    // Network failed, return stale cache if available
    if (cached) {
      console.log('[SW] Network failed, returning stale cache:', request.url.substring(0, 100));
      return cached;
    }
    throw error;
  }
}

/**
 * Network-first strategy: Try network, fall back to cache
 */
async function networkFirst(request, maxAge) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);

    if (response.ok) {
      const responseToCache = response.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cached-time', new Date().toISOString());

      const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });

      cache.put(request, cachedResponse);
      console.log('[SW] Cached from network:', request.url.substring(0, 100));
    }

    return response;
  } catch (error) {
    const cached = await cache.match(request);

    if (cached) {
      console.log('[SW] Network failed, using cache:', request.url.substring(0, 100));
      return cached;
    }

    throw error;
  }
}

/**
 * Stale-while-revalidate: Return cache immediately, update in background
 */
async function staleWhileRevalidate(request, maxAge) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  // Fetch in background
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      const responseToCache = response.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cached-time', new Date().toISOString());

      const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });

      cache.put(request, cachedResponse);
      console.log('[SW] Background cache update:', request.url.substring(0, 100));
    }
    return response;
  });

  // Return cached response immediately if available
  if (cached) {
    console.log('[SW] Returning cached, updating in background:', request.url.substring(0, 100));
    return cached;
  }

  // Otherwise wait for network
  return fetchPromise;
}

/**
 * Message handler for cache management
 */
self.addEventListener('message', (event) => {
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        console.log('[SW] Cache cleared');
        event.ports[0].postMessage({ success: true });
      })
    );
  } else if (event.data.type === 'GET_CACHE_SIZE') {
    event.waitUntil(
      getCacheSize().then((size) => {
        event.ports[0].postMessage({ size });
      })
    );
  }
});

/**
 * Calculate total cache size
 */
async function getCacheSize() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  let totalSize = 0;

  for (const request of keys) {
    const response = await cache.match(request);
    if (response) {
      const blob = await response.blob();
      totalSize += blob.size;
    }
  }

  return totalSize;
}
