// Deliberately minimal - a plain network passthrough, no offline caching.
// Its only job is to satisfy the browser's PWA installability requirement
// (a registered service worker with a fetch handler); caching app data
// here would risk serving a stale bundle after a deploy, which isn't
// worth the tradeoff for what this app needs right now.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
