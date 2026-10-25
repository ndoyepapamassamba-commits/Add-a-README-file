// Assemble le jeu en un seul fichier HTML autonome (Three.js inclus), jouable hors ligne par double-clic.
// Usage : npm install && npm run build   ->  dist/horizon-cite.html
// Option : node build.mjs --cdn  ->  dist/horizon-cite-cdn.html (Three.js chargé depuis jsDelivr, fichier plus léger)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const useCdn = process.argv.includes('--cdn');
const fragment = process.argv.includes('--fragment'); // sans <html>/<head>/<body> (hébergement qui fournit le squelette)

const result = await build({
  entryPoints: [join(here, 'src/main.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  target: ['es2020'],
  legalComments: 'none',
  external: useCdn ? ['three'] : [],
});
let js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

let html = readFileSync(join(here, 'index.html'), 'utf8');
const importmap = useCdn
  ? '<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js" } }</script>'
  : '';
html = html.replace(/<!-- BUILD:IMPORTMAP -->[\s\S]*?<!-- \/BUILD:IMPORTMAP -->/, importmap);
html = html.replace(/<!-- BUILD:SCRIPT -->[\s\S]*?<!-- \/BUILD:SCRIPT -->/, () => `<script type="module">\n${js}\n</script>`);

if (fragment) {
  html = html
    .replace(/<!DOCTYPE html>\s*/i, '')
    .replace(/<html[^>]*>\s*/i, '')
    .replace(/<\/html>\s*/i, '')
    .replace(/<head>\s*/i, '')
    .replace(/<\/head>\s*/i, '')
    .replace(/<body>\s*/i, '')
    .replace(/<\/body>\s*/i, '')
    .replace(/<meta charset="UTF-8">\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '');
}

mkdirSync(join(here, 'dist'), { recursive: true });
const name = fragment ? 'horizon-cite-fragment.html' : useCdn ? 'horizon-cite-cdn.html' : 'horizon-cite.html';
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6) || join(here, 'dist', name);
writeFileSync(out, html);
console.log(`OK ${out} (${(html.length / 1024).toFixed(0)} Ko)`);
