/**
 * TDRN Service Worker — Offline-First Disaster Response
 * Caches all portal pages and assets for use without internet
 * Critical for field deployment where connectivity may be lost
 */

const CACHE_VERSION = 'tdrn-v2-2026';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

// All portal pages to cache on install
const STATIC_ASSETS = [
  '/',
  '/tdrn/dashboard',
  '/tdrn/tennessee',
  '/tdrn/warren-county',
  '/tdrn/members',
  '/tdrn/teams',
  '/tdrn/training',
  '/tdrn/equipment',
  '/tdrn/events',
  '/tdrn/communications',
  '/tdrn/documents',
  '/tdrn/certifications',
  '/tdrn/applicants',
  '/tdrn/partners',
  '/tdrn/readiness',
  '/tdrn/settings',
  '/tdrn/analytics',
  '/tdrn/ics-forms',
  '/tdrn/map',
  '/tdrn/ai-center',
  'tdrn-core.css',
  'tdrn-core.js',
  'ai-engine.js',
  'supabase-client.js',
  'manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Oswald:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap'
];

// ─── INSTALL ─────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing TDRN Service Worker v2...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Pre-caching all portal pages for offline use');
        // Cache assets that are available; don't fail on missing
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err => console.warn(`[SW] Could not cache ${url}:`, err))
          )
        );
      })
      .then(() => {
        console.log('[SW] Install complete — TDRN portal available offline');
        return self.skipWaiting();
      })
  );
});

// ─── ACTIVATE ────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating TDRN Service Worker...');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('tdrn-') && !key.startsWith(CACHE_VERSION))
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => {
        console.log('[SW] Old caches cleared — taking control of all clients');
        return self.clients.claim();
      })
  );
});

// ─── FETCH STRATEGY ──────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip browser-extension and non-http requests
  if (!request.url.startsWith('http')) return;

  // ── API / Data requests: Network First, fall back to cache ──
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/api/') ||
    url.pathname.includes('/rest/') ||
    url.hostname.includes('googleapis.com') && url.pathname.includes('/v1/')
  ) {
    event.respondWith(networkFirst(request, DATA_CACHE, 8000));
    return;
  }

  // ── Google Fonts: Cache First (rarely changes) ──
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // ── Core assets (CSS, JS): Stale While Revalidate ──
  if (
    request.url.includes('tdrn-core.css') ||
    request.url.includes('tdrn-core.js') ||
    request.url.includes('ai-engine.js') ||
    request.url.includes('supabase-client.js')
  ) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // ── Portal pages: Network First with offline fallback ──
  if (
    url.pathname.startsWith('/tdrn/') ||
    request.destination === 'document'
  ) {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // ── Default: Cache First ──
  event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
});

// ─── FETCH STRATEGIES ────────────────────────────────────────────────────────

/** Cache First: return from cache, fetch only if not cached */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    return offlineResponse(request);
  }
}

/** Network First: try network, fall back to cache */
async function networkFirst(request, cacheName, timeout = 5000) {
  const cache = await caches.open(cacheName);
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(id);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      console.log('[SW] Offline — serving cached data for', request.url);
      return cached;
    }
    return offlineResponse(request);
  }
}

/** Stale While Revalidate: serve from cache immediately, update in background */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || await fetchPromise || offlineResponse(request);
}

/** Network First with a branded offline page for portal navigation */
async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    // Return branded offline page
    return new Response(offlinePage(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

/** Generic offline response based on request destination */
function offlineResponse(request) {
  if (request.destination === 'document') {
    return new Response(offlinePage(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
  if (request.destination === 'image') {
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#16181D"/><text x="100" y="110" text-anchor="middle" fill="#9CA3AF" font-size="14">Offline</text></svg>',
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }
  return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
}

/** Branded offline page shown when no cached version is available */
function offlinePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TDRN — Offline Mode</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: #0F1011;
      color: #D1D5DB;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
      padding: 24px;
    }
    .offline-card {
      background: #16181D;
      border: 1px solid #252830;
      border-top: 4px solid #F5C400;
      border-radius: 12px;
      padding: 48px 40px;
      max-width: 480px;
      width: 100%;
    }
    .logo-mark {
      width: 64px;
      height: 64px;
      background: #F5C400;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      font-size: 28px;
      font-weight: 900;
      color: #0F1011;
      font-family: 'Oswald', sans-serif;
    }
    h1 { color: #F9FAFB; font-size: 24px; margin-bottom: 12px; }
    p { color: #9CA3AF; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: rgba(248,113,113,0.12);
      border: 1px solid rgba(248,113,113,0.3);
      border-radius: 20px;
      color: #F87171;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 32px;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #F87171; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
    .cached-pages h3 { color: #F9FAFB; font-size: 14px; margin-bottom: 12px; text-align: left; }
    .page-list { list-style: none; text-align: left; }
    .page-list li { padding: 8px 0; border-bottom: 1px solid #252830; font-size: 13px; }
    .page-list li a { color: #60A5FA; text-decoration: none; }
    .page-list li a:hover { text-decoration: underline; }
    .retry-btn {
      margin-top: 24px;
      padding: 14px 32px;
      background: #F5C400;
      color: #0F1011;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      width: 100%;
    }
    .retry-btn:hover { background: #D4A800; }
  </style>
</head>
<body>
  <div class="offline-card">
    <div class="logo-mark" aria-hidden="true">TD</div>
    <h1>You're Offline</h1>
    <p>No internet connection detected. TDRN portal is operating in offline mode. Cached data and pages are still available.</p>
    <div class="status-badge">
      <span class="dot" aria-hidden="true"></span>
      No Network Connection
    </div>
    <div class="cached-pages">
      <h3>Available Offline:</h3>
      <ul class="page-list">
        <li><a href="/tdrn/dashboard">National Dashboard</a></li>
        <li><a href="/tdrn/warren-county">Warren County Hub</a></li>
        <li><a href="/tdrn/members">Member Directory</a></li>
        <li><a href="/tdrn/teams">Team Management</a></li>
        <li><a href="/tdrn/equipment">Equipment Registry</a></li>
        <li><a href="/tdrn/readiness">Readiness Board</a></li>
        <li><a href="/tdrn/communications">Communications</a></li>
      </ul>
    </div>
    <button class="retry-btn" onclick="window.location.reload()" aria-label="Retry connection to TDRN portal">
      Retry Connection
    </button>
  </div>
</body>
</html>`;
}

// ─── BACKGROUND SYNC ─────────────────────────────────────────────────────────
// Queue actions taken offline and sync when connection restores
self.addEventListener('sync', event => {
  console.log('[SW] Background sync triggered:', event.tag);
  if (event.tag === 'tdrn-sync-members') {
    event.waitUntil(syncPendingMemberUpdates());
  }
  if (event.tag === 'tdrn-sync-incidents') {
    event.waitUntil(syncPendingIncidentLogs());
  }
  if (event.tag === 'tdrn-sync-equipment') {
    event.waitUntil(syncPendingEquipmentUpdates());
  }
});

async function syncPendingMemberUpdates() {
  // In production: pull from IndexedDB queue and POST to Supabase
  console.log('[SW] Syncing pending member updates...');
}

async function syncPendingIncidentLogs() {
  console.log('[SW] Syncing pending incident log entries...');
}

async function syncPendingEquipmentUpdates() {
  console.log('[SW] Syncing pending equipment status updates...');
}

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'TDRN Alert';
  const options = {
    body: data.body || 'New update from TDRN.',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="24" fill="%230F1011"/><rect x="16" y="16" width="160" height="160" rx="16" fill="%23F5C400"/></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="48" r="48" fill="%23F5C400"/></svg>',
    tag: data.tag || 'tdrn-notification',
    renotify: true,
    requireInteraction: data.priority === 'critical',
    vibrate: data.priority === 'critical' ? [200, 100, 200, 100, 200] : [200],
    data: { url: data.url || '/tdrn/dashboard', timestamp: Date.now() },
    actions: [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || '/tdrn/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        const existing = windowClients.find(c => c.url.includes('/tdrn/'));
        if (existing) { existing.focus(); existing.navigate(url); }
        else clients.openWindow(url);
      })
  );
});

console.log('[SW] TDRN Service Worker loaded — Offline-first disaster response active');
