// Offline support. Pages load network-first so updates show up right away;
// other same-origin files (hashed assets, images) come from cache while being
// refreshed in the background.
const CACHE = 'tacta-v4';
// Relative to the worker's location, so the app works from any base path.
const SHELL = ['./', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const fresh = fetch(request).then((res) => {
        if (res.ok) cache.put(request, res.clone());
        return res;
      });
      if (request.mode === 'navigate') {
        // Offline: the cached page, or the game page if this one was never visited.
        return fresh.catch(() => cached || cache.match(new URL('./', self.registration.scope).href));
      }
      return cached ? (fresh.catch(() => {}), cached) : fresh;
    }),
  );
});
