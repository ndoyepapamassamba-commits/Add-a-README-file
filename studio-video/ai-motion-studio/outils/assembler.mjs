// Assemble l'application en UN seul fichier HTML (styles et scripts en ligne), à ouvrir d'un double-clic.
// Usage : node outils/assembler.mjs [--sans-troupe]   →   dist/MASSAMBA-AI-Motion-Studio.html
// Les vignettes de la troupe (prive/troupe-images.js) sont incluses si elles existent ; dist/ n'entre jamais dans le
// dépôt public (.gitignore). Le fichier assemblé est contrôlé : aucun chargement externe restant, aucune clé.
import fs from 'node:fs';
import path from 'node:path';

const ICI = path.dirname(new URL(import.meta.url).pathname);
const RACINE = path.join(ICI, '..');
const sansTroupe = process.argv.includes('--sans-troupe');
const lire = (p) => fs.readFileSync(path.join(RACINE, p), 'utf8');
const enLigne = (code) => code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

let html = lire('index.html');
html = html.replace(/<link rel="stylesheet" href="([^"]+)"\s*\/?>/g, (_, href) => '<style>\n' + lire(href) + '\n</style>');
let manquants = [];
html = html.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  if (src.startsWith('prive/') && (sansTroupe || !fs.existsSync(path.join(RACINE, src)))) { manquants.push(src); return '<!-- ' + src + ' non inclus -->'; }
  return '<script>/* ' + src + ' */\n' + enLigne(lire(src)) + '\n</script>';
});

// contrôles du fichier produit
const restes = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="(?!data:)([^"]+)"/g)].map((m) => m[1]);
if (restes.length) { console.error('Ressources externes restantes :', restes); process.exit(1); }
if (/hf_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|key_[A-Za-z0-9]{20,}/.test(html)) { console.error('Motif de clé détecté : assemblage refusé.'); process.exit(1); }

const dist = path.join(RACINE, 'dist'); fs.mkdirSync(dist, { recursive: true });
const sortie = path.join(dist, 'MASSAMBA-AI-Motion-Studio.html');
fs.writeFileSync(sortie, html);
const taille = fs.statSync(sortie).size;
console.log(JSON.stringify({ sortie, octets: taille, mo: +(taille / 1048576).toFixed(2), troupeIncluse: !manquants.length, nonInclus: manquants }));
