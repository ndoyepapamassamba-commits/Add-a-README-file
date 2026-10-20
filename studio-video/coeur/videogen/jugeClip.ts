// JEV JUGE CHAQUE CLIP DU GPU DISTANT (18/10/2026) — les critères qui départagent les outils image → vidéo (veille du
// 18/10 : identité gardée, qualité du mouvement, défauts, attente, coût par clip utilisable) deviennent trois questions
// posées à l'œil de JEV sur une planche « image de départ | milieu du clip | fin du clip ». Règle du projet (CLAUDE.md,
// « aucune tolérance ») : le clip n'est utilisable que si CHAQUE probabilité dépasse 0,5 ; sinon on le refait.
import type { EyeElement, EyeVerdict } from '@workbench/server/jev/eye';

export const SEUIL_JEV = 0.5;

/** les trois éléments que JEV doit voir sur la planche (panneau de gauche = image d'origine). */
export function elementsJuge(mouvementEn: string): EyeElement[] {
  return [
    { name: 'the same character in all three panels, with the same face, clothes and colors (the left panel is the original image)' },
    { name: `this motion happening across the three panels: ${mouvementEn.trim() || 'a natural movement of the character'}` },
    { name: 'clean, undeformed bodies in every panel: normal faces, hands and limbs, nothing melting, duplicated or distorted' },
  ];
}

export interface VerdictClip {
  identite: number;
  mouvement: number;
  proprete: number;
  /** vrai seulement si les trois probabilités dépassent 0,5. */
  conforme: boolean;
  finition: number | null;
  coutUsd: number;
}

/** lit la réponse de l'œil de JEV ; null si une des trois probabilités manque (JEV n'a pas pu juger). */
export function lireVerdict(v: EyeVerdict, elements: EyeElement[]): VerdictClip | null {
  const toutes = [...v.seen, ...v.missing];
  const p = (i: number) => toutes.find((x) => x.name === elements[i]?.name)?.p;
  const [identite, mouvement, proprete] = [p(0), p(1), p(2)];
  if (identite == null || mouvement == null || proprete == null) return null;
  return {
    identite,
    mouvement,
    proprete,
    conforme: identite > SEUIL_JEV && mouvement > SEUIL_JEV && proprete > SEUIL_JEV,
    finition: v.finish,
    coutUsd: v.costUsd,
  };
}

/** secondes de GPU par clip utilisable (critère « coût par clip utilisable » rendu mesurable). */
export function gpuParClipUtilisable(essais: { reserveS: number; conforme: boolean | null }[]): number | null {
  const utiles = essais.filter((e) => e.conforme === true).length;
  if (!utiles) return null;
  return essais.reduce((s, e) => s + e.reserveS, 0) / utiles;
}
