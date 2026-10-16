/**
 * Bouche : mélange de la forme articulée (visèmes coarticulés) avec l'expression et les indications des actions.
 *
 * - En parole, les lèvres viennent de la coarticulation ; l'intensité suit deux axes, dans l'esprit de JALI :
 *   mâchoire `ouverture' = ouverture^(1/JA)` (JA de 1 à 1,6 : colère, cri, rire) et lèvres
 *   `(largeur, arrondi) × LI`. L'expression garde les coins (sourire) et l'étirement.
 * - Les fermetures M/B/P restent fermées quelle que soit l'expression.
 * - Hors parole, la bouche est celle de l'expression et des actions (O de surprise, rire ouvert, dents serrées).
 */
import { borner } from '../noyau/maths2d';
import type { EtatVisage, Viseme } from '../timeline/types';
import type { IndicesVisage } from '../anim/canaux';
import type { VisageExpression } from './expression';
import { visemeLePlusProche, type FormeBouche } from './visemes';

/** Entrées du mélange de la bouche. */
export interface EntreeBouche {
  /** Forme articulée (repos hors parole). */
  forme: FormeBouche;
  /** Poids de la parole (0 hors réplique, 1 pendant, rampes lisses). */
  parole: number;
  /** Visème discret de la parole. */
  visemeParole: Viseme;
  expr: VisageExpression;
  indices: IndicesVisage;
  /** Intensité de mâchoire (≥ 1). */
  ja: number;
  /** Intensité des lèvres (≈ 1). */
  li: number;
}

/** Paramètres de bouche de l'état du visage. */
export type EtatBouche = Pick<EtatVisage, 'viseme' | 'ouvertureBouche' | 'largeur' | 'arrondi' | 'dents' | 'langue' | 'sourire'>;

/** Mélange de la bouche. */
export function etatBouche(e: EntreeBouche): EtatBouche {
  const w = borner(e.parole, 0, 1);
  const ja = borner(e.ja, 1, 1.6);
  const levres = Math.max(0, e.forme.ouverture) ** (1 / ja);
  const horsParole = Math.max(0, e.expr.ouverture + e.indices.ouverture);
  // En parole, une expression ouverte (rire, surprise) ajoute un peu d'ouverture, sauf sur les fermetures.
  const garde = borner(levres / 0.05, 0, 1);
  const ouverture = borner(w * (levres + 0.25 * horsParole * garde) + (1 - w) * horsParole, 0, 1);
  const largeur = borner(w * e.forme.largeur * e.li + e.expr.largeur + e.indices.largeur * (1 - 0.5 * w), -1, 1);
  const arrondi = borner(w * e.forme.arrondi * e.li + (1 - w) * (e.expr.arrondi + e.indices.arrondi), 0, 1);
  const dents = borner(Math.max(w * e.forme.dents, e.expr.dents + e.indices.dents), 0, 1);
  const langue = borner(w * e.forme.langue, 0, 1);
  const sourire = borner((e.expr.sourire + e.indices.sourire) * (1 - 0.3 * w), -1, 1);
  let viseme: Viseme;
  if (w >= 0.5) viseme = e.visemeParole;
  else viseme = ouverture > 0.12 ? visemeLePlusProche({ ouverture, largeur, arrondi }) : 'repos';
  return { viseme, ouvertureBouche: ouverture, largeur, arrondi, dents, langue, sourire };
}
