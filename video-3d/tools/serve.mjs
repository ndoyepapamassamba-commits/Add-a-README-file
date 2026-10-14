// Mini serveur statique (zéro dépendance) avec support des requêtes Range pour la vidéo.
// Usage : node tools/serve.mjs [port]   puis ouvrir http://localhost:8080
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.m4a': 'audio/mp4', '.svg': 'image/svg+xml',
};

// `handler(req, res, url)` optionnel : renvoie true s'il a traité la requête (routes de l'export CLI).
export function startServer(port = 8080, { handler } = {}) {
  const base = ROOT;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (handler && (await handler(req, res, url))) return;
    } catch (err) {
      console.error(err);
      res.writeHead(500).end(String(err));
      return;
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(base, path.normalize(rel));
    if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('404'); return;
    }
    const size = fs.statSync(file).size;
    const headers = {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache',
    };
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      const start = range[1] ? +range[1] : 0;
      const end = range[2] ? Math.min(+range[2], size - 1) : size - 1;
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': size });
      fs.createReadStream(file).pipe(res);
    }
  });
  // Connexions gardées ouvertes longtemps : évite qu'un envoi de frame tombe sur une connexion que
  // le serveur vient de fermer (course classique avec le délai par défaut de 5 s).
  server.keepAliveTimeout = 120000;
  server.headersTimeout = 125000;
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = +(process.argv[2] || 8080);
  await startServer(port);
  console.log(`▶  http://localhost:${port}/`);
}
