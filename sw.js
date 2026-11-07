// Service worker: membuat website tetap bisa dibuka saat offline.
// Strategi "jaringan dulu": saat online selalu memakai versi terbaru dari server,
// lalu menyimpan salinannya. Saat offline, salinan terakhir yang dipakai.
// Naikkan CACHE_VERSION setiap rilis agar salinan lama dibersihkan.

const CACHE_VERSION = 'gtacoach-0.7.0';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/layout.css',
  './css/components.css',
  './js/main.js',
  './js/config.js',
  './js/store.js',
  './js/data.js',
  './js/format.js',
  './js/router.js',
  './js/ui.js',
  './js/engine/finance.js',
  './js/engine/calculator.js',
  './js/engine/catalog.js',
  './js/engine/recommend.js',
  './js/engine/planner.js',
  './js/engine/progression.js',
  './js/views/dashboard.js',
  './js/views/recommendation.js',
  './js/views/profile.js',
  './js/views/events.js',
  './js/views/businesses.js',
  './js/views/calculator.js',
  './js/views/plan.js',
  './js/views/progression.js',
  './js/views/guides.js',
  './js/views/settings.js',
  './js/views/upcoming.js',
  './data/businesses.json',
  './data/events/current.json',
  './data/gtaplus.json',
  './data/progression.json',
  './data/guides.json',
  './icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gtacoach-') && k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())),
      ),
  );
});
