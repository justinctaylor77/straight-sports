// Service worker: app shell cache-first, API network-first (offline fallback), logos stale-while-revalidate.
const VERSION = 'ss-v20';
const SHELL = ['/', '/index.html', '/styles.css?v=18', '/app.js?v=20', '/lib.js', '/gamecast.js?v=20', '/plays.js?v=18', '/anim.js?v=18', '/teamtheme.js', '/backdrop.js', '/catalog.js', '/watch.js', '/people.js?v=19', '/fonts/barlow-condensed-600.woff2', '/fonts/barlow-condensed-700.woff2', '/fonts/barlow-condensed-800.woff2', '/manifest.webmanifest', '/icons/mark-96.png?v=16', '/icons/mark-192.png?v=16', '/icons/logo-full-640.png?v=16', '/icons/apple-touch-icon.png?v=16', '/icons/favicon-32.png?v=16', '/icons/favicon-16.png?v=16', '/icons/icon-maskable-512.png?v=16', '/favicon.ico?v=16', '/icons/icon-192.png?v=16', '/icons/icon-512.png?v=16'];
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
