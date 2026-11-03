/* ColisPreuve — service worker : l'application est gardée sur le téléphone (elle s'ouvre sans réseau).
   Les échanges avec le serveur (autre origine) ne passent jamais par ce cache.
   Changer VERSION à chaque publication de fichiers modifiés. */
var VERSION = 'cp-v1.0.0';
var FICHIERS = [
  './', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/coeur.js', 'js/db.js', 'js/reseau.js', 'js/photo.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/logo-64.png'
];
// Gardés au premier usage (PDF) : js/pdf.js, vendor/jspdf.umd.min.js

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(FICHIERS.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () {
    // Première installation : prendre la main tout de suite. Mise à jour : attendre l'accord de l'utilisateur.
    return self.registration.active ? null : self.skipWaiting();
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return k.indexOf('cp-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) { if (e.data === 'maj') self.skipWaiting(); });

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  var racine = new URL('./', self.registration.scope).pathname;
  if (url.pathname.indexOf(racine) !== 0) return;
  // Ouverture de l'application (liens livreur / client compris : la partie après # ne change pas l'adresse)
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
