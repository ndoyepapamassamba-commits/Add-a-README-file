/* AccordAI — service worker : l'application est gardée sur le téléphone (ouverture hors ligne)
   et reçoit les discussions WhatsApp partagées vers l'application installée (Android).
   Changer VERSION à chaque publication de fichiers modifiés. */
var VERSION = 'accordai-v1.0.0';
var PARTAGE = 'accordai-partage';
var FICHIERS = [
  './', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/theme.js', 'js/coeur.js', 'js/db.js', 'js/pdf.js', 'js/app.js',
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
    return Promise.all(cles.filter(function (k) { return k.indexOf('accordai-v') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) { if (e.data === 'maj') self.skipWaiting(); });

// Ouvrir l'application en touchant une notification de rappel
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var cible = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (liste) {
    for (var i = 0; i < liste.length; i++) { if (liste[i].url.indexOf(self.registration.scope) === 0 && 'focus' in liste[i]) { liste[i].navigate(cible); return liste[i].focus(); } }
    return self.clients.openWindow(cible);
  }));
});

// Discussion partagée depuis WhatsApp (« Exporter la discussion » → AccordAI) : gardée le temps que l'application la lise
function recevoirPartage(req) {
  return req.formData().then(function (fd) {
    return caches.delete(PARTAGE).then(function () { return caches.open(PARTAGE); }).then(function (c) {
      var fichiers = fd.getAll('fichiers').filter(function (f) { return f && typeof f === 'object' && f.size; }).slice(0, 6);
      var texte = [fd.get('titre'), fd.get('texte'), fd.get('lien')].filter(function (x) { return typeof x === 'string' && x.trim(); }).join('\n');
      var ecritures = fichiers.map(function (f, i) {
        return c.put(new Request('partage/' + i), new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-nom': encodeURIComponent(f.name || ('fichier-' + i)) } }));
      });
      if (texte) ecritures.push(c.put(new Request('partage/texte'), new Response(texte, { headers: { 'content-type': 'text/plain; charset=utf-8' } })));
      return Promise.all(ecritures);
    });
  }).then(function () {
    return Response.redirect(new URL('./#/nouveau?partage=1', self.registration.scope).href, 303);
  }).catch(function () {
    return Response.redirect(new URL('./#/nouveau', self.registration.scope).href, 303);
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // serveur des accords : toujours en direct
  var racine = new URL('./', self.registration.scope).pathname;
  if (url.pathname.indexOf(racine) !== 0) return;
  if (req.method === 'POST' && url.pathname === racine + 'partage') { e.respondWith(recevoirPartage(req)); return; }
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate' && (url.pathname === racine || url.pathname === racine + 'index.html' || url.pathname === racine + 'partage')) {
    e.respondWith(caches.open(VERSION).then(function (c) {
      return c.match('index.html').then(function (r) { return r || fetch(req); });
    }).catch(function () { return fetch(req); }));
    return;
  }
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (r) {
      return r || fetch(req).then(function (res) {
        if (res.ok && res.type === 'basic' && url.pathname.indexOf(racine + 'partage') !== 0) c.put(req, res.clone());
        return res;
      });
    });
  }));
});
