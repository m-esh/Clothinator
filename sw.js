// Offline support. The app shell is cached on install; the AI library from
// the CDN is cached the first time it's used. Model weights are cached by the
// library itself. Weather always goes to the network (the app keeps its own
// last-known copy).

const VERSION = 'v20';
const SHELL = `clothinator-shell-${VERSION}`;
const RUNTIME = 'clothinator-runtime';

const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'styles/app.css',
  'assets/icon.svg', 'assets/icon-180.png', 'assets/icon-192.png', 'assets/icon-512.png',
  'assets/fonts/unbounded.woff2',
  'src/app.js', 'src/ui/dom.js', 'src/ui/board.js', 'src/ui/today.js', 'src/ui/closet.js', 'src/ui/add.js',
  'src/ui/outfits.js', 'src/ui/laundry.js', 'src/ui/settings.js',
  'src/data/db.js', 'src/data/store.js', 'src/data/backup.js', 'src/data/weather-service.js',
  'src/core/catalog.js', 'src/core/color.js', 'src/core/rules.js', 'src/core/generate.js',
  'src/core/taste.js', 'src/core/weather.js', 'src/core/week.js',
  'src/vision/pixels.js', 'src/vision/photo.js', 'src/vision/ai.js', 'src/ui/glyphs.js', 'src/ui/silhouettes.js', 'src/ui/tabbar.js', 'src/ui/palette.js', 'src/ui/weather-sheet.js', 'src/ui/swipe.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('clothinator-shell-') && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Our own files: network first so updates land, cache when offline.
  if (url.origin === location.origin) {
    // 'no-cache' revalidates with the server every time (a cheap 304 when
    // nothing changed), so updates show up on the next open instead of
    // waiting out GitHub Pages' 10-minute cache.
    e.respondWith(fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) caches.open(SHELL).then((c) => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
    return;
  }

  // The pinned AI library, its WebAssembly runtime and the fonts never
  // change: cache first.
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) caches.open(RUNTIME).then((c) => c.put(e.request, res.clone()));
      return res;
    })));
  }
});
