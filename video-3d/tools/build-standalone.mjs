#!/usr/bin/env node
// Fabrique UN SEUL fichier HTML autonome : vidéo, cartes de profondeur, Three.js, Mediabunny et le
// code du studio sont intégrés à la page. Il s'ouvre par double-clic (file://), sans serveur ni Internet.
//
//   node tools/build-standalone.mjs                       → dist/ivrogne-3d.html
//   node tools/build-standalone.mjs --video autre.mp4 --out dist/autre.html
//
// Les modules JS sont stockés en base64 dans des balises <script> inertes, puis transformés en URL
// blob: au chargement ; une import map générée à la volée relie les imports entre eux.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opts = {};
for (let i = 2; i < process.argv.length; i += 2) opts[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];

const read = (p) => fs.readFileSync(path.resolve(ROOT, p));
const text = (p) => read(p).toString('utf8');
const b64 = (buf) => Buffer.from(buf).toString('base64');

// Remplace `from` par `to` et échoue si `from` est absent (garde-fou si une bibliothèque change).
function rewrite(code, from, to, label) {
  const parts = code.split(from);
  if (parts.length < 2) throw new Error(`${label} : « ${from} » introuvable`);
  return parts.join(to);
}

const videoPath = path.resolve(ROOT, opts.video || 'assets/source.mp4');
const videoType = videoPath.endsWith('.webm') ? 'video/webm' : 'video/mp4';
const outFile = path.resolve(ROOT, opts.out || 'dist/ivrogne-3d.html');

const modules = {
  'three-core': text('vendor/three.core.js'),
  three: rewrite(text('vendor/three.module.js'), "'./three.core.js'", "'three-core'", 'three.module.js'),
  mediabunny: text('vendor/mediabunny.min.mjs'),
  compositor: rewrite(text('src/compositor.js'), "'../vendor/three.module.js'", "'three'", 'compositor.js'),
};
let app = text('src/app.js');
app = rewrite(app, "'./compositor.js'", "'compositor'", 'app.js');
app = rewrite(app, "'../vendor/mediabunny.min.mjs'", "'mediabunny'", 'app.js');

const BOOT = `(() => {
  const text = (id) => document.getElementById(id).textContent;
  const bytes = (id) => {
    const s = atob(text(id));
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  };
  const js = (id) => URL.createObjectURL(new Blob([bytes(id)], { type: 'text/javascript;charset=utf-8' }));
  const videoBlob = new Blob([bytes('asset-video')], { type: '${videoType}' });
  window.__ASSETS = {
    video: URL.createObjectURL(videoBlob),
    videoBlob,
    depthMeta: JSON.parse(text('asset-depth-meta')),
    depthImage: 'data:image/png;base64,' + text('asset-depth-atlas'),
  };
  const map = document.createElement('script');
  map.type = 'importmap';
  map.textContent = JSON.stringify({ imports: {
    three: js('mod-three'), 'three-core': js('mod-three-core'),
    mediabunny: js('mod-mediabunny'), compositor: js('mod-compositor'),
  } });
  document.head.append(map);
  const main = document.createElement('script');
  main.type = 'module';
  main.src = js('mod-app');
  document.body.append(main);
})();`;

const block = (id, type, data) => `<script id="${id}" type="${type}">${data}</script>`;
const payload = [
  block('asset-video', `${videoType};base64`, b64(fs.readFileSync(videoPath))),
  block('asset-depth-atlas', 'image/png;base64', b64(read('assets/depth-atlas.png'))),
  block('asset-depth-meta', 'application/json', JSON.stringify(JSON.parse(text('assets/depth-meta.json')))),
  ...Object.entries(modules).map(([name, code]) => block(`mod-${name}`, 'text/plain;base64', b64(Buffer.from(code, 'utf8')))),
  block('mod-app', 'text/plain;base64', b64(Buffer.from(app, 'utf8'))),
  `<script>${BOOT}</script>`,
].join('\n  ');

let html = text('index.html');
html = rewrite(html, ' src="assets/source.mp4"', '', 'index.html');
html = rewrite(html, '<script type="module" src="src/app.js"></script>', payload, 'index.html');
html = rewrite(html,
  "Dans le navigateur, l'export passe par WebCodecs (Chrome, Edge). En ligne de commande : <code>npm run export</code> (FFmpeg).",
  "Fichier autonome : tout fonctionne hors ligne. L'export MP4 passe par WebCodecs, ouvrez ce fichier dans Chrome ou Edge sur ordinateur.",
  'index.html');

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
console.log(`✔ ${path.relative(process.cwd(), outFile)} (${(fs.statSync(outFile).size / 1e6).toFixed(1)} Mo)`);
