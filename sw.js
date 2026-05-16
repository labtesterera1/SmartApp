/* ============================================================
   sw.js — service worker  v0.16
   Bare-minimum app-shell caching so the PWA installs offline.
   IMPORTANT: We do NOT cache user data — that lives in IndexedDB.
   To force users onto new code: bump CACHE_NAME below.
   ============================================================ */
const CACHE_NAME = 'smartapp-shell-v0.16';
const SHELL = [
  './',
  './index.html',
  './app.css',
  './manifest.json',
  './core/router.js',
  './core/storage.js',
  './core/ui.js',
  './core/version.js',
  './core/profile.js',
  './core/persistence.js',
  './core/messages.js',
  './core/timeart.js',
  './core/reader-overlay.js',
  './core/backup.js',
  './core/speech.js',
  './vendor/jszip.min.js',
  './vendor/jspdf.umd.min.js',
  './modules/ledger.js',
  './modules/documents.js',
  './modules/sweep.js',
  './modules/vault.js',
  './modules/reader.js',
  './modules/guts.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(SHELL.map((url) =>
        cache.add(url).catch(() => null)
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const fresh = fetch(req).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
