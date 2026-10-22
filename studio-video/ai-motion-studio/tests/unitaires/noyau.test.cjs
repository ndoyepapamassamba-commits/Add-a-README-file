// Tests unitaires du noyau (node --test) : registre vérifié en direct, client Gradio, gestionnaire de tâches, migration
// des projets, filtre des secrets, assistant de consigne. Les configurations des Spaces sont celles relevées le 22/10/2026.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../../js/registre.js');
const G = require('../../js/gradio.js');
const T = require('../../js/taches.js');
const K = require('../../js/stockage.js');
const P = require('../../js/prompt.js');

const cfg = (k) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'configs', k + '.json'), 'utf8'));

test('registre : capacités déduites des signatures réelles (22/10/2026)', () => {
  const wan = R.capacites(G.decrire(cfg('wan22-i2v-rapide'), 'generate_video'));
  assert.equal(wan.i2v, true); assert.equal(wan.t2v, false); assert.equal(wan.imageObligatoire, true); assert.equal(wan.fin, false);
  assert.equal(wan.dureeMin, 0.5); assert.equal(wan.dureeMax, 5);
  const ff = R.capacites(G.decrire(cfg('wan22-premier-dernier'), 'generate_video'));
  assert.equal(ff.fin, true); assert.equal(ff.finObligatoire, true);
  const ltx = R.capacites(G.decrire(cfg('ltx23'), 'generate_video'));
  assert.equal(ltx.t2v, true); assert.equal(ltx.i2v, true); assert.equal(ltx.resolution, true); assert.equal(ltx.dureeMax, 10);
  const lff = R.capacites(G.decrire(cfg('ltx23-premier-dernier'), 'generate_video'));
  assert.equal(lff.fin, true); assert.equal(lff.finObligatoire, false); assert.equal(lff.audioEntree, true);
  const dis = R.capacites(G.decrire(cfg('ltx-video-distille'), 'text_to_video'));
  assert.equal(dis.t2v, true);
});

test('registre : valeurs transmises par libellé, bornées, entrée obligatoire manquante refusée', () => {
  const d = G.decrire(cfg('wan22-i2v-rapide'), 'generate_video');
  const img = { size: 10, name: 'a.png', arrayBuffer() {} };
  const v = R.construire(d, { image: img, prompt: 'Il sourit', dureeS: 99, graine: null }, { etapes: 4 });
  assert.equal(v[0], img); assert.equal(v[1], 'Il sourit'); assert.equal(v[2], 4); assert.equal(v[4], 5, 'durée bornée au maximum lu en direct');
  assert.equal(v[8], true, 'graine aléatoire si aucune graine');
  assert.throws(() => R.construire(d, { prompt: 'x', dureeS: 2 }), /image de départ/);
  const l = G.decrire(cfg('ltx23'), 'generate_video');
  const vl = R.construire(l, { prompt: 'Un marché', dureeS: 3, largeur: 768, hauteur: 448, mode: 't2v' });
  assert.equal(vl[0], null, 'image facultative absente en texte → vidéo'); assert.equal(vl[3], false, 'jamais de réécriture automatique de la consigne');
  assert.deepEqual([vl[6], vl[7]], [448, 768]);
});

test('registre : aucun prix inventé pour les voies payantes', () => {
  for (const m of R.MODELES.filter((x) => x.payant)) assert.equal(m.prix, R.PRIX_INCONNU, m.id);
  assert.match(R.trouver('kling-officiel').limites, /CONFIRMER/);
});

function flux(lignes) { return new ReadableStream({ start(c) { for (const l of lignes) c.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(l) + '\n\n')); c.close(); } }); }

test('gradio : lecture du flux SSE (file, calcul, progression, résultat)', async () => {
  const etats = [];
  const out = await G.lireFlux(flux([{ msg: 'estimation', rank: 2, rank_eta: 30 }, { msg: 'process_starts', eta: 20 }, { msg: 'progress', progress_data: [{ index: 1, length: 4 }] },
    { msg: 'process_completed', success: true, output: { data: [{ video: { url: 'https://x.hf.space/f.mp4' } }, 7] } }]), (e) => etats.push(e));
  assert.deepEqual(etats.map((e) => e.phase), ['file', 'calcul', 'calcul']); assert.equal(etats[0].rang, 2); assert.equal(etats[2].progression, 0.25);
  assert.equal(out.data[1], 7);
});

test('gradio : quota épuisé et file sans GPU → messages clairs en français', async () => {
  await assert.rejects(G.lireFlux(flux([{ msg: 'process_completed', success: false, output: { error: 'You have exceeded your GPU quota (60s requested vs. 12s left)' } }])),
    (e) => e.name === 'ErreurQuota' && e.resteS === 12 && /Quota GPU gratuit du jour épuisé/.test(e.message));
  await assert.rejects(G.lireFlux(flux([{ msg: 'process_completed', success: false, output: { error: 'No GPU was available after 60s. <a href="x">Create a free account</a>' } }])), /Aucun GPU libre/);
});

test('gradio : appel complet (envoi, file, flux, téléchargement) avec un service simulé', async () => {
  const appels = [];
  const fakeFetch = async (url, o = {}) => {
    appels.push([o.method || 'GET', url, o.headers && o.headers.Authorization]);
    if (url.endsWith('/config')) return new Response(JSON.stringify(cfg('wan22-i2v-rapide')));
    if (url.includes('/upload')) return new Response(JSON.stringify(['/tmp/gradio/abc/depart.png']));
    if (url.includes('/queue/join')) { const b = JSON.parse(o.body); assert.equal(b.data[0].path, '/tmp/gradio/abc/depart.png'); assert.equal(b.data[1], 'bonjour'); return new Response(JSON.stringify({ event_id: 'e' })); }
    if (url.includes('/queue/data')) return new Response(flux([{ msg: 'process_completed', success: true, output: { data: [{ video: { url: 'https://s.hf.space/gradio_api/file=/tmp/v.mp4' } }, 99] } }]));
    if (url.includes('file=')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'video/mp4' } });
    throw new Error('url inattendue ' + url);
  };
  const img = new Blob([new Uint8Array([137, 80])], { type: 'image/png' });
  const d = G.decrire(cfg('wan22-i2v-rapide'), 'generate_video');
  const r = await G.appeler('https://s.hf.space', 'generate_video', R.construire(d, { image: img, prompt: 'bonjour', dureeS: 2 }, {}), { fetch: fakeFetch, jeton: 'hf_TESTjetonFactice123' });
  assert.equal(r.video.size, 3); assert.equal(r.graine, 99);
  assert.ok(appels.every((a) => a[2] === 'Bearer hf_TESTjetonFactice123'), 'le jeton ne part que vers le Space appelé');
});

test('tâches : états, double soumission refusée, concurrence, annulation', async () => {
  let fin; const g = new T.Gestionnaire({ executer: (t, suivi) => new Promise((res) => { suivi({ etat: 'encours', rang: 1 }); fin = res; }), maxTotal: 1, enLigne: () => true });
  const d = { mode: 't2v', prompt: 'a', dureeS: 2, format: '16:9' };
  const t1 = g.ajouter({ modeleId: 'm', voie: 'navigateur', source: 's', demande: d });
  assert.throws(() => g.ajouter({ modeleId: 'm', voie: 'navigateur', source: 's', demande: d }), /déjà en cours/);
  const t2 = g.ajouter({ modeleId: 'm', voie: 'navigateur', source: 's', demande: Object.assign({}, d, { prompt: 'b' }) });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(t1.etat, 'encours'); assert.equal(t2.etat, 'attente', 'concurrence limitée');
  fin({ ok: 1 }); await new Promise((r) => setTimeout(r, 10));
  assert.equal(t1.etat, 'terminee'); assert.equal(t2.etat, 'encours');
  assert.equal(g.annuler(t2.id), true); assert.equal(t2.etat, 'annulee');
  assert.deepEqual(t1.journal.map((j) => j.etat), ['attente', 'envoi', 'encours', 'terminee']);
});

test('tâches : coupure réseau, file sans GPU (reprise automatique unique), restauration après actualisation', async () => {
  const g = new T.Gestionnaire({ executer: () => Promise.reject(new TypeError('Failed to fetch')), enLigne: () => true });
  const t = g.ajouter({ modeleId: 'm', voie: 'navigateur', demande: { mode: 't2v', prompt: 'x' } });
  await new Promise((r) => setTimeout(r, 10)); assert.equal(t.etat, 'echec'); assert.match(t.erreur, /réseau/);
  let n = 0; const g2 = new T.Gestionnaire({ repriseMs: 5, executer: () => (++n === 1 ? Promise.reject(new Error('Aucun GPU libre dans la file gratuite')) : Promise.resolve({})), enLigne: () => true });
  const t2 = g2.ajouter({ modeleId: 'm', voie: 'navigateur', demande: { mode: 't2v', prompt: 'y' } });
  await new Promise((r) => setTimeout(r, 60)); assert.equal(t2.etat, 'terminee'); assert.equal(n, 2);
  const g3 = new T.Gestionnaire({ executer: () => new Promise(() => {}) });
  const reprises = g3.restaurer([{ id: 'a', etat: 'encours', voie: 'navigateur', journal: [] }, { id: 'b', etat: 'encours', voie: 'serveur', idFournisseur: 's1', journal: [] }]);
  assert.equal(g3.trouver('a').etat, 'echec'); assert.equal(reprises.length, 1);
  const g4 = new T.Gestionnaire({ executer: () => Promise.resolve({}), enLigne: () => false });
  const t4 = g4.ajouter({ modeleId: 'm', voie: 'navigateur', demande: { mode: 't2v', prompt: 'z' } });
  assert.equal(t4.etat, 'echec'); assert.match(t4.erreur, /Pas de connexion/);
});

test('stockage : migration d’un projet MASSAMBA Motion Studio 2 (v2) et filtre des secrets', () => {
  const v2 = { v: 2, settings: { aspect: '9:16', quality: 1, fps: 24, grade: 'chaud', audio: { vol: 0.4, gen: 'calme' } }, media: [{ id: 'm1', name: 'a.png', data: 'data:image/jpeg;base64,AAAA' }],
    clips: [{ id: 'c1', mid: 'm1', dur: 4, preset: 'zoomIn', kf: [] }], texts: [{ id: 't1', text: 'Titre', start: 0, dur: 3 }] };
  const { projet, notes } = K.migrer(v2);
  assert.equal(projet.v, 3); assert.equal(projet.reglages.aspect, '9:16'); assert.equal(projet.reglages.audio.gen, 'calme'); assert.equal(projet.reglages.audio.volVoice, 0.9);
  assert.equal(projet.medias[0].type, 'image'); assert.equal(projet.clips[0].type, 'image'); assert.equal(projet.clips[0].preset, 'zoomIn'); assert.equal(projet.texts[0].text, 'Titre');
  assert.ok(notes.some((n) => /vignettes/.test(n)));
  assert.throws(() => K.migrer({ foo: 1 }), /pas un projet/);
  const nettoye = K.sansSecrets({ a: 1, jeton: 'hf_x', profond: { apiKey: 'k', token: 't', ok: [{ secret: 's', b: 2 }] } });
  assert.deepEqual(nettoye, { a: 1, profond: { ok: [{ b: 2 }] } });
});

test('assistant de consigne : l’idée de l’utilisateur est gardée telle quelle, chaque morceau a son origine', () => {
  const r = P.structurer({ idee: 'Odette gronde Blaise', camera: 'Plan fixe', preset: 'Cartoon africain', eclairage: 'lumière chaude' });
  assert.ok(r.texte.startsWith('Odette gronde Blaise.'));
  assert.deepEqual(r.parties.map((p) => p.origine), ['sujet + action', 'caméra', 'éclairage', 'préréglage « Cartoon africain »']);
  assert.equal(Object.keys(P.PRESETS).length, 11, 'les 11 préréglages demandés');
});
