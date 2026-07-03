/**
 * Service worker — makes Nebula Studio usable offline once it's been
 * loaded at least once. This is a real fit for a browser beat maker (make
 * music with no connection), not decorative PWA boilerplate.
 *
 * Strategy: cache-first for same-origin GET requests, with a network
 * fallback that also updates the cache (stale-while-revalidate). No
 * hardcoded file manifest to keep in sync with the source tree -- every
 * asset the app actually requests gets cached the first time it's
 * fetched, so this never goes stale as files are added/renamed.
 *
 * Explicitly NOT cached: the /api/ai proxy (must always hit the network --
 * caching an AI response would be actively wrong) and cross-origin
 * requests (Google Fonts, OpenRouter direct calls in BYOK mode).
 *
 * @module sw
 */

const CACHE_NAME = 'nebula-studio-v1';

self.addEventListener('install', (_event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return; // don't touch cross-origin (fonts, OpenRouter)
  if (url.pathname === '/api/ai') return; // never cache AI responses

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);

      // Cache-first when we have it (instant offline load); otherwise wait
      // on the network and cache the result for next time.
      return cached || networkFetch;
    })
  );
});
