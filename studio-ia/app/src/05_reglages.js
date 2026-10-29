"use strict";
/* ============================================================================================================
   Réglages, onglets, démarrage.
   ============================================================================================================ */

function montrerOnglet(nom) {
  $$(".onglet").forEach((b) => b.classList.toggle("actif", b.dataset.onglet === nom));
  $$(".panneau").forEach((p) => { p.hidden = p.id !== `p-${nom}`; });
  if (nom === "montage") afficherMontage();
  if (nom === "production") afficherProduction();
  location.hash = nom;
}

function initReglages() {
  const champ = (id, cle, conv = (x) => x) => {
    const e = $(id);
    if (e.type === "checkbox") e.checked = !!R[cle]; else e.value = R[cle];
    e.addEventListener("change", () => { R[cle] = e.type === "checkbox" ? e.checked : conv(e.value); sauverReglages(); });
  };
  champ("#r-modele-image", "modeleImage");
  champ("#r-modele-video", "modeleVideo");
  champ("#r-modele-juge", "modeleJuge");
  champ("#r-resolution", "resolution");
  champ("#r-plancher", "plancher", (x) => Math.max(0, +x || 0));
  champ("#r-conc-images", "concurrenceImages", (x) => Math.max(1, Math.min(6, +x || 1)));
  champ("#r-conc-videos", "concurrenceVideos", (x) => Math.max(1, Math.min(8, +x || 1)));
  champ("#r-controle", "controle");
  champ("#r-reprise", "repriseAuto");
  champ("#r-nom", "nom");
  champ("#r-pseudo", "pseudo");
  champ("#r-accroche1", "accroche1");
  champ("#r-accroche2", "accroche2");
  champ("#r-credit", "creditGags");
  $("#r-cle").value = CLE ? "••••••••" + CLE.slice(-4) : "";
  $("#r-souvenir").checked = !!localStorage.getItem("studio-cle");
  $("#r-enregistrer-cle").addEventListener("click", async () => {
    const v = $("#r-cle").value.trim();
    if (!v || v.startsWith("••")) { alerte("Colle ta clé OpenRouter (elle commence par sk-or-).", "attention"); return; }
    definirCle(v, $("#r-souvenir").checked);
    $("#r-cle").value = "••••••••" + CLE.slice(-4);
    await testerCle();
  });
  $("#r-tester").addEventListener("click", testerCle);
  $("#r-oublier").addEventListener("click", () => { definirCle("", false); sessionStorage.removeItem("studio-cle"); $("#r-cle").value = ""; alerte("Clé effacée de ce navigateur."); });
  $("#r-dossier").addEventListener("click", async () => {
    try { const d = await choisirDossier(); if (d) { $("#r-dossier-nom").textContent = `dossier : ${d.name}`; alerte(`Les images, clips et compilations seront aussi écrits dans « ${d.name} ».`); } }
    catch (e) { if (e.name !== "AbortError") alerte(e.message, "erreur"); }
  });
  $("#r-avatar").addEventListener("change", async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    await DB.put("fichiers", "montage:avatar", f);
    await chargerAvatar();
    alerte("Logo de la chaîne enregistré.");
  });
  $("#r-effacer").addEventListener("click", async () => {
    if (!confirm("Effacer TOUT ce que l'application garde dans ce navigateur (images, clips, compilations, états, journal) ? Les vidéos en cours seront perdues.")) return;
    for (const m of ["etat", "fichiers", "journal", "sketchs"]) await DB.vider(m);
    localStorage.removeItem("studio-file");
    location.reload();
  });
  $("#r-journal").addEventListener("click", async () => {
    const j = await DB.tout("journal");
    const csv = "date;genre;modele;cout;sketch\n" + j.map((x) => `${new Date(x.t).toISOString()};${x.genre};${x.modele};${(+x.cout).toFixed(4)};${x.ref}`).join("\n");
    telecharger("depenses.csv", new Blob([csv], { type: "text/csv" }));
  });
}
async function testerCle() {
  try {
    const i = await infoCle();
    RUN.resteCle = i.reste; RUN.derniereVerifCle = Date.now(); majCle();
    alerte(`Clé valide. Solde restant : ${dollars(i.reste)}${i.limite != null ? ` (limite ${dollars(i.limite)})` : ""}.`);
  } catch (e) { alerte(`Clé refusée : ${e.message}`, "erreur"); }
}
async function chargerAvatar() {
  const f = await DB.get("fichiers", "montage:avatar");
  if (!f) return;
  AVATAR = await new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = URL.createObjectURL(f); });
}

async function demarrerApplication() {
  try {
    await chargerDepenses();
    await chargerBanque();
    await chargerAvatar();
  } catch (e) {
    alerte(`Mémoire du navigateur indisponible (${e.message}) : ouvre le fichier dans Chrome ou Edge, hors navigation privée.`, "erreur");
  }
  $$(".onglet").forEach((b) => b.addEventListener("click", () => montrerOnglet(b.dataset.onglet)));
  initReglages();
  initBanque();
  initProduction();
  initMontage();
  majEntete();
  $("#nb-banque").textContent = `${SKETCHS.size} sketchs · ${SKETCHS.size * 2} prompts`;
  montrerOnglet((location.hash || "#banque").slice(1) || "banque");
  if (CLE) testerCle(); else alerte("Bienvenue ! Commence par coller ta clé OpenRouter dans l'onglet Réglages.");
  if (!window.VideoEncoder) alerte("Ce navigateur ne sait pas encoder la vidéo : le montage demandera Chrome ou Edge récent (la production d'images et de clips marche quand même).", "attention");
}
document.addEventListener("DOMContentLoaded", demarrerApplication);
