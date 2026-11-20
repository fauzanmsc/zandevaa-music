const CACHE_NAME = 'zandevaa-music-v1';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './playlist.js',
  './manifest.webmanifest',
  './assets/favicon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './assets/cover.webp',
  './assets/cover-lagu-kedua.webp',
  './assets/cover-3.webp',
  './lyrics/untukmu-syifa.txt',
  './lyrics/lagu-kedua.txt',
  './lyrics/you.txt'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Never intercept HTTP Range requests (preserves Safari/Chrome audio scrubbing & seeking).
  if (req.headers.has('range')) return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML & JS/CSS/playlist/lyrics so updates arrive immediately when online,
  // with full offline fallback from cache.
  const isFreshAsset = /\.(html|js|css|txt|lrc|webmanifest)$/i.test(url.pathname) || url.pathname.endsWith('/');
  if (isFreshAsset) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for covers, icons, and full media fetches for instant repeat loads & offline playback.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
