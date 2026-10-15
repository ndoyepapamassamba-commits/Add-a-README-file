#!/usr/bin/env node
// Export MP4 en ligne de commande (outils libres) : la page Three.js tourne dans Chromium sans écran
// (Playwright), chaque frame est lue (readPixels) puis encodée en H.264 par FFmpeg (x264).
//
//   node tools/export.mjs                                   # mosaïque animée, relief 3D (boucle 8 s)
//   node tools/export.mjs --format slides                   # diaporama vertical 1080×1920
//   node tools/export.mjs --format mosaic --mode original   # contrôle zéro régression
//   node tools/export.mjs --prompt "Vidéo de 10 s : zoom avant sur Cocody, titre « Abidjan »"
//   node tools/export.mjs --prompt "Une affiche carrée du village d'Assinie"   # → image PNG
// Options : --format mosaic|slides  --mode 3d|original  --camera respiration|vague|souris
//           --planche scenes (autre planche, dans assets/scenes/)  --fige (sans animation de l'univers)  --relief 0.2  --duration 2.5  --crf 16  --chroma 420|444  --audio musique.mp3  --out <fichier>  --frames <n>
// --chroma 444 : master aux couleurs pleine résolution (fichier plus lourd, moins de lecteurs compatibles).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SWS = 'accurate_rnd+full_chroma_int+full_chroma_inp+bitexact';
const opts = parseArgs(process.argv.slice(2));
const PIX = String(opts.chroma) === '444' ? 'yuv444p' : 'yuv420p';
const render = {
  format: opts.format === 'slides' ? 'slides' : 'mosaic',
  mode: opts.mode === 'original' ? 'original' : '3d',
  camera: opts.camera || 'respiration',
  relief: opts.relief != null ? +opts.relief : null,
  slideDuration: +(opts.duration || 2.5),
  prompt: typeof opts.prompt === 'string' ? opts.prompt : null,
  animate: !opts.fige, // --fige : seule la caméra bouge (personnages et véhicules immobiles)
};
const slug = (txt) => txt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const baseName = render.prompt ? `prompt-${slug(render.prompt)}`
  : `abidjan-${render.format === 'slides' ? 'diaporama' : 'mosaique'}-${render.mode === '3d' ? `3d${render.format === 'mosaic' ? `-${render.camera}` : ''}${render.animate ? '-anime' : ''}` : 'original'}`;

let encoder = null, encoderDone = null, firstFrame = null, nextFrame = 0, outFile = null;
const server = await startServer(0, {
  async handler(req, res, url) {
    const m = /^\/__out\/(\d+)$/.exec(url.pathname);
    if (!m || req.method !== 'POST') return false;
    const chunks = [];
    req.on('aborted', () => console.error(`\nEnvoi de la frame ${m[1]} interrompu par le navigateur.`));
    for await (const c of req) chunks.push(c);
    const frame = Buffer.concat(chunks);
    if (+m[1] < nextFrame) { res.writeHead(204).end(); return true; } // doublon (nouvel essai)
    nextFrame = +m[1] + 1;
    if (!firstFrame) firstFrame = frame;
    if (!encoder.stdin.write(frame)) await new Promise((r) => encoder.stdin.once('drain', r));
    res.writeHead(204).end();
    return true;
  },
});

const browser = await launchBrowser(opts.browser);
let info;
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  page.on('pageerror', (e) => console.error('Erreur page :', e.message));
  const planche = typeof opts.planche === 'string' ? `&p=${encodeURIComponent(opts.planche)}` : '';
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?render=1${planche}`);
  await page.waitForFunction(() => window.__studioReady === true, null, { timeout: 60000 });
  info = await page.evaluate((o) => window.__studio.prepare(o), render);
  const still = info.output === 'image' || opts.image === true;
  outFile = path.resolve(ROOT, opts.out || path.join('out', `${baseName}.${still ? 'png' : 'mp4'}`));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  if (render.prompt) {
    console.log('Prompt compris :');
    for (const line of info.understood) console.log(`  · ${line}`);
  }
  const frames = still ? 1 : Math.min(info.frames, +(opts.frames || info.frames));

  if (render.format === 'mosaic' && render.mode === 'original') {
    const v = await page.evaluate(() => window.__studio.verifyOriginal());
    console.log(`Rendu WebGL vs image décodée par le navigateur : ${v.diff === 0 ? `${v.pixels} pixels identiques ✔` : `${v.diff} pixels différents (écart max ${v.max}/255)`}`);
    if (v.diff) process.exitCode = 1;
  }

  encoder = still
    ? spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${info.w}x${info.h}`, '-i', 'pipe:0',
      '-vf', 'vflip', '-frames:v', '1', outFile], { stdio: ['pipe', 'inherit', 'inherit'] })
    : spawn('ffmpeg', ['-y', '-v', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${info.w}x${info.h}`, '-framerate', '30', '-i', 'pipe:0',
    ...(opts.audio ? ['-i', path.resolve(opts.audio), '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
    '-vf', `vflip,scale=flags=${SWS}:out_color_matrix=bt709:out_range=tv,format=${PIX}`,
    '-c:v', 'libx264', '-preset', opts.preset || 'slow', '-crf', String(opts.crf ?? 16),
    ...(PIX === 'yuv420p' ? ['-profile:v', 'high'] : []),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
  encoder.stdin.on('error', (e) => console.error(`\nFFmpeg n'accepte plus de frames (${e.code}).`));
  encoderDone = new Promise((ok, ko) => encoder.on('close', (c, sig) => (c === 0 ? ok() : ko(new Error(`ffmpeg s'est arrêté (code ${c}${sig ? `, signal ${sig}` : ''})`)))));
  encoderDone.catch((e) => console.error(`\n${e.message}`));

  console.log(still ? `▶ image ${info.w}×${info.h}` : `▶ ${frames} frames ${info.w}×${info.h} · ${info.format} · ${render.mode}${render.mode === '3d' && info.format === 'mosaic' && !render.prompt ? ` · caméra ${render.camera}` : ''}`);
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate((f) => window.__studio.renderFrame(f), still ? info.still : i);
    if (i % 30 === 0 || i === frames - 1) {
      process.stdout.write(`\r  frame ${String(i + 1).padStart(4)}/${frames}  (${((i + 1) / ((Date.now() - t0) / 1000)).toFixed(1)} i/s)   `);
    }
  }
  process.stdout.write('\n');
} finally {
  await browser.close();
  server.close();
  encoder?.stdin.end();
}
await encoderDone;
console.log(`✔ ${outFile.endsWith('.png') ? 'Image' : 'MP4'} écrit${outFile.endsWith('.png') ? 'e' : ''} : ${path.relative(process.cwd(), outFile)} (${(fs.statSync(outFile).size / 1e6).toFixed(1)} Mo)`);

// Perte due à l'encodage : première frame du MP4 comparée à la frame rendue, dans l'espace de la vidéo
// (même conversion de couleurs), comme on mesure habituellement une vidéo.
if (firstFrame && !opts['no-check'] && outFile.endsWith('.mp4')) {
  const ref = path.join(os.tmpdir(), `abidjan-ref-${process.pid}.rgba`);
  fs.writeFileSync(ref, firstFrame);
  const graph = `[1:v]vflip,scale=flags=${SWS}:out_color_matrix=bt709:out_range=tv,format=${PIX}[r];[0:v][r]`;
  const run = (f) => spawnSync('ffmpeg', ['-v', 'info', '-nostats', '-i', outFile, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${info.w}x${info.h}`, '-i', ref,
    '-frames:v', '1', '-lavfi', graph + f, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const psnr = /PSNR y:([\d.inf]+)/.exec(run('psnr'))?.[1];
  const ssim = /All:([\d.]+)/.exec(run('ssim'))?.[1];
  fs.rmSync(ref, { force: true });
  console.log(`MP4 vs rendu (frame 1) : PSNR luminance ${psnr} dB · SSIM ${ssim}`);
}

async function launchBrowser(explicit) {
  const args = ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--force-color-profile=srgb', '--js-flags=--expose-gc'];
  const candidates = [
    explicit && { executablePath: explicit },
    process.env.CHROMIUM_PATH && { executablePath: process.env.CHROMIUM_PATH },
    fs.existsSync('/opt/pw-browsers/chromium') && { executablePath: '/opt/pw-browsers/chromium' },
    {}, { channel: 'chrome' }, { channel: 'msedge' },
  ].filter(Boolean);
  let lastErr;
  for (const c of candidates) {
    try { return await chromium.launch({ ...c, args }); } catch (e) { lastErr = e; }
  }
  throw new Error(`Aucun Chromium trouvé : « npx playwright-core install chromium » ou --browser <chemin>.\n${lastErr?.message}`);
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2), next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) o[key] = true;
    else { o[key] = next; i++; }
  }
  return o;
}
