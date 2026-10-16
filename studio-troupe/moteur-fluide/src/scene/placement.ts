/**
 * Placement des personnages dans le décor : pieds sur la ligne de sol (ou sur leur trajet de marche), taille réelle
 * d'après `fit.mH` et la perspective du sol, profondeur lue dans la carte du décor, ordre de dessin, ombre de
 * contact (ellipse douce, plus sombre au contact), étalonnage couleur vers le décor (transfert Lab partiel) et
 * liseré de lumière dans la direction de la lumière du décor.
 *
 * Contrat : `fournisseurPlacement(ctx) → PlacementMonde`, fonction pure.
 */
import { borner } from '../noyau/maths2d';
import { etalonnageNeutre, ombreNeutre } from '../timeline/neutres';
import type {
  AnalyseDecor,
  ContextePersonnage,
  Etalonnage,
  EtatOmbre,
  FournisseurPlacement,
  InfoDecor,
  PlacementMonde,
  StatsLab,
} from '../timeline/types';
import { etalonnageVersDecor, melangerStats } from './couleur';
import { aplatissementSol, geometrieSujet, profondeurSol, type GeometrieSujet } from './sol';

/** Réglages de l'intégration (valeurs par défaut documentées). */
export const REGLAGES_PLACEMENT = Object.freeze({
  /** Demi-largeur de l'ombre de contact, en hauteurs du personnage. */
  largeurOmbre: 0.17,
  /** Opacité de base de l'ombre de contact (augmentée avec le contraste de la lumière du décor). */
  opaciteOmbre: 0.6,
  /** Part de la statistique locale (autour du personnage) dans l'étalonnage, le reste étant globale. */
  partLocale: 0.5,
  /** Force de l'étalonnage (1 = transfert partiel complet). */
  forceEtalonnage: 1,
  /** Intensité de base du liseré de lumière. */
  lisere: 0.32,
});

/** Statistiques Lab locales du décor autour d'un point (fractions du décor), mélangées aux globales. */
export function statsLocales(analyse: AnalyseDecor, u: number, v: number, partLocale: number = REGLAGES_PLACEMENT.partLocale): StatsLab {
  const g = analyse.grille;
  if (g.colonnes <= 0 || g.lignes <= 0) return analyse.lab;
  // Interpolation bilinéaire sur les centres de cellules, pondérée par la part de pixels utiles.
  const x = borner(u * g.colonnes - 0.5, 0, g.colonnes - 1);
  const y = borner(v * g.lignes - 0.5, 0, g.lignes - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(g.colonnes - 1, x0 + 1);
  const y1 = Math.min(g.lignes - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  let wTot = 0;
  const m = [0, 0, 0];
  const e = [0, 0, 0];
  const coins: Array<[number, number, number]> = [
    [x0, y0, (1 - fx) * (1 - fy)],
    [x1, y0, fx * (1 - fy)],
    [x0, y1, (1 - fx) * fy],
    [x1, y1, fx * fy],
  ];
  for (const [cx, cy, w0] of coins) {
    const i = cy * g.colonnes + cx;
    const w = w0 * (g.poids[i] ?? 0);
    if (w <= 0) continue;
    const mi = g.moyennes[i]!;
    const ei = g.ecarts[i]!;
    for (let k = 0; k < 3; k++) {
      m[k]! += w * mi[k]!;
      e[k]! += w * ei[k]!;
    }
    wTot += w;
  }
  if (wTot <= 1e-9) return analyse.lab;
  const locale: StatsLab = {
    moyenne: [m[0]! / wTot, m[1]! / wTot, m[2]! / wTot],
    ecart: [e[0]! / wTot, e[1]! / wTot, e[2]! / wTot],
  };
  return melangerStats(analyse.lab, locale, partLocale * Math.min(1, wTot / 0.5));
}

/** Étalonnage d'un personnage (statistiques du dessin) vers le décor au point de ses pieds. */
export function etalonnagePour(
  statsPerso: StatsLab | undefined,
  decor: InfoDecor | null,
  sujet: Pick<GeometrieSujet, 'u' | 'v' | 'hauteur'>,
): Etalonnage {
  const analyse = decor?.analyse;
  if (!analyse || !statsPerso) return etalonnageNeutre();
  // Statistiques prises au milieu du corps.
  const stats = statsLocales(analyse, sujet.u, sujet.v - sujet.hauteur / 2);
  const e = etalonnageVersDecor(statsPerso, stats, undefined, REGLAGES_PLACEMENT.forceEtalonnage);
  const l = analyse.lumiere;
  const intensite = Math.round(REGLAGES_PLACEMENT.lisere * (0.5 + 0.6 * l.contraste) * 1e4) / 1e4;
  return {
    ...e,
    lisere: { direction: { x: l.direction.x, y: l.direction.y }, couleur: [l.couleur[0], l.couleur[1], l.couleur[2]], intensite, largeur: 5 },
  };
}

/** Ombre de contact d'un sujet. */
export function ombrePour(decor: InfoDecor | null, sujet: Pick<GeometrieSujet, 'v' | 'hauteur'>): EtatOmbre {
  const contraste = decor?.analyse?.lumiere.contraste ?? 0.4;
  const o = ombreNeutre(REGLAGES_PLACEMENT.largeurOmbre * sujet.hauteur);
  o.aplatissement = aplatissementSol(decor, sujet.v);
  o.opacite = borner(REGLAGES_PLACEMENT.opaciteOmbre + 0.2 * contraste, 0, 0.8);
  o.flou = 6;
  return o;
}

/** Placement monde d'un personnage du plan actif. */
export const fournisseurPlacement: FournisseurPlacement = (ctx: ContextePersonnage): PlacementMonde => {
  const decor = ctx.decor;
  if (!ctx.plan) {
    return {
      position: { x: ctx.placement.u * (decor?.aspect ?? 2), y: ctx.placement.v ?? decor?.fit.floor ?? 0.95 },
      echelle: 1e-3,
      profondeur: 0.8,
      ordre: 0,
      ombre: ombreNeutre(),
      etalonnage: etalonnageNeutre(),
      flou: 0,
      opacite: 1,
      visible: true,
    };
  }
  const sujet = geometrieSujet(ctx.projet, ctx.plan, ctx.placement, ctx.declaration.tailleM, ctx.rig, decor, ctx.tJeu);
  return {
    position: sujet.pieds,
    echelle: sujet.echelle,
    profondeur: profondeurSol(decor, sujet.v),
    ordre: ctx.placement.ordre ?? Math.round(sujet.v * 1e6) / 1e3,
    ombre: ombrePour(decor, sujet),
    etalonnage: etalonnagePour(ctx.rig?.couleur, decor, sujet),
    flou: 0,
    opacite: 1,
    visible: true,
  };
};
