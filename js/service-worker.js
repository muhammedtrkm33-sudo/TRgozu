const CACHE_NAME = 'trgozu-cache-v1';
const CACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/assets/trgozu.jpg',
  '/js/config.js',
  '/js/utils.js',
  '/js/api.js',
  '/js/map.js',
  '/js/auth.js',
  '/js/email-functions.js',
  '/js/sos.js',
  '/js/tracking.js',
  '/js/battery.js',
  '/js/health.js',
  '/js/chat.js',
  '/js/messaging.js',
  '/js/volunteer.js',
  '/js/routing.js',
  '/js/institutions.js',
  '/js/heatmap.js',
  '/js/saferoute.js',
  '/js/family.js',
  '/js/help.js',
  '/js/missing.js',
  '/js/announcement.js',
  '/js/verification.js',
  '/js/voice.js',
  '/js/forecast.js',
  '/js/airquality.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CACHE_ASSETS))
      .catch((err) => console.error('SW cache install failed:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || event.request.url.startsWith('chrome-extension://')) {
            return networkResponse;
          }
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return networkResponse;
        })
        .catch(() => caches.match('/index.html'));
    })
  );
});

