const CACHE_NAME = 'zandevaa-music-v7';
const OFFLINE_AUDIO_CACHE = 'zandevaa-offline-audio-v1';
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
      .then((keys) => Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== OFFLINE_AUDIO_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

async function buildRangeResponse(cachedResponse, request) {
  const rangeHeader = request.headers.get('range');
  if (!rangeHeader) return cachedResponse;
  const buf = await cachedResponse.arrayBuffer();
  const total = buf.byteLength;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return new Response(buf, { status: 200, headers: cachedResponse.headers });
  const start = match[1] ? parseInt(match[1], 10) : Math.max(0, total - parseInt(match[2] || '0', 10));
  const end = match[2] ? Math.min(total - 1, parseInt(match[2], 10)) : total - 1;
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${total}` }
    });
  }
  const sliced = buf.slice(start, end + 1);
  return new Response(sliced, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': cachedResponse.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(sliced.byteLength)
    }
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Serve opt-in offline saved MP3s from OFFLINE_AUDIO_CACHE (with full HTTP Range support);
  // uncached audio streams go straight to network without caching overhead.
  if (
    req.headers.has('range') ||
    req.destination === 'audio' ||
    /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(url.pathname)
  ) {
    event.respondWith(
      caches.open(OFFLINE_AUDIO_CACHE)
        .then((cache) => cache.match(url.href))
        .then((cached) => (cached ? buildRangeResponse(cached, req) : fetch(req)))
    );
    return;
  }

  // Network-first for HTML, JS, CSS, lyrics so updates appear right away when online.
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

  // Cache-first for lightweight images & icons.
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
