/**
 * Commande : génère le personnage de test MODOU (dessin procédural) et son `rig.json`.
 *
 *   npx tsx src/outils/personnage-test/generer.ts [--sortie <dossier>]
 *
 * Écrit dans `assets-test/modou-test/` (par défaut) :
 * - `modou-test.png` : le dessin (RGBA, fond transparent, 720×1440) ;
 * - `modou-test.parties.png` : carte des parties (canal rouge = index + 1 de l'os, voir `rig.json`) ;
 * - `rig.json` : description source (`moteur-fluide/rig-source@1`) : articulations, visage, pieds, carte.
 * Puis construit le rig complet (maillage, poids) pour contrôle et affiche ses mesures.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chargerRig, ecrirePNG } from '../../rig/charger';
import { FORMAT_SOURCE_RIG, type SourceRig } from '../../rig/construire';
import { RACINE_MOTEUR } from '../kit';
import { ARTICULATIONS, HAUTEUR, LARGEUR, PARTIES_OS, PIEDS, VISAGE, calquesModou } from './modou';
import { peindre } from './peintre';

const AIDE = `Personnage de test MODOU (dessin procédural)

Utilisation :
  npx tsx src/outils/personnage-test/generer.ts [--sortie <dossier>]

Options :
  --sortie <dossier>  dossier de sortie (défaut : assets-test/modou-test)
  --aide              afficher cette aide
`;

function principal(): number {
  const { values } = parseArgs({ options: { sortie: { type: 'string' }, aide: { type: 'boolean', short: 'h' } } });
  if (values.aide) {
    console.log(AIDE);
    return 0;
  }
  const dossier = resolve(values.sortie ?? join(RACINE_MOTEUR, 'assets-test', 'modou-test'));
  mkdirSync(dossier, { recursive: true });
  const t0 = performance.now();
  const p = peindre(LARGEUR, HAUTEUR, calquesModou());
  const t1 = performance.now();
  ecrirePNG(join(dossier, 'modou-test.png'), { largeur: p.largeur, hauteur: p.hauteur, donnees: p.rgba });
  // Carte des parties : canal rouge = index + 1 dans PARTIES_OS.
  const carte = new Uint8Array(4 * LARGEUR * HAUTEUR);
  const inconnus = new Set<string>();
  for (let i = 0; i < LARGEUR * HAUTEUR; i++) {
    const k = p.partieParPixel[i]!;
    if (k < 0) continue;
    const nom = p.parties[k]!;
    const j = (PARTIES_OS as readonly string[]).indexOf(nom);
    if (j < 0) {
      inconnus.add(nom);
      continue;
    }
    carte[4 * i] = j + 1;
    carte[4 * i + 3] = 255;
  }
  if (inconnus.size) throw new Error(`Parties inconnues : ${[...inconnus].join(', ')}`);
  ecrirePNG(join(dossier, 'modou-test.parties.png'), { largeur: LARGEUR, hauteur: HAUTEUR, donnees: carte });
  const source: SourceRig = {
    format: FORMAT_SOURCE_RIG,
    id: 'modou-test',
    nom: 'MODOU (personnage de test)',
    image: 'modou-test.png',
    orientationDessin: 0,
    articulations: ARTICULATIONS,
    pieds: PIEDS,
    ancrageSol: { x: (PIEDS.gauche.x + PIEDS.droit.x) / 2, y: PIEDS.droit.y },
    visage: VISAGE,
    parties: { image: 'modou-test.parties.png', os: [...PARTIES_OS] },
    provenance: {
      source: 'dessin procédural du moteur (src/outils/personnage-test/modou.ts)',
      licence: 'propriété du projet (aucune ressource tierce)',
    },
  };
  writeFileSync(join(dossier, 'rig.json'), JSON.stringify(source, null, 2) + '\n');
  const { rig, rapport } = chargerRig(join(dossier, 'rig.json'), { cache: false });
  console.log(`Dessin : ${LARGEUR}×${HAUTEUR} en ${((t1 - t0) / 1000).toFixed(2)} s → ${dossier}`);
  if (rapport) {
    console.log(
      `Rig « ${rig.id} » : ${rapport.maillage.sommets} sommets, ${rapport.maillage.triangles} triangles, ` +
        `couverture ${(100 * rapport.couverture).toFixed(2)} %, triangles dehors ${rapport.trianglesDehors}, ` +
        `segments manquants ${rapport.maillage.segmentsManquants}, angle min p5 ${rapport.maillage.angleMinP5.toFixed(1)}°, ` +
        `sommets libres ${rapport.poids.sommetsLibres}, CoR ${rapport.poids.sommetsCor}, ponts coupés ${rapport.poids.pontsRetires}, ` +
        `construit en ${(rapport.dureeMs / 1000).toFixed(2)} s`,
    );
    console.log(`Groupes : ${rig.groupes.map((g) => `${g.nom}(${g.nombreTriangles}, ordre ${g.ordre})`).join(' ')}`);
  }
  return 0;
}

process.exitCode = principal();
