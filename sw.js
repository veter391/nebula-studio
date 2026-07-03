/**
 * Service worker — makes Nebula Studio usable offline once it's been
 * loaded at least once. This is a real fit for a browser beat maker (make
 * music with no connection), not decorative PWA boilerplate.
 *
 * Strategy: NETWORK-FIRST for same-origin GET requests, with the cache as
 * an offline fallback. An online visitor ALWAYS gets the freshly deployed
 * version; the cache only kicks in when the network fails (genuinely
 * offline). This is deliberately not cache-first: an earlier version of
 * this worker was cache-first, which trapped visitors on whatever version
 * they first loaded and made new deploys invisible until the cache name
 * changed -- a classic service-worker footgun. Network-first trades a
 * little load latency (tiny JS files off Cloudflare's edge) for never
 * serving stale app code to someone who is online.
 *
 * Explicitly NOT handled here: the /api/ai proxy (must always hit the
 * network fresh -- caching an AI response would be actively wrong) and
 * cross-origin requests (Google Fonts, OpenRouter direct calls in BYOK
 * mode), which fall through to the browser's normal handling.
 *
 * @module sw
 */

// Bump this whenever the caching STRATEGY changes -- activate deletes any
// cache whose name doesn't match, so bumping it force-flushes visitors who
// were stuck on the previous (cache-first) worker.
const CACHE_NAME = 'nebula-studio-v2-netfirst';

self.addEventListener('install', (_event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return; // don't touch cross-origin (fonts, OpenRouter)
  if (url.pathname === '/api/ai') return; // never cache AI responses

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        // Network first: an online visitor always gets the latest deploy.
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        // Offline (or network error) -- fall back to the last cached copy.
        const cached = await cache.match(request);
        if (cached) return cached;
        throw new Error('offline and not cached');
      }
    })()
  );
});
