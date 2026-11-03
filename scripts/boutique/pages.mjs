// Pages de Teranga Outils, régénérées depuis le catalogue public (fonction Edge « boutique ») :
// boutique/index.html, une page par produit, commande.html, cgv.html, guides gratuits (scripts/boutique/guides.json),
// sitemap.xml et clé IndexNow.
// node scripts/boutique/pages.mjs [catalogue.json]  → écrit dans boutique/ et affiche les URL nouvelles ou modifiées.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const RACINE = fileURLToPath(new URL("../../boutique/", import.meta.url));
const BASE = "https://ndoyepapamassamba-commits.github.io/Add-a-README-file/boutique/";
const API = "https://seegnylaubuularegmku.supabase.co/functions/v1/boutique";
const CLE_INDEXNOW = "ebb4ea75c352a571bd0b205056c2b276";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fcfa = (n) => Number(n || 0).toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ") + " F";
const sansAcc = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
// Guides gratuits : contenu utile trouvé sur les moteurs de recherche, relié aux produits (marketing sans aucun envoi de message)
const FICHIER_GUIDES = fileURLToPath(new URL("./guides.json", import.meta.url));
const guides = (existsSync(FICHIER_GUIDES) ? JSON.parse(readFileSync(FICHIER_GUIDES, "utf8")) : []).filter((g) => g && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.slug) && g.titre && Array.isArray(g.sections));
const carte = (p) => `<a class="carte" href="${esc(p.slug)}.html" data-cherche="${esc(sansAcc(p.titre + " " + p.domaine + " " + p.accroche))}">
<span class="etiquette">${esc(p.domaine)}${p.type === "generateur" ? " · sur mesure" : p.apercu && p.apercu.type === "document" ? " · kit à imprimer" : ""}</span><h3>${esc(p.titre)}</h3><p>${esc(p.accroche)}</p><span class="prix">${fcfa(p.prix)}</span></a>`;

function valeur(v, type) {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {
    if (type === "montant") return fcfa(Math.round(v));
    if (type === "pourcentage") return Math.round(v * 100) + " %";
    if (type === "decimal") return v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
    return v.toLocaleString("fr-FR");
  }
  return String(v);
}

const tete = (titre, description, canonique, extra = "") => `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titre)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonique)}">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#0b6e4f">
<meta property="og:type" content="website">
<meta property="og:locale" content="fr_FR">
<meta property="og:site_name" content="Teranga Outils">
<meta property="og:title" content="${esc(titre)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonique)}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230b6e4f'/%3E%3Ctext x='16' y='22' font-family='Arial' font-size='15' font-weight='700' fill='white' text-anchor='middle'%3EXL%3C/text%3E%3C/svg%3E">
<link rel="stylesheet" href="boutique.css">
${extra}</head>
<body>
<header class="top"><a class="brand" href="./">Teranga <b>Outils</b></a><span><a class="lien" href="./">Tous les outils</a>${guides.length ? ' · <a class="lien" href="guides.html">Guides</a>' : ""}</span></header>
`;
const pied = `<footer>
<p>Teranga Outils · outils Excel prêts à l'emploi, payés par Wave et livrés tout de suite. Vendeur : particulier au Sénégal.</p>
<p><a href="cgv.html">Conditions de vente</a> · <a href="../cv/">Teranga CV</a> · <a href="../formation/">Teranga Pro</a></p>
</footer>
<script src="boutique.js" defer></script>
</body>
</html>
`;

function rendreDocument(d) {
  if (!d || !Array.isArray(d.sections)) return "";
  return `<div class="document"><h3>${esc(d.titre)}</h3>${d.sections.map((s) => `${s.titre ? `<h4>${esc(s.titre)}</h4>` : ""}${(s.paragraphes || []).map((x) => `<p>${esc(x)}</p>`).join("")}${(s.puces || []).length ? `<ul>${s.puces.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`).join("")}</div>`;
}
function champ(c) {
  const id = "r_" + c.id, req = c.obligatoire ? " required" : "", lib = `<label for="${id}">${esc(c.label)}${c.obligatoire ? " *" : ""}</label>`;
  const aide = c.aide ? `<small>${esc(c.aide)}</small>` : "";
  if (c.type === "paragraphe") return lib + `<textarea id="${id}" name="${id}" rows="4" maxlength="${Number(c.max) || 1500}"${req}></textarea>` + aide;
  if (c.type === "choix") return lib + `<select id="${id}" name="${id}"${req}><option value="">Choisir…</option>${c.choix.map((x) => `<option>${esc(x)}</option>`).join("")}</select>` + aide;
  const type = c.type === "nombre" ? ' type="text" inputmode="decimal"' : c.type === "date" ? ' type="date"' : ' type="text"';
  return lib + `<input${type} id="${id}" name="${id}" maxlength="${Number(c.max) || 150}"${req}>` + aide;
}

function pageProduit(p) {
  const url = BASE + p.slug + ".html";
  const jsonld = [{
    "@context": "https://schema.org", "@type": "Product", name: p.titre, description: p.accroche, category: p.domaine,
    brand: { "@type": "Brand", name: "Teranga Outils" }, url,
    offers: { "@type": "Offer", price: String(p.prix), priceCurrency: "XOF", availability: "https://schema.org/InStock", url },
  }, {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: (p.faq || []).map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.r } })),
  }];
  const ap = p.apercu || { feuilles: [], synthese: [] };
  const kit = p.type !== "generateur" && ap.type === "document";
  const apercuKit = kit ? `<p style="color:var(--muted);font-size:15px">${esc(ap.titre)}${ap.sous_titre ? " — " + esc(ap.sous_titre) : ""} · ${Number(ap.pages) || ""} pages</p>
<h3>Sommaire</h3>\n<ol class="points">${(ap.sections_titres || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
<h3>Extrait</h3>\n${rendreDocument({ titre: ap.titre, sections: ap.extrait || [] })}` : "";
  const tableaux = (ap.feuilles || []).map((f) => `<h3>Feuille « ${esc(f.nom)} » (exemple)</h3>
<div class="apercu"><table><thead><tr>${f.colonnes.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
<tbody>${(f.lignes || []).map((l) => `<tr>${l.map((v, i) => `<td${typeof v === "number" ? ' class="n"' : ""}>${esc(valeur(v, f.types && f.types[i]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`).join("\n");
  const kpi = (ap.synthese || []).length ? `<h3>Tableau de bord (calculé sur l'exemple)</h3><div class="kpi">${ap.synthese.map((s) => `<div><span>${esc(s.libelle)}</span><strong>${esc(valeur(s.valeur, s.type))}</strong></div>`).join("")}</div>` : "";
  return tete(`${p.titre} | Teranga Outils`, p.accroche, url, `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>\n`) + `<main>
<p class="crumbs"><a href="./">Teranga Outils</a> › ${esc(p.domaine)}</p>
<span class="etiquette">${esc(p.domaine)}${kit ? " · kit à imprimer" : p.type === "generateur" ? " · sur mesure" : ""}</span>
<h1>${esc(p.titre)}</h1>
<p class="lead">${esc(p.accroche)}</p>
<p class="prix">${fcfa(p.prix)}</p>
<form class="achat" id="achat" data-produit="${esc(p.id)}" data-type="${esc(p.type || "fichier")}" novalidate>
  <strong>${p.type === "generateur" ? "Répondez aux questions : votre document est rédigé dès votre paiement Wave" : "Recevez le fichier tout de suite après votre paiement Wave"}</strong>
  ${p.type === "generateur" ? `<div class="formulaire">${(p.formulaire || []).map(champ).join("\n")}</div>` : ""}
  <label for="nom">Votre nom</label>
  <input type="text" id="nom" name="nom" autocomplete="name" required maxlength="80" placeholder="Ex. : Awa Ndiaye">
  <div class="hp" aria-hidden="true"><label>Laissez vide <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
  <label class="cgv"><input type="checkbox" name="cgv"> <span>J'accepte les <a href="cgv.html" target="_blank" rel="noopener">conditions de vente</a> : fichier numérique livré dès le paiement.</span></label>
  <p><button class="btn" type="submit">Commander — ${fcfa(p.prix)}</button></p>
  <p class="msg" id="achat-msg" role="status" aria-live="polite"></p>
  <p style="font-size:14px;color:var(--muted);margin:0">Paiement par Wave au montant exact affiché à l'étape suivante. Aucun compte à créer.</p>
</form>
<h2>${kit ? "Ce que contient ce kit" : p.type === "generateur" ? "Ce que vous recevez" : "Ce que fait cet outil"}</h2>
<p>${esc(p.description)}</p>
<ul class="points">${(p.points || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
${p.type === "generateur" ? `<h2>Exemple de document rédigé</h2>\n<p style="color:var(--muted);font-size:15px">Exemple obtenu avec des réponses fictives. Votre document est rédigé à partir de vos propres réponses.</p>\n${rendreDocument(p.exemple)}` : kit ? `<h2>Aperçu du kit</h2>\n${apercuKit}` : `<h2>Aperçu du classeur</h2>\n${tableaux}\n${kpi}`}
<h2>Questions fréquentes</h2>
${(p.faq || []).map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.r)}</p></details>`).join("\n")}
${guidesDe(p.slug)}
<p style="margin-top:1.5em">${p.type === "generateur" ? "Vous recevez le texte à l'écran et un fichier Word (.docx) modifiable, qui s'ouvre aussi sur téléphone. Relisez-le et adaptez-le avant de l'utiliser." : kit ? `Vous recevez le kit en PDF (prêt à imprimer ou à lire sur téléphone) et en Word (modifiable) : ${(p.fichiers || []).map((f) => `${esc(f.nom)} (${Math.max(1, Math.round(f.taille / 1024))} Ko)`).join(", ")}.` : `Fichier Excel (.xlsx) : ${(p.fichiers || []).map((f) => `${esc(f.nom)} (${Math.max(1, Math.round(f.taille / 1024))} Ko)`).join(", ")}. Fonctionne avec Excel, LibreOffice et Google Sheets, sur ordinateur ou téléphone.`}</p>
</main>
` + pied;
}

function guidesDe(slug) {
  const l = guides.filter((g) => (g.produits || []).includes(slug));
  return l.length ? `<h2>Guide gratuit</h2>\n<ul class="points">${l.map((g) => `<li><a href="guide-${esc(g.slug)}.html">${esc(g.titre)}</a></li>`).join("")}</ul>` : "";
}

function pageGuide(g, produits) {
  const url = BASE + "guide-" + g.slug + ".html";
  const lies = (g.produits || []).map((s) => produits.find((p) => p.slug === s)).filter(Boolean);
  const jsonld = { "@context": "https://schema.org", "@type": "Article", headline: g.titre, description: g.description, inLanguage: "fr", url,
    author: { "@type": "Organization", name: "Teranga Outils" }, publisher: { "@type": "Organization", name: "Teranga Outils" }, keywords: (g.mots_cles || []).join(", ") };
  const corps = g.sections.map((s) => `<h2>${esc(s.titre)}</h2>\n${(s.paragraphes || []).map((x) => `<p>${esc(x)}</p>`).join("\n")}${(s.puces || []).length ? `\n<ul class="points">${s.puces.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`).join("\n");
  const autres = guides.filter((x) => x.slug !== g.slug).slice(0, 4);
  return tete(g.titre + " | Teranga Outils", g.description || g.chapeau.slice(0, 155), url, `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>\n`) + `<main>
<p class="crumbs"><a href="./">Teranga Outils</a> › <a href="guides.html">Guides</a></p>
<h1>${esc(g.titre)}</h1>
<p class="lead">${esc(g.chapeau)}</p>
${corps}
${lies.length ? `<h2>Pour gagner du temps</h2>\n<div class="grille">${lies.map(carte).join("\n")}</div>` : `<p style="margin-top:1.5em"><a class="btn" href="./">Voir les outils et documents de Teranga Outils</a></p>`}
${autres.length ? `<h2>Autres guides</h2>\n<ul class="points">${autres.map((x) => `<li><a href="guide-${esc(x.slug)}.html">${esc(x.titre)}</a></li>`).join("")}</ul>` : ""}
</main>
` + pied;
}

function pageGuides() {
  return tete("Guides gratuits pour le commerce, la tontine, les loyers et les événements | Teranga Outils",
    "Guides pratiques et gratuits pour les commerçants, enseignants, propriétaires et familles du Sénégal : marges, stock, tontine, loyers, budget, annonces.", BASE + "guides.html") + `<main>
<p class="crumbs"><a href="./">Teranga Outils</a> › Guides</p>
<h1>Guides gratuits</h1>
<p class="lead">Des conseils pratiques, avec des exemples chiffrés en F CFA, pour mieux gérer votre activité ou votre budget.</p>
<div class="grille">${guides.map((g) => `<a class="carte" href="guide-${esc(g.slug)}.html"><span class="etiquette">Guide</span><h3>${esc(g.titre)}</h3><p>${esc(g.description || "")}</p></a>`).join("\n")}</div>
</main>
` + pied;
}

function pageIndex(produits) {
  const domaines = [...new Set(produits.map((p) => p.domaine))].sort((a, b) => a.localeCompare(b, "fr"));
  const cartes = (liste) => liste.map(carte).join("\n");
  const desc = `${produits.length} outils Excel et documents sur mesure pour le commerce, la tontine, les loyers, l'école, l'immobilier, les événements et plus : payés par Wave, livrés tout de suite.`;
  const jsonld = { "@context": "https://schema.org", "@type": "ItemList", itemListElement: produits.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: BASE + p.slug + ".html", name: p.titre })) };
  return tete("Outils Excel et documents sur mesure pour le Sénégal | Teranga Outils", desc, BASE, `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>\n`) + `<main>
<h1>Outils Excel et documents sur mesure</h1>
<p class="lead">Des classeurs Excel prêts à l'emploi et des documents rédigés sur mesure (annonces, fiches de poste, discours, livrets d'accueil…) pour votre commerce, votre famille ou votre activité. Payez par Wave, recevez tout de suite.</p>
<p><input class="recherche" id="recherche" type="search" placeholder="Rechercher un outil (stock, tontine, loyers…)" aria-label="Rechercher un outil"></p>
${produits.length ? domaines.map((d) => `<h2>${esc(d)}</h2>\n<div class="grille">${cartes(produits.filter((p) => p.domaine === d))}</div>`).join("\n") : "<p>Les premiers outils arrivent très bientôt.</p>"}
${guides.length ? `<h2>Guides gratuits</h2>\n<ul class="points">${guides.slice(0, 6).map((g) => `<li><a href="guide-${esc(g.slug)}.html">${esc(g.titre)}</a></li>`).join("")}</ul>\n<p><a href="guides.html">Tous les guides</a></p>` : ""}
<h2>Comment ça marche</h2>
<ol class="points"><li>Choisissez un outil et indiquez votre nom.</li><li>Envoyez par Wave le montant exact affiché.</li><li>Votre paiement est reconnu automatiquement : le fichier se télécharge aussitôt (lien valable 30 jours).</li></ol>
</main>
` + pied;
}

const commande = tete("Votre commande | Teranga Outils", "Paiement Wave et téléchargement de votre outil Excel.", BASE + "commande.html", '<meta name="robots" content="noindex">\n') + `<main id="commande">
<h1 id="titre-produit">Votre commande</h1>
<div id="attente" hidden>
  <div class="paiement">
    <p style="margin:0 0 .3em">Envoyez <strong>exactement</strong> ce montant par Wave :</p>
    <p class="montant" id="montant">…</p>
    <p style="margin:.2em 0">au numéro Wave <strong id="numero">…</strong> <button class="btn secondaire" type="button" data-copier="numero">Copier le numéro</button></p>
    <p id="exact" style="font-size:15px">Ce montant précis (quelques francs de moins que le prix) permet de reconnaître votre paiement automatiquement.</p>
  </div>
  <p>Dès que votre paiement arrive, cette page se met à jour toute seule (en général en moins de deux minutes) et vos fichiers apparaissent ici.</p>
  <p><button class="btn secondaire" type="button" data-copier="lien">Copier le lien de cette page</button> pour la retrouver plus tard.</p>
  <p style="font-size:14px;color:var(--muted)">Montant réservé pour vous pendant 72 heures. Le numéro Wave est celui du vendeur : vérifiez-le avant d'envoyer.</p>
</div>
<div id="payee" hidden>
  <p class="paiement"><strong>Paiement reçu, merci !</strong> <span id="payee-texte">Téléchargez vos fichiers ci-dessous.</span></p>
  <p id="redaction" hidden>Votre document est en cours de rédaction : il s'affiche ici dans une minute environ, sans recharger la page.</p>
  <div id="document-zone" hidden><div id="document"></div><p><button class="btn secondaire" type="button" id="copier-document">Copier le texte</button></p></div>
  <div class="fichiers" id="fichiers"></div>
  <p>Vos téléchargements restent ouverts jusqu'au <strong id="jusqu">…</strong>. Gardez le lien de cette page.</p>
</div>
</main>
` + pied;

const cgv = tete("Conditions de vente | Teranga Outils", "Conditions de vente des outils Excel de Teranga Outils : produit numérique, paiement Wave, livraison immédiate.", BASE + "cgv.html") + `<main>
<h1>Conditions de vente</h1>
<p class="lead">Version du 2 novembre 2026.</p>
<h2>Vendeur</h2><p>Teranga Outils est l'activité d'un particulier au Sénégal. Les reçus émis sont des reçus de paiement, pas des factures.</p>
<h2>Produits</h2><p>Des fichiers numériques (classeurs Excel .xlsx) décrits sur chaque page, avec un aperçu calculé sur des données d'exemple. Ce sont des outils de calcul et de suivi : ils ne remplacent ni un comptable, ni un juriste, ni un document officiel, et aucun résultat financier n'est garanti.</p>
<h2>Prix et paiement</h2><p>Prix en francs CFA, toutes taxes comprises le cas échéant. Paiement par Wave au montant exact indiqué après la commande (quelques francs de moins que le prix, pour reconnaître le paiement). Ce montant est réservé 72 heures.</p>
<h2>Livraison</h2><p>Le fichier est téléchargeable dès que le paiement est reconnu, depuis la page de la commande, pendant 30 jours (30 téléchargements par jour au plus).</p>
<h2>Documents sur mesure</h2><p>Pour un document sur mesure, vos réponses au formulaire sont transmises à un service d'intelligence artificielle (OpenRouter) qui rédige le document après votre paiement, en général en moins de deux minutes. Le texte s'appuie uniquement sur vos réponses : relisez-le et adaptez-le avant de l'utiliser. N'indiquez pas d'informations sensibles (santé, numéros de pièce d'identité, coordonnées bancaires). Vos réponses et le document sont effacés au plus tard 30 jours après le paiement.</p>
<h2>Droit d'usage</h2><p>Usage personnel ou au sein de votre entreprise. La revente ou la diffusion publique du fichier est interdite.</p>
<h2>Rétractation et réclamations</h2><p>En commandant, vous demandez la livraison immédiate du contenu numérique et renoncez au délai de rétractation une fois le fichier téléchargé. Si un fichier ne s'ouvre pas ou ne correspond pas à sa description, il est corrigé ou remboursé.</p>
<h2>Données personnelles</h2><p>Seuls votre nom et les informations de paiement nécessaires sont conservés, puis effacés au plus tard 30 jours après le paiement (ou 72 heures après une commande non payée). Aucune revente, aucune publicité ciblée.</p>
</main>
` + pied;

async function catalogue(argv) {
  if (argv[2]) return JSON.parse(readFileSync(argv[2], "utf8")).produits;
  const r = await fetch(API + "/catalogue", { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error("catalogue : HTTP " + r.status);
  return (await r.json()).produits;
}

const produits = (await catalogue(process.argv)).filter((p) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug));
mkdirSync(RACINE, { recursive: true });
const ecrits = new Map();
const ecrire = (nom, contenu) => {
  const chemin = RACINE + nom;
  const avant = existsSync(chemin) ? readFileSync(chemin, "utf8") : null;
  if (avant !== contenu) { writeFileSync(chemin, contenu); ecrits.set(nom, true); }
  else ecrits.set(nom, false);
};
for (const p of produits) ecrire(p.slug + ".html", pageProduit(p));
ecrire("index.html", pageIndex(produits));
ecrire("commande.html", commande);
ecrire("cgv.html", cgv);
ecrire(CLE_INDEXNOW + ".txt", CLE_INDEXNOW);
for (const g of guides) ecrire("guide-" + g.slug + ".html", pageGuide(g, produits));
if (guides.length) ecrire("guides.html", pageGuides());
// Produits retirés de la vente : leur page disparaît
const gardes = new Set(produits.map((p) => p.slug + ".html").concat(["index.html", "commande.html", "cgv.html"], guides.map((g) => "guide-" + g.slug + ".html"), guides.length ? ["guides.html"] : []));
for (const f of readdirSync(RACINE)) if (f.endsWith(".html") && !gardes.has(f)) { unlinkSync(RACINE + f); ecrits.set(f, true); }
const jour = new Date().toISOString().slice(0, 10);
const urls = [BASE, BASE + "cgv.html", ...produits.map((p) => BASE + p.slug + ".html"), ...(guides.length ? [BASE + "guides.html"] : []), ...guides.map((g) => BASE + "guide-" + g.slug + ".html")];
ecrire("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`);
const changees = [...ecrits].filter(([n, c]) => c && n.endsWith(".html") && n !== "commande.html" && existsSync(RACINE + n)).map(([n]) => n === "index.html" ? BASE : BASE + n);
writeFileSync(process.env.CHANGEES || "/tmp/boutique-changees.txt", changees.join("\n"));
console.log(`${produits.length} produits ; pages modifiées : ${changees.length}`);
console.log(createHash("sha256").update(JSON.stringify(produits)).digest("hex").slice(0, 12));
