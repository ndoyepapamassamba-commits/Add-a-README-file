// TERANGA — fonctionnement hors connexion des pages de la boutique (jamais les commandes ni les paiements)
const VERSION = "teranga-3";
const ESSENTIEL = ["./", "index.html", "boutique.css", "boutique.js", "mes-commandes.html", "manifest.webmanifest", "icone-192.png", "icone-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ESSENTIEL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // API de la boutique : toujours en direct
  if (!u.pathname.startsWith(new URL(self.registration.scope).pathname)) return; // hors boutique (apps/catalogue.json…) : en direct
  // Pages : réseau d'abord (contenu à jour), copie locale si pas de connexion ; fichiers : copie locale d'abord
  const page = e.request.mode === "navigate" || u.pathname.endsWith(".html");
  e.respondWith(page
    ? fetch(e.request).then((r) => { const c = r.clone(); caches.open(VERSION).then((ca) => ca.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
    : caches.match(e.request).then((r) => r || fetch(e.request).then((x) => { const c = x.clone(); caches.open(VERSION).then((ca) => ca.put(e.request, c)); return x; })));
});
