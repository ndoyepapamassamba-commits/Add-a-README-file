// Copies the single-file clients next to each other in dist/:
// - openrouter-workbench.html         → needs the local agent (npm start)
// - openrouter-workbench-direct.html  → works alone (talks to OpenRouter from the browser)
import fs from 'node:fs';

for (const [src, dst] of [
  ['dist/web/index.html', 'dist/openrouter-workbench.html'],
  ['dist/direct/index.html', 'dist/openrouter-workbench-direct.html'],
]) {
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, dst);
  console.log(`standalone client → ${dst} (${(fs.statSync(dst).size / 1024 / 1024).toFixed(1)} MB)`);
}
