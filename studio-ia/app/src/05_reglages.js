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
  $("#r-souvenir").addEventListener("change", (ev) => {
    if (!ev.target.checked) localStorage.removeItem("studio-cle");
    else if (CLE) localStorage.setItem("studio-cle", CLE);
  });
  $("#r-enregistrer-cle").addEventListener("click", async () => {
    const v = $("#r-cle").value.trim();
    if (!v || v.startsWith("••")) { alerte("Colle ta clé OpenRouter (elle commence par sk-or-).", "attention"); return; }
    definirCle(v, $("#r-souvenir").checked);
    $("#r-cle").value = "••••••••" + CLE.slice(-4);
    await testerCle();
    reprendreVideosLancees();               // vidéos payées avant la fermeture : récupérées dès que la clé est là
  });
  $("#r-tester").addEventListener("click", testerCle);
  $("#r-oublier").addEventListener("click", () => { definirCle("", false); sessionStorage.removeItem("studio-cle"); $("#r-cle").value = ""; alerte("Clé effacée de ce navigateur."); });
  $("#r-dossier").addEventListener("click", async () => {
    try { const d = await choisirDossier(); if (d) { $("#r-dossier-nom").textContent = `dossier : ${d.name}`; alerte(`Les images, clips et compilations seront aussi écrits dans « ${d.name} » (gardé pour les prochaines fois).`); } }
    catch (e) { if (e.name !== "AbortError") alerte(e.message, "erreur"); }
  });
  $("#r-avatar").addEventListener("change", async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    await DB.put("fichiers", "montage:avatar", f);
    await chargerAvatar();
    alerte("Logo de la chaîne enregistré.");
  });
  $("#r-effacer").addEventListener("click", async () => {
    if (!confirm("Effacer TOUT ce que l'application garde dans ce navigateur (images, clips, états, journal, ta clé) ? Les vidéos en cours seront perdues.")) return;
    // on arrête d'abord la production : une réponse qui arriverait pendant l'effacement réécrirait un état orphelin
    RUN.actif = false; RUN.pause = true;
    for (let i = 0; i < 300 && RUN.enCours.size; i++) await dormir(200);
    for (const m of ["etat", "fichiers", "journal", "sketchs"]) await DB.vider(m);
    for (const k of ["studio-file", "studio-cle"]) localStorage.removeItem(k);
    sessionStorage.removeItem("studio-cle");
    location.reload();
  });
  $("#r-journal").addEventListener("click", async () => {
    const j = await DB.tout("journal");
    // Excel en français : virgule décimale, date locale, BOM pour les accents
    const csv = "\ufeffdate;genre;modele;cout;sketch\n" + j.map((x) => `${new Date(x.t).toLocaleString("fr-FR")};${x.genre};${x.modele};${(+x.cout || 0).toFixed(4).replace(".", ",")};${x.ref ?? ""}`).join("\n");
    telecharger("depenses.csv", new Blob([csv], { type: "text/csv" }));
  });
}
async function testerCle() {
  try {
    const i = await lireSolde();
    alerte(`Clé valide. Solde utilisable : ${dollars(i.reste)}${i.limite != null ? ` (limite de la clé ${dollars(i.limite)})` : ""}${i.compte != null ? ` · crédit du compte ${dollars(i.compte)}` : ""}.`);
    if (i.reste == null) alerte("Solde inconnu : le plancher ne peut pas fonctionner. Fixe une limite de crédit à ta clé sur openrouter.ai/settings/keys.", "attention");
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
    if (await chargerDossier()) $("#r-dossier-nom").textContent = `dossier : ${DOSSIER.name} (Chrome redemandera l'accès au premier « Démarrer »)`;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});   // clips payés : pas d'éviction
  } catch (e) {
    alerte(`Mémoire du navigateur indisponible (${e.message}) : ouvre le fichier dans Chrome ou Edge, hors navigation privée.`, "erreur");
  }
  $$(".onglet").forEach((b) => b.addEventListener("click", () => montrerOnglet(b.dataset.onglet)));
  initReglages();
  initBanque();
  await initProduction();
  initMontage();
  majEntete();
  $("#nb-banque").textContent = `${SKETCHS.size} sketchs · ${SKETCHS.size * 2} prompts`;
  montrerOnglet((location.hash || "#banque").slice(1) || "banque");
  if (CLE) testerCle(); else alerte("Bienvenue ! Commence par coller ta clé OpenRouter dans l'onglet Réglages.");
  if (!window.VideoEncoder) alerte("Ce navigateur ne sait pas encoder la vidéo : le montage demandera Chrome ou Edge récent (la production d'images et de clips marche quand même).", "attention");
}
document.addEventListener("DOMContentLoaded", demarrerApplication);
