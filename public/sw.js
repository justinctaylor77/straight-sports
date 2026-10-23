// Service worker: app shell cache-first, API network-first (offline fallback), logos stale-while-revalidate.
const VERSION = 'ss-v6';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/lib.js', '/gamecast.js', '/backdrop.js', '/catalog.js', '/fonts/barlow-condensed-600.woff2', '/fonts/barlow-condensed-700.woff2', '/fonts/barlow-condensed-800.woff2', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== 'scfb-img').map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); if (r.ok) caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } }))));
    return;
  }
  if (url.hostname.endsWith('espncdn.com')) {
    e.respondWith(caches.open('scfb-img').then(async (c) => { const hit = await c.match(e.request); const net = fetch(e.request).then((r) => { c.put(e.request, r.clone()); return r; }).catch(() => hit); return hit || net; }));
    return;
  }
  if (url.origin === location.origin) {
    // network-first for the shell so updates land quickly; cache fallback offline
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); if (r.ok) caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html'))));
  }
});
