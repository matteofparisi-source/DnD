// Offline support: network first (so updates show up right away), falling back to the cached copy.
const CACHE = 'ledger-v6';
const ASSETS = [
  './', './index.html', './css/styles.css', './js/app.js', './js/rules.js', './js/store.js',
  './js/data/artificer.js', './js/data/spells.js', './js/data/plans.js', './js/data/feats.js', './js/data/equipment.js',
  './manifest.webmanifest', './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './img/grain.png',
  './fonts/cinzel-latin-400-normal.woff2', './fonts/cinzel-latin-700-normal.woff2', './fonts/cinzel-decorative-latin-700-normal.woff2',
  './fonts/eb-garamond-latin-400-normal.woff2', './fonts/eb-garamond-latin-400-italic.woff2', './fonts/eb-garamond-latin-600-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
