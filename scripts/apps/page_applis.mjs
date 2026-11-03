// Applications TERANGA : page catalogue apps/index.html et plan apps/sitemap.xml, générés depuis apps/catalogue.json
// (une carte par appli prête : icône, nom, accroche, prix des pass, « Essayer gratuitement », « Acheter le pass »).
// node scripts/apps/page_applis.mjs   → écrit apps/index.html et apps/sitemap.xml, affiche les URL modifiées.
// La clé IndexNow apps/ebb4ea75c352a571bd0b205056c2b276.txt n'est jamais touchée.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const APPS = fileURLToPath(new URL("../../apps/", import.meta.url));
const SITE = "https://ndoyepapamassamba-commits.github.io/Add-a-README-file/";
const BASE = SITE + "apps/";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fcfa = (n) => Number(n || 0).toLocaleString("fr-FR").replace(/ | /g, " ").replace(/ /g, " ") + " F";
const json = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

const cat = JSON.parse(readFileSync(APPS + "catalogue.json", "utf8"));
const pretes = cat.applis.filter((a) => a.pret && /^[a-z0-9-]+$/.test(a.dossier) && existsSync(APPS + a.dossier + "/index.html") && (a.passes || []).length);
const parDossier = Object.fromEntries(pretes.map((a) => [a.dossier, a]));
const icone = (a) => (a.icone && existsSync(APPS + a.icone) ? a.icone : a.dossier + "/icons/icon-192.png");
const grande = (a) => { const g = icone(a).replace(/icon-192\.png$/, "icon-512.png"); return existsSync(APPS + g) ? g : icone(a); };
const duree = (p) => (p.duree_jours ? `${p.titre}` : "Licence à vie");
const acheter = (a, p) => (a.passes.length === 1 ? (p.duree_jours ? "Acheter le pass" : "Acheter la licence") : `Acheter le ${p.titre.toLowerCase()}`);

function carte(a) {
  const prix = a.passes.map((p) => `${esc(duree(p))}&nbsp;: <strong>${esc(fcfa(p.prix))}</strong>`).join(" · ");
  const voir = (a.voir_aussi || []).filter((v) => parDossier[v.dossier]).map((v) => `<p class="voir">${esc(v.texte)} Voir <a href="#${esc(v.dossier)}">${esc(parDossier[v.dossier].nom)}</a>.</p>`).join("");
  return `<article class="app" id="${esc(a.dossier)}">
  <img src="${esc(icone(a))}" alt="" width="96" height="96" loading="lazy">
  <div class="app-tete">
    <h2>${esc(a.nom)}</h2>
    ${(a.etiquettes || []).length ? `<div class="etiquettes">${a.etiquettes.map((e) => `<span>${esc(e)}</span>`).join("")}</div>` : ""}
  </div>
  <div class="app-corps">
    <p>${esc(a.accroche)}</p>
    ${(a.points || []).length ? `<ul class="points">${a.points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    <p class="prix">${a.gratuit ? `${esc(a.gratuit)} ` : "Essai gratuit. "}${prix}</p>
    ${voir}
  </div>
  <div class="actions"><a class="btn" href="${esc(a.dossier)}/">Essayer gratuitement</a>${a.passes.map((p) => `<a class="btn sec" href="../boutique/${esc(p.slug)}.html">${esc(acheter(a, p))} (${esc(fcfa(p.prix))})</a>`).join("")}</div>
</article>`;
}

const noms = pretes.map((a) => a.nom);
const listeNoms = noms.length > 1 ? noms.slice(0, -1).join(", ") + " et " + noms[noms.length - 1] : noms[0] || "";
const titre = "Applications TERANGA pour téléphone : essai gratuit, pass Wave | Teranga Outils";
const description = `${pretes.length} application${pretes.length > 1 ? "s" : ""} TERANGA en français et en F CFA pour votre téléphone : ${listeNoms}. Essai gratuit, pass payé par Wave et activé en un geste.`;
// « Vos données restent sur le téléphone » seulement pour les applis sans serveur (scripts/apps/passes.py le détecte)
const horsLigne = pretes.filter((a) => a.hors_ligne !== false && !a.serveur), enLigne = pretes.filter((a) => a.hors_ligne === false || a.serveur);
const et = (l) => (l.length > 1 ? l.slice(0, -1).join(", ") + " et " + l[l.length - 1] : l[0] || "");
const jsonld = {
  "@context": "https://schema.org", "@type": "ItemList", name: "Applications TERANGA", url: BASE,
  itemListElement: pretes.map((a, i) => ({
    "@type": "ListItem", position: i + 1, url: BASE + a.dossier + "/",
    item: {
      "@type": "SoftwareApplication", name: a.nom, url: BASE + a.dossier + "/", description: a.accroche, image: BASE + grande(a),
      applicationCategory: a.categorie || "BusinessApplication", operatingSystem: "Android, iOS, navigateur web", inLanguage: "fr",
      offers: [{ "@type": "Offer", name: "Version gratuite", price: "0", priceCurrency: "XOF" },
        ...a.passes.map((p) => ({ "@type": "Offer", name: p.titre, price: String(p.prix), priceCurrency: "XOF", url: SITE + "boutique/" + p.slug + ".html", availability: "https://schema.org/InStock" }))],
    },
  })),
};
const premiere = pretes[0];

const page = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titre)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${BASE}">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#0b6e4f">
<meta property="og:type" content="website">
<meta property="og:locale" content="fr_FR">
<meta property="og:site_name" content="Teranga Outils">
<meta property="og:title" content="Applications TERANGA pour téléphone">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${BASE}">
${premiere ? `<meta property="og:image" content="${esc(BASE + grande(premiere))}">\n<link rel="icon" type="image/png" href="${esc(premiere.dossier)}/icons/favicon-32.png">` : ""}
<script type="application/ld+json">${json(jsonld)}</script>
<style>
:root{--bg:#f5f7f4;--surface:#fff;--text:#17201b;--muted:#56625b;--line:#d9e0db;--brand:#0b6e4f;--brand-ink:#fff;--brand-soft:#e2f1ea;--brand-texte:#0b6e4f;--accent:#f2b705}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0f1412;--surface:#18201c;--text:#e8eeea;--muted:#a6b2ab;--line:#2d3833;--brand:#3fbf8c;--brand-ink:#04140d;--brand-soft:#173528;--brand-texte:#5fd3a3}}
:root[data-theme="dark"]{--bg:#0f1412;--surface:#18201c;--text:#e8eeea;--muted:#a6b2ab;--line:#2d3833;--brand:#3fbf8c;--brand-ink:#04140d;--brand-soft:#173528;--brand-texte:#5fd3a3}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;overflow-wrap:break-word}
a{color:var(--brand-texte)}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.top{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px 12px;padding:10px 16px;background:var(--surface);border-bottom:1px solid var(--line)}
.brand{font-weight:800;font-size:18px;text-decoration:none;color:var(--text)}
.brand b{color:var(--brand-texte)}
.top nav a{font-size:15px;font-weight:600;text-decoration:none;margin-left:12px}
.top nav a:first-child{margin-left:0}
main{max-width:820px;margin:0 auto;padding:12px 16px 40px}
h1{font-size:1.65rem;line-height:1.25;margin:.5em 0 .3em}
h2{font-size:1.25rem;line-height:1.3;margin:1.6em 0 .5em}
h3{font-size:1.05rem;margin:.2em 0 .4em}
.lead{font-size:1.1rem;color:var(--muted)}
.sommaire{display:flex;flex-wrap:wrap;gap:8px;margin:.8em 0 0;padding:0;list-style:none}
.sommaire a{display:inline-flex;align-items:center;min-height:40px;padding:4px 14px;border:1px solid var(--line);border-radius:999px;background:var(--surface);text-decoration:none;font-weight:600;font-size:15px}
.app{display:grid;grid-template-columns:96px 1fr;gap:16px;background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:18px;margin:1.2em 0;scroll-margin-top:70px}
.app img{border-radius:22px;width:96px;height:96px}
.app-tete{align-self:center;min-width:0}
.app-corps{grid-column:1/-1}
.app h2{margin:0 0 .2em}
.app p{margin:.3em 0}
.etiquettes{display:flex;flex-wrap:wrap;gap:6px;margin:.4em 0}
.etiquettes span{font-size:13px;font-weight:700;color:var(--brand-texte);background:var(--brand-soft);border-radius:999px;padding:2px 10px}
.points{padding-left:1.2em;margin:.6em 0}.points li{margin:.25em 0}
.prix{color:var(--muted)}.prix strong{color:var(--text)}
.voir{font-size:15px}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px;grid-column:1/-1}
.btn{display:inline-flex;align-items:center;justify-content:center;text-align:center;min-height:48px;padding:10px 20px;border-radius:14px;font-weight:700;text-decoration:none;background:var(--brand);color:var(--brand-ink);border:1.5px solid var(--brand)}
.btn.sec{background:transparent;color:var(--brand-texte)}
.etapes{counter-reset:e;list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.etapes li{counter-increment:e;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 14px 12px 52px;position:relative}
.etapes li::before{content:counter(e);position:absolute;left:14px;top:12px;width:28px;height:28px;border-radius:50%;background:var(--brand);color:var(--brand-ink);font-weight:800;display:flex;align-items:center;justify-content:center}
.colonnes{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.encart{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.encart ol{padding-left:1.3em;margin:.4em 0}.encart li{margin:.35em 0}
details{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 14px;margin:.5em 0}
summary{font-weight:600;cursor:pointer;min-height:32px}
footer{max-width:820px;margin:0 auto;padding:20px 16px 40px;font-size:14px;color:var(--muted);border-top:1px solid var(--line)}
footer a{color:var(--muted)}
@media (max-width:520px){h1{font-size:1.4rem}.app{grid-template-columns:64px 1fr;gap:12px;padding:14px}.app img{width:64px;height:64px;border-radius:16px}.app .btn{flex:1 1 100%}}
</style>
</head>
<body>
<header class="top"><a class="brand" href="../boutique/">Teranga <b>Outils</b></a><nav aria-label="Liens du site"><a href="../boutique/">Boutique</a><a href="../boutique/mes-commandes.html">Mes commandes</a><a href="../boutique/guides.html">Guides</a></nav></header>
<main>
<h1>Applications TERANGA pour votre téléphone</h1>
<p class="lead">Des applications simples, en français et en F CFA, qui s'installent en un geste sur votre téléphone. Essayez-les gratuitement ; le pass, payé par Wave, débloque la version complète.${horsLigne.length ? ` ${esc(et(horsLigne.map((a) => a.nom)))} ${horsLigne.length > 1 ? "marchent" : "marche"} même sans Internet.` : ""}</p>
${pretes.length > 1 ? `<ul class="sommaire" aria-label="Applications">${pretes.map((a) => `<li><a href="#${esc(a.dossier)}">${esc(a.nom)}</a></li>`).join("")}</ul>` : ""}
${pretes.map(carte).join("\n\n")}

<h2>Comment ça marche</h2>
<ol class="etapes">
  <li><strong>Essayez gratuitement.</strong> Ouvrez l'application et utilisez la version gratuite, sans compte ni inscription.</li>
  <li><strong>Payez le pass par Wave.</strong> Dans la boutique, envoyez le montant exact affiché : le paiement est reconnu tout seul.</li>
  <li><strong>Activez en un geste.</strong> Sur la page de votre commande, touchez «&nbsp;Ouvrir l'application et activer&nbsp;».</li>
</ol>

<h2 id="installer">Installer une application sur votre téléphone</h2>
<div class="colonnes">
  <section class="encart">
    <h3>Sur Android (Chrome)</h3>
    <ol>
      <li>Ouvrez l'application dans Chrome (bouton «&nbsp;Essayer gratuitement&nbsp;»).</li>
      <li>Touchez «&nbsp;Installer&nbsp;» dans l'application, ou le menu <b>⋮</b> en haut à droite.</li>
      <li>Choisissez «&nbsp;Installer l'application&nbsp;» ou «&nbsp;Ajouter à l'écran d'accueil&nbsp;».</li>
    </ol>
  </section>
  <section class="encart">
    <h3>Sur iPhone (Safari)</h3>
    <ol>
      <li>Ouvrez l'application dans Safari.</li>
      <li>Touchez le bouton <b>Partager</b> (carré avec une flèche vers le haut).</li>
      <li>Choisissez «&nbsp;Sur l'écran d'accueil&nbsp;», puis «&nbsp;Ajouter&nbsp;».</li>
    </ol>
  </section>
</div>
<p>L'icône apparaît sur votre écran d'accueil, comme une application normale.${horsLigne.length ? " Pour les applications hors ligne, plus besoin d'Internet après la première ouverture." : ""} Sur iPhone, activez le pass depuis l'application installée : copiez le lien de la page de votre commande, puis collez-le dans l'écran du pass de l'application.</p>

<h2>Questions fréquentes</h2>
<details><summary>Mes données sont-elles envoyées sur Internet ?</summary><p>${horsLigne.length ? `${esc(et(horsLigne.map((a) => a.nom)))} : non, ce que vous saisissez reste sur votre téléphone ; seule la vérification du pass passe par Internet. Pensez à faire une sauvegarde de temps en temps (Réglages de l'application). ` : ""}${enLigne.length ? `${esc(et(enLigne.map((a) => a.nom)))} : ce que vous partagez par lien passe par notre serveur pour que l'autre personne le voie ; seules les personnes qui ont le lien y ont accès, et c'est effacé 180 jours après la dernière activité.` : ""}</p></details>
<details><summary>Comment activer mon pass après le paiement ?</summary><p>Sur la page de votre commande payée, touchez «&nbsp;Ouvrir l'application et activer&nbsp;». Vous pouvez aussi copier le lien de cette page et le coller dans l'écran du pass de l'application. Un mode d'emploi en PDF est fourni avec chaque pass.</p></details>
<details><summary>Et si je change de téléphone ?</summary><p>Restaurez votre sauvegarde sur le nouveau téléphone, puis activez à nouveau avec le même lien de commande.</p></details>
<details><summary>Le pass se renouvelle-t-il tout seul ?</summary><p>Non. Rien n'est prélevé automatiquement. À la fin d'un pass, vos données restent sur votre téléphone et vous reprenez un pass seulement si vous le voulez.</p></details>
<details><summary>Puis-je les utiliser sur un ordinateur ?</summary><p>Oui, les applications fonctionnent aussi dans le navigateur d'un ordinateur, et peuvent y être installées avec Chrome ou Edge.</p></details>
<p>D'autres applications arrivent bientôt. Retrouvez aussi les <a href="../boutique/">outils Excel et documents sur mesure</a> de la boutique.</p>
</main>
<footer><p><a href="../boutique/">Boutique Teranga Outils</a> · <a href="../boutique/mes-commandes.html">Mes commandes</a> · <a href="../boutique/guides.html">Guides gratuits</a> · <a href="../cv/">Teranga CV</a> · <a href="../boutique/cgv.html">Conditions de vente</a></p></footer>
</body>
</html>
`;

const plan = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[BASE, ...pretes.map((a) => BASE + a.dossier + "/")].map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`;

const changees = [];
for (const [nom, contenu, url] of [["index.html", page, BASE], ["sitemap.xml", plan, null]]) {
  const avant = existsSync(APPS + nom) ? readFileSync(APPS + nom, "utf8") : null;
  if (avant !== contenu) { writeFileSync(APPS + nom, contenu); if (url) changees.push(url); }
}
console.log(`${pretes.length} applis prêtes (${noms.join(", ")}) ; apps/index.html et apps/sitemap.xml à jour`);
if (changees.length) console.log("Modifiées : " + changees.join(" "));
