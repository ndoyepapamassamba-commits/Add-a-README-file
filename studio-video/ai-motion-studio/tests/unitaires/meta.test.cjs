// Consigne embarquée (23/10/2026, « les prompts doivent être embarqués pour chaque vidéo ») : js/meta.js écrit la consigne
// dans des fichiers RÉELS produits par ffmpeg (MP4 « fast start », MP4 moov en fin, WebM avec SeekHead et Cues, WebM en direct
// sans index), puis on vérifie avec les outils de référence : ffprobe lit les étiquettes, ffmpeg décode tout sans erreur et
// l'empreinte image par image et son (framemd5) est identique à l'original. Réembarquer est idempotent.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const M = require('../../js/meta.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aims-meta-'));
const src = ['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '1.5'];
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...src, ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
ff(['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', path.join(dir, 'debut.mp4')]);
ff(['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(dir, 'fin.mp4')]);
ff(['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libopus', path.join(dir, 'classique.webm')]);
ff(['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libopus', '-live', '1', '-f', 'webm', path.join(dir, 'direct.webm')]);
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const champs = { titre: 'Odette sourit', consigne: 'Odette sourit et salue la caméra, lumière chaude — « été » ✓', description: 'essai unitaire',
  massamba: { type: 'generation', modele: 'Wan 2.2 14B', graine: 4242, plans: [1, 2] } };
const tags = (f) => { const t = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', f]).toString()).format.tags || {}; const o = {}; for (const k in t) o[k.toLowerCase()] = t[k]; return o; };
const md5 = (f) => execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-map', '0', '-f', 'framemd5', '-']).toString().split('\n').filter((l) => l && !l.startsWith('#')).join('\n');

for (const f of ['debut.mp4', 'fin.mp4', 'classique.webm', 'direct.webm']) {
  test(`consigne embarquée dans ${f} : lue par ffprobe, contenu identique, idempotent`, () => {
    const orig = new Uint8Array(fs.readFileSync(path.join(dir, f)));
    const une = M.embarquerOctets(orig, champs), deux = M.embarquerOctets(une, champs);
    assert.equal(deux.length, une.length, 'réembarquer ne fait pas grossir le fichier');
    assert.ok(une.length - orig.length < 4096, 'surcoût de quelques centaines d’octets');
    const dst = path.join(dir, 'emb-' + f); fs.writeFileSync(dst, deux);
    const t = tags(dst);
    assert.equal(t.title, champs.titre);
    assert.equal(t.comment, champs.consigne);
    const j = JSON.parse(t.massamba);
    assert.equal(j.schema, M.SCHEMA); assert.equal(j.consigne, champs.consigne); assert.equal(j.graine, 4242);
    assert.equal(md5(dst), md5(path.join(dir, f)), 'images et son identiques (framemd5)');
    execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', dst, '-f', 'null', '-']);   // décodage intégral sans erreur
    const relu = M.lireOctets(deux);
    assert.equal(relu.consigne, champs.consigne); assert.equal(relu.massamba.modele, 'Wan 2.2 14B');
  });
}

test('API Blob : embarquer puis lire (MP4 moov en fin et WebM), format inconnu refusé', async () => {
  for (const f of ['fin.mp4', 'classique.webm']) {
    const b = new Blob([fs.readFileSync(path.join(dir, f))], { type: f.endsWith('mp4') ? 'video/mp4' : 'video/webm' });
    const e = await M.embarquer(b, champs);
    assert.equal(e.type, b.type);
    const r = await M.lire(e); assert.equal(r.consigne, champs.consigne); assert.equal(r.massamba.graine, 4242);
    const r0 = await M.lire(b); assert.ok(!(r0 && r0.consigne), 'fichier d’origine sans consigne (seule l’étiquette d’outil de ffmpeg)');
  }
  assert.equal(M.nature(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])), null);
  assert.throws(() => M.embarquerOctets(new Uint8Array(64), champs), /non reconnu/);
});
