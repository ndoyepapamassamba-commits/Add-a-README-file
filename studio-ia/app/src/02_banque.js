"use strict";
/* ============================================================================================================
   Banque de sketchs : liste, filtres, prompts image / vidéo, sélection, exports, import.
   BANQUE (injectée à la construction) + sketchs importés par l'utilisateur (IndexedDB « sketchs »).
   ============================================================================================================ */

const SKETCHS = new Map();       // id → sketch
const ETATS = new Map();         // id → état de production (IndexedDB « etat »)
const SELECTION = new Set();
const PAGE = 120;
let affiches = PAGE;

const LIBELLES = {
  attente: "en file", image: "image en cours", image_ok: "image prête", video_envoi: "envoi de la vidéo", video_lancee: "vidéo en cours",
  video_ok: "vidéo prête", controle: "contrôle en cours", pret: "prêt", a_revoir: "à revoir", erreur: "erreur",
};

async function chargerBanque() {
  for (const s of BANQUE) SKETCHS.set(s.id, s);
  for (const s of (await DB.tout("sketchs")) || []) SKETCHS.set(s.id, s);
  for (const [k, v] of await DB.entrees("etat")) ETATS.set(k, v);
}

function texteDialogue(s) { return s.dialogue.map(([, t]) => t).join(" / "); }

function filtrer() {
  const q = normaliser($("#f-recherche").value).join(" ");
  const theme = $("#f-theme").value;
  const noteMin = +$("#f-note").value;
  const statut = $("#f-statut").value;
  const tri = $("#f-tri").value;
  let liste = [...SKETCHS.values()].filter((s) => {
    if (theme && s.theme !== theme) return false;
    if ((s.note ?? 10) < noteMin) return false;
    const e = ETATS.get(s.id);
    if (statut === "libre" && e) return false;
    if (statut === "tourne" && !(e && ["video_ok", "pret", "a_revoir"].includes(e.statut))) return false;
    if (q && !normaliser(`${s.titre} ${texteDialogue(s)} ${s.id} ${s.theme || ""}`).join(" ").includes(q)) return false;
    return true;
  });
  if (tri === "note") liste.sort((a, b) => (b.note ?? 0) - (a.note ?? 0) || a.id.localeCompare(b.id));
  else liste.sort((a, b) => a.id.localeCompare(b.id));
  return liste;
}

function puceStatut(id) {
  const e = ETATS.get(id);
  if (!e) return el("span", { class: "puce libre" }, "non tourné");
  return el("span", { class: `puce ${e.statut}` }, LIBELLES[e.statut] || e.statut);
}

function afficherBanque(reset = true) {
  if (reset) affiches = PAGE;
  const liste = filtrer();
  $("#banque-compte").textContent = `${liste.length} sketchs (${liste.length * 2} prompts) · ${SELECTION.size} sélectionnés`;
  const zone = $("#banque-liste");
  zone.innerHTML = "";
  for (const s of liste.slice(0, affiches)) {
    const coche = el("input", { type: "checkbox", checked: SELECTION.has(s.id) });
    coche.addEventListener("change", () => { coche.checked ? SELECTION.add(s.id) : SELECTION.delete(s.id); majCompte(liste.length); });
    zone.append(el("div", { class: "ligne-sketch" },
      coche,
      el("span", { class: "note", title: notesDetail(s) }, s.note != null ? (+s.note).toFixed(1) : "—"),
      el("div", { class: "corps" },
        el("div", { class: "titre" }, s.titre, " ", el("span", { class: "id" }, s.id), " ", puceStatut(s.id)),
        el("div", { class: "dialogue" }, ...s.dialogue.map(([i, t]) => el("div", {}, el("b", {}, roleCourt(s, i) + " : "), t))),
        s.theme ? el("div", { class: "theme" }, s.theme) : null),
      el("div", { class: "actions" },
        el("button", { onclick: () => ouvrirPrompts(s) }, "Prompts"),
        el("button", { class: "principal", onclick: () => { ajouterFile([s.id]); } }, "Produire"))));
  }
  if (liste.length > affiches)
    zone.append(el("button", { class: "plus", onclick: () => { affiches += PAGE; afficherBanque(false); } }, `Afficher ${Math.min(PAGE, liste.length - affiches)} de plus`));
}
function majCompte(n) { $("#banque-compte").textContent = `${n} sketchs (${n * 2} prompts) · ${SELECTION.size} sélectionnés`; }
function notesDetail(s) { return s.notes ? `choc ${s.notes.choc ?? "?"} · public ${s.notes.public ?? "?"}` : ""; }
function roleCourt(s, i) {
  // « the tontine president with the notebook » → « tontine president »
  const n = ((s.persos[i] || {}).nom || `perso ${i}`).replace(/^(the|a|an) /i, "");
  return n.split(/\s+(?:with|in|at|on|holding|by|behind|next|from|who|of)\b/i)[0].split(" ").slice(0, 4).join(" ");
}

function ouvrirPrompts(s) {
  const pi = promptImage(s), pv = promptVideo(s);
  const boite = $("#modale");
  boite.innerHTML = "";
  const copier = (txt) => navigator.clipboard.writeText(txt).then(() => alerte("Copié."));
  boite.append(el("div", { class: "modale-boite" },
    el("div", { class: "modale-tete" }, el("h3", {}, `${s.titre} — ${s.id}`), el("button", { onclick: () => boite.close() }, "Fermer")),
    el("p", { class: "petit" }, [`Note ${s.note ?? "—"}`, notesDetail(s), `durée du clip ${dureeClip(s)} s`, `coût estimé ${dollars(coutEstime(s))}`].filter(Boolean).join(" · ")),
    el("h4", {}, "Dialogue"),
    el("div", { class: "dialogue" }, ...s.dialogue.map(([i, t]) => el("div", {}, el("b", {}, roleCourt(s, i) + " : "), t))),
    s.gag_legende ? el("p", { class: "petit" }, `Légende du gag de transition : ${s.gag_legende}`) : null,
    el("h4", {}, "Prompt image ", el("button", { onclick: () => copier(pi) }, "Copier")),
    el("pre", {}, pi),
    el("h4", {}, "Prompt vidéo ", el("button", { onclick: () => copier(pv) }, "Copier")),
    el("pre", {}, pv),
    el("div", { class: "droite" }, el("button", { class: "principal", onclick: () => { ajouterFile([s.id]); boite.close(); } }, "Produire ce sketch"))));
  boite.showModal();
}

function selectionnerMeilleurs() {
  const n = +$("#f-nombre").value || 3;
  const libres = filtrer().filter((s) => !ETATS.get(s.id)).sort((a, b) => (b.note ?? 0) - (a.note ?? 0));
  SELECTION.clear();
  libres.slice(0, n).forEach((s) => SELECTION.add(s.id));
  afficherBanque(false);
  alerte(`${SELECTION.size} meilleurs sketchs non tournés sélectionnés.`);
}

function lignesExport(liste) {
  return liste.map((s) => ({ id: s.id, titre: s.titre, theme: s.theme || "", note: s.note ?? null, duree: dureeClip(s),
    dialogue: texteDialogue(s), gag_legende: s.gag_legende || "", prompt_image: promptImage(s), prompt_video: promptVideo(s) }));
}
function exporter(format) {
  const liste = SELECTION.size ? [...SELECTION].map((id) => SKETCHS.get(id)).filter(Boolean) : filtrer();
  const lignes = lignesExport(liste);
  let blob, nom;
  if (format === "json") {
    blob = new Blob([JSON.stringify(lignes, null, 1)], { type: "application/json" }); nom = "prompts.json";
  } else if (format === "csv") {
    // Excel en français : « ; » entre colonnes, virgule décimale ; une cellule qui commence par = + - @ est neutralisée
    const esc = (v) => { let x = typeof v === "number" ? String(v).replace(".", ",") : String(v); if (/^[=+\-@\t\r]/.test(x)) x = "'" + x; return `"${x.replace(/"/g, '""')}"`; };
    const tete = ["id", "titre", "theme", "note", "duree", "dialogue", "gag_legende", "prompt_image", "prompt_video"];
    blob = new Blob(["\ufeff" + [tete.join(";"), ...lignes.map((l) => tete.map((k) => esc(l[k] ?? "")).join(";"))].join("\n")], { type: "text/csv" });
    nom = "prompts.csv";
  } else if (format === "lot") {          // format des lots du pipeline Python (generer.py / chaine.py)
    blob = new Blob([JSON.stringify(liste.map(versLot), null, 1)], { type: "application/json" }); nom = "lot.json";
  } else {
    blob = new Blob([lignes.map((l) => `### ${l.id} — ${l.titre} (note ${l.note ?? "—"})\nDIALOGUE : ${l.dialogue}\n\nPROMPT IMAGE :\n${l.prompt_image}\n\nPROMPT VIDÉO :\n${l.prompt_video}\n`).join("\n")], { type: "text/plain" });
    nom = "prompts.txt";
  }
  telecharger(nom, blob);
  alerte(`${lignes.length} sketchs exportés (${lignes.length * 2} prompts).`);
}
function versLot(s) {
  const o = { id: s.id, titre: s.titre, lieu: s.lieu, persos: s.persos, dialogue: s.dialogue, jeu: s.jeu, chute: s.chute,
    fin: s.fin, emoji: s.emoji, cles: s.cles };
  if (s.duree) o.duree = s.duree;
  return o;
}

const texteOk = (x) => typeof x === "string" && x.trim().length > 0;
function sketchValide(s) {
  return !!(s && typeof s === "object" && texteOk(s.id) && /^[\w.-]{1,40}$/.test(s.id) && texteOk(s.titre) && texteOk(s.lieu) && texteOk(s.jeu) &&
    Array.isArray(s.persos) && s.persos.length >= 1 && s.persos.length <= 4 &&
    s.persos.every((p) => p && texteOk(p.nom) && texteOk(p.desc) && texteOk(p.pose)) &&
    Array.isArray(s.dialogue) && s.dialogue.length >= 1 && s.dialogue.length <= 6 &&
    s.dialogue.every((l) => Array.isArray(l) && Number.isInteger(l[0]) && s.persos[l[0]] && texteOk(l[1])) &&
    Number.isInteger(s.fin) && s.persos[s.fin] && (s.chute == null || typeof s.chute === "string") &&
    (s.duree == null || (Number.isInteger(s.duree) && s.duree >= 3 && s.duree <= 15)) &&
    (s.coupe == null || (typeof s.coupe === "number" && s.coupe > 1)));
}
async function importer(fichier) {
  let donnees;
  try { donnees = JSON.parse(await fichier.text()); } catch (e) { alerte("Fichier JSON illisible.", "erreur"); return; }
  const liste = Array.isArray(donnees) ? donnees : [donnees];
  let n = 0, rejet = 0, renommes = 0;
  for (const [k, s] of liste.entries()) {
    if (!sketchValide(s)) { rejet++; continue; }
    s.cles = Array.isArray(s.cles) ? s.cles.filter((c) => typeof c === "string") : [];
    s.emoji = ["choc", "mdr"].includes(s.emoji) ? s.emoji : "mdr";
    if (s.note != null && !Number.isFinite(+s.note)) delete s.note;
    // même id qu'un sketch existant mais texte différent : nouvel id (l'état et le clip de l'ancien ne passent pas au nouveau)
    const ancien = SKETCHS.get(s.id);
    if (ancien && JSON.stringify(versLot(ancien)) !== JSON.stringify(versLot(s))) { s.id = `${s.id}-${Date.now().toString(36)}${k}`; renommes++; }
    await DB.put("sketchs", s.id, s);
    SKETCHS.set(s.id, s);
    n++;
  }
  remplirThemes();
  afficherBanque();
  alerte(`${n} sketchs importés${renommes ? ` (${renommes} renommés : leur id existait déjà avec un autre texte)` : ""}${rejet ? `, ${rejet} rejetés (format incomplet)` : ""}.`, rejet ? "attention" : "info");
}

function remplirThemes() {
  const sel = $("#f-theme");
  const actuel = sel.value;
  const themes = [...new Set([...SKETCHS.values()].map((s) => s.theme).filter(Boolean))].sort();
  sel.innerHTML = "";
  sel.append(el("option", { value: "" }, `tous les thèmes (${themes.length})`), ...themes.map((t) => el("option", { value: t }, t)));
  sel.value = actuel;
}

function initBanque() {
  remplirThemes();
  for (const id of ["#f-recherche", "#f-theme", "#f-note", "#f-statut", "#f-tri"])
    $(id).addEventListener(id === "#f-recherche" ? "input" : "change", () => afficherBanque());
  $("#f-note").addEventListener("input", () => { $("#f-note-val").textContent = $("#f-note").value; });
  $("#b-meilleurs").addEventListener("click", selectionnerMeilleurs);
  $("#b-tout").addEventListener("click", () => { filtrer().forEach((s) => SELECTION.add(s.id)); afficherBanque(false); });
  $("#b-aucun").addEventListener("click", () => { SELECTION.clear(); afficherBanque(false); });
  $("#b-produire-sel").addEventListener("click", () => {
    if (!SELECTION.size) { alerte("Sélectionne d'abord des sketchs.", "attention"); return; }
    ajouterFile([...SELECTION]);
    montrerOnglet("production");
  });
  for (const f of ["json", "csv", "txt", "lot"]) $(`#b-export-${f}`).addEventListener("click", () => exporter(f));
  $("#b-importer").addEventListener("change", (e) => { if (e.target.files[0]) importer(e.target.files[0]); e.target.value = ""; });
  afficherBanque();
}
