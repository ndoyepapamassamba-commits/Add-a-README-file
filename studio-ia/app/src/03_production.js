"use strict";
/* ============================================================================================================
   Production : file d'attente image → vidéo → contrôle IA, plafond de budget, reprise après fermeture.
   Une vidéo déjà lancée (donc payée) n'est jamais relancée par accident : son identifiant est gardé et la vidéo
   est récupérée dès qu'elle est prête (le contenu expire chez OpenRouter au bout de quelques heures).
   ============================================================================================================ */

let FILE = lireJSON(localStorage, "studio-file") || [];
const RUN = { actif: false, pause: false, enCours: new Set(), engage: 0, derniereVerifCle: 0, resteCle: null, interroge: new Map() };

const QUESTION_REGARD = (d, persos) => `Ces 16 images sont extraites DANS L'ORDRE (de gauche à droite, ligne par ligne, temps en jaune) d'un même plan ` +
  `d'animation 3D de ${d.toFixed(0)} secondes. Personnages prévus : ${persos}. Juge la CONTINUITÉ DES PERSONNAGES. ` +
  `GRAVE = un personnage disparaît ou apparaît d'un coup, se transforme en un autre, fusionne avec un autre, se ` +
  `dédouble, change franchement de visage, de corps ou de tenue, ou un corps se déforme (membre en trop, étirement). ` +
  `MINEUR = seulement un petit objet ou un détail du décor qui change, ou un léger changement de maquillage / motif ` +
  `pendant un zoom. NE SONT PAS des défauts : un personnage qui se lève, s'assoit, marche ou sort normalement du ` +
  `cadre, un zoom ou un recadrage vers un visage. ` +
  `Réponds sur UNE ligne : REALISME=OK ou REALISME=MINEUR ou REALISME=GRAVE ; puis le défaut précis avec le temps.`;
const QUESTION_ACCENT = "Écoute les voix de ce sketch. Réponds sur UNE ligne au format : ACCENT=<ivoirien|ouest-africain|" +
  "africain autre|français de France|autre> ; NATUREL=<note sur 10> ; DRÔLE=<note sur 10> ; remarque courte.";
const QUESTION_SYNCHRO = (persos) => `Images extraites d'un plan d'animation 3D, deux par réplique, dans l'ordre. Sur chaque image est écrit ` +
  `le numéro de la réplique et LE PERSONNAGE QUI DOIT PARLER à ce moment. Personnages : ${persos}. Pour chaque ` +
  `réplique : le personnage indiqué est-il bien visible et en train de parler (bouche ouverte ou qui bouge) ? ` +
  `Est-ce plutôt un AUTRE personnage qui parle, ou qui est seul en gros plan à sa place ? ` +
  `Réponds sur UNE ligne : SYNCHRO=OK ou SYNCHRO=ERREUR ; puis le numéro de la réplique fautive et ce qu'on voit.`;

function sauverFile() { localStorage.setItem("studio-file", JSON.stringify(FILE)); }
async function majEtat(id, champs) {
  const e = Object.assign({}, ETATS.get(id) || {}, champs, { maj: Date.now() });
  ETATS.set(id, e);
  await DB.put("etat", id, e);
  afficherCarte(id);
  majResume();
  return e;
}

function ajouterFile(ids) {
  let n = 0;
  for (const id of ids) if (SKETCHS.has(id) && !FILE.includes(id)) { FILE.push(id); n++; }
  sauverFile();
  for (const id of ids) if (!ETATS.get(id)) majEtat(id, { statut: "attente", couts: {}, essaisVideo: 0 });
  afficherProduction();
  alerte(`${n} sketch(s) ajouté(s) à la production. Estimation : ${dollars(ids.reduce((a, id) => a + coutEstime(SKETCHS.get(id)), 0))}.`);
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
async function budgetPermet(montant, quoi) {
  if (DEPENSES.session + RUN.engage + montant > R.budget + 1e-9) {
    pauseBudget(`Plafond de budget atteint (${dollars(R.budget)}) : ${quoi} non lancé. Monte le plafond pour continuer.`);
    return false;
  }
  if (Date.now() - RUN.derniereVerifCle > 60000) {
    try { RUN.resteCle = (await infoCle()).reste; RUN.derniereVerifCle = Date.now(); majCle(); } catch (e) { /* on garde l'ancienne valeur */ }
  }
  if (RUN.resteCle != null && RUN.resteCle - RUN.engage - montant < R.plancher) {
    pauseBudget(`Il ne resterait que ${dollars(RUN.resteCle - RUN.engage - montant)} sur la clé (plancher ${dollars(R.plancher)}) : ${quoi} non lancé.`);
    return false;
  }
  return true;
}
function pauseBudget(msg) {
  if (!RUN.pause) alerte(msg, "attention");
  RUN.pause = true;
  majBoutons();
}

// ---------- étapes ----------
async function etapeImage(id) {
  const s = SKETCHS.get(id);
  if (!(await budgetPermet(PRIX.image, `l'image de ${id}`))) return;
  RUN.engage += PRIX.image;
  await majEtat(id, { statut: "image", erreur: null });
  try {
    const { blob, cout } = await genererImage(s);
    await DB.put("fichiers", `${id}:image`, blob);
    ecrireFichier("images", `${id}.${blob.type === "image/png" ? "png" : "jpg"}`, blob);
    const e = ETATS.get(id) || {};
    await majEtat(id, { statut: "image_ok", couts: Object.assign({}, e.couts, { image: cout }) });
  } catch (err) {
    await majEtat(id, { statut: "erreur", erreur: `image : ${err.message}`, etapeErreur: "image" });
  } finally { RUN.engage -= PRIX.image; }
}

async function etapeVideo(id) {
  const s = SKETCHS.get(id);
  const estim = dureeClip(s) * PRIX.video_seconde + PRIX.video_image;
  if (!(await budgetPermet(estim, `la vidéo de ${id}`))) return;
  const image = await DB.get("fichiers", `${id}:image`);
  if (!image) { await majEtat(id, { statut: "attente" }); return; }
  RUN.engage += estim;
  try {
    const job = await lancerVideo(s, image);
    const e = ETATS.get(id) || {};
    await majEtat(id, { statut: "video_lancee", job, estimVideo: estim, lancee: Date.now(), essaisVideo: (e.essaisVideo || 0) + 1 });
  } catch (err) {
    RUN.engage -= estim;
    await majEtat(id, { statut: "erreur", erreur: `vidéo : ${err.message}`, etapeErreur: "video" });
  }
}

async function etapeAttente(id) {
  const e = ETATS.get(id);
  if (!e || !e.job) return;
  let et;
  try { et = await etatVideo(e.job); } catch (err) { return; }      // on réessaie au tour suivant
  if (et.status === "completed") {
    try {
      const blob = await telechargerVideo(e.job, et);
      const cout = (et.usage || {}).cost ?? e.estimVideo;
      RUN.engage = Math.max(0, RUN.engage - (e.estimVideo || 0));
      await noterDepense("video", R.modeleVideo, cout, id);
      const ancien = await DB.get("fichiers", `${id}:video`);
      if (ancien) await DB.put("fichiers", `${id}:video_v${(e.essaisVideo || 1) - 1}`, ancien);
      await DB.put("fichiers", `${id}:video`, blob);
      ecrireFichier("clips", `${id}.mp4`, blob);
      await majEtat(id, { statut: "video_ok", couts: Object.assign({}, e.couts, { video: (e.couts?.video || 0) + (+cout || 0) }), controle: null });
    } catch (err) {
      await majEtat(id, { erreur: `téléchargement : ${err.message} (nouvel essai au prochain tour)` });
      if (err.statut === 410) await majEtat(id, { statut: "erreur", erreur: "la vidéo a expiré chez OpenRouter avant d'être récupérée", etapeErreur: "video" });
    }
  } else if (["failed", "cancelled", "expired"].includes(et.status)) {
    RUN.engage = Math.max(0, RUN.engage - (e.estimVideo || 0));
    await majEtat(id, { statut: "erreur", erreur: `vidéo ${et.status} : ${JSON.stringify(et.error || "").slice(0, 200)}`, etapeErreur: "video", job: null });
  }
}

async function etapeControle(id) {
  const s = SKETCHS.get(id);
  if (!R.controle) { await majEtat(id, { statut: "pret" }); return; }
  if (!(await budgetPermet(PRIX.controle * 3, `le contrôle de ${id}`))) return;
  await majEtat(id, { statut: "controle" });
  try {
    const blob = await DB.get("fichiers", `${id}:video`);
    const res = await controler(s, blob);
    const e = ETATS.get(id) || {};
    const couts = Object.assign({}, e.couts, { controle: (e.couts?.controle || 0) + res.cout });
    if (res.mauvais && R.repriseAuto && (e.essaisVideo || 1) < 2) {
      await majEtat(id, { statut: "image_ok", controle: res, couts, job: null, erreur: `contrôle : ${res.raison} → nouvelle vidéo` });
      return;
    }
    await majEtat(id, { statut: res.mauvais ? "a_revoir" : "pret", controle: res, couts });
  } catch (err) {
    await majEtat(id, { statut: "pret", erreur: `contrôle impossible : ${err.message}` });
  }
}

// ---------- contrôle IA ----------
async function controler(s, blob) {
  const video = await chargerVideo(blob);
  const d = video.duration;
  const audio = await decoderAudio(blob);
  const segs = segmentsParole(audio);
  const lignes = tempsLignes(s, segs, d);
  let cout = 0;
  // 1) réalisme : planche de 16 images
  const planche = await plancheImages(video, 16, 4, 320, (t) => `${t.toFixed(1)}s`);
  const persos = s.persos.map((p) => p.nom).join(" ; ");
  const r1 = await chatJuge([{ type: "text", text: QUESTION_REGARD(d, persos) }, { type: "image_url", image_url: { url: planche } }]);
  cout += r1.cout;
  const realisme = (r1.texte.match(/REALISME\s*=\s*(OK|MINEUR|GRAVE)/i) || [, "?"])[1].toUpperCase();
  // 2) accent : deux écoutes si la première dit « France » (juge capricieux, test 4)
  const wav = wavBase64(audio, 16000, 40);
  const ecoute = async () => {
    const r = await chatJuge([{ type: "text", text: QUESTION_ACCENT }, { type: "input_audio", input_audio: { data: wav, format: "wav" } }]);
    cout += r.cout;
    return r.texte.replace(/\s+/g, " ").trim();
  };
  let avis = await ecoute();
  const france = (t) => /ACCENT\s*=\s*(français de france|autre)/i.test(t);
  if (france(avis)) { const a2 = await ecoute(); if (!france(a2)) avis = a2 + " (2e écoute)"; }
  const note = (cle) => { const m = avis.match(new RegExp(`${cle}\\s*=\\s*(\\d+(?:[.,]\\d+)?)`, "i")); return m ? +m[1].replace(",", ".") : null; };
  // 3) synchro : deux images par réplique, étiquetées avec le personnage qui doit parler
  const etiquettes = [];
  for (const [k, l] of lignes.entries()) for (const f of [0.35, 0.8]) etiquettes.push({ t: l.debut + (l.fin - l.debut) * f, txt: `réplique ${k + 1} : ${s.persos[s.dialogue[k][0]].nom} parle` });
  const plancheS = await plancheImages(video, etiquettes.length, 4, 400, null, etiquettes);
  const r3 = await chatJuge([{ type: "text", text: QUESTION_SYNCHRO(persos) }, { type: "image_url", image_url: { url: plancheS } }]);
  cout += r3.cout;
  const synchro = /SYNCHRO\s*=\s*ERREUR/i.test(r3.texte) ? "ERREUR" : "OK";
  URL.revokeObjectURL(video.src);
  await noterDepense("controle", R.modeleJuge, cout, s.id);
  const raisons = [];
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
async function decoderAudio(blob) {
  CONTEXTE_AUDIO = CONTEXTE_AUDIO || new AudioContext({ sampleRate: 48000 });
  const buf = await blob.arrayBuffer();
  try { return await CONTEXTE_AUDIO.decodeAudioData(buf); } catch (e) { return CONTEXTE_AUDIO.createBuffer(2, 48000, 48000); }
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
  const lancer = (id, f) => { RUN.enCours.add(id); f(id).finally(() => { RUN.enCours.delete(id); }); };
  const parStatut = (st) => FILE.filter((id) => (ETATS.get(id) || {}).statut === st);
  // récupération des vidéos lancées : toujours, même en pause (déjà payées) ; une interrogation toutes les 10 s par vidéo
  for (const id of parStatut("video_lancee")) {
    if (!occupe(id) && Date.now() - (RUN.interroge.get(id) || 0) > 10000) { RUN.interroge.set(id, Date.now()); lancer(id, etapeAttente); }
  }
  if (!RUN.pause) {
    for (const id of parStatut("video_ok")) if (!occupe(id)) lancer(id, etapeControle);
    const imagesEnCours = FILE.filter((id) => (ETATS.get(id) || {}).statut === "image").length;
    const videosEnCours = parStatut("video_lancee").length;
    let placesV = R.concurrenceVideos - videosEnCours;
    for (const id of parStatut("image_ok")) if (placesV > 0 && !occupe(id)) { lancer(id, etapeVideo); placesV--; }
    let placesI = R.concurrenceImages - imagesEnCours;
    for (const id of FILE) {
      const st = (ETATS.get(id) || {}).statut;
      if ((!st || st === "attente") && placesI > 0 && !occupe(id) && !RUN.pause) { lancer(id, etapeImage); placesI--; }
    }
  }
  const restant = FILE.some((id) => !["pret", "a_revoir", "erreur"].includes((ETATS.get(id) || {}).statut));
  if (!restant && !RUN.enCours.size) { RUN.actif = false; alerte("Production terminée.", "info"); majBoutons(); majResume(); return; }
  majResume();
  setTimeout(tour, RUN.enCours.size ? 4000 : 1500);
}
function demarrer() {
  if (!CLE) { alerte("Ajoute ta clé OpenRouter dans l'onglet Réglages.", "attention"); montrerOnglet("reglages"); return; }
  if (!FILE.length) { alerte("La file est vide : choisis des sketchs dans la Banque.", "attention"); return; }
  RUN.pause = false;
  if (!RUN.actif) { RUN.actif = true; tour(); }
  majBoutons();
}
function mettrePause() { RUN.pause = true; majBoutons(); alerte("Pause : plus rien de nouveau n'est lancé (les vidéos déjà payées sont quand même récupérées)."); }

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
  const img = ["image_ok", "video_lancee", "video_ok", "controle", "pret", "a_revoir"].includes(e.statut) || (e.statut === "erreur" && e.etapeErreur === "video")
    ? await urlFichier(`${id}:image`) : null;
  const vid = ["video_ok", "controle", "pret", "a_revoir"].includes(e.statut) ? await urlFichier(`${id}:video`) : null;
  c.innerHTML = "";
  c.append(
    el("div", { class: "carte-tete" }, el("b", {}, s ? s.titre : id), " ", el("span", { class: "id" }, id), " ", puceStatut(id),
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
          el("button", { onclick: () => refaire(id, "video"), disabled: !["pret", "a_revoir", "erreur", "video_ok"].includes(e.statut) }, "Refaire la vidéo"),
          el("button", { onclick: () => refaire(id, "image"), disabled: ["image", "video_lancee", "controle"].includes(e.statut) }, "Refaire l'image"),
          vid ? el("button", { onclick: async () => telecharger(`${id}.mp4`, await DB.get("fichiers", `${id}:video`)) }, "Télécharger le clip") : null,
          img ? el("button", { onclick: async () => { const b = await DB.get("fichiers", `${id}:image`); telecharger(`${id}.${b.type === "image/png" ? "png" : "jpg"}`, b); } }, "Télécharger l'image") : null,
          el("button", { onclick: () => retirer(id), disabled: ["image", "video_lancee", "controle"].includes(e.statut) }, "Retirer")))));
}
async function refaire(id, quoi) {
  const e = ETATS.get(id) || {};
  if (quoi === "video" && !(await DB.get("fichiers", `${id}:image`))) quoi = "image";
  await majEtat(id, { statut: quoi === "image" ? "attente" : "image_ok", erreur: null, job: null, controle: null, essaisVideo: quoi === "video" ? e.essaisVideo || 0 : 0 });
  alerte(`${id} : ${quoi === "image" ? "nouvelle image puis nouvelle vidéo" : "nouvelle vidéo"} au prochain démarrage (≈ ${dollars(coutEstime(SKETCHS.get(id), quoi === "image", true))}).`);
}
function retirer(id) {
  FILE = FILE.filter((x) => x !== id);
  sauverFile();
  afficherProduction();
}
function majResume() {
  const n = (st) => FILE.filter((id) => (ETATS.get(id) || {}).statut === st).length;
  const r = $("#prod-resume");
  if (r) r.textContent = `${FILE.length} dans la file · ${n("pret")} prêts · ${n("a_revoir")} à revoir · ${n("erreur")} en erreur · ` +
    `${n("video_lancee")} vidéos en cours · reste à payer ≈ ${dollars(coutRestantFile())} · dépensé cette session ${dollars(DEPENSES.session)} / plafond ${dollars(R.budget)}`;
}
function majBoutons() {
  const b = $("#b-demarrer"), p = $("#b-pause");
  if (!b) return;
  b.textContent = RUN.actif && !RUN.pause ? "Production en cours…" : RUN.actif ? "Reprendre" : "Démarrer la production";
  b.disabled = RUN.actif && !RUN.pause;
  p.disabled = !RUN.actif || RUN.pause;
}
function majCle() {
  const z = $("#solde-cle");
  if (z) z.textContent = RUN.resteCle == null ? "solde inconnu" : `solde de la clé ${dollars(RUN.resteCle)}`;
}

function initProduction() {
  $("#b-demarrer").addEventListener("click", demarrer);
  $("#b-pause").addEventListener("click", mettrePause);
  $("#b-vider").addEventListener("click", () => {
    const bloques = FILE.filter((id) => ["image", "video_lancee", "controle"].includes((ETATS.get(id) || {}).statut));
    FILE = bloques;
    sauverFile();
    afficherProduction();
    if (bloques.length) alerte(`${bloques.length} sketch(s) gardés : leur image ou leur vidéo est en cours (déjà payée).`, "attention");
  });
  $("#prod-budget").value = R.budget;
  $("#prod-budget").addEventListener("change", (ev) => { R.budget = Math.max(0, +ev.target.value || 0); sauverReglages(); majResume(); if (RUN.pause && RUN.actif) alerte("Plafond modifié : clique « Reprendre »."); });
  afficherProduction();
  // vidéos lancées avant la fermeture de la page : on les récupère tout de suite (déjà payées)
  if (CLE && FILE.some((id) => (ETATS.get(id) || {}).statut === "video_lancee")) {
    RUN.actif = true; RUN.pause = true;
    for (const id of FILE) { const e = ETATS.get(id) || {}; if (e.statut === "video_lancee") RUN.engage += e.estimVideo || 0; }
    alerte("Des vidéos lancées avant la fermeture sont en cours de récupération.");
    tour();
  }
  // un sketch resté « en cours » sans tâche (page fermée en pleine image ou en plein contrôle) repart de l'étape d'avant
  for (const id of FILE) {
    const st = (ETATS.get(id) || {}).statut;
    if (st === "image") majEtat(id, { statut: "attente" });
    if (st === "controle") majEtat(id, { statut: "video_ok" });
  }
}
