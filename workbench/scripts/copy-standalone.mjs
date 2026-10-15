// Copies the single-file clients next to each other in dist/:
// - massamba-workbench.html         → needs the local agent (npm start)
// - massamba-workbench-direct.html  → works alone (talks to OpenRouter from the browser)
import fs from 'node:fs';

// Packs of sets (MASSAMBA_TROUPE_PACKS build): the old ones go, the new ones sit next to the app.
for (const f of fs.readdirSync('dist')) if (/^massamba-troupe-\d+\.js$/.test(f)) fs.rmSync(`dist/${f}`);
if (fs.existsSync('dist/direct'))
  for (const f of fs.readdirSync('dist/direct'))
    if (/^massamba-troupe-\d+\.js$/.test(f)) {
      fs.copyFileSync(`dist/direct/${f}`, `dist/${f}`);
      console.log(`paquet de décors → dist/${f} (${(fs.statSync(`dist/${f}`).size / 1024 / 1024).toFixed(1)} MB)`);
    }

for (const [src, dst] of [
  ['dist/web/index.html', 'dist/massamba-workbench.html'],
  ['dist/direct/index.html', 'dist/massamba-workbench-direct.html'],
]) {
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, dst);
  console.log(`standalone client → ${dst} (${(fs.statSync(dst).size / 1024 / 1024).toFixed(1)} MB)`);
}
