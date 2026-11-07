#!/usr/bin/env node
/* Construit skit-studio.standalone.html : un seul fichier HTML avec CSS et JS inclus.
   Les bibliothèques CDN (Tailwind, mp4-muxer, MediaPipe, Piper, Transformers.js, emojis 3D)
   restent chargées à la demande depuis le réseau. Usage : node tools/build-standalone.js */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="css\/studio\.css">/, () => '<style>\n' + fs.readFileSync(path.join(root, 'css/studio.css'), 'utf8') + '\n</style>');
html = html.replace(/<script src="js\/([^"]+)"><\/script>/g, (m, f) => '<script>\n' + fs.readFileSync(path.join(root, 'js', f), 'utf8').replace(/<\/script>/g, '<\\/script>') + '\n</script>');
html = html.replace(/<link rel="manifest"[^>]*>\n?/, '');
html = html.replace(/href="README\.md"/, 'href="https://github.com/ndoyepapamassamba-commits/Add-a-README-file/tree/main/skit-studio"');
const out = path.join(root, 'skit-studio.standalone.html');
fs.writeFileSync(out, html);
console.log('écrit', out, (fs.statSync(out).size / 1024).toFixed(0), 'Ko');
