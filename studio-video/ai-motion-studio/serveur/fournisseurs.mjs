// MASSAMBA AI MOTION STUDIO — connecteurs côté serveur (22/10/2026).
// Les clés restent dans les variables d'environnement de CE processus ; elles ne sont jamais renvoyées, journalisées ni
// écrites sur disque. Chaque connecteur : configure() → bool, soumettre(d, fichiers) → { id, ... }, suivre(t) →
// { etat: 'encours'|'terminee'|'echec'|'annulee', progression?, message?, urlVideo?, cheminVideo?, erreur? }, annuler(t).
// Sources (lues le 22/10/2026) : fal.ai/docs (file d'attente) ; replicate.com/docs/reference/http ; @runwayml/sdk 4.22.0
// (X-Runway-Version 2024-11-06, /v1/image_to_video, /v1/text_to_video, /v1/tasks/{id}) ; lumaai 1.19.1 + docs.lumalabs.ai.
// Kling : documentation officielle non relue en direct (page en JavaScript) — adresse obligatoire en configuration, « à confirmer ».
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const env = (k) => (process.env[k] || '').trim();
const vers64 = (buf, type) => `data:${type || 'image/png'};base64,${buf.toString('base64')}`;
async function json(r) { const t = await r.text(); try { return JSON.parse(t); } catch { return { brut: t.slice(0, 300) }; } }
function erreurHttp(nom, r, j) { return new Error(`${nom} : refus ${r.status}${j && (j.detail || j.error || j.message) ? ' — ' + String(j.detail || j.error?.message || j.error || j.message).slice(0, 200) : ''}`); }

// ------------------------------------------------------------------ fal.ai (file d'attente officielle)
export const fal = {
  nom: 'fal.ai', payant: true,
  configure: () => !!env('FAL_KEY') && !!(env('FAL_MODELE_I2V') || env('FAL_MODELE_T2V')),
  async soumettre(d, f) {
    const modele = d.mode === 'i2v' ? env('FAL_MODELE_I2V') : env('FAL_MODELE_T2V');
    if (!modele) throw new Error(`fal.ai : aucun modèle configuré pour ${d.mode === 'i2v' ? 'image → vidéo (FAL_MODELE_I2V)' : 'texte → vidéo (FAL_MODELE_T2V)'}.`);
    const entree = { prompt: d.prompt };
    if (f.image) entree.image_url = vers64(f.image.buf, f.image.type);   // champ courant des modèles fal image → vidéo ; à vérifier par modèle
    if (d.dureeS) entree.duration = String(Math.round(d.dureeS));
    const r = await fetch(`https://queue.fal.run/${modele}`, { method: 'POST', headers: { Authorization: `Key ${env('FAL_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify(entree) });
    const j = await json(r); if (!r.ok) throw erreurHttp('fal.ai', r, j);
    return { id: j.request_id, status_url: j.status_url, response_url: j.response_url, cancel_url: j.cancel_url };
  },
  async suivre(t) {
    const h = { Authorization: `Key ${env('FAL_KEY')}` };
    const r = await fetch(t.ext.status_url, { headers: h }); const j = await json(r); if (!r.ok) throw erreurHttp('fal.ai', r, j);
    if (j.status === 'IN_QUEUE') return { etat: 'encours', message: `En file (position ${j.queue_position ?? '?'})` };
    if (j.status === 'IN_PROGRESS') return { etat: 'encours' };
    if (j.status === 'COMPLETED') {
      if (j.error) return { etat: 'echec', erreur: `fal.ai : ${j.error}` };
      const rr = await fetch(t.ext.response_url, { headers: h }); const res = await json(rr); if (!rr.ok) throw erreurHttp('fal.ai', rr, res);
      const url = res?.video?.url || res?.videos?.[0]?.url || res?.output?.video?.url;
      return url ? { etat: 'terminee', urlVideo: url } : { etat: 'echec', erreur: 'fal.ai : réponse sans vidéo' };
    }
    return { etat: 'encours', message: j.status };
  },
  async annuler(t) { if (t.ext?.cancel_url) await fetch(t.ext.cancel_url, { method: 'PUT', headers: { Authorization: `Key ${env('FAL_KEY')}` } }); }
};

// ------------------------------------------------------------------ Replicate (schéma d'entrée lu en direct)
export const replicate = {
  nom: 'Replicate', payant: true,
  configure: () => !!env('REPLICATE_API_TOKEN') && /^[\w.-]+\/[\w.-]+$/.test(env('REPLICATE_MODELE')),
  async schema() {
    const r = await fetch(`https://api.replicate.com/v1/models/${env('REPLICATE_MODELE')}`, { headers: { Authorization: `Bearer ${env('REPLICATE_API_TOKEN')}` } });
    const j = await json(r); if (!r.ok) throw erreurHttp('Replicate', r, j);
    return j?.latest_version?.openapi_schema?.components?.schemas?.Input?.properties || {};
  },
  async soumettre(d, f) {
    const p = await this.schema(); const entree = {};
    const cle = (...c) => c.find((k) => k in p);
    const kp = cle('prompt'); if (!kp) throw new Error('Replicate : ce modèle n’a pas d’entrée « prompt ».'); entree[kp] = d.prompt;
    if (f.image) { const k = cle('image', 'start_image', 'first_frame_image', 'input_image', 'first_frame'); if (!k) throw new Error('Replicate : ce modèle n’accepte pas d’image de départ.'); entree[k] = vers64(f.image.buf, f.image.type); }
    if (f.fin) { const k = cle('end_image', 'last_frame_image', 'last_image', 'last_frame'); if (!k) throw new Error('Replicate : ce modèle n’accepte pas d’image de fin.'); entree[k] = vers64(f.fin.buf, f.fin.type); }
    const kd = cle('duration', 'seconds'); if (kd && d.dureeS) entree[kd] = p[kd]?.type === 'integer' ? Math.round(d.dureeS) : d.dureeS;
    const ka = cle('aspect_ratio'); if (ka && d.format) entree[ka] = d.format;
    const r = await fetch(`https://api.replicate.com/v1/models/${env('REPLICATE_MODELE')}/predictions`, { method: 'POST', headers: { Authorization: `Bearer ${env('REPLICATE_API_TOKEN')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ input: entree }) });
    const j = await json(r); if (!r.ok) throw erreurHttp('Replicate', r, j);
    return { id: j.id };
  },
  async suivre(t) {
    const r = await fetch(`https://api.replicate.com/v1/predictions/${t.ext.id}`, { headers: { Authorization: `Bearer ${env('REPLICATE_API_TOKEN')}` } });
    const j = await json(r); if (!r.ok) throw erreurHttp('Replicate', r, j);
    if (j.status === 'succeeded') { const o = Array.isArray(j.output) ? j.output[0] : (j.output?.video || j.output); return typeof o === 'string' ? { etat: 'terminee', urlVideo: o, enTetesTelechargement: { Authorization: `Bearer ${env('REPLICATE_API_TOKEN')}` } } : { etat: 'echec', erreur: 'Replicate : sortie sans vidéo' }; }
    if (j.status === 'failed') return { etat: 'echec', erreur: `Replicate : ${j.error || 'échec'}` };
    if (j.status === 'canceled') return { etat: 'annulee' };
    return { etat: 'encours', message: j.status === 'starting' ? 'Démarrage du modèle' : 'Calcul en cours' };
  },
  async annuler(t) { await fetch(`https://api.replicate.com/v1/predictions/${t.ext.id}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${env('REPLICATE_API_TOKEN')}` } }); }
};

// ------------------------------------------------------------------ Runway (API développeur officielle)
const RUNWAY = 'https://api.dev.runwayml.com';
const hRunway = () => ({ Authorization: `Bearer ${env('RUNWAYML_API_SECRET')}`, 'X-Runway-Version': '2024-11-06', 'Content-Type': 'application/json' });
const RATIOS = { '16:9': '1280:720', '9:16': '720:1280', '1:1': '960:960' };
export const runway = {
  nom: 'Runway', payant: true,
  configure: () => !!env('RUNWAYML_API_SECRET'),
  async soumettre(d, f) {
    const modele = d.modele || 'gen4_turbo';
    const corps = { model: modele, promptText: String(d.prompt).slice(0, 1000), ratio: RATIOS[d.format] || '1280:720' };
    if (d.dureeS) corps.duration = Math.round(d.dureeS);
    let route = '/v1/text_to_video';
    if (f.image) {
      if (f.image.buf.length > 5 * 1024 * 1024) throw new Error('Runway : image de départ limitée à 5 Mo en data URI.');
      route = '/v1/image_to_video';
      corps.promptImage = f.fin ? [{ uri: vers64(f.image.buf, f.image.type), position: 'first' }, { uri: vers64(f.fin.buf, f.fin.type), position: 'last' }] : vers64(f.image.buf, f.image.type);
    }
    const r = await fetch(RUNWAY + route, { method: 'POST', headers: hRunway(), body: JSON.stringify(corps) });
    const j = await json(r); if (!r.ok) throw erreurHttp('Runway', r, j);
    return { id: j.id };
  },
  async suivre(t) {
    const r = await fetch(`${RUNWAY}/v1/tasks/${t.ext.id}`, { headers: hRunway() }); const j = await json(r); if (!r.ok) throw erreurHttp('Runway', r, j);
    if (j.status === 'SUCCEEDED') return j.output?.[0] ? { etat: 'terminee', urlVideo: j.output[0] } : { etat: 'echec', erreur: 'Runway : sortie vide' };
    if (j.status === 'FAILED') return { etat: 'echec', erreur: `Runway : ${j.failure || 'échec'}` };
    if (j.status === 'CANCELLED') return { etat: 'annulee' };
    return { etat: 'encours', progression: typeof j.progress === 'number' ? j.progress : null, message: j.status === 'THROTTLED' ? 'Mis en attente par Runway (limite de votre compte)' : null };
  },
  async annuler(t) { await fetch(`${RUNWAY}/v1/tasks/${t.ext.id}`, { method: 'DELETE', headers: hRunway() }); }
};

// ------------------------------------------------------------------ Luma (Dream Machine)
const LUMA = 'https://api.lumalabs.ai/dream-machine/v1';
const hLuma = () => ({ Authorization: `Bearer ${env('LUMAAI_API_KEY')}`, 'Content-Type': 'application/json' });
export const luma = {
  nom: 'Luma', payant: true,
  configure: () => !!env('LUMAAI_API_KEY'),
  async soumettre(d, f) {
    if (f.image || f.fin) throw new Error('Luma exige des images accessibles par une URL publique : un fichier local ne peut pas être envoyé tel quel. Utilisez Luma en texte → vidéo, ou un autre moteur pour l’image → vidéo.');
    const corps = { prompt: d.prompt, model: d.modele || 'ray-2', aspect_ratio: d.format || '16:9', duration: d.dureeS > 6 ? '9s' : '5s' };
    const r = await fetch(`${LUMA}/generations`, { method: 'POST', headers: hLuma(), body: JSON.stringify(corps) });
    const j = await json(r); if (!r.ok) throw erreurHttp('Luma', r, j);
    return { id: j.id };
  },
  async suivre(t) {
    const r = await fetch(`${LUMA}/generations/${t.ext.id}`, { headers: hLuma() }); const j = await json(r); if (!r.ok) throw erreurHttp('Luma', r, j);
    if (j.state === 'completed') return j.assets?.video ? { etat: 'terminee', urlVideo: j.assets.video } : { etat: 'echec', erreur: 'Luma : vidéo absente' };
    if (j.state === 'failed') return { etat: 'echec', erreur: `Luma : ${j.failure_reason || 'échec'}` };
    return { etat: 'encours', message: j.state === 'queued' ? 'En file chez Luma' : null };
  },
  async annuler(t) { await fetch(`${LUMA}/generations/${t.ext.id}`, { method: 'DELETE', headers: hLuma() }); }
};

// ------------------------------------------------------------------ Kling (API officielle, à confirmer)
function jwtKling() {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); const now = Math.floor(Date.now() / 1000);
  const tete = b({ alg: 'HS256', typ: 'JWT' }), corps = b({ iss: env('KLING_ACCESS_KEY'), exp: now + 1800, nbf: now - 5 });
  return `${tete}.${corps}.${crypto.createHmac('sha256', env('KLING_SECRET_KEY')).update(`${tete}.${corps}`).digest('base64url')}`;
}
export const kling = {
  nom: 'Kling', payant: true,
  configure: () => !!(env('KLING_ACCESS_KEY') && env('KLING_SECRET_KEY') && /^https:\/\//.test(env('KLING_API_BASE')) && env('KLING_MODELE')),
  async soumettre(d, f) {
    const sorte = f.image ? 'image2video' : 'text2video';
    const corps = { model_name: env('KLING_MODELE'), prompt: d.prompt, duration: String(d.dureeS > 7 ? 10 : 5) };
    if (f.image) corps.image = f.image.buf.toString('base64');
    const r = await fetch(`${env('KLING_API_BASE').replace(/\/$/, '')}/v1/videos/${sorte}`, { method: 'POST', headers: { Authorization: `Bearer ${jwtKling()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const j = await json(r); if (!r.ok || (j.code != null && j.code !== 0)) throw erreurHttp('Kling', r, j);
    return { id: j.data?.task_id, sorte };
  },
  async suivre(t) {
    const r = await fetch(`${env('KLING_API_BASE').replace(/\/$/, '')}/v1/videos/${t.ext.sorte}/${t.ext.id}`, { headers: { Authorization: `Bearer ${jwtKling()}` } });
    const j = await json(r); if (!r.ok) throw erreurHttp('Kling', r, j);
    const s = j.data?.task_status;
    if (s === 'succeed') { const u = j.data?.task_result?.videos?.[0]?.url; return u ? { etat: 'terminee', urlVideo: u } : { etat: 'echec', erreur: 'Kling : vidéo absente' }; }
    if (s === 'failed') return { etat: 'echec', erreur: `Kling : ${j.data?.task_status_msg || 'échec'}` };
    return { etat: 'encours' };
  },
  async annuler() { /* annulation non documentée de façon vérifiable : la tâche se termine chez Kling */ }
};

// ------------------------------------------------------------------ moteur V1 de la troupe (local, gratuit)
const ICI = path.dirname(new URL(import.meta.url).pathname);
export const moteurV1 = {
  nom: 'Moteur V1 (local)', payant: false,
  python: () => env('PYTHON') || 'python3',
  configure: () => fs.existsSync(path.resolve(env('MOTEUR_V1_DIR') || path.join(ICI, '..', '..', 'moteur-troupe'), 'usine.py')) && !!env('MASSAMBA_BIBLIO'),
  executer(args, opts = {}) {
    return new Promise((res, rej) => {
      const p = spawn(this.python(), [path.join(ICI, 'moteur_v1.py'), ...args], { env: process.env, cwd: ICI, ...opts });
      let out = '', err = ''; p.stdout.on('data', (b) => { out += b; }); p.stderr.on('data', (b) => { err += b; if (err.length > 20000) err = err.slice(-20000); });
      p.on('close', (code) => {
        const derniere = out.trim().split('\n').pop() || '';
        try { const j = JSON.parse(derniere); if (j.erreur) return rej(new Error('Moteur V1 : ' + j.erreur)); return res(j); } catch { return rej(new Error(`Moteur V1 : sortie illisible (code ${code}) ${err.slice(-400)}`)); }
      });
      if (opts.surProcessus) opts.surProcessus(p);
    });
  },
  catalogue() { return this.executer(['catalogue']); },
  prechauffe() { return this.executer(['prechauffe']); },
  controle(demande, dossier) { const f = path.join(dossier, `controle-${Date.now()}.json`); fs.writeFileSync(f, JSON.stringify(demande)); return this.executer(['controle', f]).finally(() => fs.rmSync(f, { force: true })); },
  async soumettre(d, f, t, dossier) {
    const rep = path.join(dossier, `v1-${t.id}`); fs.mkdirSync(rep, { recursive: true });
    const fj = path.join(rep, 'demande.json'); fs.writeFileSync(fj, JSON.stringify({ id: `APP-${t.id}`, sketchs: d.sketchs || [] }));
    t.ext = { rep };
    t._promesse = this.executer(['tourne', fj, rep], { surProcessus: (p) => { t._processus = p; } })
      .then((r) => { t._resultat = r; }, (e) => { t._erreur = e.message; });
    return { id: t.id, rep };
  },
  async suivre(t) {
    if (t._erreur) return { etat: 'echec', erreur: t._erreur };
    if (t._resultat) return { etat: 'terminee', cheminVideo: t._resultat.video, meta: { secondes: t._resultat.secondes, sketchs: t._resultat.sketchs, legende: t._resultat.legende } };
    if (!t._promesse) return { etat: 'echec', erreur: 'Moteur V1 : tâche perdue (serveur redémarré).' };
    let message = 'Tournage en cours';
    try { const l = fs.readFileSync(path.join(t.ext.rep, 'v1-usine.log'), 'utf8').trim().split('\n').filter(Boolean).pop(); if (l) message = 'Moteur V1 : ' + l.slice(0, 140); } catch { /* journal pas encore créé */ }
    return { etat: 'encours', message };
  },
  async annuler(t) { if (t._processus) t._processus.kill('SIGTERM'); }
};

export const CONNECTEURS = { fal, replicate, runway, luma, kling, 'moteur-v1': moteurV1 };
