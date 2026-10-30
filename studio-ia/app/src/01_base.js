"use strict";
/* ============================================================================================================
   Studio Comédie Abidjan — socle : réglages, gabarits de prompts, mémoire locale (IndexedDB), appels OpenRouter.
   Les gabarits de prompts sont ceux du pipeline Python (generer.py) qui ont passé les tests 1 à 10.
   ============================================================================================================ */

const API = "https://openrouter.ai/api/v1";
const PRIX = { image: 0.034, video_seconde: 0.02, video_image: 0.01, controle: 0.006 };   // dollars, mesurés aux tests

// ---------- gabarits de prompts (repris mot pour mot de generer.py) ----------
const STYLE = "3D animated cartoon still in Pixar/DreamWorks style, West African comedy sketch set in Abidjan, Cote d'Ivoire. " +
  "All characters are Black Ivorian people with deep dark-brown skin and African facial features, " +
  "big expressive eyes, exaggerated comedic expressions and body language.";
const FINITION = "Full-bleed image filling the whole frame edge to edge, no black borders. Characters fully visible from head to knees, clear readable faces, warm cinematic lighting, " +
  "vibrant saturated colors, high detail, clean composition, no text, no letters, no logo, no watermark.";
const REALISME_IMAGE = "Realistic natural staging: believable poses, correct anatomy with five fingers per hand, props that are " +
  "physically plausible and held naturally, characters placed so they can all stay in frame.";
const VOIX = "VOICE DIRECTION (most important): every character speaks French with a heavy, authentic Ivorian accent from " +
  "Abidjan, Cote d'Ivoire - Abidjan street French with Nouchi intonation, West African rhythm and melody, rolled R - " +
  "NOT a Parisian or standard France French accent. Warm, loud, lively, natural voices like real Ivorian people joking " +
  "in the neighborhood: deep Ivorian voices for men, Ivorian women's voices for women, child voices for children. " +
  "No background music, no subtitles, no text on screen.";
const REALISME = "REALISM AND CONTINUITY (strict, as important as the voices): one single continuous shot that starts exactly on " +
  "this image, steady camera, no cuts, no scene change. Every character and every object of the first frame stays " +
  "present and identical for the whole video: nobody and nothing appears, disappears, duplicates, teleports or " +
  "changes face, clothes, hair, size or position suddenly; no new character enters the frame. Natural, physically " +
  "plausible human movement at normal speed, with real weight and balance: hands with five fingers, no extra limbs, " +
  "no stretching, no morphing, no floating objects. Small believable gestures (pointing, shrugging, leaning, hands " +
  "on hips, head turns, facial expressions); only the character who is speaking moves the lips, the others listen " +
  "and react naturally. Each action follows the previous one in a clear logical order, smooth and readable, " +
  "without glitches. The final close-up is a slow smooth camera push-in, never a jump cut.";
const SYNCHRO = "SPEAKING ORDER (strict): the numbered lines below are spoken one after another, each ONLY by the character named, " +
  "with that character's own lips moving and the voice type given; all the other characters keep their mouths " +
  "closed while they listen. The final reaction and the camera push-in start only AFTER the last line has been " +
  "completely spoken; during the final close-up nobody speaks and all mouths stay closed.";
// renfort du choc humoristique dans le jeu d'acteur (même esprit que « punchy comedic timing » du pipeline Python)
const CHOC = "Pixar-style 3D cartoon acting, punchy comedic timing, accurate lip-sync: a tiny beat of silence right before the " +
  "last line, the last line is delivered with total confidence, then the reaction is BIG, frozen and readable (wide eyes, " +
  "dropped jaw) like the best cartoon punchlines.";

function normaliser(texte) {
  return (texte || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]+/g) || [];
}
function motsDialogue(s) { return s.dialogue.reduce((n, [, t]) => n + normaliser(t).length, 0); }
// débit mesuré chez Grok : ≈ 3 mots par seconde, + 2 s pour la chute et la réaction finale
function dureeClip(s) {
  const d = Math.round(+s.duree);                // une durée importée illisible (« 10 s ») ne doit jamais fausser le budget
  return d >= 3 && d <= 15 ? d : Math.min(12, Math.max(6, Math.round(motsDialogue(s) / 3 + 2)));
}
function majuscule1(t) { return t ? t[0].toUpperCase() + t.slice(1) : t; }

function voixDe(p) {
  const d = (p.nom + " " + p.desc).toLowerCase();
  const m = d.match(/around (\d+)/);
  const enfant = /\b(baby|boy|girl|child|kid|schoolboy|schoolgirl|son|daughter|grandson|granddaughter)\b/.test(d) &&
    !/in (her|his) (20s|30s|40s)/.test(d);
  if (enfant || (m && +m[1] < 15)) return "child's voice";
  if (/\b(woman|wife|mother|mamie|aunt|sister|lady|grandmother|girlfriend|bride|nurse|seller in her|teacher in her|her \d0s|in her)\b/.test(d))
    return "adult woman's voice";
  return "adult man's voice";
}
function promptImage(s) {
  const persos = s.persos.map((p) => `${majuscule1(p.desc)}, ${p.pose}.`).join(" ");
  return `${STYLE} Scene: ${s.lieu}. ${persos} ${REALISME_IMAGE} ${FINITION}`;
}
function promptVideo(s) {
  const noms = s.persos.map((p) => p.nom);
  const lignes = s.dialogue.map(([i, t], k) =>
    `Line ${k + 1}, spoken only by ${noms[i].toUpperCase()} (${voixDe(s.persos[i])}, heavy Ivorian accent): "${t}"`).join(" ");
  const chute = s.chute || `At the very end, the camera slowly pushes in to a close-up of ${noms[s.fin]}'s face reacting in cartoon shock, looking straight into the camera.`;
  return `${VOIX} ${REALISME} Animate this exact image, keep the same characters, faces, skin tones and setting. ${CHOC} ` +
    `${s.jeu} ${chute} ${SYNCHRO} Dialogue: ${lignes}`;
}
// prix à la seconde selon la résolution choisie (mesuré sur grok-imagine-video : 480p ≈ 0,02 $/s, 720p ≈ 0,03 $/s)
function prixSeconde() { return R.resolution === "720p" ? 0.03 : PRIX.video_seconde; }
function coutVideo(s) { return dureeClip(s) * prixSeconde() + PRIX.video_image; }
function coutEstime(s, image = true, video = true) {
  return (image ? PRIX.image : 0) + (video ? coutVideo(s) : 0);
}

// ---------- réglages (localStorage ; la clé API n'y est écrite que si l'utilisateur coche « se souvenir ») ----------
const REGLAGES_DEFAUT = {
  modeleImage: "google/gemini-3.1-flash-lite-image",
  modeleVideo: "x-ai/grok-imagine-video-1.5-lite",
  modeleJuge: "google/gemini-3.8-flash",
  resolution: "480p", format: "4:3",
  budget: 1.0, plancher: 0.4,
  concurrenceImages: 2, concurrenceVideos: 3,
  controle: true, repriseAuto: false,
  nom: "MA CHAÎNE", pseudo: "@ma_chaine",
  accroche1: "ATTENDS LE DERNIER…", accroche2: "C'EST GÂTÉ !",
  creditGags: "(CC BY) Blender Foundation | studio.blender.org",
  seSouvenir: false,
};
const R = Object.assign({}, REGLAGES_DEFAUT, lireJSON(localStorage, "studio-reglages") || {});
let CLE = sessionStorage.getItem("studio-cle") || localStorage.getItem("studio-cle") || "";

function lireJSON(stock, cle) { try { return JSON.parse(stock.getItem(cle)); } catch (e) { return null; } }
function sauverReglages() {
  const copie = Object.assign({}, R);
  localStorage.setItem("studio-reglages", JSON.stringify(copie));
}
function definirCle(cle, souvenir) {
  CLE = (cle || "").trim();
  sessionStorage.setItem("studio-cle", CLE);
  if (souvenir) localStorage.setItem("studio-cle", CLE); else localStorage.removeItem("studio-cle");
}

// ---------- mémoire locale : IndexedDB (états, fichiers, journal des dépenses) ----------
const DB = (() => {
  let base = null;
  function ouvrir() {
    if (base) return Promise.resolve(base);
    return new Promise((ok, ko) => {
      const r = indexedDB.open("studio-comedie", 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        db.createObjectStore("etat");
        db.createObjectStore("fichiers");
        db.createObjectStore("journal", { autoIncrement: true });
        db.createObjectStore("sketchs");
      };
      r.onsuccess = () => { base = r.result; ok(base); };
      r.onerror = () => ko(r.error);
    });
  }
  async function tx(magasin, mode, action) {
    const db = await ouvrir();
    return new Promise((ok, ko) => {
      const t = db.transaction(magasin, mode);
      const req = action(t.objectStore(magasin));          // une requête IndexedDB : son résultat est lu à la fin
      t.oncomplete = () => ok(req ? req.result : undefined);
      t.onerror = () => ko(t.error);
      t.onabort = () => ko(t.error);
    });
  }
  return {
    get: (m, k) => tx(m, "readonly", (st) => st.get(k)),
    put: (m, k, v) => tx(m, "readwrite", (st) => (m === "journal" ? st.add(v) : st.put(v, k))),
    del: (m, k) => tx(m, "readwrite", (st) => st.delete(k)),
    tout: (m) => tx(m, "readonly", (st) => st.getAll()),
    entrees: async (m) => {                  // [clé, valeur] lus dans UNE transaction (clés et valeurs toujours alignées)
      const db = await ouvrir();
      return new Promise((ok, ko) => {
        const t = db.transaction(m, "readonly"), res = [];
        t.objectStore(m).openCursor().onsuccess = (ev) => { const c = ev.target.result; if (c) { res.push([c.key, c.value]); c.continue(); } };
        t.oncomplete = () => ok(res);
        t.onerror = () => ko(t.error);
      });
    },
    cles: (m) => tx(m, "readonly", (st) => st.getAllKeys()),
    vider: (m) => tx(m, "readwrite", (st) => st.clear()),
  };
})();

// ---------- journal des dépenses ----------
const DEPENSES = { session: 0, total: 0 };
async function noterDepense(genre, modele, cout, ref) {
  const c = +cout || 0;
  DEPENSES.session += c;
  DEPENSES.total += c;
  majEntete();
  await DB.put("journal", null, { t: Date.now(), genre, modele, cout: c, ref });
}
async function chargerDepenses() {
  const j = await DB.tout("journal");
  DEPENSES.total = j.reduce((a, x) => a + (+x.cout || 0), 0);
}

// ---------- appels OpenRouter ----------
class ErreurAPI extends Error {
  constructor(statut, texte) { super(`OpenRouter ${statut} : ${texte}`); this.statut = statut; }
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Un GET est rejoué après une erreur passagère. Un POST (payant) n'est rejoué QUE sur 429 : c'est la seule réponse qui
// garantit que rien n'a été créé ; après une 5xx ou une coupure, le travail a pu être créé et payé, l'erreur est
// marquée « incertaine » pour que l'utilisateur vérifie avant de relancer. La clé n'est envoyée qu'à openrouter.ai.
async function api(chemin, { methode = "GET", corps = null, brut = false, essais = 4 } = {}) {
  if (!CLE) throw new ErreurAPI(401, "aucune clé API (onglet Réglages)");
  if (chemin.startsWith("http") && !chemin.startsWith(API + "/")) throw new ErreurAPI(400, `adresse refusée : ${chemin.slice(0, 60)}`);
  const url = chemin.startsWith("http") ? chemin : API + chemin;
  const payant = methode !== "GET";
  const idem = payant && crypto.randomUUID ? crypto.randomUUID() : null;
  let derniere = null;
  for (let k = 0; k < essais; k++) {
    let r;
    try {
      r = await fetch(url, {
        method: methode,
        headers: Object.assign({ Authorization: `Bearer ${CLE}`, "X-Title": "Studio Comedie Abidjan" },
          corps ? { "Content-Type": "application/json" } : {}, idem ? { "Idempotency-Key": idem } : {}),
        body: corps ? JSON.stringify(corps) : undefined,
      });
    } catch (e) {                                   // coupure réseau : la requête a pu arriver
      derniere = new ErreurAPI(0, `connexion coupée (${e.message})`);
      if (payant) { derniere.incertain = true; throw derniere; }
      await dormir(2000 * 2 ** k);
      continue;
    }
    if (r.ok) return brut ? r : r.json();
    const texte = (await r.text().catch(() => "")).slice(0, 400);
    derniere = new ErreurAPI(r.status, texte);
    // erreurs définitives : pas de nouvel essai (clé, crédit, requête refusée, contenu expiré)
    if ([400, 401, 402, 403, 404, 410, 422].includes(r.status)) throw derniere;
    if (payant && r.status !== 429) { derniere.incertain = r.status >= 500; throw derniere; }
    await dormir(2000 * 2 ** k);
  }
  throw derniere;
}

// solde utilisable = le plus petit entre la limite propre à la clé (null si la clé n'a pas de limite) et le crédit du compte
async function infoCle() {
  const d = (await api("/key")).data || {};
  let compte = null;
  try { const c = (await api("/credits", { essais: 1 })).data || {}; if (c.total_credits != null) compte = c.total_credits - (c.total_usage || 0); } catch (e) { /* facultatif */ }
  const valeurs = [d.limit_remaining, compte].filter((x) => x != null && Number.isFinite(+x)).map(Number);
  return { reste: valeurs.length ? Math.min(...valeurs) : null, limite: d.limit, compte, usage: d.usage };
}

function blobVersDataURL(blob) {
  return new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ko(r.error); r.readAsDataURL(blob); });
}
function b64VersBlob(b64) {
  const bin = atob(b64);
  const oct = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) oct[i] = bin.charCodeAt(i);
  const png = oct[0] === 0x89 && oct[1] === 0x50;
  return new Blob([oct], { type: png ? "image/png" : "image/jpeg" });
}

async function genererImage(s) {
  const d = await api("/images", { methode: "POST", corps: { model: R.modeleImage, prompt: promptImage(s), aspect_ratio: R.format } });
  const item = (d.data || [])[0];
  if (!item || !item.b64_json) throw new ErreurAPI(500, "réponse image sans contenu");
  const cout = (d.usage || {}).cost;
  await noterDepense("image", R.modeleImage, cout ?? PRIX.image, s.id);
  return { blob: b64VersBlob(item.b64_json), cout: +cout || PRIX.image };
}

async function lancerVideo(s, imageBlob) {
  const url = await blobVersDataURL(imageBlob);
  const d = await api("/videos", {
    methode: "POST", corps: {
      model: R.modeleVideo, prompt: promptVideo(s), duration: dureeClip(s), resolution: R.resolution,
      aspect_ratio: R.format, generate_audio: true,
      frame_images: [{ type: "image_url", image_url: { url }, frame_type: "first_frame" }],
    },
  });
  if (!d.id) throw new ErreurAPI(500, "réponse vidéo sans identifiant");
  return d.id;
}

async function etatVideo(job) { return api(`/videos/${job}`); }

// toujours par l'adresse d'OpenRouter (jamais par une URL de stockage tierce, qui recevrait la clé)
async function telechargerVideo(job) {
  const r = await api(`/videos/${job}/content?index=0`, { brut: true });
  const b = await r.blob();
  if (b.size < 1000) throw new ErreurAPI(500, "fichier vidéo vide");
  return b;
}

// chaque appel du juge est noté dès sa réponse : un appel suivant qui échoue ne fait pas oublier celui-ci
async function chatJuge(contenu, ref) {
  const d = await api("/chat/completions", { methode: "POST", corps: { model: R.modeleJuge, messages: [{ role: "user", content: contenu }] } });
  const cout = +(d.usage || {}).cost || PRIX.controle;
  await noterDepense("controle", R.modeleJuge, cout, ref).catch(() => {});
  return { texte: (((d.choices || [])[0] || {}).message || {}).content || "", cout };
}

// ---------- dossier de sortie (File System Access API, Chrome / Edge) ----------
// Le dossier choisi est gardé dans IndexedDB ; Chrome redemande l'autorisation à la réouverture (au premier clic).
let DOSSIER = null;
async function choisirDossier() {
  if (!window.showDirectoryPicker) { alerte("Ce navigateur ne permet pas de choisir un dossier : les images et les clips restent dans le navigateur, télécharge-les depuis leur carte.", "attention"); return null; }
  DOSSIER = await window.showDirectoryPicker({ mode: "readwrite" });
  await DB.put("fichiers", "config:dossier", DOSSIER).catch(() => {});
  return DOSSIER;
}
async function chargerDossier() {
  const d = await DB.get("fichiers", "config:dossier").catch(() => null);
  if (d && d.queryPermission) DOSSIER = d;
  return DOSSIER;
}
async function autoriserDossier() {               // à appeler pendant un clic (Chrome l'exige)
  if (!DOSSIER || !DOSSIER.queryPermission) return false;
  try {
    if ((await DOSSIER.queryPermission({ mode: "readwrite" })) === "granted") return true;
    return (await DOSSIER.requestPermission({ mode: "readwrite" })) === "granted";
  } catch (e) { return false; }
}
async function ecrireFichier(sousDossier, nom, blob) {
  if (!DOSSIER) return false;
  try { if ((await DOSSIER.queryPermission({ mode: "readwrite" })) !== "granted") return false; } catch (e) { return false; }
  try {
    const d = sousDossier ? await DOSSIER.getDirectoryHandle(sousDossier, { create: true }) : DOSSIER;
    const f = await d.getFileHandle(nom, { create: true });
    const w = await f.createWritable();
    await w.write(blob);
    await w.close();
    return true;
  } catch (e) { console.warn("écriture impossible", e); return false; }
}
function telecharger(nom, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

// ---------- petits outils d'interface ----------
const $ = (sel, racine = document) => racine.querySelector(sel);
const $$ = (sel, racine = document) => [...racine.querySelectorAll(sel)];
function el(tag, attrs = {}, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, "");
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of enfants.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
function alerte(texte, type = "info") {
  const zone = $("#alertes");
  const a = el("div", { class: `alerte ${type}` }, texte);
  zone.append(a);
  setTimeout(() => a.remove(), type === "erreur" ? 12000 : 5000);
}
function dollars(x) { return (x == null || isNaN(x)) ? "—" : `${(+x).toFixed(2)} $`; }
function majEntete() {
  const d = $("#depense-session");
  if (d) d.textContent = dollars(DEPENSES.session);
  const t = $("#depense-total");
  if (t) t.textContent = dollars(DEPENSES.total);
}
