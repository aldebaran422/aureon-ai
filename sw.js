// Aureon Service Worker
// Caches the app shell so it loads from the home screen without a network round-trip.

// Increment this version string with every production deploy
// so all users get a fresh cache immediately.
const CACHE = 'aureon-v6';

const SHELL = [
  '/',
  '/index.html',
  '/aureon-logo.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/site.webmanifest',
];

// Install: pre-cache the shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API calls, cache-first for everything else
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always go to network for API and external CDN resources
  if (url.pathname.startsWith('/api/') || url.origin !== location.origin) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      });
      return cached || network;
    })
  );
});
