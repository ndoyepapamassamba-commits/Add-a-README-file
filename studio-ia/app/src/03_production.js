"use strict";
/* ============================================================================================================
   Production : file d'attente image → vidéo → contrôle IA, plafond de budget, reprise après fermeture.
   Règles d'argent : (1) chaque dépense est RÉSERVÉE avant son premier « await », donc deux lancements d'un même tour ne
   voient jamais le même budget ; (2) une requête payante n'est jamais renvoyée à l'aveugle (voir api()) ; (3) une vidéo
   lancée garde son identifiant et est récupérée même après fermeture de la page (le contenu expire chez OpenRouter au
   bout de quelques heures) ; (4) un seul onglet produit à la fois.
   ============================================================================================================ */

let FILE = lireJSON(localStorage, "studio-file") || [];
const RUN = { actif: false, pause: false, enCours: new Set(), engage: 0, derniereVerifCle: 0, resteCle: null, sessionVerif: 0,
  lecture: null, interroge: new Map(), repris: false, seul: true, alerteSolde: false };
// étapes payantes en cours : un sketch dans l'une d'elles n'est jamais retiré, vidé ni relancé
const EN_VOL = ["image", "video_envoi", "video_lancee", "controle"];
const DEJA_OUVERT = "Le studio est déjà ouvert dans un autre onglet : la production ne marche que dans un seul onglet à la " +
  "fois (sinon tout serait payé deux fois). Ferme cet onglet et utilise l'autre.";
const MAX_CONTROLES = 2;

const QUESTION_REGARD = (d, persos) => `Ces 16 images sont extraites DANS L'ORDRE (de gauche à droite, ligne par ligne, temps en jaune) d'un même plan ` +
  `d'animation 3D de ${d.toFixed(0)} secondes. Personnages prévus : ${persos}. Juge la CONTINUITÉ DES PERSONNAGES. ` +
  `GRAVE = un personnage disparaît ou apparaît d'un coup, se transforme en un autre, fusionne avec un autre, se ` +
  `dédouble, change franchement de visage, de corps ou de tenue, ou un corps se déforme (membre en trop, étirement). ` +
  `MINEUR = seulement un petit objet ou un détail du décor qui change, ou un léger changement de maquillage / motif ` +
  `pendant un zoom. NE SONT PAS des défauts : un personnage qui se lève, s'assoit, marche ou sort normalement du ` +
  `cadre, un zoom ou un recadrage vers un visage. ` +
  `Réponds sur UNE ligne : REALISME=OK ou REALISME=MINEUR ou REALISME=GRAVE ; puis le défaut précis avec le temps.`;
const QUESTION_ACCENT = "Écoute les voix de ce sketch. Juge la PRONONCIATION (R roulé ou R du fond de la gorge, mélodie, " +
  "rythme, voyelles), PAS les mots : des mots ivoiriens (« dêh », « là », « ya fohi ») dits avec une prononciation de France " +
  "= français de France. Réponds sur UNE ligne au format : ACCENT=<ivoirien|ouest-africain|" +
  "africain autre|français de France|autre> ; NATUREL=<note sur 10> ; DRÔLE=<note sur 10> ; remarque courte.";
const QUESTION_SYNCHRO = (persos) => `Images extraites d'un plan d'animation 3D, deux par réplique, dans l'ordre. Sur chaque image est écrit ` +
  `le numéro de la réplique et LE PERSONNAGE QUI DOIT PARLER à ce moment. Personnages : ${persos}. Pour chaque ` +
  `réplique : le personnage indiqué est-il bien visible et en train de parler (bouche ouverte ou qui bouge) ? ` +
  `Est-ce plutôt un AUTRE personnage qui parle, ou qui est seul en gros plan à sa place ? ` +
  `Réponds sur UNE ligne : SYNCHRO=OK ou SYNCHRO=ERREUR ; puis le numéro de la réplique fautive et ce qu'on voit.`;

function sauverFile() { localStorage.setItem("studio-file", JSON.stringify(FILE)); }
async function majEtat(id, champs) {
  const e = Object.assign({}, ETATS.get(id) || {}, champs, { maj: Date.now() });
  ETATS.set(id, e);                     // la mémoire d'abord : même si l'écriture échoue, l'onglet garde le bon état
  afficherCarte(id);
  majResume();
  await DB.put("etat", id, e);
  return e;
}
const statutDe = (id) => (ETATS.get(id) || {}).statut;

function ajouterFile(ids) {
  if (!RUN.seul) { alerte(DEJA_OUVERT, "erreur"); return; }
  let n = 0;
  for (const id of ids) if (SKETCHS.has(id) && !FILE.includes(id)) { FILE.push(id); n++; }
  sauverFile();
  for (const id of ids) {
    const s = SKETCHS.get(id);
    if (!s) continue;
    // copie du sketch : il reste lisible même si une nouvelle version de la banque ne le contient plus
    DB.put("sketchs", id, s).catch(() => {});
    if (!ETATS.get(id)) majEtat(id, { statut: "attente", couts: {}, essaisVideo: 0 }).catch(() => {});
  }
  afficherProduction();
  alerte(`${n} sketch(s) ajouté(s) à la production. Estimation : ${dollars(ids.reduce((a, id) => a + (SKETCHS.has(id) ? coutEstime(SKETCHS.get(id)) : 0), 0))}.`);
}
// une vidéo en vol hors de la file (ancienne version, retrait pendant un envoi) y est remise : elle est payée
function rattacherEnVol() {
  let n = 0;
  for (const [id, e] of ETATS) if (["video_envoi", "video_lancee"].includes(e.statut) && !FILE.includes(id)) { FILE.push(id); n++; }
  if (n) { sauverFile(); afficherProduction(); }
}

// ---------- budget ----------
function coutRestantFile() {
  let c = 0;
  for (const id of FILE) {
    const e = ETATS.get(id) || {}, s = SKETCHS.get(id);
    if (!s) continue;
    if (!e.statut || e.statut === "attente" || e.statut === "image") c += coutEstime(s);
    else if (e.statut === "image_ok") c += coutEstime(s, false, true);
  }
  return c;
}
// solde de la clé lu au dernier GET /key, moins ce qui a été dépensé depuis
function soldeEstime() { return RUN.resteCle == null ? null : RUN.resteCle - (DEPENSES.session - RUN.sessionVerif); }
async function lireSolde() {
  if (!RUN.lecture) {
    RUN.lecture = infoCle().then((i) => {
      RUN.resteCle = i.reste; RUN.sessionVerif = DEPENSES.session; RUN.derniereVerifCle = Date.now(); majCle();
      return i;
    }).finally(() => { RUN.lecture = null; });
  }
  return RUN.lecture;
}
function liberer(montant) { RUN.engage = Math.max(0, RUN.engage - (+montant || 0)); }
// Réserve « montant » et renvoie true (à libérer ensuite avec liberer), ou false si le plafond ou le plancher l'interdit.
// Le plafond est testé et la somme réservée AVANT le premier await.
async function reserver(montant, quoi) {
  if (!Number.isFinite(montant) || montant < 0 || !Number.isFinite(RUN.engage)) {
    pauseBudget(`Coût inconnu pour ${quoi} : rien n'est lancé.`);
    return false;
  }
  if (DEPENSES.session + RUN.engage + montant > R.budget + 1e-9) {
    pauseBudget(`Plafond de dépense atteint (${dollars(R.budget)}) : ${quoi} non lancé. Monte le plafond puis clique « Reprendre ».`);
    return false;
  }
  RUN.engage += montant;
  if (Date.now() - RUN.derniereVerifCle > 60000) {
    try { await lireSolde(); } catch (e) { RUN.derniereVerifCle = Date.now() - 45000; }   // nouvel essai dans 15 s
  }
  const reste = soldeEstime();
  if (reste == null) {
    if (R.plancher > 0 && !RUN.alerteSolde) {
      RUN.alerteSolde = true;
      alerte("Solde de la clé inconnu : le plancher ne peut pas être vérifié, seul le plafond de session protège.", "attention");
    }
  } else if (reste - RUN.engage < R.plancher - 1e-9) {
    const apres = reste - RUN.engage;
    liberer(montant);
    pauseBudget(`Il ne resterait que ${dollars(apres)} sur la clé (plancher ${dollars(R.plancher)}) : ${quoi} non lancé.`);
    return false;
  }
  return true;
}
function pauseBudget(msg) {
  if (!RUN.pause) alerte(msg, "attention");
  RUN.pause = true;
  majBoutons();
}
// clé refusée (401) ou crédit épuisé (402) : toute la production se met en pause, le sketch garde sa place dans la file
async function echec(id, err, etape, statutAvant) {
  const msg = (err && err.message) || String(err);
  if ([401, 402].includes(err && err.statut)) {
    await majEtat(id, { statut: statutAvant, erreur: `${etape} : ${msg}` });
    pauseBudget(err.statut === 402 ? "Crédit OpenRouter insuffisant : production en pause. Recharge ton compte, puis clique « Reprendre »."
      : "Clé OpenRouter refusée : production en pause. Vérifie ta clé dans Réglages, puis clique « Reprendre ».");
    return;
  }
  const texte = err && err.incertain
    ? `${etape} : envoi interrompu (${msg}). Il a peut-être été créé et payé : vérifie sur openrouter.ai/activity avant de le refaire.`
    : `${etape} : ${msg}`;
  if (etape === "vidéo") await videoRatee(id, texte);
  else await majEtat(id, { statut: "erreur", erreur: texte, etapeErreur: "image" });
}
// une nouvelle vidéo a échoué : si le sketch avait déjà un clip, il le garde (et retrouve son statut d'avant)
async function videoRatee(id, msg) {
  const e = ETATS.get(id) || {};
  if (e.clip) await majEtat(id, { statut: e.statutAvant || "pret", job: null, erreur: `${msg} — l'ancien clip est gardé` });
  else await majEtat(id, { statut: "erreur", etapeErreur: "video", job: null, erreur: msg });
}

// ---------- étapes ----------
async function etapeImage(id) {
  const s = SKETCHS.get(id);
  if (!(await reserver(PRIX.image, `l'image de ${id}`))) return;
  try {
    await majEtat(id, { statut: "image", erreur: null });
    const { blob, cout } = await genererImage(s);
    await DB.put("fichiers", `${id}:image`, blob);
    ecrireFichier("images", `${id}.${blob.type === "image/png" ? "png" : "jpg"}`, blob);
    const e = ETATS.get(id) || {};
    await majEtat(id, { statut: "image_ok", couts: Object.assign({}, e.couts, { image: (e.couts?.image || 0) + cout }) });
  } catch (err) {
    await echec(id, err, "image", "attente");
  } finally { liberer(PRIX.image); }
}

async function etapeVideo(id) {
  const s = SKETCHS.get(id);
  const estim = coutVideo(s);
  if (!(await reserver(estim, `la vidéo de ${id}`))) return;
  let job;
  try {
    const image = await DB.get("fichiers", `${id}:image`);
    if (!image) { liberer(estim); await majEtat(id, { statut: "attente" }); return; }
    // statut gardé en mémoire ET sur disque pendant l'envoi : on ne peut ni retirer ni relancer ce sketch
    await majEtat(id, { statut: "video_envoi", envoi: Date.now(), erreur: null });
    job = await lancerVideo(s, image);
  } catch (err) {
    liberer(estim);
    await echec(id, err, "vidéo", "image_ok");
    return;
  }
  const e = ETATS.get(id) || {};
  try {
    await majEtat(id, { statut: "video_lancee", job, estimVideo: estim, coutNote: false, lancee: Date.now(), essaisVideo: (e.essaisVideo || 0) + 1 });
  } catch (err) {
    alerte(`${id} : vidéo lancée mais pas enregistrée dans le navigateur (${err.message}). Garde la page ouverte jusqu'à sa récupération.`, "erreur");
  }
}

async function etapeAttente(id) {
  const e = ETATS.get(id);
  if (!e || !e.job) return;
  let et;
  try { et = await etatVideo(e.job); } catch (err) {
    // vidéo introuvable (purgée, autre clé) ou lancée il y a plus de 12 h : on arrête d'attendre ; sinon nouvel essai
    if ([404, 410].includes(err.statut) || Date.now() - (e.lancee || 0) > 12 * 3600e3) {
      if (!e.coutNote) liberer(e.estimVideo);
      await videoRatee(id, `vidéo introuvable ou expirée chez OpenRouter (${String(err.message).slice(0, 80)})`);
    }
    return;
  }
  if (et.status === "completed") {
    if (!e.coutNote) {                     // dépense notée une seule fois, dès que la vidéo est finie (avant le téléchargement)
      const cout = +((et.usage || {}).cost ?? e.estimVideo) || 0;
      liberer(e.estimVideo);
      await majEtat(id, { coutNote: true, couts: Object.assign({}, e.couts, { video: (e.couts?.video || 0) + cout }) }).catch(() => {});
      await noterDepense("video", R.modeleVideo, cout, id).catch(() => {});
    }
    let blob;
    try { blob = await telechargerVideo(e.job); } catch (err) {
      if ([404, 410].includes(err.statut)) await videoRatee(id, "la vidéo a expiré chez OpenRouter avant d'être récupérée");
      else await majEtat(id, { erreur: `téléchargement : ${err.message} (nouvel essai dans 10 s)` });
      return;
    }
    const n = (ETATS.get(id) || {}).essaisVideo || 1;
    ecrireFichier("clips", `${id}_v${n}.mp4`, blob);
    let avant = false;
    try {
      const ancien = await DB.get("fichiers", `${id}:video`);
      if (ancien) { await DB.put("fichiers", `${id}:video_avant`, ancien); avant = true; }
      await DB.put("fichiers", `${id}:video`, blob);
    } catch (err) {                        // mémoire du navigateur pleine : le clip payé est remis à l'utilisateur
      telecharger(`${id}_v${n}.mp4`, blob);
      await videoRatee(id, `mémoire du navigateur pleine (${err.message}) : le clip a été téléchargé sous ${id}_v${n}.mp4`);
      return;
    }
    await majEtat(id, { statut: "video_ok", clip: true, clipAvant: avant || !!e.clipAvant, job: null, controle: null, erreur: null });
  } else if (["failed", "cancelled", "expired"].includes(et.status)) {
    if (!e.coutNote) liberer(e.estimVideo);
    await videoRatee(id, `vidéo ${et.status} : ${JSON.stringify(et.error || "").slice(0, 200)}`);
  }
}

async function etapeControle(id) {
  const s = SKETCHS.get(id);
  if (!R.controle) { await majEtat(id, { statut: "pret" }); return; }
  const montant = PRIX.controle * 4;                 // jusqu'à 4 appels du juge (2 écoutes)
  if (!(await reserver(montant, `le contrôle de ${id}`))) return;
  try {
    await majEtat(id, { statut: "controle" });
    const blob = await DB.get("fichiers", `${id}:video`);
    const res = await controler(s, blob);
    const e = ETATS.get(id) || {};
    const couts = Object.assign({}, e.couts, { controle: (e.couts?.controle || 0) + res.cout });
    if (res.mauvais && R.repriseAuto && (e.essaisVideo || 1) < 2) {
      await majEtat(id, { statut: "image_ok", statutAvant: "a_revoir", controle: res, couts, erreur: `contrôle : ${res.raison} → nouvelle vidéo` });
      return;
    }
    await majEtat(id, { statut: res.mauvais ? "a_revoir" : "pret", controle: res, couts });
  } catch (err) {
    if ([401, 402].includes(err.statut)) await echec(id, err, "contrôle", "video_ok");
    else await majEtat(id, { statut: "pret", erreur: `contrôle impossible : ${err.message}` });
  } finally { liberer(montant); }
}

// ---------- contrôle IA ----------
async function controler(s, blob) {
  const video = await chargerVideo(blob);
  const d = video.duration;
  const audio = await decoderAudio(blob);
  const muet = !sonPresent(audio);
  const segs = muet ? [] : segmentsParole(audio);
  const lignes = tempsLignes(s, segs, d);
  let cout = 0;
  // 1) réalisme : planche de 16 images
  const planche = await plancheImages(video, 16, 4, 320, (t) => `${t.toFixed(1)}s`);
  const persos = s.persos.map((p) => p.nom).join(" ; ");
  const r1 = await chatJuge([{ type: "text", text: QUESTION_REGARD(d, persos) }, { type: "image_url", image_url: { url: planche } }], s.id);
  cout += r1.cout;
  const realisme = (r1.texte.match(/REALISME\s*=\s*(OK|MINEUR|GRAVE)/i) || [, "?"])[1].toUpperCase();
  // 2) accent : deux écoutes si la première dit « France » (juge capricieux, test 4)
  const france = (t) => /ACCENT\s*=\s*(français de france|autre)/i.test(t);
  let avis = "ACCENT=aucun son ; clip muet";
  if (!muet) {
    const wav = wavBase64(audio, 16000, 40);
    const ecoute = async () => {
      const r = await chatJuge([{ type: "text", text: QUESTION_ACCENT }, { type: "input_audio", input_audio: { data: wav, format: "wav" } }], s.id, R.modeleOreille || R.modeleJuge);
      cout += r.cout;
      return r.texte.replace(/\s+/g, " ").trim();
    };
    avis = await ecoute();
    if (france(avis)) { const a2 = await ecoute(); if (!france(a2)) avis = a2 + " (2e écoute)"; }
  }
  const note = (cle) => { const m = avis.match(new RegExp(`${cle}\\s*=\\s*(\\d+(?:[.,]\\d+)?)`, "i")); return m ? +m[1].replace(",", ".") : null; };
  // 3) synchro : deux images par réplique, étiquetées avec le personnage qui doit parler
  const etiquettes = [];
  for (const [k, l] of lignes.entries()) for (const f of [0.35, 0.8]) etiquettes.push({ t: l.debut + (l.fin - l.debut) * f, txt: `réplique ${k + 1} : ${s.persos[s.dialogue[k][0]].nom} parle` });
  const plancheS = await plancheImages(video, etiquettes.length, 4, 400, null, etiquettes);
  const r3 = await chatJuge([{ type: "text", text: QUESTION_SYNCHRO(persos) }, { type: "image_url", image_url: { url: plancheS } }], s.id);
  cout += r3.cout;
  const synchro = /SYNCHRO\s*=\s*ERREUR/i.test(r3.texte) ? "ERREUR" : "OK";
  URL.revokeObjectURL(video.src);
  const raisons = [];
  if (muet) raisons.push("clip sans son");
  if (realisme === "GRAVE") raisons.push("défaut grave d'image");
  if (france(avis)) raisons.push("accent jugé « France » deux fois");
  if (synchro === "ERREUR") raisons.push("le mauvais personnage parle");
  return { realisme, avisRegard: r1.texte.slice(0, 300), accent: (avis.match(/ACCENT\s*=\s*([^;]+)/i) || [, "?"])[1].trim(),
    naturel: note("NATUREL"), drole: note("DR[OÔ]LE"), avis: avis.slice(0, 300), synchro, avisSynchro: r3.texte.slice(0, 300),
    mauvais: raisons.length > 0, raison: raisons.join(", "), cout, finParole: lignes.length ? lignes[lignes.length - 1].fin : null };
}

function chargerVideo(blob) {
  return new Promise((ok, ko) => {
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.playsInline = true;
    v.onloadeddata = () => ok(v);
    v.onerror = () => ko(new Error("vidéo illisible par le navigateur"));
    v.src = URL.createObjectURL(blob);
  });
}
function allerA(video, t) {
  return new Promise((ok) => {
    const cible = Math.max(0, Math.min(t, video.duration - 0.04));
    if (Math.abs(video.currentTime - cible) < 1e-3 && video.readyState >= 2) { ok(); return; }
    const fini = () => { video.removeEventListener("seeked", fini); ok(); };
    video.addEventListener("seeked", fini);
    video.currentTime = cible;
  });
}
async function plancheImages(video, n, colonnes, largeur, legende, etiquettes = null) {
  const h = Math.round(largeur * video.videoHeight / video.videoWidth);
  const lignes = Math.ceil(n / colonnes);
  const c = document.createElement("canvas");
  c.width = largeur * colonnes; c.height = h * lignes;
  const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < n; i++) {
    const t = etiquettes ? etiquettes[i].t : video.duration * (i + 0.5) / n;
    await allerA(video, t);
    const x = (i % colonnes) * largeur, y = Math.floor(i / colonnes) * h;
    g.drawImage(video, x, y, largeur, h);
    const txt = etiquettes ? `${etiquettes[i].txt} (${t.toFixed(1)}s)` : legende(t);
    g.fillStyle = "rgba(0,0,0,.75)"; g.fillRect(x, y, Math.min(largeur, 12 + txt.length * 7), 18);
    g.fillStyle = "#ffff00"; g.font = "12px sans-serif"; g.fillText(txt, x + 5, y + 13);
  }
  return c.toDataURL("image/jpeg", 0.85);
}

let CONTEXTE_AUDIO = null;
// null si le fichier n'a pas de son lisible (jamais un faux silence : un clip muet doit se voir)
async function decoderAudio(blob) {
  CONTEXTE_AUDIO = CONTEXTE_AUDIO || new AudioContext({ sampleRate: 48000 });
  const buf = await blob.arrayBuffer();
  try { return await CONTEXTE_AUDIO.decodeAudioData(buf); } catch (e) { return null; }
}
function sonPresent(buffer) {
  if (!buffer) return false;
  const d = buffer.getChannelData(0);
  for (let i = 0; i < d.length; i += 97) if (Math.abs(d[i]) > 1e-3) return true;
  return false;
}
function wavBase64(buffer, taux = 16000, maxSec = 40) {
  // ré-échantillonnage simple (moyenne des voies + interpolation linéaire) puis PCM 16 bits
  const n = Math.min(Math.floor(buffer.duration * taux), maxSec * taux);
  const voies = [...Array(buffer.numberOfChannels).keys()].map((k) => buffer.getChannelData(k));
  const pcm = new Int16Array(n);
  const pas = buffer.sampleRate / taux;
  for (let i = 0; i < n; i++) {
    const x = i * pas, j = Math.floor(x), f = x - j;
    let v = 0;
    for (const d of voies) v += (d[j] || 0) * (1 - f) + (d[j + 1] || 0) * f;
    pcm[i] = Math.max(-1, Math.min(1, v / voies.length)) * 32767;
  }
  const tete = new ArrayBuffer(44), dv = new DataView(tete);
  const ecr = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  ecr(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); ecr(8, "WAVE"); ecr(12, "fmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, taux, true);
  dv.setUint32(28, taux * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); ecr(36, "data"); dv.setUint32(40, n * 2, true);
  const octets = new Uint8Array(44 + n * 2);
  octets.set(new Uint8Array(tete), 0);
  octets.set(new Uint8Array(pcm.buffer), 44);
  let bin = "";
  for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
  return btoa(bin);
}

// segments de parole par l'énergie du son (fenêtres de 20 ms), pour caler sous-titres, replay et synchro
function segmentsParole(buffer) {
  const taux = buffer.sampleRate, fen = Math.round(taux * 0.02);
  const d0 = buffer.getChannelData(0), d1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : d0;
  const rms = [];
  for (let i = 0; i + fen <= d0.length; i += fen) {
    let e = 0;
    for (let j = i; j < i + fen; j++) { const v = (d0[j] + d1[j]) / 2; e += v * v; }
    rms.push(Math.sqrt(e / fen));
  }
  if (!rms.length) return [];
  const tri = [...rms].sort((a, b) => a - b);
  const p90 = tri[Math.floor(tri.length * 0.9)], p20 = tri[Math.floor(tri.length * 0.2)];
  const seuil = Math.max(0.01, p20 + (p90 - p20) * 0.18);
  const segs = [];
  let debut = null, silence = 0;
  rms.forEach((v, i) => {
    const t = i * 0.02;
    if (v >= seuil) { if (debut === null) debut = t; silence = 0; }
    else if (debut !== null) { silence += 0.02; if (silence > 0.3) { segs.push([debut, t - silence + 0.02]); debut = null; silence = 0; } }
  });
  if (debut !== null) segs.push([debut, rms.length * 0.02]);
  return segs.filter(([a, b]) => b - a >= 0.15);
}
// temps de chaque réplique : les mots sont répartis sur le temps de parole détecté, au prorata
function tempsLignes(s, segs, duree) {
  const mots = s.dialogue.map(([, t]) => Math.max(1, normaliser(t).length));
  const total = mots.reduce((a, b) => a + b, 0);
  if (!segs.length) {                       // pas de parole détectée : répartition sur 80 % du clip
    const pas = (duree * 0.8 - 0.3) / total;
    let t = 0.3;
    return mots.map((m) => { const l = { debut: t, fin: t + m * pas }; t += m * pas; return l; });
  }
  const parle = segs.reduce((a, [x, y]) => a + (y - x), 0);
  const versTemps = (v) => {                 // temps de parole cumulé → instant réel
    for (const [x, y] of segs) { if (v <= y - x) return x + v; v -= y - x; }
    return segs[segs.length - 1][1];
  };
  let cumul = 0;
  return mots.map((m) => {
    const a = versTemps(cumul / total * parle);
    cumul += m;
    return { debut: a, fin: versTemps(cumul / total * parle) };
  });
}

// ---------- boucle ----------
async function tour() {
  if (!RUN.actif) return;
  const occupe = (id) => RUN.enCours.has(id);
  const lancer = (id, f) => {
    RUN.enCours.add(id);
    f(id).catch((e) => console.warn(id, e)).finally(() => { RUN.enCours.delete(id); majResume(); });
  };
  const parStatut = (st) => FILE.filter((id) => statutDe(id) === st && SKETCHS.has(id));
  rattacherEnVol();
  // récupération des vidéos lancées : toujours, même en pause (déjà payées) ; une interrogation toutes les 10 s par vidéo
  for (const id of FILE.filter((x) => statutDe(x) === "video_lancee")) {
    if (!occupe(id) && Date.now() - (RUN.interroge.get(id) || 0) > 10000) { RUN.interroge.set(id, Date.now()); lancer(id, etapeAttente); }
  }
  if (!RUN.pause) {
    // les tâches qui attendent encore leur réponse comptent dans le parallélisme (sinon un /key lent en lance d'autres)
    let placesC = MAX_CONTROLES - FILE.filter((id) => statutDe(id) === "controle" || (statutDe(id) === "video_ok" && occupe(id))).length;
    for (const id of parStatut("video_ok")) if (placesC > 0 && !occupe(id) && !RUN.pause) { lancer(id, etapeControle); placesC--; }
    const videosEnCours = FILE.filter((id) => ["video_envoi", "video_lancee"].includes(statutDe(id)) || (statutDe(id) === "image_ok" && occupe(id))).length;
    let placesV = R.concurrenceVideos - videosEnCours;
    for (const id of parStatut("image_ok")) if (placesV > 0 && !occupe(id) && !RUN.pause) { lancer(id, etapeVideo); placesV--; }
    const imagesEnCours = FILE.filter((id) => statutDe(id) === "image" || ((!statutDe(id) || statutDe(id) === "attente") && occupe(id))).length;
    let placesI = R.concurrenceImages - imagesEnCours;
    for (const id of FILE) {
      const st = statutDe(id);
      if ((!st || st === "attente") && SKETCHS.has(id) && placesI > 0 && !occupe(id) && !RUN.pause) { lancer(id, etapeImage); placesI--; }
    }
  }
  const restant = FILE.some((id) => SKETCHS.has(id) && !["pret", "a_revoir", "erreur"].includes(statutDe(id)));
  if (!restant && !RUN.enCours.size) { RUN.actif = false; alerte("Production terminée.", "info"); majBoutons(); majResume(); return; }
  majResume();
  setTimeout(tour, RUN.enCours.size ? 4000 : 1500);
}
// vidéos lancées avant une fermeture de la page : récupérées dès que la clé est là (déjà payées) ; réservées une fois
function reprendreVideosLancees() {
  if (!CLE || !RUN.seul) return;
  rattacherEnVol();
  const lancees = FILE.filter((id) => statutDe(id) === "video_lancee");
  if (!RUN.repris) {
    RUN.repris = true;
    for (const id of lancees) { const e = ETATS.get(id); if (!e.coutNote) RUN.engage += +e.estimVideo || 0; }
  }
  if (!RUN.actif && lancees.length) {
    RUN.actif = true; RUN.pause = true;
    alerte(`${lancees.length} vidéo(s) lancée(s) avant la fermeture : récupération en cours (rien de nouveau n'est lancé).`);
    majBoutons();
    tour();
  }
}
function demarrer() {
  if (!RUN.seul) { alerte(DEJA_OUVERT, "erreur"); return; }
  if (!CLE) { alerte("Ajoute ta clé OpenRouter dans l'onglet Réglages.", "attention"); montrerOnglet("reglages"); return; }
  autoriserDossier();                      // pendant le clic : Chrome redemande l'accès au dossier de sortie gardé
  reprendreVideosLancees();
  if (!FILE.length) { alerte("La file est vide : choisis des sketchs dans la Banque.", "attention"); return; }
  RUN.pause = false;
  if (!RUN.actif) { RUN.actif = true; tour(); }
  majBoutons();
}
function mettrePause() { RUN.pause = true; majBoutons(); alerte("Pause : plus rien de nouveau n'est lancé (les vidéos déjà payées sont quand même récupérées)."); }

// ---------- un seul onglet ----------
async function prendreVerrou() {
  if (navigator.locks && navigator.locks.request) {
    return new Promise((ok) => {
      navigator.locks.request("studio-comedie-production", { ifAvailable: true }, (verrou) => {
        if (!verrou) { ok(false); return null; }
        ok(true);
        return new Promise(() => {});      // gardé tant que la page est ouverte
      }).catch(() => ok(true));
    });
  }
  // repli sans Web Locks : battement dans localStorage (un onglet muet depuis 90 s est considéré fermé)
  const autre = lireJSON(localStorage, "studio-onglet");
  if (autre && Date.now() - autre.t < 90000) return false;
  const moi = Math.random().toString(36).slice(2);
  const battre = () => localStorage.setItem("studio-onglet", JSON.stringify({ id: moi, t: Date.now() }));
  battre(); setInterval(battre, 3000);
  addEventListener("pagehide", () => { const x = lireJSON(localStorage, "studio-onglet"); if (x && x.id === moi) localStorage.removeItem("studio-onglet"); });
  return true;
}

// ---------- interface ----------
function afficherProduction() {
  const zone = $("#prod-liste");
  zone.innerHTML = "";
  if (!FILE.length) zone.append(el("p", { class: "vide" }, "La file est vide. Va dans la Banque, sélectionne des sketchs et clique « Envoyer en production »."));
  for (const id of FILE) zone.append(el("div", { class: "carte", id: `carte-${id}` }));
  FILE.forEach(afficherCarte);
  majResume();
  majBoutons();
}
const URLS = new Map();
async function urlFichier(cle) {
  const b = await DB.get("fichiers", cle);
  if (!b) return null;
  if (URLS.has(cle)) URL.revokeObjectURL(URLS.get(cle));
  const u = URL.createObjectURL(b);
  URLS.set(cle, u);
  return u;
}
async function afficherCarte(id) {
  const c = document.getElementById(`carte-${id}`);
  if (!c) return;
  const s = SKETCHS.get(id), e = ETATS.get(id) || {};
  const couts = e.couts || {};
  const total = (couts.image || 0) + (couts.video || 0) + (couts.controle || 0);
  const ctrl = e.controle;
  const aClip = e.clip || ["video_ok", "controle", "pret", "a_revoir"].includes(e.statut);
  const img = !["attente", "image"].includes(e.statut) && e.statut ? await urlFichier(`${id}:image`) : null;
  const vid = aClip ? await urlFichier(`${id}:video`) : null;
  const bloque = !RUN.seul || RUN.enCours.has(id) || EN_VOL.includes(e.statut);
  c.innerHTML = "";
  c.append(
    el("div", { class: "carte-tete" }, el("b", {}, s ? s.titre : `${id} (absent de la banque)`), " ", el("span", { class: "id" }, id), " ", puceStatut(id),
      el("span", { class: "cout" }, total ? dollars(total) : `≈ ${dollars(s ? coutEstime(s) : 0)}`)),
    el("div", { class: "carte-corps" },
      vid ? el("video", { src: vid, controls: true, playsinline: true, class: "apercu" }) : img ? el("img", { src: img, class: "apercu" }) : el("div", { class: "apercu vide" }, "…"),
      el("div", { class: "carte-infos" },
        el("div", { class: "dialogue" }, ...(s ? s.dialogue.map(([i, t]) => el("div", {}, el("b", {}, roleCourt(s, i) + " : "), t)) : [])),
        ctrl ? el("div", { class: `controle ${ctrl.mauvais ? "mauvais" : "bon"}` },
          `Réalisme ${ctrl.realisme} · accent ${ctrl.accent} · naturel ${ctrl.naturel ?? "?"}/10 · drôle ${ctrl.drole ?? "?"}/10 · synchro ${ctrl.synchro}`,
          ctrl.mauvais ? el("div", {}, `À revoir : ${ctrl.raison}`) : null) : null,
        e.erreur ? el("div", { class: "erreur" }, e.erreur) : null,
        el("div", { class: "boutons" },
          el("button", { onclick: () => refaire(id, "video"), disabled: bloque || !s || !["pret", "a_revoir", "erreur", "video_ok"].includes(e.statut) }, "Refaire la vidéo"),
          el("button", { onclick: () => refaire(id, "image"), disabled: bloque || !s || e.statut === "attente" || !e.statut }, "Refaire l'image"),
          vid ? el("button", { onclick: async () => telecharger(`${id}.mp4`, await DB.get("fichiers", `${id}:video`)) }, "Télécharger le clip") : null,
          e.clipAvant && !bloque ? el("button", { onclick: () => revenirClipAvant(id), title: "échange le clip actuel avec le précédent" }, "Clip d'avant") : null,
          img ? el("button", { onclick: async () => { const b = await DB.get("fichiers", `${id}:image`); telecharger(`${id}.${b.type === "image/png" ? "png" : "jpg"}`, b); } }, "Télécharger l'image") : null,
          el("button", { onclick: () => retirer(id), disabled: bloque }, "Retirer")))));
}
async function refaire(id, quoi) {
  const e = ETATS.get(id) || {}, s = SKETCHS.get(id);
  if (!s || !RUN.seul || RUN.enCours.has(id) || EN_VOL.includes(e.statut)) return;
  if (quoi === "video" && !(await DB.get("fichiers", `${id}:image`))) quoi = "image";
  const cout = coutEstime(s, quoi === "image", true);
  const quoiTxt = quoi === "image" ? "une nouvelle image puis une nouvelle vidéo" : "une nouvelle vidéo";
  if (!confirm(`« ${s.titre} » : ${quoiTxt}, environ ${dollars(cout)}.${e.clip ? " Le clip actuel reste utilisable tant que le nouveau n'est pas prêt." : ""}`)) return;
  if (!FILE.includes(id)) { FILE.push(id); sauverFile(); afficherProduction(); }
  await majEtat(id, { statut: quoi === "image" ? "attente" : "image_ok", erreur: null, job: null,
    statutAvant: ["pret", "a_revoir", "video_ok"].includes(e.statut) ? e.statut : e.statutAvant,
    essaisVideo: quoi === "video" ? e.essaisVideo || 0 : 0 });
  alerte(RUN.actif && !RUN.pause ? `${id} : relancé (≈ ${dollars(cout)}).` : `${id} : sera relancé quand tu cliques « Démarrer » ou « Reprendre » (≈ ${dollars(cout)}).`);
}
async function revenirClipAvant(id) {
  const a = await DB.get("fichiers", `${id}:video`), b = await DB.get("fichiers", `${id}:video_avant`);
  if (!a || !b) return;
  await DB.put("fichiers", `${id}:video`, b);
  await DB.put("fichiers", `${id}:video_avant`, a);
  await majEtat(id, { controle: null, erreur: "clip d'avant remis (le contrôle IA n'a pas été refait)" });
}
// un sketch retiré qui n'a rien coûté redevient « non tourné » (il revient dans « les meilleurs non tournés »)
async function oublierSiGratuit(id) {
  const e = ETATS.get(id);
  if (!e || RUN.enCours.has(id)) return;
  const paye = e.clip || (e.couts && ((e.couts.image || 0) + (e.couts.video || 0) > 0));
  if (!paye && ["attente", "erreur"].includes(e.statut)) { ETATS.delete(id); await DB.del("etat", id).catch(() => {}); }
}
function retirer(id) {
  if (!RUN.seul || RUN.enCours.has(id) || EN_VOL.includes(statutDe(id))) { alerte("Une étape payée est en cours pour ce sketch : attends qu'elle finisse.", "attention"); return; }
  FILE = FILE.filter((x) => x !== id);
  sauverFile();
  oublierSiGratuit(id).finally(() => { afficherProduction(); });
}
function majResume() {
  majCle();
  const n = (st) => FILE.filter((id) => statutDe(id) === st).length;
  const r = $("#prod-resume");
  if (r) r.textContent = !RUN.seul ? DEJA_OUVERT : `${FILE.length} dans la file · ${n("pret")} prêts · ${n("a_revoir")} à revoir · ${n("erreur")} en erreur · ` +
    `${n("video_lancee") + n("video_envoi")} vidéos en cours · reste à payer ≈ ${dollars(coutRestantFile())} · dépensé cette session ${dollars(DEPENSES.session)} / plafond ${dollars(R.budget)}`;
}
function majBoutons() {
  const b = $("#b-demarrer"), p = $("#b-pause");
  if (!b) return;
  b.textContent = !RUN.seul ? "Ouvert dans un autre onglet" : RUN.actif && !RUN.pause ? "Production en cours…" : RUN.actif ? "Reprendre" : "Démarrer la production";
  b.disabled = !RUN.seul || (RUN.actif && !RUN.pause);
  p.disabled = !RUN.seul || !RUN.actif || RUN.pause;
}
function majCle() {
  const z = $("#solde-cle");
  if (z) z.textContent = RUN.resteCle == null ? "solde inconnu (plancher inactif)" : `solde de la clé ${dollars(soldeEstime())}`;
}

async function initProduction() {
  RUN.seul = await prendreVerrou();
  $("#b-demarrer").addEventListener("click", demarrer);
  $("#b-pause").addEventListener("click", mettrePause);
  $("#b-vider").addEventListener("click", async () => {
    if (!RUN.seul) { alerte(DEJA_OUVERT, "erreur"); return; }
    const garder = (id) => RUN.enCours.has(id) || EN_VOL.includes(statutDe(id));
    const partis = FILE.filter((id) => !garder(id));
    FILE = FILE.filter(garder);
    sauverFile();
    for (const id of partis) await oublierSiGratuit(id);
    afficherProduction();
    if (FILE.length) alerte(`${FILE.length} sketch(s) gardés : une étape déjà payée est en cours.`, "attention");
  });
  $("#prod-budget").value = R.budget;
  $("#prod-budget").addEventListener("change", (ev) => { R.budget = Math.max(0, +ev.target.value || 0); sauverReglages(); majResume(); if (RUN.pause && RUN.actif) alerte("Plafond modifié : clique « Reprendre »."); });
  addEventListener("beforeunload", (ev) => {     // un envoi payant en cours : on prévient avant de fermer
    if ([...RUN.enCours].some((id) => ["image", "video_envoi"].includes(statutDe(id)))) { ev.preventDefault(); ev.returnValue = ""; }
  });
  if (!RUN.seul) { afficherProduction(); alerte(DEJA_OUVERT, "erreur"); return; }
  // un sketch resté « en cours » sans tâche (page fermée en pleine étape) : on ne repaie jamais à l'aveugle une vidéo
  for (const [id, e] of ETATS) {
    if (e.statut === "image") majEtat(id, { statut: "attente", erreur: "page fermée pendant l'image : elle sera refaite (≈ 0,03 $)" }).catch(() => {});
    if (e.statut === "controle") majEtat(id, { statut: "video_ok" }).catch(() => {});
    if (e.statut === "video_envoi") videoRatee(id, "page fermée pendant l'envoi de la vidéo : elle a peut-être été créée et payée. Vérifie sur openrouter.ai/activity avant de la refaire.").catch(() => {});
  }
  afficherProduction();
  if (CLE) reprendreVideosLancees();
  else {
    const n = [...ETATS.values()].filter((e) => e.statut === "video_lancee").length;
    if (n) alerte(`${n} vidéo(s) déjà payée(s) attendent d'être récupérées : colle ta clé dans Réglages (elles expirent au bout de quelques heures).`, "attention");
  }
}
