#!/usr/bin/env node
// Export MP4 100 % libre et gratuit, sans navigateur propriétaire :
//   FFmpeg décode la vidéo source → la page Three.js (Chromium headless, piloté par Playwright)
//   redessine chaque frame → FFmpeg encode en H.264 (x264) et copie la piste audio d'origine.
//
// Exemples :
//   node tools/export.mjs                                   # mode original (zéro régression)
//   node tools/export.mjs --mode 3d --camera orbite         # relief 3D
//   node tools/export.mjs --subs --out out/avec-sous-titres.mp4
// Options : --mode original|3d  --camera travelling|orbite|fixe  --relief 0.15  --subs
//           --crf 12  --preset slow  --out <fichier>  --frames <n>  --browser <chemin chromium>  --no-check
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';
import { checkRegression } from './regression.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = 1080, H = 1920, FPS = 30, TOTAL = 369, FRAME_BYTES = W * H * 4;
// Conversion YUV↔RGB symétrique et précise : l'aller-retour est quasi sans perte (≈ 64 dB).
const SWS = 'accurate_rnd+full_chroma_int+full_chroma_inp+bitexact';

const opts = parseArgs(process.argv.slice(2));
const source = path.resolve(ROOT, opts.source || 'assets/source.mp4');
const frames = Math.min(TOTAL, +(opts.frames || TOTAL));
const mode = opts.mode === '3d' ? '3d' : 'original';
const render = { mode, camera: opts.camera || 'travelling', relief: +(opts.relief ?? 0.15), subtitles: !!opts.subs };
const defaultName = `ivrogne-${mode === '3d' ? `3d-${render.camera}` : 'original'}${render.subtitles ? '-soustitres' : ''}.mp4`;
const outFile = path.resolve(ROOT, opts.out || path.join('out', defaultName));
fs.mkdirSync(path.dirname(outFile), { recursive: true });

// 1) Décodage de la source en RGBA brut, lu frame par frame à la demande de la page.
const decoder = spawn('ffmpeg', ['-v', 'error', '-i', source, '-frames:v', String(frames),
  '-vf', `scale=flags=${SWS}:in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgba`,
  '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { stdio: ['ignore', 'pipe', 'inherit'] });
const inputFrames = readFrames(decoder.stdout, FRAME_BYTES);

// 2) Encodeur : frames rendues (lues à l'envers par readPixels → vflip) + audio copié sans perte.
const encoder = spawn('ffmpeg', ['-y', '-v', 'error',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-framerate', String(FPS), '-i', 'pipe:0',
  '-i', source, '-map', '0:v:0', '-map', '1:a:0?', '-c:a', 'copy',
  '-vf', `vflip,scale=flags=${SWS}:out_color_matrix=bt709:out_range=tv,format=yuv420p`,
  '-c:v', 'libx264', '-preset', opts.preset || 'slow', '-crf', String(opts.crf ?? 12),
  // --crf 0 = master sans perte (profil High 4:4:4 Predictive, fichier lourd, moins compatible).
  ...(+(opts.crf ?? 12) === 0 ? [] : ['-profile:v', 'high']),
  '-colorspace', 'unknown', '-color_primaries', 'unknown', '-color_trc', 'unknown', '-color_range', 'tv',
  ...(frames < TOTAL ? ['-shortest'] : []), '-movflags', '+faststart', outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
const encoderDone = new Promise((resolve, reject) => encoder.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg (encodage) a échoué : code ${c}`)))));

let lastInput = null;
const stats = { frames: 0, identicalFrames: 0, diffPixels: 0, maxDiff: 0 };

const server = await startServer(+(opts.port || 0), { // port 0 = port libre choisi par le système
  async handler(req, res, url) {
    let m = /^\/__frame\/(\d+)$/.exec(url.pathname);
    if (m && req.method === 'GET') {
      const { value, done } = await inputFrames.next();
      if (done) { res.writeHead(410).end('fin de la source'); return true; }
      lastInput = value;
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': value.length }).end(value);
      return true;
    }
    m = /^\/__out\/(\d+)$/.exec(url.pathname);
    if (m && req.method === 'POST') {
      const out = await readBody(req, FRAME_BYTES);
      if (mode === 'original' && !render.subtitles) compare(out, lastInput);
      if (!encoder.stdin.write(out)) await new Promise((r) => encoder.stdin.once('drain', r));
      res.writeHead(204).end();
      return true;
    }
    return false;
  },
});
const port = server.address().port;

const browser = await launchBrowser(opts.browser);
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  page.on('pageerror', (e) => console.error('Erreur page :', e.message));
  page.on('console', (msg) => { if (msg.type() === 'error' || msg.type() === 'warning') console.error('[page]', msg.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html?render=1`);
  await page.waitForFunction(() => window.__studioReady === true, null, { timeout: 60000 });
  if (mode === '3d' && !(await page.evaluate(() => window.__studio.has3D))) {
    throw new Error('assets/depth-atlas.png manquant : lancez d\'abord tools/depth.py');
  }
  console.log(`▶ Rendu ${frames} frames · mode ${mode}${mode === '3d' ? ` · caméra ${render.camera} · relief ${render.relief}` : ''}${render.subtitles ? ' · sous-titres' : ''}`);
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate(([f, o]) => window.__studio.renderFrame(f, o), [i, render]);
    if (i % 30 === 0 || i === frames - 1) {
      const fps = (i + 1) / ((Date.now() - t0) / 1000);
      process.stdout.write(`\r  frame ${String(i + 1).padStart(3)}/${frames}  (${fps.toFixed(1)} i/s)   `);
    }
  }
  process.stdout.write('\n');
} finally {
  await browser.close();
  server.close();
  encoder.stdin.end();
  decoder.kill();
}
await encoderDone;
console.log(`✔ MP4 écrit : ${path.relative(process.cwd(), outFile)} (${(fs.statSync(outFile).size / 1e6).toFixed(1)} Mo)`);

if (mode === 'original' && !render.subtitles) {
  const exact = stats.identicalFrames === stats.frames;
  console.log(`\nRendu HTML/WebGL vs frames source : ${stats.identicalFrames}/${stats.frames} frames identiques au pixel près` +
    (exact ? ' ✔' : ` — ${stats.diffPixels} pixels différents (écart max ${stats.maxDiff}/255)`));
  if (!opts['no-check'] && frames === TOTAL) {
    const ok = await checkRegression(outFile, source);
    process.exitCode = ok && exact ? 0 : 1;
  }
}

// ---------------------------------------------------------------------------------------------
function compare(out, input) {
  if (!input) return;
  stats.frames++;
  let diffPixels = 0, maxDiff = 0;
  const row = W * 4;
  for (let y = 0; y < H; y++) {
    const o = (H - 1 - y) * row, s = y * row;
    for (let x = 0; x < row; x += 4) {
      const d = Math.max(Math.abs(out[o + x] - input[s + x]), Math.abs(out[o + x + 1] - input[s + x + 1]), Math.abs(out[o + x + 2] - input[s + x + 2]));
      if (d) { diffPixels++; if (d > maxDiff) maxDiff = d; }
    }
  }
  if (!diffPixels) stats.identicalFrames++;
  stats.diffPixels += diffPixels;
  stats.maxDiff = Math.max(stats.maxDiff, maxDiff);
}

async function* readFrames(stream, size) {
  let frame = Buffer.allocUnsafe(size), off = 0;
  for await (const chunk of stream) {
    let p = 0;
    while (p < chunk.length) {
      const n = Math.min(size - off, chunk.length - p);
      chunk.copy(frame, off, p, p + n);
      off += n; p += n;
      if (off === size) { yield frame; frame = Buffer.allocUnsafe(size); off = 0; }
    }
  }
}

function readBody(req, size) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.allocUnsafe(size);
    let off = 0;
    req.on('data', (c) => { c.copy(buf, off); off += c.length; });
    req.on('end', () => (off === size ? resolve(buf) : reject(new Error(`frame incomplète (${off}/${size} octets)`))));
    req.on('error', reject);
  });
}

async function launchBrowser(explicit) {
  const args = ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--force-color-profile=srgb', '--js-flags=--expose-gc'];
  const candidates = [
    explicit && { executablePath: explicit },
    process.env.CHROMIUM_PATH && { executablePath: process.env.CHROMIUM_PATH },
    fs.existsSync('/opt/pw-browsers/chromium') && { executablePath: '/opt/pw-browsers/chromium' },
    {},                      // Chromium installé par `npx playwright-core install chromium`
    { channel: 'chrome' },   // Google Chrome du système
    { channel: 'msedge' },
  ].filter(Boolean);
  let lastErr;
  for (const c of candidates) {
    try { return await chromium.launch({ ...c, args }); } catch (e) { lastErr = e; }
  }
  throw new Error(`Aucun navigateur Chromium trouvé. Installez-en un avec « npx playwright-core install chromium » ` +
    `ou passez --browser <chemin>.\n${lastErr?.message}`);
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) o[key] = true;
    else { o[key] = next; i++; }
  }
  return o;
}
