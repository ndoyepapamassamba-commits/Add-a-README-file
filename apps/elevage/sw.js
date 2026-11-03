/* Carnet Élevage — service worker : l'application s'ouvre et fonctionne sans Internet.
   Changer VERSION à chaque mise à jour des fichiers : l'ancien cache est alors supprimé. */
var PREFIXE = 'carnet-elevage-';
var VERSION = PREFIXE + 'v1';
var FICHIERS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/theme.js', 'js/ui.js', 'js/licence.js', 'js/db.js', 'js/calculs.js', 'js/photo.js', 'js/pdf.js', 'js/coquille.js', 'js/app.js',
  'vendor/jspdf.umd.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FICHIERS.map(function (f) { return new Request(f, { cache: 'reload' }); })); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return k.indexOf(PREFIXE) === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'MISE_A_JOUR') self.skipWaiting();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // Seulement les fichiers de l'application ; jamais la vérification du pass (autre domaine)
  if (url.origin !== self.location.origin || url.pathname.indexOf(new URL('./', self.location).pathname) !== 0) return;
  if (req.mode === 'navigate') {
    if (!/\/$|\/index\.html$/.test(url.pathname)) return;
    e.respondWith(caches.match('index.html', { cacheName: VERSION }).then(function (r) { return r || fetch(req); }));
    return;
  }
  e.respondWith(caches.match(req, { cacheName: VERSION, ignoreSearch: true }).then(function (r) {
    return r || fetch(req).then(function (rep) {
      if (rep && rep.ok && rep.type === 'basic') { var copie = rep.clone(); caches.open(VERSION).then(function (c) { c.put(req, copie); }); }
      return rep;
    });
  }));
});
