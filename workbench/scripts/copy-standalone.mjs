// Copies the single-file clients next to each other in dist/:
// - massamba-workbench.html         → needs the local agent (npm start)
// - massamba-workbench-direct.html  → works alone (talks to OpenRouter from the browser)
import fs from 'node:fs';

// The packs of sets (massamba-troupe-N.js) belong to the Studio Vidéo app since 16/10/2026: old ones leave dist/.
for (const f of fs.readdirSync('dist')) if (/^massamba-troupe-\d+\.js$/.test(f)) fs.rmSync(`dist/${f}`);

for (const [src, dst] of [
  ['dist/web/index.html', 'dist/massamba-workbench.html'],
  ['dist/direct/index.html', 'dist/massamba-workbench-direct.html'],
]) {
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, dst);
  console.log(`standalone client → ${dst} (${(fs.statSync(dst).size / 1024 / 1024).toFixed(1)} MB)`);
}
