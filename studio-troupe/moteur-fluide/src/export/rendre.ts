/**
 * Commande `npm run rendre -- <projet.json> [options]` : valide un projet, évalue toutes ses images et (quand le
 * module `export/` sera branché) produit le MP4 9:16 vérifié.
 *
 * ÉTAT : ébauche du socle. La vérification (validation + évaluation pure de chaque image + empreinte de
 * déterminisme) fonctionne ; l'export MP4 n'est PAS encore branché et la commande le dit, sans rien simuler.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { creerMoteurComplet } from '../assemblage';
import { formaterDuree, imageVersTemps, nombreImages, tempsVersImage, timecode } from '../noyau/temps';
import { MANIFESTE_DECORS_DEFAUT, chargerDecors } from '../outils/kit';
import { evaluer } from '../timeline/evaluer';
import { validerProjet } from '../timeline/projet';
import type { InfoDecor } from '../timeline/types';

const AIDE = `Moteur fluide de la troupe — rendu d'un projet

Utilisation :
  npm run rendre -- <projet.json> [options]

Options :
  --sortie <fichier.mp4>  produire la vidéo (module export : pas encore branché)
  --de <secondes>         début de la plage évaluée (défaut 0)
  --a <secondes>          fin de la plage évaluée (défaut : durée du projet)
  --kit <decors.json>     manifeste des décors (défaut : kit privé de studio-troupe)
  --aide                  afficher cette aide

Sans --sortie, la commande vérifie le projet : validation, évaluation de chaque image
(fonction pure du temps) et empreinte de déterminisme.
`;

function lire(): number {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      sortie: { type: 'string' },
      de: { type: 'string' },
      a: { type: 'string' },
      kit: { type: 'string' },
      aide: { type: 'boolean', short: 'h' },
    },
  });
  if (values.aide || positionals.length === 0) {
    console.log(AIDE);
    return values.aide ? 0 : 1;
  }
  const chemin = resolve(positionals[0]!);
  if (!existsSync(chemin)) {
    console.error(`Projet introuvable : ${chemin}`);
    return 1;
  }
  const resultat = validerProjet(JSON.parse(readFileSync(chemin, 'utf8')));
  for (const a of resultat.avertissements) console.warn(`avertissement — ${a}`);
  if (!resultat.ok || !resultat.projet) {
    console.error(`Projet invalide (${resultat.erreurs.length} erreur(s)) :`);
    for (const e of resultat.erreurs) console.error(`  - ${e}`);
    return 1;
  }
  const projet = resultat.projet;

  let decors: Record<string, InfoDecor> = {};
  const manifeste = values.kit ? resolve(values.kit) : MANIFESTE_DECORS_DEFAUT;
  if (existsSync(manifeste)) {
    const kit = chargerDecors(manifeste);
    decors = kit.decors;
    for (const p of projet.plans) {
      if (!decors[p.decor]) console.warn(`avertissement — décor « ${p.decor} » absent du kit (plan ${p.id})`);
    }
  } else {
    console.warn(`avertissement — kit des décors introuvable (${manifeste}) : placement approximatif`);
  }

  const moteur = creerMoteurComplet({ decors });
  const de = values.de !== undefined ? Number(values.de) : 0;
  const a = values.a !== undefined ? Number(values.a) : projet.duree;
  if (!Number.isFinite(de) || !Number.isFinite(a) || a <= de) {
    console.error('Plage invalide : --de doit être inférieur à --a');
    return 1;
  }
  const premiere = tempsVersImage(de, projet.fps);
  const derniere = Math.min(nombreImages(a, projet.fps), nombreImages(projet.duree, projet.fps));
  const empreinte = createHash('sha256');
  const debutChrono = performance.now();
  let personnagesMax = 0;
  for (let n = premiere; n < derniere; n++) {
    const etat = evaluer(projet, imageVersTemps(n, projet.fps), moteur);
    personnagesMax = Math.max(personnagesMax, etat.personnages.length);
    empreinte.update(JSON.stringify(etat));
  }
  const ms = performance.now() - debutChrono;
  const images = derniere - premiere;

  console.log(`Projet « ${projet.titre} » — ${projet.sortie.largeur}×${projet.sortie.hauteur}, ${projet.fps} i/s`);
  console.log(`  durée ${formaterDuree(projet.duree)} ; plans ${projet.plans.length} ; personnages ${projet.personnages.length}`);
  console.log(`  images évaluées ${images} (${timecode(imageVersTemps(premiere, projet.fps), projet.fps)} → ${timecode(imageVersTemps(derniere, projet.fps), projet.fps)})`);
  console.log(`  évaluation ${(ms / Math.max(1, images)).toFixed(3)} ms/image ; jusqu'à ${personnagesMax} personnage(s) à l'image`);
  console.log(`  empreinte des états ${empreinte.digest('hex').slice(0, 16)}`);

  if (values.sortie) {
    console.error(
      `Le module export n'est pas encore branché : aucun MP4 n'a été produit (${resolve(values.sortie)} non écrit).`,
    );
    return 3;
  }
  return 0;
}

process.exitCode = lire();
