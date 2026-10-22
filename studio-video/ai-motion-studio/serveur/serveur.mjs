// MASSAMBA AI MOTION STUDIO — serveur local (22/10/2026). Aucune dépendance : Node 20 ou plus suffit.
//   node serveur/serveur.mjs          → http://127.0.0.1:8787 (l'application + l'API)
// Rôle : 1) servir l'application ; 2) faire tourner le moteur V1 de la troupe et la voix Piper EN LOCAL ; 3) garder les clés
// des fournisseurs payants dans les variables d'environnement (jamais envoyées au navigateur, jamais journalisées) ;
// 4) file de tâches, limites de débit, plafond quotidien des tâches payantes, rapatriement des vidéos, purge après 24 h.
// « Rien de payant » : PAYANT_AUTORISE vaut 0 par défaut ; même à 1, chaque tâche payante exige la confirmation explicite
// envoyée par l'application (confirmationCout) et respecte PLAFOND_TACHES_PAYANTES_JOUR.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { CONNECTEURS } from './fournisseurs.mjs';

const ICI = path.dirname(new URL(import.meta.url).pathname);
const APP = path.resolve(ICI, '..');
const DONNEES = path.resolve(process.env.DONNEES_DIR || path.join(ICI, 'donnees'));
const VIDEOS = path.join(DONNEES, 'videos');
fs.mkdirSync(VIDEOS, { recursive: true });

function lireEnv(f) {   // .env local facultatif (format CLE=valeur), jamais versionné
  if (!fs.existsSync(f)) return;
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
lireEnv(path.join(APP, '.env'));
const PORT = Number(process.env.PORT || 8787), HOTE = process.env.HOTE || '127.0.0.1';
const PAYANT = process.env.PAYANT_AUTORISE === '1';
const PLAFOND_PAYANT = Number(process.env.PLAFOND_TACHES_PAYANTES_JOUR || 5);
const RETENTION_MS = Number(process.env.RETENTION_HEURES || 24) * 3600 * 1000;
const MAX_CORPS = 25 * 1024 * 1024;

// ------------------------------------------------------------------ journal sans secrets
const SECRETS = () => ['FAL_KEY', 'REPLICATE_API_TOKEN', 'RUNWAYML_API_SECRET', 'LUMAAI_API_KEY', 'KLING_ACCESS_KEY', 'KLING_SECRET_KEY', 'HF_TOKEN'].map((k) => process.env[k]).filter((v) => v && v.length > 5);
export function caviarder(s) { let t = String(s); for (const v of SECRETS()) t = t.split(v).join('«secret»'); return t.replace(/(Bearer|Key)\s+[A-Za-z0-9._\-]{12,}/g, '$1 «secret»').replace(/hf_[A-Za-z0-9]{10,}/g, 'hf_«secret»'); }
const journal = (...a) => console.log(new Date().toISOString(), caviarder(a.join(' ')));

// ------------------------------------------------------------------ tâches (mémoire + fichier, sans secrets)
const FICHIER_TACHES = path.join(DONNEES, 'taches.json');
const taches = new Map();
try { for (const t of JSON.parse(fs.readFileSync(FICHIER_TACHES, 'utf8'))) taches.set(t.id, t); } catch { /* premier lancement */ }
function enregistrer() {
  const l = [...taches.values()].map(({ _promesse, _processus, _resultat, _erreur, ...t }) => t);
  fs.writeFileSync(FICHIER_TACHES, JSON.stringify(l, null, 1));
}
function payantesDuJour() { const j = new Date().toISOString().slice(0, 10); return [...taches.values()].filter((t) => t.payant && t.creeLe.slice(0, 10) === j).length; }
function purger() {
  const lim = Date.now() - RETENTION_MS;
  for (const [id, t] of taches) if (Date.parse(t.creeLe) < lim) { if (t.cheminVideo && t.cheminVideo.startsWith(VIDEOS)) fs.rmSync(t.cheminVideo, { force: true }); taches.delete(id); }
  for (const f of fs.readdirSync(VIDEOS)) { const p = path.join(VIDEOS, f); try { if (fs.statSync(p).mtimeMs < lim) fs.rmSync(p, { recursive: true, force: true }); } catch { /* déjà supprimé */ } }
  enregistrer();
}
purger(); setInterval(purger, 3600 * 1000).unref();

// ------------------------------------------------------------------ limite de débit (par adresse, fenêtre d'une minute)
const debit = new Map();
function limite(ip, max = 30) { const n = Date.now(), l = (debit.get(ip) || []).filter((x) => n - x < 60000); l.push(n); debit.set(ip, l); return l.length > max; }

// ------------------------------------------------------------------ utilitaires HTTP
function origineAutorisee(o) { return !o || o === 'null' || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o); }
function envoyer(res, code, corps, req) {
  const o = req?.headers.origin;
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (o && origineAutorisee(o)) { h['Access-Control-Allow-Origin'] = o; h.Vary = 'Origin'; }
  res.writeHead(code, h); res.end(JSON.stringify(corps));
}
async function corpsJson(req) { const ch = []; let n = 0; for await (const c of req) { n += c.length; if (n > 1024 * 1024) throw new Error('Corps trop gros.'); ch.push(c); } return JSON.parse(Buffer.concat(ch).toString('utf8') || '{}'); }
async function formulaire(req) {
  if (Number(req.headers['content-length'] || 0) > MAX_CORPS) throw new Error('Fichiers trop lourds (25 Mo au plus).');
  const r = new Request('http://local/', { method: 'POST', headers: req.headers, body: Readable.toWeb(req), duplex: 'half' });
  return r.formData();
}
async function fichier(fd, nom) {
  const f = fd.get(nom); if (!f || typeof f === 'string') return null;
  const type = f.type || 'application/octet-stream';
  if (!/^image\/(png|jpe?g|webp)$/.test(type)) throw new Error(`Fichier « ${nom} » refusé : JPG, PNG ou WEBP uniquement.`);
  return { buf: Buffer.from(await f.arrayBuffer()), type };
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wav': 'audio/wav' };
function servirFichier(res, p, req) {
  fs.stat(p, (e, st) => {
    if (e || !st.isFile()) { envoyer(res, 404, { erreur: 'introuvable' }, req); return; }
    const type = TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', h = { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' };
    const o = req.headers.origin; if (o && origineAutorisee(o)) h['Access-Control-Allow-Origin'] = o;
    const plage = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    if (plage) { const a = Number(plage[1]), z = plage[2] ? Number(plage[2]) : st.size - 1; res.writeHead(206, { ...h, 'Content-Range': `bytes ${a}-${z}/${st.size}`, 'Content-Length': z - a + 1 }); fs.createReadStream(p, { start: a, end: z }).pipe(res); }
    else { res.writeHead(200, h); fs.createReadStream(p).pipe(res); }
  });
}

// ------------------------------------------------------------------ validation stricte d'une demande
const FOURNISSEURS = Object.keys(CONNECTEURS);
function valider(d) {
  const e = [];
  if (!FOURNISSEURS.includes(d.fournisseur)) e.push('fournisseur inconnu');
  if (d.fournisseur === 'moteur-v1') {
    if (!Array.isArray(d.sketchs) || !d.sketchs.length || d.sketchs.length > 3) e.push('1 à 3 sketchs attendus');
  } else {
    if (!['i2v', 't2v'].includes(d.mode)) e.push('mode i2v ou t2v attendu');
    if (typeof d.prompt !== 'string' || !d.prompt.trim() || d.prompt.length > 2000) e.push('consigne de 1 à 2 000 caractères');
    if (d.dureeS != null && !(Number(d.dureeS) > 0 && Number(d.dureeS) <= 20)) e.push('durée entre 0 et 20 s');
    if (d.format && !['16:9', '9:16', '1:1'].includes(d.format)) e.push('format 16:9, 9:16 ou 1:1');
    if (d.modele != null && !/^[\w.\-]{1,40}$/.test(String(d.modele))) e.push('nom de modèle invalide');
  }
  return e;
}

async function rapatrier(t, url, entetes) {
  const r = await fetch(url, { headers: entetes || {} });
  if (!r.ok) throw new Error(`téléchargement de la vidéo refusé (${r.status})`);
  const p = path.join(VIDEOS, `${t.id}.mp4`); fs.writeFileSync(p, Buffer.from(await r.arrayBuffer())); return p;
}

async function suivreBoucle(t) {
  const c = CONNECTEURS[t.fournisseur];
  for (let i = 0; i < 2000; i++) {
    if (t.etat === 'annulee') return;
    await new Promise((r) => setTimeout(r, t.fournisseur === 'moteur-v1' ? 3000 : 4000));
    try {
      const s = await c.suivre(t);
      if (s.etat === 'terminee') {
        t.etat = 'finalisation'; t.message = 'Rapatriement de la vidéo'; enregistrer();
        t.cheminVideo = s.cheminVideo || await rapatrier(t, s.urlVideo, s.enTetesTelechargement);
        t.meta = s.meta || null; t.etat = 'terminee'; t.message = null; t.finLe = new Date().toISOString(); enregistrer();
        journal('tâche', t.id, t.fournisseur, 'terminée'); return;
      }
      if (s.etat === 'echec' || s.etat === 'annulee') { t.etat = s.etat; t.erreur = s.erreur || null; enregistrer(); journal('tâche', t.id, t.fournisseur, s.etat, s.erreur || ''); return; }
      t.etat = 'encours'; t.progression = s.progression ?? null; t.message = s.message || null;
    } catch (e) { t.etat = 'echec'; t.erreur = caviarder(e.message); enregistrer(); journal('tâche', t.id, 'échec', e.message); return; }
  }
  t.etat = 'echec'; t.erreur = 'Délai dépassé.'; enregistrer();
}

function sante() {
  const f = {};
  for (const [k, c] of Object.entries(CONNECTEURS)) f[k] = { nom: c.nom, configure: !!c.configure(), payant: !!c.payant, actif: !!c.configure() && (!c.payant || PAYANT) };
  return { ok: true, version: '3.0.0', payantAutorise: PAYANT, plafondPayantJour: PLAFOND_PAYANT, payantesAujourdhui: payantesDuJour(), retentionHeures: RETENTION_MS / 3600000,
    fournisseurs: f, voix: { piper: fs.existsSync(path.join(process.env.PIPER_VOICES || path.join(process.env.HOME || '', '.cache/massamba-models/piper'), 'fr_FR-siwis-medium.onnx')) } };
}

let catalogueCache = null;
const serveur = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://local'); const ip = req.socket.remoteAddress || '?';
  try {
    if (req.method === 'OPTIONS') {
      const o = req.headers.origin; if (!origineAutorisee(o)) { res.writeHead(403); res.end(); return; }
      res.writeHead(204, { 'Access-Control-Allow-Origin': o || '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' }); res.end(); return;
    }
    if (u.pathname.startsWith('/api/')) {
      if (!origineAutorisee(req.headers.origin)) { envoyer(res, 403, { erreur: 'origine refusée' }, req); return; }
      if (req.method !== 'GET' && limite(ip)) { envoyer(res, 429, { erreur: 'Trop de requêtes : attendez une minute.' }, req); return; }
    }
    if (u.pathname === '/api/sante') return envoyer(res, 200, sante(), req);
    if (u.pathname === '/api/v1/catalogue' && req.method === 'GET') {
      const c = CONNECTEURS['moteur-v1']; if (!c.configure()) return envoyer(res, 503, { erreur: 'Moteur V1 non configuré (MASSAMBA_BIBLIO et MOTEUR_V1_DIR).' }, req);
      if (!catalogueCache || Date.now() - catalogueCache.t > 60000) catalogueCache = { t: Date.now(), d: await c.catalogue() };
      return envoyer(res, 200, catalogueCache.d, req);
    }
    if (u.pathname === '/api/v1/controle' && req.method === 'POST') {
      const c = CONNECTEURS['moteur-v1']; if (!c.configure()) return envoyer(res, 503, { erreur: 'Moteur V1 non configuré.' }, req);
      const d = await corpsJson(req); return envoyer(res, 200, await c.controle({ sketchs: d.sketchs || [] }, VIDEOS), req);
    }
    if (u.pathname === '/api/voix' && req.method === 'POST') {
      const d = await corpsJson(req); const texte = String(d.texte || '').trim();
      if (!texte || texte.length > 2000) return envoyer(res, 400, { erreur: 'Texte de 1 à 2 000 caractères.' }, req);
      const id = crypto.randomUUID(), ft = path.join(VIDEOS, `${id}.txt`), fw = path.join(VIDEOS, `voix-${id}.wav`);
      fs.writeFileSync(ft, texte);
      const code = await new Promise((r) => spawn(process.env.PYTHON || 'python3', [path.join(ICI, 'voix_piper.py'), ft, fw, d.voix === 'gilles' ? 'gilles' : 'siwis'], { env: process.env }).on('close', r));
      fs.rmSync(ft, { force: true });
      if (code !== 0 || !fs.existsSync(fw)) return envoyer(res, 500, { erreur: 'Piper n’a pas produit la voix (voir docs/GUIDE-INSTALLATION.md).' }, req);
      return servirFichier(res, fw, req);
    }
    if (u.pathname === '/api/taches' && req.method === 'POST') {
      const fd = await formulaire(req); let d;
      try { d = JSON.parse(String(fd.get('demande') || '{}')); } catch { return envoyer(res, 400, { erreur: 'Demande illisible.' }, req); }
      const err = valider(d); if (err.length) return envoyer(res, 400, { erreur: 'Demande refusée : ' + err.join(', ') + '.' }, req);
      const c = CONNECTEURS[d.fournisseur];
      if (!c.configure()) return envoyer(res, 503, { erreur: `${c.nom} n’est pas configuré sur ce serveur (variables d’environnement manquantes).` }, req);
      if (c.payant) {
        if (!PAYANT) return envoyer(res, 403, { erreur: 'Voies payantes désactivées (PAYANT_AUTORISE=0) : rien de payant par défaut.' }, req);
        if (!d.confirmationCout) return envoyer(res, 403, { erreur: 'Génération payante non confirmée dans l’application.' }, req);
        if (payantesDuJour() >= PLAFOND_PAYANT) return envoyer(res, 429, { erreur: `Plafond de ${PLAFOND_PAYANT} tâche(s) payante(s) par jour atteint.` }, req);
      }
      const fichiers = { image: await fichier(fd, 'image'), fin: await fichier(fd, 'fin') };
      const t = { id: 's' + crypto.randomBytes(6).toString('hex'), fournisseur: d.fournisseur, payant: !!c.payant, etat: 'envoi', creeLe: new Date().toISOString(), mode: d.mode || 'v1' };
      taches.set(t.id, t); enregistrer();
      try { t.ext = await c.soumettre(d, fichiers, t, VIDEOS); t.etat = 'encours'; enregistrer(); }
      catch (e) { t.etat = 'echec'; t.erreur = caviarder(e.message); enregistrer(); return envoyer(res, 502, { erreur: t.erreur, id: t.id }, req); }
      journal('tâche', t.id, t.fournisseur, 'soumise');
      suivreBoucle(t);
      return envoyer(res, 202, { id: t.id, etat: t.etat }, req);
    }
    const m = /^\/api\/taches\/([\w-]+)(\/video)?$/.exec(u.pathname);
    if (m) {
      const t = taches.get(m[1]); if (!t) return envoyer(res, 404, { erreur: 'Tâche inconnue (purgée après ' + RETENTION_MS / 3600000 + ' h ou serveur réinitialisé).' }, req);
      if (m[2]) return t.etat === 'terminee' && t.cheminVideo ? servirFichier(res, t.cheminVideo, req) : envoyer(res, 409, { erreur: 'Vidéo pas encore prête.' }, req);
      if (req.method === 'DELETE') {
        if (['envoi', 'encours', 'finalisation'].includes(t.etat)) { t.etat = 'annulee'; try { await CONNECTEURS[t.fournisseur].annuler(t); } catch { /* annulation au mieux */ } enregistrer(); }
        return envoyer(res, 200, { id: t.id, etat: t.etat }, req);
      }
      return envoyer(res, 200, { id: t.id, etat: t.etat, progression: t.progression ?? null, message: t.message || null, erreur: t.erreur || null, meta: t.meta || null, creeLe: t.creeLe, finLe: t.finLe || null }, req);
    }
    if (u.pathname.startsWith('/api/')) return envoyer(res, 404, { erreur: 'route inconnue' }, req);
    // fichiers de l'application (lecture seule, sans sortir du dossier)
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    const abs = path.resolve(APP, '.' + p);
    if (!abs.startsWith(APP + path.sep) || /[\\/](serveur|donnees|\.env)/.test(abs.slice(APP.length))) return envoyer(res, 403, { erreur: 'interdit' }, req);
    return servirFichier(res, abs, req);
  } catch (e) { journal('erreur', e.message); envoyer(res, 500, { erreur: caviarder(e.message) }, req); }
});

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  serveur.listen(PORT, HOTE, () => {
    const s = sante();
    journal(`MASSAMBA AI MOTION STUDIO : http://${HOTE}:${PORT}  (payant ${PAYANT ? 'AUTORISÉ' : 'désactivé'})`);
    for (const [k, v] of Object.entries(s.fournisseurs)) journal(`  ${k.padEnd(10)} ${v.configure ? 'configuré' : 'non configuré'}${v.payant ? (v.actif ? ' — actif' : ' — inactif (payant)') : ''}`);
  });
}
export { serveur, valider, sante };
