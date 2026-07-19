// QTO service worker: programos karkasas veikia offline, API – visada tinklas.
const CACHE = 'qto-shell-v1';
// Tik '/': SPA fallback grąžina 404 be text/html Accept, tad '/app' čia netelptų –
// jis į talpyklą patenka per navigacijos handlerį (network-first) žemiau.
const SHELL = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // API ir autentikacija – visada iš tinklo (be talpyklos)
  if (url.pathname.startsWith('/api/')) return;

  // Navigacija – network-first su fallback į talpyklą (offline režimas)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match('/'))),
    );
    return;
  }

  // Statiniai resursai (JS/CSS/wasm/ikonos) – cache-first
  e.respondWith(
    caches.match(e.request).then(
      (cached) =>
        cached ||
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        }),
    ),
  );
});
