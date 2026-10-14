#!/usr/bin/env node
// Test de non-régression : compare un MP4 exporté à la vidéo source (FFmpeg uniquement).
//   node tools/regression.mjs out/ivrogne-original.mp4 [assets/source.mp4]
// Vérifie : résolution, cadence, nombre de frames, durée, audio identique au bit près,
// PSNR (moyen et pire frame) et SSIM.
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const THRESHOLDS = { psnrAvg: 45, psnrMin: 40, ssim: 0.99 };

function probe(file) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file]));
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  return {
    size: `${v.width}x${v.height}`, fps: v.r_frame_rate, frames: +v.nb_read_frames,
    duration: (+j.format.duration).toFixed(2), audio: a ? `${a.codec_name} ${a.sample_rate} Hz ${a.channels} ch` : 'aucun',
  };
}

function audioMd5(file) {
  try {
    return execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-c', 'copy', '-f', 'md5', '-']).toString().trim();
  } catch { return null; }
}

function ffmpegLog(out, src, filter) {
  const r = spawnSync('ffmpeg', ['-v', 'info', '-nostats', '-i', out, '-i', src, '-lavfi', `[0:v][1:v]${filter}`, '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`ffmpeg ${filter} : ${r.stderr.slice(-500)}`);
  return r.stderr;
}

function measure(out, src) {
  const p = /PSNR y:([\d.inf]+) u:([\d.inf]+) v:([\d.inf]+) average:([\d.inf]+) min:([\d.inf]+)/.exec(ffmpegLog(out, src, 'psnr'));
  const s = /SSIM Y:([\d.]+).*All:([\d.]+)/.exec(ffmpegLog(out, src, 'ssim'));
  const num = (x) => (x === 'inf' ? Infinity : +x);
  return { psnrAvg: num(p[4]), psnrMin: num(p[5]), ssim: +s[2] };
}

export async function checkRegression(out, src = path.join(ROOT, 'assets/source.mp4')) {
  console.log(`\nTest de non-régression : ${path.basename(out)}  ↔  ${path.basename(src)}`);
  const a = probe(out), b = probe(src);
  const rows = [];
  const check = (label, ok, detail) => { rows.push({ label, ok, detail }); return ok; };
  check('Résolution', a.size === b.size, `${a.size} / ${b.size}`);
  check('Cadence', a.fps === b.fps, `${a.fps} / ${b.fps}`);
  check('Nombre de frames', a.frames === b.frames, `${a.frames} / ${b.frames}`);
  check('Durée', Math.abs(a.duration - b.duration) <= 0.05, `${a.duration} s / ${b.duration} s`);
  const ma = audioMd5(out), mb = audioMd5(src);
  check('Audio (bit à bit)', !!ma && ma === mb, ma === mb ? `identique (${a.audio})` : `différent (${a.audio} / ${b.audio})`);
  const m = measure(out, src);
  check('PSNR moyen', m.psnrAvg >= THRESHOLDS.psnrAvg, `${fmt(m.psnrAvg)} dB (seuil ${THRESHOLDS.psnrAvg} dB)`);
  check('PSNR pire frame', m.psnrMin >= THRESHOLDS.psnrMin, `${fmt(m.psnrMin)} dB (seuil ${THRESHOLDS.psnrMin} dB)`);
  check('SSIM', m.ssim >= THRESHOLDS.ssim, `${m.ssim.toFixed(5)} (seuil ${THRESHOLDS.ssim})`);
  for (const r of rows) console.log(`  ${r.ok ? '✔' : '✘'} ${r.label.padEnd(18)} ${r.detail}`);
  const ok = rows.every((r) => r.ok);
  console.log(ok ? '\n✔ ZÉRO RÉGRESSION : l\'export est fidèle à la vidéo source.' : '\n✘ Régression détectée.');
  return ok;
}

function fmt(x) { return x === Infinity ? '∞' : x.toFixed(2); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, src] = process.argv.slice(2);
  if (!out) { console.error('Usage : node tools/regression.mjs <export.mp4> [source.mp4]'); process.exit(2); }
  const ok = await checkRegression(path.resolve(out), src ? path.resolve(src) : undefined);
  process.exit(ok ? 0 : 1);
}
