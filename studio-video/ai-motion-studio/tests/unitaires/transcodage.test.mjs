// Export H.264 par le serveur local (23/10/2026) : conversion RÉELLE d'un WebM VP9/Opus en MP4 H.264 + AAC par ffmpeg,
// contrôle ffprobe renvoyé au navigateur, formats refusés, et service indisponible proprement quand ffmpeg manque.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const ICI = path.dirname(new URL(import.meta.url).pathname), CLIP = path.join(ICI, '..', 'fixtures', 'clip-test.webm');
process.env.DONNEES_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aims-conv-'));
delete process.env.PAYANT_AUTORISE;
const { serveur, sante } = await import('../../serveur/serveur.mjs');
const port = await new Promise((r) => serveur.listen(0, '127.0.0.1', () => r(serveur.address().port)));
const base = `http://127.0.0.1:${port}`;
test.after(() => serveur.close());

test('santé : la conversion H.264 est annoncée (ffmpeg avec libx264 et aac)', () => {
  const s = sante(); assert.equal(s.transcodage.ffmpeg, true); assert.equal(s.transcodage.h264, true); assert.equal(s.transcodage.aac, true);
});

test('WebM VP9 + Opus → MP4 H.264 + AAC, contrôlé par ffprobe et décodé en entier', async () => {
  const r = await fetch(base + '/api/transcoder', { method: 'POST', headers: { 'Content-Type': 'video/webm', 'X-Fps': '30' }, body: fs.readFileSync(CLIP) });
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'video/mp4');
  assert.ok(Number(r.headers.get('x-transcodage-ms')) > 0);
  const c = JSON.parse(decodeURIComponent(r.headers.get('x-controle')));
  assert.equal(c.video, 'h264'); assert.equal(c.audio, 'aac'); assert.equal(c.largeur, 480); assert.equal(c.hauteur, 272);
  assert.equal(c.decodeSansErreur, true); assert.ok(Math.abs(c.duree - 2) < 0.1, 'durée ' + c.duree); assert.ok(c.sonMaxDb > -60, 'son présent');
  const f = path.join(process.env.DONNEES_DIR, 'sortie.mp4'); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  const p = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,pix_fmt', '-of', 'json', f]).toString()).streams;
  assert.deepEqual(p.map((x) => x.codec_name), ['h264', 'aac']); assert.equal(p[0].pix_fmt, 'yuv420p');
  // « fast start » : la boîte moov précède mdat (lecture immédiate et consigne lisible sans tout télécharger)
  const u = fs.readFileSync(f); assert.ok(u.indexOf('moov') < u.indexOf('mdat'));
  const restes = () => fs.readdirSync(path.join(process.env.DONNEES_DIR, 'videos')).filter((x) => x.startsWith('conv-')).length;
  for (let i = 0; i < 20 && restes(); i++) await new Promise((ok) => setTimeout(ok, 50));   // suppression à la fermeture du flux
  assert.equal(restes(), 0, 'fichiers temporaires supprimés');
});

test('format refusé (415) et OPTIONS autorise l’en-tête X-Fps', async () => {
  const r = await fetch(base + '/api/transcoder', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'pas une vidéo' }); assert.equal(r.status, 415);
  const o = await fetch(base + '/api/transcoder', { method: 'OPTIONS' }); assert.match(o.headers.get('access-control-allow-headers') || '', /X-Fps/);
});

test('sans ffmpeg : 503 avec un message en français, jamais un plantage', async () => {
  const port2 = 18700 + Math.floor(Math.random() * 200);
  const p = spawn(process.execPath, [path.join(ICI, '..', '..', 'serveur', 'serveur.mjs')], { env: { ...process.env, PORT: String(port2), FFMPEG: 'ffmpeg-introuvable', PRECHAUFFE_V1: '0' }, stdio: 'ignore' });
  try {
    let r = null;
    for (let i = 0; i < 50 && !r; i++) { await new Promise((ok) => setTimeout(ok, 100)); r = await fetch(`http://127.0.0.1:${port2}/api/transcoder`, { method: 'POST', headers: { 'Content-Type': 'video/webm' }, body: 'x' }).catch(() => null); }
    assert.equal(r.status, 503); assert.match((await r.json()).erreur, /ffmpeg/);
  } finally { p.kill(); }
});
