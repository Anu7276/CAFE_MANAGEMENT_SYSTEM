/**
 * Café Emerald Service Worker (PWA)
 * Versioned cache storage for offline kitchen tablet operation.
 * Invalidates and replaces stale assets on new deployments.
 */

const CACHE_VERSION = 'emerald-build-__SW_CACHE_VERSION__';
const STATIC_CACHE_NAME = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `dynamic-${CACHE_VERSION}`;

const ASSETS_TO_PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install Event - Pre-cache core application shell
self.addEventListener('install', (event) => {
  console.log(`[ServiceWorker] Installing version: ${CACHE_VERSION}`);
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_PRECACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event - Purge outdated caches from previous deployments
self.addEventListener('activate', (event) => {
  console.log(`[ServiceWorker] Activating version: ${CACHE_VERSION}`);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('emerald-') || name.startsWith('static-') || name.startsWith('dynamic-'))
          .filter((name) => name !== STATIC_CACHE_NAME && name !== DYNAMIC_CACHE_NAME)
          .map((staleCache) => {
            console.log(`[ServiceWorker] Deleting obsolete cache: ${staleCache}`);
            return caches.delete(staleCache);
          })
      );
    })
  );
  return self.clients.claim();
});

// Message Event - Handle SKIP_WAITING from kitchen tablet update prompt
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[ServiceWorker] Received SKIP_WAITING message. Activating new worker...');
    self.skipWaiting();
  }
});

// Fetch Event - Network first for APIs, cache fallback for assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API, WebSockets, Cloudinary, Unsplash, or Razorpay requests to avoid stale or blocked media
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/socket.io') ||
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('unsplash.com') ||
    url.hostname.includes('razorpay.com')
  ) {
    return;
  }

  // Handle navigation requests (SPA HTML)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html') || caches.match('/');
      })
    );
    return;
  }

  // Cache-first with network fallback for static JS/CSS/image assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          // Fallback on offline asset with valid SVG placeholder
          if (event.request.destination === 'image') {
            const placeholderSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="100%" height="100%" fill="#06160f"/><text x="50%" y="50%" font-size="64" text-anchor="middle" dominant-baseline="middle">☕</text></svg>';
            return new Response(placeholderSvg, { headers: { 'Content-Type': 'image/svg+xml' } });
          }
        });
    })
  );
});
