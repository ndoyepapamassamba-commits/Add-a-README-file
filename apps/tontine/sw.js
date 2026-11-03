/* Tontine Claire — service worker : l'application est gardée sur le téléphone (hors ligne).
   Les données de la tontine passent toujours en direct par l'API (jamais mises en cache ici).
   Changer VERSION à chaque publication de fichiers modifiés. */
var VERSION = 'tc-v1.0.0';
var FICHIERS = [
  './', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/coeur.js', 'js/db.js', 'js/pdf.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'vendor/jspdf.umd.min.js', 'vendor/LISEZMOI.txt'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(FICHIERS.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return k.indexOf('tc-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) { if (e.data === 'maj') self.skipWaiting(); });

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API des tontines et pass : toujours en direct
  var racine = new URL('./', self.registration.scope).pathname;
  if (url.pathname.indexOf(racine) !== 0) return;
  // Ouverture de l'application (lien du groupe compris : le « # » reste dans le navigateur)
  if (req.mode === 'navigate' && (url.pathname === racine || url.pathname === racine + 'index.html')) {
    e.respondWith(caches.open(VERSION).then(function (c) {
      return c.match('index.html').then(function (r) { return r || fetch(req); });
    }).catch(function () { return fetch(req); }));
    return;
  }
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (r) {
      return r || fetch(req).then(function (res) {
        if (res.ok && res.type === 'basic') c.put(req, res.clone());
        return res;
      });
    });
  }));
});
