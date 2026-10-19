/**
 * Kogna Coffee POS — Service Worker v9
 * Provides resilient offline capability without breaking RSC navigations or cold starts.
 */

const CACHE_NAME = 'kogna-pos-v9';
const OFFLINE_URL = '/offline.html';

// Assets to pre-cache on install (app shell)
const PRECACHE_ASSETS = [
  '/',
  '/dashboard/tables',
  '/login',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// ── Install: pre-cache app shell ──────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Pre-cache partial failure:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: intercept requests ────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and cross-origin requests
  if (request.method !== 'GET' || url.origin !== location.origin) {
    return;
  }

  // Scanner & Tunnels: Always network only, NEVER cache anything
  if (
    url.pathname.startsWith('/scanner') ||
    url.hostname.startsWith('scanner.') ||
    url.hostname.includes('trycloudflare.com')
  ) {
    event.respondWith(networkOnly(request));
    return;
  }

  // API routes: Always network only (fresh dynamic data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkOnly(request));
    return;
  }

  // Next.js RSC Flight requests (?_rsc=... or Header RSC: 1):
  // MUST ALWAYS be network-only. NEVER return offline.html or text to RSC requests!
  if (request.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) {
    event.respondWith(networkOnly(request));
    return;
  }

  // Next.js static assets and build chunks:
  // Use Cache-First with Network fallback, but NEVER return a fake 503 text string
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.json') {
    event.respondWith(cacheFirstStatic(request));
    return;
  }

  // Full-page navigations (HTML documents):
  // Network-first with generous timeout (25s) to accommodate serverless & Neon DB cold starts
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstDocument(request));
    return;
  }

  // Default: Network fetch
  event.respondWith(fetch(request));
});

// ── Resilient Strategies ──────────────────────────────────

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch (err) {
    // If it's an API route, return JSON error
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'Offline — no network connection', offline: true }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
    // For other requests (e.g. RSC), let the network error propagate cleanly to React
    throw err;
  }
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // DO NOT return a 503 text response! Throw so browser/script tags handle retry
    throw err;
  }
}

async function networkFirstDocument(request) {
  try {
    // 25-second timeout to handle Vercel serverless cold starts & Neon wake-up gracefully
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeout);

    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline or network failure: check if this specific URL is in cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // Return friendly offline page as last resort for document navigation
    const offlinePage = await caches.match(OFFLINE_URL);
    if (offlinePage) return offlinePage;

    return new Response(
      '<h1>Offline</h1><p>Please check your connection and try again.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

// ── Background sync trigger ──────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'diva-sync' || event.tag === 'kogna-sync') {
    event.waitUntil(
      fetch('/api/sync', { method: 'POST' })
        .then(() => console.log('[SW] Background sync completed'))
        .catch((err) => console.warn('[SW] Background sync failed:', err))
    );
  }
});
