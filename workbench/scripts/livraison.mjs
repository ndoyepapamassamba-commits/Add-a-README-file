// LIVRAISON — consigne de l'utilisateur (15/10/2026) : « tu livreras désormais l'app avec les paquets ».
// Assemble dist/livraison/MASSAMBA Workbench/ : l'app, les paquets de décors massamba-troupe-N.js et LISEZ-MOI.txt
// (installation, vérification, repli, tailles, empreintes SHA-256). Contrôle bloquant : chaque fichier sous la limite
// d'envoi de 30 Mio, et les paquets de la même version que l'app. Les images de l'utilisateur restent hors du dépôt
// (dist/ est ignoré par git).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const LIMIT = 30 * 1024 * 1024; // limite d'envoi d'un fichier
const WARN = 27 * 1024 * 1024; // marge : au-delà, prévoir de déplacer du contenu de l'app vers les paquets
const APP = 'massamba-workbench-direct.html';
const OUT = path.join('dist', 'livraison', 'MASSAMBA Workbench');

if (!fs.existsSync(path.join('dist', APP))) {
  console.error(`livraison : dist/${APP} absent — lancez d'abord la construction`);
  process.exit(1);
}
const packs = fs
  .readdirSync('dist')
  .filter((f) => /^massamba-troupe-\d+\.js$/.test(f))
  .sort((a, b) => Number(/\d+/.exec(a)[0]) - Number(/\d+/.exec(b)[0]));
const files = [APP, ...packs];

// Same version on both sides: the app refuses packs of another build.
const app = fs.readFileSync(path.join('dist', APP), 'utf8');
const want = /packs:\{version:[`'"]([0-9a-f]{16})[`'"],count:(\d+)/.exec(app);
const errors = [];
if (want) {
  if (Number(want[2]) !== packs.length) errors.push(`l'app attend ${want[2]} paquet(s), ${packs.length} trouvé(s)`);
  for (const p of packs) {
    const head = fs.readFileSync(path.join('dist', p), 'utf8').slice(0, 300);
    const v = /"version":"([0-9a-f]{16})"/.exec(head)?.[1];
    if (v !== want[1]) errors.push(`${p} : version ${v ?? '?'} ≠ app ${want[1]}`);
  }
} else if (packs.length) errors.push('paquets présents mais app construite sans paquets (build simple)');

fs.rmSync(path.dirname(OUT), { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const rows = [];
for (const f of files) {
  const src = path.join('dist', f);
  const dst = path.join(OUT, f);
  try {
    fs.linkSync(src, dst); // no extra disk space
  } catch {
    fs.copyFileSync(src, dst);
  }
  const size = fs.statSync(src).size;
  const sha = createHash('sha256').update(fs.readFileSync(src)).digest('hex');
  rows.push({ f, size, sha });
  if (size > LIMIT) errors.push(`${f} : ${(size / 1048576).toFixed(1)} Mio dépasse la limite d'envoi de 30 Mio`);
  // The packs are split automatically under the limit; the app itself grows with each version.
  else if (f === APP && size > WARN)
    console.warn(`livraison : attention, l'app approche la limite (${(size / 1048576).toFixed(1)} Mio) — déplacer planches et galeries dans les paquets`);
}

const date = new Date().toLocaleDateString('fr-FR');
const n = packs.length;
const notice = [
  'MASSAMBA WORKBENCH - DOSSIER A ENREGISTRER SUR LE BUREAU',
  `Version du ${date}${want ? ` - paquets de decors version ${want[1]}` : ''}`,
  '',
  'INSTALLATION',
  '1. Sur le Bureau, creez un dossier nomme : MASSAMBA Workbench',
  `2. Enregistrez dans ce dossier les ${files.length + 1} fichiers de la livraison, sans les renommer.`,
  `3. Double-cliquez sur ${APP} (Chrome ou Edge conseilles).`,
  '   Une nouvelle livraison remplace TOUS les fichiers du dossier.',
  '',
  ...(n
    ? [
        'VERIFICATION',
        'Ouvrez Video IA, puis Image, puis Images du projet.',
        "Le message doit indiquer : decors charges depuis les paquets a cote de l'app.",
        '',
        'SI LES DECORS NE SE CHARGENT PAS TOUT SEULS',
        `- Verifiez les noms : massamba-troupe-1.js a massamba-troupe-${n}.js, exactement.`,
        "  Un navigateur peut ajouter (1) au nom d'un fichier telecharge deux fois.",
        '- Sinon, dans la galerie Images du projet, cliquez sur Importer les paquets de decors',
        `  et choisissez les ${n} fichiers .js. A faire une seule fois : ils restent dans le navigateur.`,
        '',
      ]
    : []),
  'CONTENU DU DOSSIER (taille en octets, empreinte SHA-256)',
  ...rows.map((r) => `${r.f}  ${r.size}  ${r.sha}`),
  '',
  'CONFIDENTIALITE',
  'Ces fichiers contiennent vos propres images (planches, galeries, decors).',
  'Gardez-les sur votre poste ; ne les publiez pas.',
  '',
].join('\r\n');
fs.writeFileSync(path.join(OUT, 'LISEZ-MOI.txt'), notice);

for (const r of rows) console.log(`livraison : ${r.f} ${(r.size / 1048576).toFixed(1)} Mio`);
if (errors.length) {
  console.error(`livraison REFUSÉE :\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`livraison prête → ${OUT} (${files.length + 1} fichiers, chacun sous 30 Mio)`);
