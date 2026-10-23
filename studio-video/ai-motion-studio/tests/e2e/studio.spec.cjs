// Les 17 tests obligatoires de la mission (§17), exécutés dans un vrai Chromium contre le vrai serveur local.
// Réseau des Spaces simulé fidèlement (protocole Gradio sse_v3 : /config, /upload, /queue/join, /queue/data, /file=),
// à partir des configurations réelles relevées le 22/10/2026. Aucun test ne s'appuie sur un résultat inventé :
// chaque vérification lit l'état réel de l'application, du fichier produit ou des requêtes émises.
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { test, expect } = require(path.resolve(__dirname, '../../../../workbench/node_modules/@playwright/test'));

const FIX = path.join(__dirname, '..', 'fixtures');
const cfg = (k) => JSON.parse(fs.readFileSync(path.join(FIX, 'configs', k + '.json'), 'utf8'));
const CLIP = fs.readFileSync(path.join(FIX, 'clip-test.webm'));
const IMG1 = path.join(FIX, 'image-test-1.png');
const IMG2 = path.join(FIX, 'image-test-2.png');
const SPACES = {
  'zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space': 'wan22-i2v-rapide',
  'multimodalart-wan-2-2-first-last-frame.hf.space': 'wan22-premier-dernier',
  'lightricks-ltx-2-3.hf.space': 'ltx23',
  'linoyts-ltx-2-3-first-last-frame.hf.space': 'ltx23-premier-dernier',
  'lightricks-ltx-video-distilled.hf.space': 'ltx-video-distille'
};
const JETON = 'hf_FAUX-jeton-de-test-e2e-0000';   // forme impossible pour un vrai jeton (tirets)
const PAYANTS = /fal\.run|fal\.ai|replicate\.com|runwayml\.com|lumalabs\.ai|klingai|kling\.ai/;

// ------------------------------------------------------------------ outils
function entetesCors(req) {
  return { 'access-control-allow-origin': req.headers().origin || '*', 'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS' };
}
/** simule les Spaces : `o` est modifiable entre deux générations (événements SSE, coupure, délai). */
async function simulerSpaces(page, o) {
  const journal = [];
  await page.route(/^https:\/\/[a-z0-9-]+\.hf\.space\//, async (route) => {
    const req = route.request(), u = new URL(req.url()), h = entetesCors(req);
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: h });
    journal.push({ chemin: u.pathname, hote: u.hostname, methode: req.method(), auth: req.headers().authorization || null, corps: /queue\/join$/.test(u.pathname) ? req.postData() : null });
    const json = (x) => route.fulfill({ status: 200, headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify(x) });
    if (u.pathname === '/config') return json(cfg(SPACES[u.hostname]));
    if (u.pathname.endsWith('/upload')) return json(['/tmp/gradio/essai/depart.png']);
    if (u.pathname.endsWith('/queue/join')) { if (o.coupure) return route.abort('internetdisconnected'); return json({ event_id: 'e1' }); }
    if (u.pathname.endsWith('/queue/data')) {
      if (o.delaiMs) await new Promise((r) => setTimeout(r, o.delaiMs));
      const ev = (o.quotaSur || []).includes(u.hostname) ? [{ msg: 'process_completed', success: false, output: { error: 'You have exceeded your GPU quota (60s requested vs. 12s left)' } }] : o.evenements || [{ msg: 'estimation', rank: 3, rank_eta: 12 }, { msg: 'process_starts', eta: 8 },
        { msg: 'progress', progress_data: [{ index: 1, length: 4 }] },
        { msg: 'process_completed', success: true, output: { data: [{ video: { url: 'https://' + u.hostname + '/gradio_api/file=/tmp/gradio/essai/sortie.webm' } }, 4242] } }];
      return route.fulfill({ status: 200, headers: { ...h, 'content-type': 'text/event-stream' }, body: ev.map((e) => 'data: ' + JSON.stringify(e) + '\n\n').join('') });
    }
    if (u.pathname.includes('/file=')) return route.fulfill({ status: 200, headers: { ...h, 'content-type': 'video/webm' }, body: CLIP });
    return route.fulfill({ status: 404, headers: h, body: '' });
  });
  return journal;
}
/** ouvre l'application ; relève les erreurs JavaScript et toute requête vers un fournisseur payant. */
async function ouvrir(page, o = {}) {
  const suivi = { erreurs: [], payants: [], requetes: [] };
  page.on('pageerror', (e) => suivi.erreurs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) suivi.erreurs.push('console : ' + m.text()); });
  page.on('request', (r) => { suivi.requetes.push({ url: r.url(), auth: r.headers().authorization || null }); if (PAYANTS.test(r.url())) suivi.payants.push(r.url()); });
  // aucun accès réel : Spaces, Pollinations et Hugging Face coupés tant qu'une simulation n'est pas installée (elle passe devant)
  await page.route(/pollinations\.ai|huggingface\.co\/|\.hf\.space\//, (r) => r.abort());
  if (o.whoami) {
    await page.route(/huggingface\.co\/api\/whoami-v2/, (r) => {
      const req = r.request(), h = entetesCors(req);
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h });
      return r.fulfill({ status: req.headers().authorization === 'Bearer ' + JETON ? 200 : 401, headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'essai-e2e' }) });
    });
  }
  await page.goto('/');
  await page.waitForFunction(() => window.__MAMS_APP__ && window.MAMS && window.MAMS.studio && window.MAMS.studio.S);
  return suivi;
}
const etatApp = (page, f, arg) => page.evaluate(f, arg);
/** octets du Blob d'un média de l'application (pour ffprobe / ffmpeg). */
async function octetsMedia(page, mid) {
  const b64 = await page.evaluate(async (id) => { const b = window.MAMS.studio.media(id).blob; const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); }, mid);
  return Buffer.from(b64, 'base64');
}
/** étiquettes du conteneur lues par ffprobe (clés en minuscules). */
function etiquettes(f) { const t = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', f]).toString()).format.tags || {}; const o = {}; for (const k in t) o[k.toLowerCase()] = t[k]; return o; }
const framemd5 = (f) => execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-map', '0', '-f', 'framemd5', '-']).toString().split('\n').filter((l) => l && !l.startsWith('#')).join('\n');
const tmpFichier = (nom, octets) => { const f = path.join(require('os').tmpdir(), 'aims-e2e-' + Date.now() + '-' + nom); fs.writeFileSync(f, octets); return f; };
async function vue(page, nom) { await page.click(`.nav[data-vue="${nom}"]`); }
async function choisirModele(page, mode, id) {
  await vue(page, 'generer');
  await page.click(mode === 'i2v' ? '#modeI2V' : '#modeT2V');
  await page.selectOption('#genModele', id);
  await page.locator('#genModele').dispatchEvent('change');
  await expect(page.locator('#genCaps')).toContainText(/État :/);
}
async function attendreTache(page, prompt, etats = /terminee|echec|annulee/) {
  await page.waitForFunction(([p, e]) => { const t = window.__MAMS_APP__.gest.taches.find((x) => x.prompt.indexOf(p) === 0); return t && new RegExp(e).test(t.etat); }, [prompt, etats.source], { timeout: 60000 });
  return etatApp(page, (p) => { const t = window.__MAMS_APP__.gest.taches.find((x) => x.prompt.indexOf(p) === 0); return JSON.parse(JSON.stringify({ ...t, demande: undefined })); }, prompt);
}
async function genererI2V(page, prompt, duree = 2) {
  await choisirModele(page, 'i2v', 'wan22-i2v-rapide');
  await page.setInputFiles('#genImageFile', IMG1);
  await page.fill('#genPrompt', prompt); await page.fill('#genPromptFinal', prompt);
  await page.fill('#genDuree', String(duree));
  await page.click('#btnGenerer');
}
/** luminance moyenne et écart-type du canevas du montage. */
const mesureCanevas = (page) => page.evaluate(() => {
  const c = window.MAMS.studio.canvas(), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
  let s = 0, s2 = 0, sat = 0, n = 0;
  for (let i = 0; i < d.length; i += 4 * 97) { const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; s += y; s2 += y * y; sat += Math.abs(d[i] - d[i + 1]) + Math.abs(d[i + 1] - d[i + 2]); n++; }
  const m = s / n; return { moyenne: m, ecart: Math.sqrt(Math.max(0, s2 / n - m * m)), saturation: sat / n, largeur: c.width, hauteur: c.height };
});
async function importerAuMontage(page, fichiers) {
  await vue(page, 'montage');
  const avant = await etatApp(page, () => window.MAMS.studio.S.media.length);
  await page.setInputFiles('#fileInput', fichiers);
  await page.waitForFunction((n) => window.MAMS.studio.S.media.length >= n, avant + fichiers.length);
}

// ------------------------------------------------------------------ 1
test('01 · ouverture sans clé API : 9 sections, aucune erreur, aucun appel payant, aucune clé demandée', async ({ page }) => {
  const s = await ouvrir(page);
  for (const v of ['generer', 'storyboard', 'medias', 'personnages', 'montage', 'audio', 'historique', 'projets', 'moteurs']) {
    await vue(page, v); await expect(page.locator(`.vue[data-vue="${v}"]`)).toHaveClass(/on/);
  }
  await expect(page.locator('#modeChip')).toHaveText('Moteurs réels');
  expect(await etatApp(page, () => window.__MAMS_APP__.A.jeton)).toBeNull();
  await vue(page, 'generer'); await page.click('#modeT2V');
  expect(await page.locator('#genModele option:not([disabled])').count()).toBeGreaterThan(0);
  await page.click('#modeI2V');
  expect(await page.locator('#genModele option:not([disabled])').count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toMatch(/hf_|sk-|token|apikey/i);
  expect(s.payants).toEqual([]);
  expect(s.erreurs).toEqual([]);
});

// ------------------------------------------------------------------ 2
test('02 · mode démo clairement identifié : bascule visible, résultat marqué DÉMO jusque dans l’image', async ({ page }) => {
  const s = await ouvrir(page);
  await page.click('#modeChip');
  await expect(page.locator('#modeChip')).toHaveText('MODE DÉMO');
  await vue(page, 'generer'); await page.click('#modeT2V');
  const ids = await page.locator('#genModele option').evaluateAll((o) => o.map((x) => x.value));
  expect(ids).toEqual(['demo']);
  await expect(page.locator('#genCaps')).toContainText('DÉMO — animation locale, pas une génération IA');
  await page.fill('#genPrompt', 'Essai démo'); await page.fill('#genPromptFinal', 'Essai démo'); await page.fill('#genDuree', '1');
  await page.click('#btnGenerer');
  const t = await attendreTache(page, 'Essai démo');
  expect(t.etat).toBe('terminee'); expect(t.nature).toBe('demo');
  await expect(page.locator('#genEtat')).toContainText('DÉMO — pas une génération IA');
  const m = await etatApp(page, (id) => { const x = window.MAMS.studio.media(id); return { nom: x.name, nature: x.nature, origine: x.origine }; }, t.resultatMediaId);
  expect(m.nom).toMatch(/^DEMO-/); expect(m.nature).toBe('demo'); expect(m.origine).toBe('demo');
  // le bandeau orange « DÉMO » est incrusté dans chaque image de la vidéo
  const bandeau = await page.evaluate(async () => {
    const v = document.getElementById('genVideo'); if (v.readyState < 2) await new Promise((r) => v.addEventListener('loadeddata', r, { once: true }));
    v.currentTime = 0.5; await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; const g = c.getContext('2d'); g.drawImage(v, 0, 0);
    const p = g.getImageData(Math.round(c.width * 0.9), 2, 1, 1).data; return [p[0], p[1], p[2]];
  });
  expect(bandeau[0]).toBeGreaterThan(200); expect(bandeau[1]).toBeGreaterThan(110); expect(bandeau[2]).toBeLessThan(90);
  await vue(page, 'medias'); await expect(page.locator('#libGrid .tag.demo').first()).toHaveText('DÉMO');
  // consigne embarquée dans le WebM du MediaRecorder (23/10/2026), lue par ffprobe ; la nature DÉMO voyage avec le fichier
  const f = tmpFichier('demo.webm', await octetsMedia(page, t.resultatMediaId)), tg = etiquettes(f);
  expect(tg.comment).toBe('Essai démo'); const mj = JSON.parse(tg.massamba); expect(mj.nature).toBe('demo'); expect(mj.modeleId).toBe('demo');
  execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', f, '-f', 'null', '-']);
  await expect(page.locator('#libGrid .tag.ok', { hasText: 'consigne embarquée' }).first()).toBeVisible();
  expect(s.erreurs).toEqual([]);
});

// ------------------------------------------------------------------ 3
test('03 · import d’une image : aperçu, format refusé, médiathèque', async ({ page }) => {
  const s = await ouvrir(page);
  await vue(page, 'generer'); await page.click('#modeI2V');
  await page.setInputFiles('#genImageFile', IMG1);
  await expect(page.locator('#genImagePreview')).toBeVisible();
  expect(await page.locator('#genImagePreview').evaluate((i) => i.complete ? i.naturalWidth : new Promise((r) => i.onload = () => r(i.naturalWidth)))).toBe(640);
  await page.setInputFiles('#genImageFile', { name: 'anim.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await expect(page.locator('#genErreurs')).toContainText('Format accepté : JPG, PNG ou WEBP');
  await vue(page, 'medias');
  await page.setInputFiles('#libImport', IMG2);
  await page.waitForFunction(() => window.MAMS.studio.S.media.some((m) => m.name === 'image-test-2.png'));   // import asynchrone
  await expect(page.locator('#libGrid .libitem')).toHaveCount(await etatApp(page, () => window.MAMS.studio.S.media.filter((m) => !m.supprime).length));
  await expect(page.locator('#libGrid')).toContainText('image-test-2.png');
  expect(s.erreurs).toEqual([]);
});

// ------------------------------------------------------------------ 4
test('04 · création d’un prompt : l’idée reste intacte et en tête, chaque ajout est sourcé, rien n’est réécrit en silence', async ({ page }) => {
  const s = await ouvrir(page);
  await vue(page, 'generer');
  await page.fill('#genPrompt', 'Odette gronde Blaise devant la boutique');
  await page.click('#genAvance > summary');   // l'assistant de consigne est dans « Options avancées »
  await page.selectOption('#genPreset', 'Cartoon africain');
  await page.selectOption('#genCamera', 'Plan fixe');
  await page.fill('#genLumiere', 'lumière chaude de fin d’après-midi');
  await page.click('#btnStructurer');
  const final = await page.inputValue('#genPromptFinal');
  expect(final.startsWith('Odette gronde Blaise devant la boutique')).toBe(true);
  const origines = await page.locator('#genParts li b').allTextContents();
  expect(origines[0]).toBe('sujet + action');
  expect(origines).toEqual(expect.arrayContaining(['caméra', 'éclairage', 'préréglage « Cartoon africain »']));
  // la consigne finale reste modifiable et c'est elle qui part
  await page.fill('#genPromptFinal', final + ' Slow push-in.');
  expect(await page.inputValue('#genPrompt')).toBe('Odette gronde Blaise devant la boutique');
  expect(s.erreurs).toEqual([]);
});

// ------------------------------------------------------------------ 5
test('05 · validation des paramètres d’un modèle d’après sa configuration lue en direct', async ({ page }) => {
  const s = await ouvrir(page); await simulerSpaces(page, {});
  await choisirModele(page, 'i2v', 'wan22-i2v-rapide');
  await expect(page.locator('#genCaps')).toContainText('0.5 à 5 s');
  expect(await page.getAttribute('#genDuree', 'max')).toBe('5');
  await page.fill('#genPrompt', 'test'); await page.fill('#genPromptFinal', 'test');
  await page.click('#btnGenerer');
  await expect(page.locator('#genErreurs')).toContainText('Importez une image de départ.');
  await page.setInputFiles('#genImageFile', IMG1); await page.fill('#genDuree', '9'); await page.click('#btnGenerer');
  await expect(page.locator('#genErreurs')).toContainText('Durée maximale : 5 s.');
  await page.fill('#genDuree', '2'); await page.fill('#genPromptFinal', ''); await page.fill('#genPrompt', ''); await page.click('#btnGenerer');
  await expect(page.locator('#genErreurs')).toContainText('Écrivez une consigne.');
  await choisirModele(page, 'i2v', 'wan22-premier-dernier');
  await expect(page.locator('#blocFin')).toBeVisible();
  await page.fill('#genPrompt', 'test'); await page.fill('#genPromptFinal', 'test'); await page.click('#btnGenerer');
  await expect(page.locator('#genErreurs')).toContainText('Ce moteur exige une image de fin.');
  expect(await etatApp(page, () => window.__MAMS_APP__.gest.taches.length)).toBe(0);
  expect(s.erreurs).toEqual([]);
});

// ------------------------------------------------------------------ 6
test('06 · soumission d’une génération avec une connexion configurée (jeton HF) : protocole complet et paramètres transmis', async ({ page }) => {
  const s = await ouvrir(page, { whoami: true }); const j = await simulerSpaces(page, {});
  await vue(page, 'moteurs'); await page.fill('#hfJeton', JETON); await page.click('#btnHfVerifier');
  await expect(page.locator('#hfEtat')).toContainText('essai-e2e');
  await genererI2V(page, 'Odette sourit et salue la caméra', 2);
  const t = await attendreTache(page, 'Odette sourit');
  expect(t.etat).toBe('terminee');
  const wan = j.filter((x) => x.hote.startsWith('zerogpu-aoti'));
  expect(wan.map((x) => x.chemin.replace(/^\/gradio_api/, ''))).toEqual(expect.arrayContaining(['/config', '/upload', '/queue/join', '/queue/data']));
  expect(wan.some((x) => x.chemin.includes('/file='))).toBe(true);
  const join = JSON.parse(wan.find((x) => x.chemin.endsWith('/queue/join')).corps);
  expect(join.data[0].path).toBe('/tmp/gradio/essai/depart.png');
  expect(join.data[1]).toBe('Odette sourit et salue la caméra');
  expect(join.data[2]).toBe(4); // étapes (registre)
  expect(join.data[4]).toBe(2); // durée demandée, dans les bornes lues
  expect(wan.every((x) => x.auth === 'Bearer ' + JETON)).toBe(true);
  expect(t.resultat.graine).toBe(4242);
  expect(s.payants).toEqual([]); expect(s.erreurs).toEqual([]);
});

// ------------------------------------------------------------------ 7
test('07 · affichage des états (file, calcul, fin) et des erreurs en français', async ({ page }) => {
  const s = await ouvrir(page); const o = { delaiMs: 1500 }; await simulerSpaces(page, o);
  await page.evaluate(() => { window.__etats = []; new MutationObserver(() => { const e = document.querySelector('#genEtat .st'); if (e) window.__etats.push(e.className + ' | ' + document.getElementById('genEtat').innerText.replace(/\s+/g, ' ')); }).observe(document.getElementById('genEtat'), { childList: true, subtree: true }); });
  await genererI2V(page, 'Plan états', 2);
  await expect(page.locator('#genEtat .st')).toHaveClass(/st-envoi|st-attente/);
  const t = await attendreTache(page, 'Plan états');
  expect(t.journal.map((x) => x.etat)).toEqual(expect.arrayContaining(['attente', 'envoi', 'encours', 'finalisation', 'terminee']));
  const vus = await page.evaluate(() => window.__etats);
  expect(vus.some((x) => /Rang dans la file du service : 3/.test(x))).toBe(true);
  expect(vus.some((x) => /Progression donnée par le service : 25 %/.test(x))).toBe(true);
  await expect(page.locator('#genEtat .st')).toHaveClass(/st-terminee/);
  await expect(page.locator('#genEtat')).toContainText('Coût : Gratuit');
  // erreur de quota : message traduit, état Échec
  o.delaiMs = 0; o.evenements = [{ msg: 'process_completed', success: false, output: { error: 'You have exceeded your GPU quota (60s requested vs. 12s left)' } }];
  await page.fill('#genPromptFinal', 'Plan quota'); await page.click('#btnGenerer');
  const q = await attendreTache(page, 'Plan quota');
  expect(q.etat).toBe('echec'); await expect(page.locator('#genEtat .st-echec').last()).toContainText('Quota GPU gratuit du jour épuisé');
  // file sans GPU : reprise automatique annoncée, puis annulation par l'utilisateur
  o.evenements = [{ msg: 'process_completed', success: false, output: { error: 'No GPU was available after 60s.' } }];
  await page.fill('#genPromptFinal', 'Plan sans GPU'); await page.click('#btnGenerer');
  await expect(page.locator('#genEtat')).toContainText('Aucun GPU libre : nouvel essai automatique');
  await page.click('#btnGenAnnuler');
  await expect(page.locator('#genEtat .st')).toHaveClass(/st-annulee/);
  expect(s.erreurs).toEqual([]);
});

// ------------------------------------------------------------------ 8
test('08 · récupération de la vidéo terminée : images et son identiques, consigne embarquée, lecture, téléchargement, médiathèque', async ({ page }) => {
  const s = await ouvrir(page); await simulerSpaces(page, {});
  await genererI2V(page, 'Plan récupération', 2);
  const t = await attendreTache(page, 'Plan récupération'); expect(t.etat).toBe('terminee');
  const v = await page.evaluate(async () => {
    const e = document.getElementById('genVideo'); if (e.readyState < 1) await new Promise((r) => e.addEventListener('loadedmetadata', r, { once: true }));
    return { src: e.src.slice(0, 5), duree: e.duration, l: e.videoWidth, h: e.videoHeight };
  });
  expect(v.src).toBe('blob:'); expect(v.duree).toBeGreaterThan(1.9); expect(v.duree).toBeLessThan(2.2); expect([v.l, v.h]).toEqual([480, 272]);
  await expect(page.locator('#btnGenTelecharger')).toBeEnabled();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnGenTelecharger')]);
  expect(dl.suggestedFilename()).toMatch(/^IA-plan-recuperation-.{4}\.webm$/);
  // la consigne est écrite dans le fichier (métadonnées) sans toucher une image ni un échantillon de son
  const f = await dl.path(), orig = tmpFichier('clip.webm', CLIP);
  expect(framemd5(f)).toBe(framemd5(orig));
  const tg = etiquettes(f); expect(tg.comment).toBe('Plan récupération');
  const mj = JSON.parse(tg.massamba); expect(mj.graine).toBe(4242); expect(mj.modeleId).toBe('wan22-i2v-rapide'); expect(mj.mode).toBe('i2v'); expect(mj.imageDepart).toBe(true);
  expect(fs.statSync(f).size - CLIP.length).toBeLessThan(4096);
  await vue(page, 'medias'); await expect(page.locator('#libGrid .tag.ia').first()).toHaveText('généré par IA');
  expect(s.erreurs).toEqual([]);
});

// ------------------------------------------------------------------ 9
test('09 · ajout de la vidéo générée à la timeline, avec sa durée réelle', async ({ page }) => {
  const s = await ouvrir(page); await simulerSpaces(page, {});
  await genererI2V(page, 'Plan timeline', 2); const t = await attendreTache(page, 'Plan timeline');
  await page.click('#btnGenAjouter');
  await expect(page.locator('.vue[data-vue="montage"]')).toHaveClass(/on/);
  const c = await etatApp(page, (mid) => { const ST = window.MAMS.studio, x = ST.S.clips.find((k) => k.mid === mid); return x && { type: ST.media(x.mid).type, duree: ST.clipDur(x) }; }, t.resultatMediaId);
  expect(c.type).toBe('video'); expect(c.duree).toBeGreaterThan(1.9); expect(c.duree).toBeLessThan(2.2);
  await expect(page.locator('#laneVideo .blk')).toHaveCount(await etatApp(page, () => window.MAMS.studio.S.clips.length));
  expect(s.erreurs).toEqual([]);
});

// ------------------------------------------------------------------ 10
test('10 · lecture et synchronisation audio/vidéo dans le montage', async ({ page }) => {
  const s = await ouvrir(page);
  await importerAuMontage(page, [path.join(FIX, 'clip-test.webm')]);
  const m = await etatApp(page, () => { const S = window.MAMS.studio.S; S.clips = S.clips.filter((c) => window.MAMS.studio.media(c.mid).type === 'video'); S.sel = S.clips[0].id; window.MAMS.studio.renderAll(); return { aAudio: window.MAMS.studio.media(S.clips[0].mid).aAudio }; });
  expect(m.aAudio).toBe(true);
  await page.click('#btnPlay');
  const ecarts = [];
  for (const attente of [700, 600]) {
    await page.waitForTimeout(attente);
    ecarts.push(await etatApp(page, () => { const ST = window.MAMS.studio, c = ST.S.clips[0], el = ST.media(c.mid).el; return { t: ST.S.time, src: el.currentTime, pause: el.paused, muet: el.muted, vol: el.volume }; }));
  }
  for (const e of ecarts) { expect(e.pause).toBe(false); expect(e.muet).toBe(false); expect(e.vol).toBeGreaterThan(0); expect(Math.abs(e.src - e.t)).toBeLessThan(0.25); }
  expect(ecarts[1].t).toBeGreaterThan(ecarts[0].t);
  await page.click('#btnPlay');
  expect(await etatApp(page, () => window.MAMS.studio.media(window.MAMS.studio.S.clips[0].mid).el.paused)).toBe(true);
  expect(s.erreurs).toEqual([]);
});

// ------------------------------------------------------------------ 11
test('11 · découpage au curseur et transitions (les 10 transitions d’origine rendues, fondu au noir mesuré)', async ({ page }) => {
  const s = await ouvrir(page);
  await importerAuMontage(page, [IMG1, path.join(FIX, 'clip-test.webm')]);
  await etatApp(page, () => { const ST = window.MAMS.studio, S = ST.S; S.clips = S.clips.filter((c) => /image-test-1|clip-test/.test(ST.media(c.mid).name)); S.clips.sort((a, b) => ST.media(a.mid).type === 'image' ? -1 : 1); S.clips[0].dur = 2; S.clips[0].preset = 'fixe'; S.sel = S.clips[1].id; S.time = ST.starts()[1] + 1.0; ST.renderAll(); });   // 1 s après le début du plan vidéo (la transition chevauche)
  await page.click('#btnSplit');
  const d = await etatApp(page, () => { const ST = window.MAMS.studio; return ST.S.clips.map((c) => ({ type: ST.media(c.mid).type, dur: ST.clipDur(c), debut: c.debutSource || 0 })); });
  expect(d.length).toBe(3);
  expect(d[1].type).toBe('video'); expect(d[1].dur).toBeCloseTo(1.0, 1); expect(d[2].debut).toBeCloseTo(1.0, 1); expect(d[2].dur).toBeCloseTo(1.0, 1);
  const transitions = JSON.parse(fs.readFileSync(path.join(FIX, 'reference-motion-studio-2.json'), 'utf8')).listes.selTrans;
  const mesures = {};
  for (const tr of transitions) {
    await page.locator('#laneVideo .blk').first().click();
    await page.click('.tab[data-tab="plan"]');
    await page.selectOption('#selTrans', tr);
    expect(await etatApp(page, () => window.MAMS.studio.S.clips[0].trans)).toBe(tr);
    mesures[tr] = await page.evaluate(async () => { const ST = window.MAMS.studio, b = ST.starts()[1] + ST.transDur(ST.S.clips[0], 0) / 2; ST.S.time = b; ST.syncVideos(b, false); await new Promise((r) => setTimeout(r, 250)); ST.render(b); const c = ST.canvas(), g = c.getContext('2d'), p = g.getImageData(0, 0, c.width, c.height).data; let y = 0, n = 0; for (let i = 0; i < p.length; i += 4 * 101) { y += 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]; n++; } return y / n; });
  }
  expect(mesures.dipBlack).toBeLessThan(mesures.none * 0.5);
  expect(mesures.dipWhite).toBeGreaterThan(mesures.none);
  expect(s.erreurs).toEqual([]);
});

// ------------------------------------------------------------------ 12
test('12 · sauvegarde et réouverture : automatique (navigateur) et fichier projet complet', async ({ page, browser }) => {
  const s = await ouvrir(page);
  await importerAuMontage(page, [IMG1, path.join(FIX, 'clip-test.webm')]);
  await etatApp(page, () => { const ST = window.MAMS.studio; ST.addText({ text: 'Titre sauvé' }); ST.S.subs.push({ id: 's1', start: 0.5, dur: 1.5, text: 'Sous-titre sauvé' }); ST.S.clips[0].preset = 'kenburns'; ST.snap(); ST.renderAll(); });
  await vue(page, 'projets'); await page.fill('#projNom', 'Projet e2e');
  const avant = await etatApp(page, () => { const S = window.MAMS.studio.S; return { clips: S.clips.map((c) => [c.preset, c.mid]), medias: S.media.filter((m) => !m.supprime).length, textes: S.texts.map((t) => t.text), subs: S.subs.map((t) => t.text) }; });
  await expect(page.locator('#projAuto')).toContainText(/navigateur : \d/, { timeout: 15000 });   // horodatage écrit par la vraie sauvegarde
  await page.reload(); await page.waitForFunction(() => window.MAMS && window.MAMS.studio && window.MAMS.studio.S.clips.length > 0);
  const apres = await etatApp(page, () => { const S = window.MAMS.studio.S; return { clips: S.clips.map((c) => [c.preset, c.mid]), medias: S.media.filter((m) => !m.supprime).length, textes: S.texts.map((t) => t.text), subs: S.subs.map((t) => t.text) }; });
  expect(apres).toEqual(avant);
  expect(await page.inputValue('#projNom')).toBe('Projet e2e');
  await vue(page, 'projets');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnProjSauver')]);
  const fichier = await dl.path(); const p = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  expect(p.format).toBe('massamba-ai-motion-studio'); expect(p.v).toBe(3);
  expect(p.medias.every((m) => /^data:/.test(m.data))).toBe(true);
  const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage(); await ouvrir(p2);
  await vue(p2, 'projets'); await p2.setInputFiles('#projFile2', fichier);
  await p2.waitForFunction((n) => window.MAMS.studio.S.clips.length === n, avant.clips.length);
  const rouvert = await etatApp(p2, () => { const S = window.MAMS.studio.S; return { clips: S.clips.map((c) => [c.preset, c.mid]), medias: S.media.filter((m) => !m.supprime).length, textes: S.texts.map((t) => t.text), subs: S.subs.map((t) => t.text) }; });
  expect(rouvert).toEqual(avant);
  expect(await etatApp(p2, () => { const v = window.MAMS.studio.S.media.find((m) => m.type === 'video'); return v && v.duree; })).toBeGreaterThan(1.9);
  await ctx2.close();
  expect(s.erreurs).toEqual([]);
});

// ------------------------------------------------------------------ 13
test('13 · export final : fichier validé par l’application puis relu par ffprobe', async ({ page }) => {
  const s = await ouvrir(page);
  await importerAuMontage(page, [IMG1, path.join(FIX, 'clip-test.webm')]);
  await etatApp(page, () => { const ST = window.MAMS.studio, S = ST.S; S.clips = S.clips.filter((c) => /image-test-1|clip-test/.test(ST.media(c.mid).name)); S.clips[0].dur = 1.5; S.clips[0].trans = 'fade'; ST.addText({ text: 'Fin', start: 0, dur: 1 }); ST.renderAll(); });
  const total = await etatApp(page, () => window.MAMS.studio.total());
  await page.waitForFunction(() => window.__MAMS_APP__.A.srv && window.__MAMS_APP__.A.srv.transcodage);   // serveur local joint
  await page.click('.tab[data-tab="out"]'); await page.selectOption('#selExportFormat', 'auto');   // « MP4 H.264 + AAC (navigateur, sinon serveur local) »
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 150000 }), page.click('#btnExport')]);
  await expect(page.locator('#exportRapport')).toContainText('Export validé');
  const f = await dl.path(); const nom = dl.suggestedFilename();
  const sonde = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f]).toString());
  const vid = sonde.streams.find((x) => x.codec_type === 'video'), aud = sonde.streams.find((x) => x.codec_type === 'audio');
  const dims = await etatApp(page, () => [window.MAMS.studio.canvas().width, window.MAMS.studio.canvas().height]);
  expect([vid.width, vid.height]).toEqual(dims);
  expect(Math.abs(Number(sonde.format.duration) - total)).toBeLessThan(0.35);
  expect(aud).toBeTruthy();
  // 23/10/2026 : ce Chromium n'a pas d'encodeur H.264 ; le serveur local convertit (ffmpeg) → H.264 + AAC dans tous les cas
  expect(nom).toMatch(/\.mp4$/); expect(vid.codec_name).toBe('h264'); expect(aud.codec_name).toBe('aac'); expect(Number(aud.sample_rate)).toBe(48000);
  await expect(page.locator('#exportRapport')).toContainText('H.264 + AAC par ffmpeg sur le serveur local');
  await expect(page.locator('#exportRapport')).toContainText('consigne embarquée et relue dans le fichier');
  const tg = etiquettes(f); expect(tg.comment).toMatch(/^Plan 1 \(1,5 s\)/); expect(JSON.parse(tg.massamba).type).toBe('montage');
  // toute la vidéo se décode sans erreur
  execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', f, '-f', 'null', '-']);
  test.info().annotations.push({ type: 'export', description: `${nom} : ${vid.codec_name} ${vid.width}×${vid.height}, ${aud.codec_name}, ${Number(sonde.format.duration).toFixed(2)} s (montage ${total.toFixed(2)} s)` });
  expect(s.erreurs).toEqual([]);
});

// ------------------------------------------------------------------ 14
test('14 · interruption réseau : coupure pendant la génération, puis hors ligne', async ({ page, context }) => {
  const s = await ouvrir(page); const o = { coupure: true }; await simulerSpaces(page, o);
  await genererI2V(page, 'Plan coupure', 2);
  const t = await attendreTache(page, 'Plan coupure');
  expect(t.etat).toBe('echec'); expect(t.erreur).toMatch(/Connexion réseau interrompue/);
  await expect(page.locator('#genEtat .st-echec').last()).toContainText('Connexion réseau interrompue');
  await context.setOffline(true);
  await expect(page.locator('#statusPill')).toContainText('Hors ligne');
  o.coupure = false; await page.fill('#genPromptFinal', 'Plan hors ligne'); await page.click('#btnGenerer');
  const h = await attendreTache(page, 'Plan hors ligne');
  expect(h.etat).toBe('echec'); expect(h.erreur).toMatch(/Pas de connexion réseau/);
  await context.setOffline(false);
  await expect(page.locator('#statusPill')).toContainText('Connexion rétablie');
  // relance manuelle après retour du réseau → la génération aboutit
  await vue(page, 'historique');
  await page.locator('#histListe button[data-h="relancer"]').first().click();
  const r = await attendreTache(page, 'Plan hors ligne'); expect(['terminee', 'echec']).toContain(r.etat);
  expect(r.etat).toBe('terminee');
  expect(s.erreurs).toEqual([]);
});

// ------------------------------------------------------------------ 15
test('15 · protection des clés : jeton en mémoire seulement, jamais stocké, exporté ni envoyé ailleurs ; voies payantes fermées', async ({ page }) => {
  const s = await ouvrir(page, { whoami: true }); const j = await simulerSpaces(page, {});
  await vue(page, 'moteurs'); await page.fill('#hfJeton', JETON); await page.click('#btnHfVerifier');
  await expect(page.locator('#hfEtat')).toContainText('jeton en mémoire seulement');
  expect(await page.inputValue('#hfJeton')).toBe('');
  await genererI2V(page, 'Plan clé', 2); await attendreTache(page, 'Plan clé');
  // le jeton ne part que vers le service appelé (Space) et la vérification du compte
  const porteurs = s.requetes.filter((r) => r.auth && r.auth.includes(JETON)).map((r) => new URL(r.url).hostname);
  expect(porteurs.every((h) => /\.hf\.space$|^huggingface\.co$/.test(h))).toBe(true);
  expect(s.requetes.filter((r) => /127\.0\.0\.1/.test(r.url)).every((r) => !r.auth)).toBe(true);
  expect(j.length).toBeGreaterThan(0);
  // ni dans le stockage du navigateur, ni dans la sauvegarde automatique, ni dans le fichier projet, ni dans l'historique, ni dans la page
  await expect(page.locator('#projAuto')).toContainText(/navigateur : \d/, { timeout: 15000 });   // horodatage écrit par la vraie sauvegarde
  const stockage = await page.evaluate(async () => JSON.stringify(localStorage) + JSON.stringify(sessionStorage) + JSON.stringify(await window.MAMS.stockage.idb.lire('etat', 'projet'), (k, v) => (v instanceof Blob ? '[blob]' : v)));
  expect(stockage).not.toContain(JETON);
  const hist = await page.evaluate(() => JSON.stringify(window.__MAMS_APP__.gest.exporter()));
  expect(hist).not.toContain(JETON);
  const instant = await page.evaluate(async () => JSON.stringify(await window.__MAMS_APP__.instantane(true)));
  expect(instant).not.toContain(JETON);
  expect(await page.content()).not.toContain(JETON);
  // le code livré ne contient aucune clé
  for (const f of ['index.html', 'js/app.js', 'js/registre.js', 'js/fournisseurs.js', 'js/gradio.js']) expect(fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8')).not.toMatch(/hf_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|key_[A-Za-z0-9]{20,}/);
  // voies payantes : désactivées dans la liste et refusées même par appel direct
  await vue(page, 'generer'); await page.click('#modeT2V');
  const payantes = await page.locator('#genModele option', { hasText: 'payant' }).evaluateAll((o) => o.map((x) => x.disabled));
  expect(payantes.length).toBeGreaterThan(0); expect(payantes.every(Boolean)).toBe(true);
  await page.evaluate(() => window.__MAMS_APP__.generer(false, null, { m: window.MAMS.registre.trouver('runway-gen4.5'), d: { mode: 't2v', prompt: 'x', dureeS: 5, format: '16:9' } }));
  await expect(page.locator('#genErreurs')).toContainText(/payant|Serveur local/);
  expect(await etatApp(page, () => window.__MAMS_APP__.gest.taches.filter((t) => t.modeleId === 'runway-gen4.5').length)).toBe(0);
  expect(s.payants).toEqual([]); expect(s.erreurs).toEqual([]);
});

// ------------------------------------------------------------------ 16
test('16 · compatibilité : un projet enregistré par MASSAMBA Motion Studio 2 (v2) s’ouvre et se migre', async ({ page }) => {
  const s = await ouvrir(page);
  const v2 = JSON.parse(fs.readFileSync(path.join(FIX, 'projet-motion-studio-2.json'), 'utf8'));
  await page.setInputFiles('#projFile', path.join(FIX, 'projet-motion-studio-2.json'));
  await page.waitForFunction((n) => window.MAMS.studio.S.clips.length === n, v2.clips.length);
  const r = await etatApp(page, () => { const S = window.MAMS.studio.S; return { clips: S.clips.map((c) => [c.id, c.mid, c.preset, c.dur, c.trans]), medias: S.media.map((m) => [m.id, m.name, m.type]), textes: S.texts.map((t) => [t.text, t.style, t.anim]), grade: S.grade, fps: S.fps }; });
  expect(r.clips).toEqual(v2.clips.map((c) => [c.id, c.mid, c.preset, c.dur, c.trans]));
  expect(r.medias).toEqual(v2.media.map((m) => [m.id, m.name, 'image']));
  expect(r.textes).toEqual(v2.texts.map((t) => [t.text, t.style, t.anim]));
  expect(r.grade).toBe(v2.settings.grade); expect(r.fps).toBe(v2.settings.fps);
  await expect(page.locator('#statusPill')).toContainText('vignettes');
  const m = await mesureCanevas(page); expect(m.ecart).toBeGreaterThan(5);
  expect(s.erreurs).toEqual([]);
});

// ------------------------------------------------------------------ 17
test('17 · non-régression des fonctions de montage d’origine (identifiants, listes, opérations, rendus)', async ({ page }) => {
  const s = await ouvrir(page);
  const ref = JSON.parse(fs.readFileSync(path.join(FIX, 'reference-motion-studio-2.json'), 'utf8'));
  const ids = await page.evaluate(() => [...document.querySelectorAll('[id]')].map((e) => e.id));
  expect(ref.ids.filter((i) => !ids.includes(i))).toEqual([]);
  for (const [k, liste] of Object.entries(ref.listes)) {
    const nouvelles = await page.locator('#' + k + ' option').evaluateAll((o) => o.map((x) => x.value));
    expect(liste.filter((x) => !nouvelles.includes(x)), k).toEqual([]);
  }
  await importerAuMontage(page, [IMG1, IMG2]);
  await etatApp(page, () => { const ST = window.MAMS.studio; ST.S.clips = ST.S.clips.filter((c) => /image-test/.test(ST.media(c.mid).name)); ST.S.sel = ST.S.clips[0].id; ST.renderAll(); });
  await page.click('.tab[data-tab="plan"]');
  await page.selectOption('#selPreset', 'zoomIn');
  expect(await etatApp(page, () => window.MAMS.studio.S.clips[0].preset)).toBe('zoomIn');
  await page.click('#btnAddKf');
  expect(await etatApp(page, () => window.MAMS.studio.S.clips[0].kf.length)).toBe(1);
  await page.click('.tab[data-tab="text"]'); await page.fill('#inpTitle', 'Titre régression'); await page.click('#btnTextAdd');
  const n = await etatApp(page, () => window.MAMS.studio.S.texts.length);
  await page.click('#btnUndo'); expect(await etatApp(page, () => window.MAMS.studio.S.texts.length)).toBe(n - 1);
  await page.click('#btnRedo'); expect(await etatApp(page, () => window.MAMS.studio.S.texts.length)).toBe(n);
  // chaque mouvement de caméra d'origine se rend sans erreur et produit une image non uniforme
  for (const p of ref.listes.selPreset) {
    const m = await page.evaluate((pr) => { const ST = window.MAMS.studio; ST.S.clips[0].preset = pr; ST.render(1.2); const c = ST.canvas(), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0, k = 0; for (let i = 0; i < d.length; i += 4 * 211) { const y = d[i + 1]; s += y; s2 += y * y; k++; } const mo = s / k; return Math.sqrt(s2 / k - mo * mo); }, p);
    expect(m, p).toBeGreaterThan(5);
  }
  // étalonnage « noir » : image désaturée (mesurée)
  await page.click('.tab[data-tab="fx"]'); await page.selectOption('#selGrade', 'cinema'); await etatApp(page, () => window.MAMS.studio.render(1));
  const couleur = await mesureCanevas(page);
  await page.selectOption('#selGrade', 'noir'); await etatApp(page, () => window.MAMS.studio.render(1));
  const noir = await mesureCanevas(page);
  expect(noir.saturation).toBeLessThan(couleur.saturation * 0.2);
  // instantané PNG et planche contact
  const [png] = await Promise.all([page.waitForEvent('download'), page.click('#btnPng')]);
  expect(fs.readFileSync(await png.path()).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  await page.click('.tab[data-tab="out"]');
  const [planche] = await Promise.all([page.waitForEvent('download'), page.click('#btnSheet')]);
  expect(fs.statSync(await planche.path()).size).toBeGreaterThan(1000);
  // lecture : le temps avance, puis pause
  await page.click('#btnPlay'); await page.waitForTimeout(600); await page.click('#btnPlay');
  expect(await etatApp(page, () => window.MAMS.studio.S.time)).toBeGreaterThan(0.2);
  expect(s.erreurs).toEqual([]);
});

// ------------------------------------------------------------------ 18 (23/10/2026)
test('18 · Autopilote : une idée → plans écrits → génération → montage → son → export H.264 validé, consigne embarquée', async ({ page }) => {
  const s = await ouvrir(page);
  await page.waitForFunction(() => window.__MAMS_APP__.A.srv && window.__MAMS_APP__.A.srv.transcodage);
  await vue(page, 'autopilote');
  const idee = 'Une grand-mère découvre que son téléphone répète tout. Elle s’en sert pour réclamer ses dettes au quartier.';
  await page.fill('#apIdee', idee); await page.selectOption('#apVoie', 'demo'); await page.fill('#apDuree', '6'); await page.selectOption('#apFormat', '9:16');
  await expect(page.locator('#apEstim')).toContainText('2 plan(s) DÉMO');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 170000 }), page.click('#btnApLancer')]);
  await page.waitForFunction(() => { const J = window.MAMS.autopilote.etat(); return J && J.fini; }, null, { timeout: 170000 });
  const J = await etatApp(page, () => { const J = window.MAMS.autopilote.etat(); return { ok: J.ok, etapes: Object.fromEntries(Object.entries(J.etapes).map(([k, v]) => [k, v.etat + ' | ' + (v.detail || '')])), plans: J.plans.map((p) => ({ nature: p.nature, moteur: p.moteur, narration: p.narration })) }; });
  expect(J.ok).toBe(true);
  for (const k of ['ecriture', 'consignes', 'generation', 'montage', 'son', 'export']) expect(J.etapes[k]).toMatch(/^fait/);
  expect(J.etapes.ecriture).toMatch(/découpage local/);   // modèle de texte coupé dans les tests : repli local annoncé
  expect(J.plans).toHaveLength(2); expect(J.plans.every((p) => p.nature === 'demo')).toBe(true);
  expect(J.plans.map((p) => p.narration)).toEqual(['Une grand-mère découvre que son téléphone répète tout.', 'Elle s’en sert pour réclamer ses dettes au quartier.']);
  const m = await etatApp(page, () => ({ scenes: window.__MAMS_APP__.A.scenes.filter((x) => x.autopilote).length, clips: window.MAMS.studio.S.clips.length, subs: window.MAMS.studio.S.subs.length, total: window.MAMS.studio.total(), gen: window.MAMS.studio.S.audio.gen }));
  expect(m.scenes).toBe(2); expect(m.clips).toBe(2); expect(m.subs).toBe(2); expect(m.gen).toBe('pulse');
  await expect(page.locator('#apResume')).toContainText('Film validé');
  const f = await dl.path(), sonde = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f]).toString());
  const vid = sonde.streams.find((x) => x.codec_type === 'video'), aud = sonde.streams.find((x) => x.codec_type === 'audio');
  expect(vid.codec_name).toBe('h264'); expect([vid.width, vid.height]).toEqual([720, 1280]); expect(aud.codec_name).toBe('aac');
  expect(Math.abs(Number(sonde.format.duration) - m.total)).toBeLessThan(0.35);
  execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', f, '-f', 'null', '-']);
  const tg = etiquettes(f); expect(tg.comment.indexOf('Idée : ' + idee)).toBe(0);
  const mj = JSON.parse(tg.massamba); expect(mj.type).toBe('autopilote'); expect(mj.idee).toBe(idee); expect(mj.plansEcrits).toHaveLength(2); expect(mj.reglages.format).toBe('9:16');
  test.info().annotations.push({ type: 'autopilote', description: `${dl.suggestedFilename()} : ${vid.codec_name} ${vid.width}×${vid.height}, ${aud.codec_name}, ${Number(sonde.format.duration).toFixed(2)} s` });
  expect(s.erreurs).toEqual([]);
});

// ------------------------------------------------------------------ 19 (23/10/2026)
test('19 · Autopilote : chaîne de secours — quota épuisé sur LTX-2.3, le moteur suivant rend le plan, rien de payant', async ({ page }) => {
  const s = await ouvrir(page); await simulerSpaces(page, { quotaSur: ['lightricks-ltx-2-3.hf.space'] });
  await page.waitForFunction(() => window.__MAMS_APP__.A.srv && window.__MAMS_APP__.A.srv.transcodage);
  await vue(page, 'autopilote');
  await page.fill('#apIdee', 'Un marché coloré au lever du soleil.'); await page.selectOption('#apVoie', 'ia'); await page.fill('#apDuree', '3');
  await page.uncheck('#apVoix'); await page.uncheck('#apMusique');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 170000 }), page.click('#btnApLancer')]);
  await page.waitForFunction(() => { const J = window.MAMS.autopilote.etat(); return J && J.fini; }, null, { timeout: 170000 });
  const J = await etatApp(page, () => { const J = window.MAMS.autopilote.etat(); return { ok: J.ok, plans: J.plans.map((p) => ({ essais: p.essais, moteur: p.moteur, nature: p.nature })) }; });
  expect(J.ok).toBe(true); expect(J.plans).toHaveLength(1);
  expect(J.plans[0].essais[0]).toMatch(/LTX-2\.3/); expect(J.plans[0].moteur).toMatch(/LTX-Video distillé/); expect(J.plans[0].nature).toBe('ia');
  const quota = await etatApp(page, () => window.__MAMS_APP__.gest.taches.some((t) => t.etat === 'echec' && /Quota GPU gratuit du jour épuisé/.test(t.erreur)));
  expect(quota).toBe(true);
  const tg = etiquettes(await dl.path()); expect(JSON.parse(tg.massamba).plansEcrits[0].moteur).toMatch(/LTX-Video/);
  expect(s.payants).toEqual([]); expect(s.erreurs).toEqual([]);
});

// ------------------------------------------------------------------ 20 (23/10/2026)
test('20 · Autopilote, voie troupe : l’idée choisit le sketch de la réserve, grille de ton, tournage V1, consigne embarquée, film validé', async ({ page }) => {
  const s = await ouvrir(page);
  // vidéo du « moteur V1 » simulé : MP4 lisible par ce Chromium (VP9 + Opus), fabriqué par ffmpeg depuis le clip de test
  const mp4 = path.join(require('os').tmpdir(), 'aims-e2e-v1-' + Date.now() + '.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(FIX, 'clip-test.webm'), '-c', 'copy', '-f', 'mp4', mp4]);
  const catalogue = { bibliotheque: '(simulée)', scenes: [{ nom: 'marche-etal', acteurs: ['SERAPHINE', 'MAMAN AKISSI'] }, { nom: 'salon-coiffure', acteurs: ['PRINCESSE', 'JOSIANE'] }],
    sketchs: [{ id: 'salon-mois', titre: 'LE TISSAGE DU MOIS', image: 'salon-coiffure', acteurs: ['PRINCESSE', 'JOSIANE'], repliques: [{ qui: 'PRINCESSE', texte: 'Fais-moi un tissage, je paie à la fin du mois !', chute: false }, { qui: 'JOSIANE', texte: 'Ta tête attend la fin du mois.', chute: true }] },
      { id: 'marche-direct', titre: 'LE DIRECT DU MARCHÉ', image: 'marche-etal', acteurs: ['SERAPHINE', 'MAMAN AKISSI'], repliques: [{ qui: 'SERAPHINE', texte: 'Maman, je filme le marché en direct sur TikTok !', chute: false }, { qui: 'MAMAN AKISSI', texte: 'Alors dis à tes abonnés que la tomate est à cinq cents.', chute: true }] }] };
  const vu = { controle: null, tache: null, suivis: 0 };
  await page.route('**/api/v1/catalogue', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalogue) }));
  await page.route('**/api/v1/controle', (r) => { vu.controle = JSON.parse(r.request().postData()); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rapport: 'grille de ton : conforme', sketchs: ['marche-direct'] }) }); });
  await page.route(/\/api\/taches(\/.*)?$/, (r) => {
    const u = new URL(r.request().url()), m = r.request().method();
    if (m === 'POST' && u.pathname === '/api/taches') { vu.tache = r.request().postData(); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'sV1essai' }) }); }
    if (u.pathname === '/api/taches/sV1essai') { vu.suivis++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(vu.suivis < 2 ? { etat: 'encours', message: 'Moteur V1 : tournage' } : { etat: 'terminee' }) }); }
    if (u.pathname === '/api/taches/sV1essai/video') return r.fulfill({ status: 200, contentType: 'video/mp4', body: fs.readFileSync(mp4) });
    return r.continue();
  });
  await page.waitForFunction(() => window.__MAMS_APP__.A.srv);
  await vue(page, 'autopilote');
  await page.fill('#apIdee', 'Une fille filme le marché en direct sur TikTok et sa mère en profite pour annoncer le prix de la tomate.');
  await page.selectOption('#apVoie', 'troupe');
  await expect(page.locator('#apEstim')).toContainText('moteur V1');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('#btnApLancer')]);
  await page.waitForFunction(() => { const J = window.MAMS.autopilote.etat(); return J && J.fini; }, null, { timeout: 120000 });
  const J = await etatApp(page, () => { const J = window.MAMS.autopilote.etat(); return { ok: J.ok, etapes: Object.fromEntries(Object.entries(J.etapes).map(([k, v]) => [k, v.etat + ' | ' + (v.detail || '')])) }; });
  expect(J.etapes.ecriture).toMatch(/^fait \| .*LE DIRECT DU MARCHÉ/);   // les mots de l'idée désignent le bon sketch de la réserve
  expect(vu.controle.sketchs[0]).toEqual({ id: 'marche-direct' });     // la grille de ton de la V1 est consultée avant le tournage
  expect(JSON.parse(vu.tache.match(/\{.*\}/s)[0]).sketchs[0].id).toBe('marche-direct');   // champ « demande » du formulaire envoyé au serveur
  for (const k of ['consignes', 'generation', 'montage', 'export']) expect(J.etapes[k]).toMatch(/^fait/);
  expect(J.etapes.son).toMatch(/^saute \| .*moteur V1/);
  expect(J.ok).toBe(true);
  const tg = etiquettes(await dl.path());
  expect(tg.comment).toContain('MAMAN AKISSI : Alors dis à tes abonnés que la tomate est à cinq cents. (chute)');
  const mj = JSON.parse(tg.massamba); expect(mj.mode).toBe('v1'); expect(mj.sketchs[0].id).toBe('marche-direct'); expect(mj.modeleId).toBe('moteur-v1');
  expect(await etatApp(page, () => window.MAMS.studio.S.clips.length)).toBe(1);
  fs.rmSync(mp4, { force: true });
  expect(s.erreurs).toEqual([]);
});
