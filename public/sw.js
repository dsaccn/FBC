/**
 * Diva Addis POS — Service Worker
 * Provides offline capability by caching the app shell.
 *
 * Strategy:
 * - App shell (HTML/JS/CSS/fonts): Cache-first, update in background
 * - API routes (/api/*): Network-first with 5s timeout, no offline cache
 * - Static assets (/icons, /manifest): Cache-first, long TTL
 */

const CACHE_NAME = 'nexora-pos-v3';
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
        // Don't fail install if some assets aren't available
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

  // API routes: Network-first, never cache (always fresh data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkOnly(request));
    return;
  }

  // Static assets: Cache-first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Pages: Network-first with offline fallback
  event.respondWith(networkFirstWithFallback(request));
});

// ── Strategies ────────────────────────────────────────────

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Offline — no network connection', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Asset not available offline', { status: 503 });
  }
}

async function networkFirstWithFallback(request) {
  try {
    // Try network with 5-second timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline or timeout — return cached version
    const cached = await caches.match(request);
    if (cached) return cached;

    // Return offline page as last resort
    const offlinePage = await caches.match(OFFLINE_URL);
    if (offlinePage) return offlinePage;

    return new Response(
      '<h1>Offline</h1><p>Please check your connection and try again.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

// ── Background sync trigger ──────────────────────────────
// When browser comes back online, notify the app to sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'diva-sync') {
    event.waitUntil(
      fetch('/api/sync', { method: 'POST' })
        .then(() => console.log('[SW] Background sync completed'))
        .catch((err) => console.warn('[SW] Background sync failed:', err))
    );
  }
});
