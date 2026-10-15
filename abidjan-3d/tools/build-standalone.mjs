#!/usr/bin/env node
// Fabrique UN SEUL fichier HTML autonome (planche, 30 vignettes agrandies, profondeur, Three.js,
// Mediabunny, l'interprète de prompts et le studio intégrés). Il s'ouvre par double-clic, sans serveur ni Internet.
//   node tools/build-standalone.mjs [--planche scenes] [--out dist/scenes-3d.html]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const k = process.argv.indexOf(name); return k > 0 ? process.argv[k + 1] : null; };
const planche = arg('--planche') || '';
const A = planche ? `assets/${planche}/` : 'assets/';
const outFile = path.resolve(ROOT, arg('--out') || `dist/${planche || 'abidjan'}-3d.html`);
const read = (p) => fs.readFileSync(path.resolve(ROOT, p));
const text = (p) => read(p).toString('utf8');
const b64 = (buf) => Buffer.from(buf).toString('base64');

// Remplace `from` par `to` et échoue si `from` est absent (garde-fou si un fichier change).
function rewrite(code, from, to, label) {
  const parts = code.split(from);
  if (parts.length < 2) throw new Error(`${label} : « ${from} » introuvable`);
  return parts.join(to);
}

const meta = JSON.parse(text(`${A}meta.json`));
const anim = fs.existsSync(path.resolve(ROOT, `${A}anim.json`)) ? JSON.parse(text(`${A}anim.json`)) : null;
const animFiles = anim ? [...new Set([
  ...Object.values(anim.tiles).flatMap((t) => [t.fond, t.decoupes, t.ambiance]),
  ...(anim.planche ? [anim.planche.fond, anim.planche.ambiance, anim.planche.decoupes] : []),
])] : [];
const modules = {
  'three-core': text('vendor/three.core.js'),
  three: rewrite(text('vendor/three.module.js'), "'./three.core.js'", "'three-core'", 'three.module.js'),
  mediabunny: text('vendor/mediabunny.min.mjs'),
  studio: rewrite(rewrite(text('src/studio.js'), "'../vendor/three.module.js'", "'three'", 'studio.js'), "'./prompt.js'", "'prompt'", 'studio.js'),
  prompt: text('src/prompt.js'),
};
let app = text('src/app.js');
app = rewrite(app, "'./studio.js'", "'studio'", 'app.js');
app = rewrite(app, "'../vendor/mediabunny.min.mjs'", "'mediabunny'", 'app.js');
app = rewrite(app, "'./prompt.js'", "'prompt'", 'app.js');

const BOOT = `(() => {
  const text = (id) => document.getElementById(id).textContent;
  const bytes = (id) => {
    const s = atob(text(id));
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  };
  const url = (id, type) => URL.createObjectURL(new Blob([bytes(id)], { type }));
  const meta = JSON.parse(text('asset-meta'));
  const animEl = document.getElementById('asset-anim');
  const anim = animEl ? JSON.parse(animEl.textContent) : null;
  const animFiles = {};
  document.querySelectorAll('script[data-anim]').forEach((el) => {
    const f = el.dataset.anim;
    animFiles[f] = url(el.id, f.endsWith('.png') ? 'image/png' : 'image/webp');
  });
  window.__ASSETS = {
    meta, anim, animFiles,
    source: url('asset-source', 'image/webp'),
    depth: url('asset-depth', 'image/png'),
    tiles: meta.tiles.map((t) => url('asset-tile-' + t.i, 'image/webp')),
  };
  const map = document.createElement('script');
  map.type = 'importmap';
  const js = (id) => url(id, 'text/javascript;charset=utf-8');
  map.textContent = JSON.stringify({ imports: {
    three: js('mod-three'), 'three-core': js('mod-three-core'), mediabunny: js('mod-mediabunny'), studio: js('mod-studio'), prompt: js('mod-prompt'),
  } });
  document.head.append(map);
  const main = document.createElement('script');
  main.type = 'module';
  main.src = js('mod-app');
  document.body.append(main);
})();`;

const block = (id, type, data) => `<script id="${id}" type="${type}">${data}</script>`;
const payload = [
  block('asset-meta', 'application/json', JSON.stringify(meta)),
  block('asset-source', 'image/webp;base64', b64(read(`${A}${meta.source.file}`))),
  block('asset-depth', 'image/png;base64', b64(read(`${A}depth-atlas.png`))),
  ...meta.tiles.map((t) => block(`asset-tile-${t.i}`, 'image/webp;base64', b64(read(`${A}${t.up.file}`)))),
  ...(anim ? [block('asset-anim', 'application/json', JSON.stringify(anim))] : []),
  ...animFiles.map((f, k) => `<script id="asset-anim-${k}" data-anim="${f}" type="application/octet-stream;base64">${b64(read(`${A}${f}`))}</script>`),
  ...Object.entries(modules).map(([name, code]) => block(`mod-${name}`, 'text/plain;base64', b64(Buffer.from(code, 'utf8')))),
  block('mod-app', 'text/plain;base64', b64(Buffer.from(app, 'utf8'))),
  `<script>${BOOT}</script>`,
].join('\n  ');

let html = text('index.html');
html = rewrite(html, '<script type="module" src="src/app.js"></script>', payload, 'index.html');
html = rewrite(html,
  "Dans le navigateur, l'export passe par WebCodecs (Chrome, Edge). En ligne de commande : <code>npm run export</code> (FFmpeg).",
  "Fichier autonome : tout fonctionne hors ligne. L'export MP4 passe par WebCodecs, ouvrez ce fichier dans Chrome ou Edge sur ordinateur.",
  'index.html');

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
console.log(`✔ ${path.relative(process.cwd(), outFile)} (${(fs.statSync(outFile).size / 1e6).toFixed(1)} Mo)`);
