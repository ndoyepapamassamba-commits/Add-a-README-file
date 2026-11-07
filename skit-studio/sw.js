/* Skit Studio — service worker minimal : cache de l'application (hors ligne) */
const CACHE = 'skitstudio-v1';
const FILES = ['./', './index.html', './css/studio.css', './manifest.webmanifest', './js/00-core.js', './js/10-script.js', './js/20-timeline.js', './js/30-audio.js', './js/40-voices.js', './js/50-assets.js', './js/55-facerig.js', './js/56-depth.js', './js/57-warp.js', './js/60-animator.js', './js/61-sketch.js', './js/65-imagegen.js', './js/70-painter.js', './js/80-encoder.js', './js/85-zip.js', './js/90-batch.js', './js/95-ai.js', './js/99-app.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // ressources CDN mises en cache après premier accès (polices, muxer, emojis, modèles)
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok && (url.origin === location.origin || /jsdelivr|fonts\.g|storage\.googleapis|huggingface/.test(url.host))) { const c = r.clone(); caches.open(CACHE).then(cache => cache.put(e.request, c)).catch(() => {}); } return r; }).catch(() => hit)));
});
