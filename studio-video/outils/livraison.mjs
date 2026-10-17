// LIVRAISON DE STUDIO VIDÉO — même règle que Workbench (consignes du 15/10/2026) : le dossier complet
// dist/livraison/MASSAMBA Studio Video/ (app, paquets de décors, lanceurs, pont Blender, moteur de la troupe, carnets,
// LISEZ-MOI.txt) et dist/livraison/A ENVOYER/ = SEULEMENT les fichiers qui diffèrent de la dernière livraison envoyée
// (empreintes dans .private/livraison-studio-video.json, ignoré par git). Contrôles bloquants : chaque fichier sous 30 Mio,
// paquets de la même version que l'app.
//   node outils/livraison.mjs            → assemble l'app (dist/app → dist/) puis prépare « A ENVOYER »
//   node outils/livraison.mjs --complet  → « A ENVOYER » = tout le dossier
//   node outils/livraison.mjs --envoyee  → enregistre la livraison qui vient d'être envoyée
// Première livraison : les paquets massamba-troupe-N.js identiques à ceux déjà envoyés avec Workbench ne sont pas renvoyés
// (le LISEZ-MOI dit de les déplacer du dossier Workbench vers celui-ci).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ICI);
const args = new Set(process.argv.slice(2));
const STATE = path.join('.private', 'livraison-studio-video.json');
const STATE_WB = path.join('.private', 'livraison-envoyee.json'); // livraison de Workbench (même dossier privé)
const SEND = path.join('dist', 'livraison', 'A ENVOYER');
const OUT = path.join('dist', 'livraison', 'MASSAMBA Studio Video');
const LIMIT = 30 * 1024 * 1024;
const APP = 'massamba-studio-video.html';
const PACK = /^massamba-troupe-\d+\.js$/;
const num = (f) => Number(/\d+/.exec(f)[0]);

// 1. Assemblage : la construction Vite écrit dist/app/index.html (+ paquets) ; l'app livrée porte son nom.
if (fs.existsSync(path.join('dist', 'app', 'index.html'))) {
  for (const f of fs.readdirSync('dist')) if (PACK.test(f)) fs.rmSync(path.join('dist', f));
  fs.copyFileSync(path.join('dist', 'app', 'index.html'), path.join('dist', APP));
  for (const f of fs.readdirSync(path.join('dist', 'app'))) if (PACK.test(f)) fs.copyFileSync(path.join('dist', 'app', f), path.join('dist', f));
}
if (!fs.existsSync(path.join('dist', APP))) {
  console.error(`livraison : dist/${APP} absent — lancer d'abord « npm run build »`);
  process.exit(1);
}
const packs = fs.readdirSync('dist').filter((f) => PACK.test(f)).sort((a, b) => num(a) - num(b));

// 2. Ce que contient le dossier livré : [chemin dans le dossier, source].
const files = [[APP, path.join('dist', APP)], ...packs.map((p) => [p, path.join('dist', p)])];
const ajouteDossier = (dossier, filtre) => {
  for (const f of fs.readdirSync(dossier, { recursive: true })) {
    const src = path.join(dossier, String(f));
    if (fs.statSync(src).isFile() && filtre(String(f)) && !/__pycache__|\.pyc$/.test(String(f))) files.push([src, src]);
  }
};
files.push([path.join('blender', 'blender-bridge.py'), path.join('blender', 'blender-bridge.py')]);
files.push([path.join('blender', 'blender-render.py'), path.join('blender', 'blender-render.py')]);
ajouteDossier(path.join('blender', 'film'), (f) => /\.(py|json)$/.test(f));
ajouteDossier('moteur-troupe', (f) => /\.(py|json|sh|ps1|md)$/.test(f));
ajouteDossier('carnets', (f) => /\.(ipynb|md)$/.test(f));

// Lanceurs (sans PowerShell : l'organisation de l'utilisateur l'interdit).
const LANCEURS = {
  'Lancer Studio Video.cmd': ['@echo off', 'rem Ouvre MASSAMBA Studio Video dans le navigateur par defaut (Chrome ou Edge conseilles).', `start "" "%~dp0${APP}"`, ''].join('\r\n'),
  'Lancer le pont Blender.cmd': [
    '@echo off',
    'rem Pont Blender local : l app envoie la scene, VOTRE Blender la rend (GPU, 0 $). Rien ne quitte la machine.',
    'rem Indiquez le chemin de blender.exe la premiere fois si Blender n est pas dans le PATH.',
    'set /p BLENDER="Chemin de blender.exe (Entree = blender) : "',
    'if "%BLENDER%"=="" set BLENDER=blender',
    'python "%~dp0blender\\blender-bridge.py" --blender "%BLENDER%"',
    'pause',
    '',
  ].join('\r\n'),
  'lancer-studio-video.sh': ['#!/bin/sh', '# Ouvre MASSAMBA Studio Video (Mac : open ; Linux : xdg-open).', `cd "$(dirname "$0")"`, `if command -v open >/dev/null 2>&1; then open "${APP}"; else xdg-open "${APP}"; fi`, ''].join('\n'),
};

// Version attendue des paquets (écrite dans l'app par la construction en paquets).
const app = fs.readFileSync(path.join('dist', APP), 'utf8');
const want = /packs:\{version:[`'"]([0-9a-f]{16})[`'"],count:(\d+)/.exec(app);
const errors = [];
if (want) {
  if (Number(want[2]) !== packs.length) errors.push(`l'app attend ${want[2]} paquet(s), ${packs.length} trouvé(s)`);
  for (const p of packs) {
    const v = /"version":"([0-9a-f]{16})"/.exec(fs.readFileSync(path.join('dist', p), 'utf8').slice(0, 300))?.[1];
    if (v !== want[1]) errors.push(`${p} : version ${v ?? '?'} ≠ app ${want[1]}`);
  }
} else if (packs.length) errors.push('paquets présents mais app construite sans paquets (construction simple)');

fs.rmSync(path.dirname(OUT), { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const rows = [];
const poser = (rel, src, contenu) => {
  const dst = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (contenu !== undefined) fs.writeFileSync(dst, contenu);
  else
    try {
      fs.linkSync(src, dst); // pas d'espace disque en plus
    } catch {
      fs.copyFileSync(src, dst);
    }
  const buf = fs.readFileSync(dst);
  rows.push({ f: rel.split(path.sep).join('/'), size: buf.length, sha: createHash('sha256').update(buf).digest('hex') });
  if (buf.length > LIMIT) errors.push(`${rel} : ${(buf.length / 1048576).toFixed(1)} Mio dépasse la limite d'envoi de 30 Mio`);
};
for (const [rel, src] of files) poser(rel, src);
for (const [nom, txt] of Object.entries(LANCEURS)) poser(nom, null, txt);
fs.chmodSync(path.join(OUT, 'lancer-studio-video.sh'), 0o755);

const n = packs.length;
const notice = [
  'MASSAMBA STUDIO VIDEO - DOSSIER A ENREGISTRER SUR LE BUREAU',
  want ? `Paquets de decors version ${want[1]}` : 'App sans paquets de decors',
  '',
  'CE QUE C EST',
  'L application video, separee de MASSAMBA Workbench le 16/10/2026 : Film Autopilot (studio de film IA),',
  'Video IA, bac a sable Realisation, Studio 3D, moteur de la troupe, reglages video. Workbench garde',
  'le chat, les analyses, les exports et JEV ; la video vit ici.',
  '',
  'INSTALLATION (premiere fois)',
  '1. Sur le Bureau, creez un dossier nomme : MASSAMBA Studio Video',
  `2. Enregistrez-y tout le contenu de ce dossier (${APP}${n ? `, les ${n} paquets massamba-troupe-*.js` : ''},`,
  '   les lanceurs et les dossiers blender, moteur-troupe et carnets), sans rien renommer.',
  ...(n
    ? [
        `3. Les paquets massamba-troupe-1.js a massamba-troupe-${n}.js du dossier MASSAMBA Workbench`,
        '   ne servent plus a Workbench : DEPLACEZ-les ici s ils ne sont pas dans cet envoi.',
      ]
    : []),
  `${n ? 4 : 3}. Double-cliquez sur « Lancer Studio Video.cmd » (Windows) ou sur ${APP} (Chrome ou Edge).`,
  '',
  'VOS DONNEES',
  'Au premier lancement, vos projets video, acteurs, decors et reglages video sont repris de Workbench',
  '(Workbench n est pas modifie). La cle OpenRouter et la cle JEV sont les memes que dans Workbench.',
  '',
  'PONT BLENDER (FACULTATIF)',
  'Double-cliquez sur « Lancer le pont Blender.cmd » (Python et Blender installes), puis dans l app :',
  'Reglages > Pont Blender local = http://127.0.0.1:8765.',
  '',
  'MOTEUR DE LA TROUPE ET CARNETS',
  'Dossier moteur-troupe : la chaine Python des films (voix, scene, visages, tournage, animation par outil',
  'jugee par JEV, fluidite RIFE, montage 9:16, controle). Dossier carnets : Colab / Kaggle, cartes gratuites.',
  'L ecran « Moteur de la troupe » de l app donne chaque commande a copier.',
  '',
  'MISES A JOUR',
  'Une livraison ne contient que les fichiers modifies : remplacez seulement ceux-la dans le dossier.',
  '',
  ...(n
    ? ['PAQUETS DE DECORS (taille en octets, empreinte SHA-256)', ...rows.filter((r) => PACK.test(r.f)).map((r) => `${r.f}  ${r.size}  ${r.sha}`), '']
    : []),
  'CONFIDENTIALITE',
  'Ces fichiers contiennent vos propres images (planches, galeries, decors). Gardez-les sur votre poste.',
  '',
].join('\r\n');
poser('LISEZ-MOI.txt', null, notice);

const total = rows.reduce((s, r) => s + r.size, 0);
console.log(`livraison : ${rows.length} fichiers, ${(total / 1048576).toFixed(1)} Mio (app ${(fs.statSync(path.join('dist', APP)).size / 1048576).toFixed(1)} Mio, ${n} paquet(s))`);
if (errors.length) {
  console.error(`livraison REFUSÉE :\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

let sent = {};
try {
  sent = JSON.parse(fs.readFileSync(STATE, 'utf8')).files ?? {};
} catch {
  // Première livraison : les paquets déjà envoyés avec Workbench (même empreinte) sont chez l'utilisateur.
  try {
    const wb = JSON.parse(fs.readFileSync(STATE_WB, 'utf8')).files ?? {};
    for (const [f, sha] of Object.entries(wb)) if (PACK.test(f)) sent[f] = sha;
  } catch {
    /* rien d'envoyé encore */
  }
}
if (args.has('--envoyee')) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ at: new Date().toISOString(), files: Object.fromEntries(rows.map((r) => [r.f, r.sha])) }, null, 1));
  console.log(`livraison enregistrée comme envoyée (${rows.length} fichiers) → ${STATE}`);
  process.exit(0);
}
const toSend = args.has('--complet') ? rows : rows.filter((r) => sent[r.f] !== r.sha);
fs.rmSync(SEND, { recursive: true, force: true });
fs.mkdirSync(SEND, { recursive: true });
for (const r of toSend) {
  const dst = path.join(SEND, r.f);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  try {
    fs.linkSync(path.join(OUT, r.f), dst);
  } catch {
    fs.copyFileSync(path.join(OUT, r.f), dst);
  }
}
const lourd = toSend.reduce((s, r) => s + r.size, 0);
console.log(`livraison prête → ${OUT}`);
console.log(`A ENVOYER → ${SEND} : ${toSend.length} fichier(s), ${(lourd / 1048576).toFixed(1)} Mio${toSend.some((r) => PACK.test(r.f)) ? '' : ' (paquets de décors déjà chez vous : rien à renvoyer)'}`);
