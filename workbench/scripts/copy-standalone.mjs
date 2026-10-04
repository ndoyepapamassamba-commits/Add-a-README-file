// Copies the single-file client to dist/openrouter-workbench.html (the file to
// open by double-click; it connects to the local agent on http://127.0.0.1:8787).
import fs from 'node:fs';

fs.copyFileSync('dist/web/index.html', 'dist/openrouter-workbench.html');
const size = (fs.statSync('dist/openrouter-workbench.html').size / 1024 / 1024).toFixed(1);
console.log(`standalone client → dist/openrouter-workbench.html (${size} MB)`);
