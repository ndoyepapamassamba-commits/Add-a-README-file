// Copie les bibliothèques (versions figées dans package.json) dans vendor/ pour que la page
// fonctionne hors-ligne et sans CDN.
import fs from 'node:fs';
const copies = {
  'node_modules/three/build/three.module.js': 'vendor/three.module.js',
  'node_modules/three/build/three.core.js': 'vendor/three.core.js',
  'node_modules/mediabunny/dist/bundles/mediabunny.min.mjs': 'vendor/mediabunny.min.mjs',
};
fs.mkdirSync('vendor', { recursive: true });
for (const [from, to] of Object.entries(copies)) { fs.copyFileSync(from, to); console.log(`${from} → ${to}`); }
for (const lic of [['node_modules/three/LICENSE', 'vendor/LICENSE-three.txt'], ['node_modules/mediabunny/LICENSE', 'vendor/LICENSE-mediabunny.txt']]) {
  if (fs.existsSync(lic[0])) fs.copyFileSync(lic[0], lic[1]);
}
