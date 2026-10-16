// Construit la page de rendu : src/rendu/page.ts → dist/page.js (+ dist/page.html), avec esbuild.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(racine, 'dist');
mkdirSync(dist, { recursive: true });

const resultat = await build({
  absWorkingDir: racine,
  entryPoints: ['src/rendu/page.ts'],
  outfile: 'dist/page.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  sourcemap: true,
  legalComments: 'eof',
  logLevel: 'warning',
  metafile: true,
});

writeFileSync(
  resolve(dist, 'page.html'),
  `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Moteur fluide — rendu</title>
<style>html,body{margin:0;padding:0;background:#000;overflow:hidden}canvas{display:block}</style>
</head>
<body>
<script src="page.js"></script>
</body>
</html>
`,
);

const octets = Object.values(resultat.metafile.outputs).reduce((s, o) => s + o.bytes, 0);
console.log(`Page construite : dist/page.html + dist/page.js (${(octets / 1024).toFixed(0)} Kio avec la carte des sources)`);
