/* Lecture Facile — service worker : l'application, les polices et les textes sont gardés sur le téléphone (hors ligne).
   Le lecteur de photos (vendor/tesseract, ~3,7 Mo) n'est gardé qu'après sa première utilisation.
   Changer VERSION à chaque publication de fichiers modifiés. */
var VERSION = 'lf-v1.0.0';
var FICHIERS = [
  './', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/theme.js', 'js/coeur.js', 'js/db.js', 'js/voix.js', 'js/ocr.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'fonts/opendyslexic-400.woff2', 'fonts/opendyslexic-700.woff2', 'fonts/lexend-400.woff2', 'fonts/lexend-700.woff2',
  'fonts/atkinson-400.woff2', 'fonts/atkinson-700.woff2',
  'data/textes.json'
];
var OCR = 'lf-ocr-v7.0.0'; // fichiers du lecteur de photos : gardés à part, entre deux versions de l'application

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(FICHIERS.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return k.indexOf('lf-') === 0 && k !== VERSION && k !== OCR; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) { if (e.data === 'maj') self.skipWaiting(); });

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // vérification du pass : toujours en direct
  var racine = new URL('./', self.registration.scope).pathname;
  if (url.pathname.indexOf(racine) !== 0) return;
  if (req.mode === 'navigate' && (url.pathname === racine || url.pathname === racine + 'index.html')) {
    e.respondWith(caches.open(VERSION).then(function (c) {
      return c.match('index.html').then(function (r) { return r || fetch(req); });
    }).catch(function () { return fetch(req); }));
    return;
  }
  var nom = url.pathname.indexOf(racine + 'vendor/tesseract/') === 0 ? OCR : VERSION;
  e.respondWith(caches.open(nom).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (r) {
      return r || fetch(req).then(function (res) {
        if (res.ok && res.type === 'basic') c.put(req, res.clone());
        return res;
      });
    });
  }));
});
