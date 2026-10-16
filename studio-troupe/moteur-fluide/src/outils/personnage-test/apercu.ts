/**
 * Commande : planche de contrôle d'un rig (maillage, parties, bandes de poids, poses de test en CoR et en LBS),
 * rendue sur processeur. Les planches vont dans `studio-troupe/sorties/` (jamais versées au dépôt).
 *
 *   npx tsx src/outils/personnage-test/apercu.ts <rig.json> [--sortie <fichier.png>] [--echelle 0.5]
 */
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { appliquerIK } from '../../rig/ik';
import {
  collerImage,
  couleurIndex,
  creerToile,
  dessinerChamp,
  dessinerFilDeFer,
  dessinerMaillageTexture,
  point,
  type Placement,
  type Toile,
} from '../../rig/apercu';
import { chargerRig, ecrirePNG, lirePNG } from '../../rig/charger';
import { calculerFK } from '../../rig/fk';
import { deformer } from '../../rig';
import type { CharacterRig, Pose, TransformOs, Vec2 } from '../../timeline/types';
import { DOSSIER_SORTIES } from '../kit';

const AIDE = `Planche de contrôle d'un rig

Utilisation :
  npx tsx src/outils/personnage-test/apercu.ts <rig.json> [options]

Options :
  --sortie <fichier.png>  planche à écrire (défaut : studio-troupe/sorties/rig-apercu/<id>.png)
  --echelle <k>           échelle des vignettes (défaut 0,5)
  --aide                  afficher cette aide
`;

const racine = { decalage: { x: 0, y: 0 }, rotation: 0, echelle: { x: 1, y: 1 }, flip: false };
const r = (rotation: number, echelle = { x: 1, y: 1 }): TransformOs => ({ rotation, translation: { x: 0, y: 0 }, echelle });

/** Poses de test : gestes francs aux extrêmes utiles (coudes à 120°, bras levé, haussement, flexion). */
export function posesDeTest(rig: CharacterRig): Array<{ nom: string; pose: Pose; methode?: 'lbs' | 'cor' }> {
  const poses: Array<{ nom: string; pose: Pose; methode?: 'lbs' | 'cor' }> = [];
  poses.push({
    nom: 'salut',
    pose: { os: { brasG: r(-2.3), avantBrasG: r(1.5), mainG: r(-0.3), tete: r(0.12), cou: r(0.05), torse: r(0.04), brasD: r(0.15) }, racine },
  });
  poses.push({ nom: 'coudes 120° (CoR)', pose: { os: { avantBrasD: r(-2.09), avantBrasG: r(2.09), brasD: r(0.35), brasG: r(-0.35) }, racine } });
  poses.push({ nom: 'coudes 120° (LBS)', pose: { os: { avantBrasD: r(-2.09), avantBrasG: r(2.09), brasD: r(0.35), brasG: r(-0.35) }, racine }, methode: 'lbs' });
  poses.push({
    nom: 'haussement',
    pose: { os: { epauleG: r(-0.3), epauleD: r(0.3), brasG: r(-0.55), brasD: r(0.55), avantBrasG: r(1.2), avantBrasD: r(-1.2), mainG: r(-0.6), mainD: r(0.6), tete: r(-0.18), cou: r(-0.06) }, racine },
  });
  // Pointer avec le bras droit (IK) vers le haut à gauche de l'image ; tête qui suit.
  const ikBrasD = rig.ik?.find((d) => d.nom === 'brasD');
  if (ikBrasD) {
    const base: Pose = { os: { torse: r(-0.06), tete: r(-0.15), cou: r(-0.05) }, racine };
    const epaule = rig.squelette.os.find((o) => o.nom === 'brasD')!.pivot;
    const cible: Vec2 = { x: epaule.x - 300, y: epaule.y - 150 };
    poses.push({ nom: 'pointer (IK)', pose: appliquerIK(rig.squelette, base, ikBrasD, cible).pose });
  }
  // Flexion : le bassin descend, les pieds restent au sol (IK des deux jambes), le buste se penche un peu.
  const ikG = rig.ik?.find((d) => d.nom === 'jambeG');
  const ikD = rig.ik?.find((d) => d.nom === 'jambeD');
  if (ikG && ikD) {
    let pose: Pose = { os: { bassin: { rotation: 0, translation: { x: 0, y: 0.06 * rig.hauteurPx }, echelle: { x: 1, y: 1 } }, torse: r(0.05), brasG: r(-0.5), brasD: r(0.5), avantBrasG: r(0.6), avantBrasD: r(-0.6) }, racine };
    const repos = calculerFK(rig.squelette, { os: {}, racine });
    for (const def of [ikG, ikD]) {
      const i = rig.squelette.os.findIndex((o) => o.nom === def.effecteur);
      pose = appliquerIK(rig.squelette, pose, def, repos.pivots[i]!, { angleEffecteur: rig.squelette.os[i]!.angleRepos }).pose;
    }
    poses.push({ nom: 'flexion (IK pieds)', pose });
  }
  poses.push({
    nom: 'étirement et écrasement',
    pose: { os: { avantBrasG: r(0.4, { x: 0.95, y: 1.25 }), brasG: r(-1.4), tete: r(0.3, { x: 1.08, y: 0.93 }), torse: r(-0.12, { x: 1.03, y: 0.97 }) }, racine },
  });
  return poses;
}

function etiquette(t: Toile, x: number, y: number, n: number): void {
  // Petite pastille numérotée (lisible sans police) : n points.
  for (let k = 0; k < n; k++) point(t, x + 8 + k * 9, y + 10, 3, [40, 40, 40]);
}

function principal(): number {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { sortie: { type: 'string' }, echelle: { type: 'string' }, aide: { type: 'boolean', short: 'h' } },
  });
  if (values.aide || positionals.length === 0) {
    console.log(AIDE);
    return values.aide ? 0 : 1;
  }
  const { rig, rapport } = chargerRig(resolve(positionals[0]!));
  const texture = lirePNG(rig.image.chemin);
  const k = Number(values.echelle ?? 0.5);
  const lv = Math.ceil(rig.image.largeur * k);
  const hv = Math.ceil(rig.image.hauteur * k);
  const poses = posesDeTest(rig);
  const vignettes = 3 + poses.length;
  const colonnes = 5;
  const lignes = Math.ceil(vignettes / colonnes);
  const toile = creerToile(colonnes * lv, lignes * hv);
  const place = (i: number): Placement => ({ echelle: k, dx: (i % colonnes) * lv, dy: Math.floor(i / colonnes) * hv });
  const m = rig.maillage;
  const repos = Float32Array.from(m.positions);
  // 1. Image + fil de fer + articulations.
  collerImage(toile, texture, place(0));
  dessinerFilDeFer(toile, rig, repos, place(0), [20, 20, 30], 0.35);
  for (const o of rig.squelette.os) point(toile, o.pivot.x * k + place(0).dx, o.pivot.y * k + place(0).dy, 3, [220, 30, 30]);
  // 2. Parties.
  collerImage(toile, texture, place(1));
  dessinerChamp(toile, rig, repos, place(1), (v) => [...couleurIndex(m.partie?.[v] ?? 0), 0.7]);
  // 3. Bandes : 1 − poids dominant (blanc = rigide, rouge = mélange).
  dessinerChamp(toile, rig, repos, place(2), (v) => {
    let max = 0;
    for (let s = 0; s < 4; s++) if (m.influences[4 * v + s]! >= 0) max = Math.max(max, m.poids[4 * v + s]!);
    const u = Math.min(1, 2 * (1 - max));
    return [255, Math.round(245 - 200 * u), Math.round(235 - 220 * u), 1];
  });
  // 4. Poses.
  poses.forEach((p, i) => {
    const s = deformer(rig, p.pose, p.methode ? { methode: p.methode } : {});
    dessinerMaillageTexture(toile, rig, texture, s, place(3 + i), p.pose.ordreGroupes);
    etiquette(toile, place(3 + i).dx, place(3 + i).dy, i + 1);
  });
  const sortie = resolve(values.sortie ?? join(DOSSIER_SORTIES, 'rig-apercu', `${rig.id}.png`));
  mkdirSync(dirname(sortie), { recursive: true });
  ecrirePNG(sortie, toile);
  console.log(`Planche : ${sortie}`);
  console.log(`Poses : ${poses.map((p, i) => `${i + 1}. ${p.nom}`).join(' ; ')}`);
  if (rapport) console.log(`Maillage : ${rapport.maillage.sommets} sommets, ${rapport.maillage.triangles} triangles ; poids : ${JSON.stringify(rapport.poids.rayons)}`);
  return 0;
}

process.exitCode = principal();
