// Tests du serveur local : validation stricte, voies payantes désactivées par défaut, secrets jamais renvoyés ni journalisés,
// limite de débit, fichiers protégés, en-têtes officiels des connecteurs (fetch simulé : aucun appel payant).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DONNEES_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aims-'));
process.env.FAL_KEY = 'fal_SECRETfactice_0123456789';
process.env.FAL_MODELE_T2V = 'editeur/modele-test';
process.env.RUNWAYML_API_SECRET = 'rw_SECRETfactice_abcdefghij';
delete process.env.PAYANT_AUTORISE;
const { serveur, valider, sante } = await import('../../serveur/serveur.mjs');
const { runway, kling, caviarder } = await import('../../serveur/fournisseurs.mjs').then(async (m) => ({ ...m, caviarder: (await import('../../serveur/serveur.mjs')).caviarder }));

const port = await new Promise((r) => serveur.listen(0, '127.0.0.1', () => r(serveur.address().port)));
const base = `http://127.0.0.1:${port}`;
test.after(() => serveur.close());

test('santé : fournisseurs listés, aucune valeur secrète renvoyée, payant désactivé', async () => {
  const r = await fetch(base + '/api/sante'); const t = await r.text(); const j = JSON.parse(t);
  assert.equal(j.payantAutorise, false); assert.equal(j.fournisseurs.fal.configure, true); assert.equal(j.fournisseurs.fal.actif, false);
  assert.ok(!t.includes('SECRETfactice'), 'aucun secret dans la réponse');
});

test('tâche payante refusée sans PAYANT_AUTORISE, demande invalide refusée', async () => {
  const fd = new FormData(); fd.append('demande', JSON.stringify({ fournisseur: 'fal', mode: 't2v', prompt: 'un marché', confirmationCout: true }));
  const r = await fetch(base + '/api/taches', { method: 'POST', body: fd }); assert.equal(r.status, 403); assert.match((await r.json()).erreur, /PAYANT_AUTORISE=0/);
  const fd2 = new FormData(); fd2.append('demande', JSON.stringify({ fournisseur: 'inconnu', mode: 'x', prompt: '' }));
  const r2 = await fetch(base + '/api/taches', { method: 'POST', body: fd2 }); assert.equal(r2.status, 400);
  assert.deepEqual(valider({ fournisseur: 'fal', mode: 'i2v', prompt: 'x'.repeat(2001) }), ['consigne de 1 à 2 000 caractères']);
});

test('fichiers protégés et origine étrangère refusée', async () => {
  for (const p of ['/serveur/serveur.mjs', '/../serveur/serveur.mjs', '/donnees/taches.json']) { const r = await fetch(base + p); assert.ok([403, 404].includes(r.status), p + ' ' + r.status); }
  const r = await fetch(base + '/api/sante', { headers: { Origin: 'https://site-malveillant.example' } }); assert.equal(r.status, 403);
  const ok = await fetch(base + '/index.html'); assert.equal(ok.status, 200);
});

test('limite de débit : la 31e requête d’une minute est refusée', async () => {
  let dernier = 0;
  for (let i = 0; i < 31; i++) { const r = await fetch(base + '/api/voix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"texte":""}' }); dernier = r.status; }
  assert.equal(dernier, 429);
});

test('journal : secrets caviardés', () => {
  assert.equal(caviarder('erreur avec fal_SECRETfactice_0123456789 et Bearer abcdefghijklmnopqrstu'), 'erreur avec «secret» et Bearer «secret»');
});

test('Runway : en-têtes officiels (X-Runway-Version 2024-11-06), corps conforme au SDK 4.22.0', async () => {
  const vrai = globalThis.fetch; let vu;
  globalThis.fetch = async (url, o) => { vu = { url, o }; return new Response(JSON.stringify({ id: 'tache-1' })); };
  try {
    const r = await runway.soumettre({ prompt: 'p', format: '9:16', dureeS: 5, modele: 'gen4_turbo' }, { image: { buf: Buffer.from([1, 2]), type: 'image/png' } });
    assert.equal(r.id, 'tache-1'); assert.equal(vu.url, 'https://api.dev.runwayml.com/v1/image_to_video');
    assert.equal(vu.o.headers['X-Runway-Version'], '2024-11-06'); const b = JSON.parse(vu.o.body);
    assert.equal(b.ratio, '720:1280'); assert.match(b.promptImage, /^data:image\/png;base64,/); assert.equal(b.model, 'gen4_turbo');
  } finally { globalThis.fetch = vrai; }
});

test('Kling : non configuré tant que l’adresse officielle n’est pas renseignée (à confirmer)', () => {
  assert.equal(kling.configure(), false);
  assert.equal(sante().fournisseurs.kling.configure, false);
});
