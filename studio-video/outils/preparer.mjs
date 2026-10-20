// PRÉPARER STUDIO VIDÉO — l'application vidéo partage le socle de MASSAMBA Workbench (React, Vite, client OpenRouter, JEV,
// composants d'interface) sans le recopier : un seul jeu de bibliothèques communes, celui de workbench/node_modules,
// visible depuis studio-video par la résolution standard de Node grâce au lien <dépôt>/node_modules → workbench/node_modules.
// Les bibliothèques propres à la vidéo (three.js, VRM, mediabunny, mp4box, glTF-Transform, cannon-es) sont dans
// studio-video/node_modules (npm install ici). Les images privées de l'utilisateur restent dans workbench/.private
// (ignoré par git, consigne du dépôt public) : studio-video/.private y renvoie.
//   node outils/preparer.mjs             → crée les liens manquants
//   node outils/preparer.mjs --verifier  → échoue avec la marche à suivre s'il manque quelque chose
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPOT = path.resolve(ICI, '..');
const WB = path.join(DEPOT, 'workbench');
const verifier = process.argv.includes('--verifier');
const manque = [];

function lien(cible, chemin, quoi) {
  if (fs.existsSync(chemin)) return;
  try {
    fs.lstatSync(chemin); // lien cassé : on le refait
    fs.rmSync(chemin);
  } catch {
    /* absent */
  }
  if (!fs.existsSync(path.resolve(path.dirname(chemin), cible))) return manque.push(`${quoi} : ${path.resolve(path.dirname(chemin), cible)} absent`);
  fs.symlinkSync(cible, chemin, 'dir');
  console.log(`lien créé : ${path.relative(DEPOT, chemin)} → ${cible}`);
}

if (!fs.existsSync(path.join(WB, 'node_modules', 'react'))) manque.push('socle : lancer « npm ci » dans workbench/');
else lien(path.join('workbench', 'node_modules'), path.join(DEPOT, 'node_modules'), 'socle');
if (!fs.existsSync(path.join(ICI, 'node_modules', 'three'))) manque.push('bibliothèques vidéo : lancer « npm ci » dans studio-video/');
lien(path.join('..', 'workbench', '.private'), path.join(ICI, '.private'), 'dossier privé');

if (manque.length) {
  console[verifier ? 'error' : 'warn'](`studio-video : à faire avant de construire :\n- ${manque.join('\n- ')}`);
  if (verifier && manque.some((m) => !m.startsWith('dossier privé'))) process.exit(1);
} else console.log('studio-video prêt : socle Workbench, bibliothèques vidéo et dossier privé reliés');
