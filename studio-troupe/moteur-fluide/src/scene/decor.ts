/**
 * État du décor 2,5D à un instant : parallaxe par la profondeur tirée des mouvements « posés » de la caméra
 * (translation latérale et poussée), vie du décor (figurants, ciel, lumières) sur le temps du jeu.
 *
 * Parallaxe : un point de profondeur `d` se déplace de `(d − dRef)·decalage` (+ agrandissement `(d − dRef)·poussee`
 * autour du centre de la caméra), `dRef` = profondeur du sol sous les sujets : les pieds restent collés au sol.
 * Seuls le suivi, les recadrages et les panoramiques produisent de la parallaxe (translation de la caméra) ; le
 * punch-in (focale), le filé (rotation) et le tremblement n'en produisent pas. L'amplitude est bornée par un budget
 * en pixels de sortie (les déchirures du maillage du décor restent invisibles).
 *
 * Contrat : `fournisseurDecor(ctx, camera) → EtatDecor`, fonction pure.
 */
import { borner } from '../noyau/maths2d';
import { decorNeutre } from '../timeline/neutres';
import type { ContexteImage, EtatCamera, EtatDecor, FournisseurDecor } from '../timeline/types';
import { cameraDuPlan } from './camera';
import { profondeurSol } from './sol';

/** Réglages de la vie et de la parallaxe du décor. */
export const REGLAGES_DECOR = Object.freeze({
  /** Part de la translation de la caméra rendue en parallaxe (0 = panoramique pur, 1 = travelling complet). */
  parallaxeTranslation: 0.45,
  /** Poussée (dolly) par unité de log-zoom des recadrages. */
  parallaxePoussee: 0.35,
  /** Budget de déplacement relatif maximal aux profondeurs extrêmes (px de sortie). */
  budgetPx: 26,
  /** Ciel : période de la boucle (s) et dérive par période (fraction de la largeur). */
  cielPeriode: 24,
  cielDerive: 0.018,
});

/** Profondeur de référence du plan : moyenne des sujets cadrés (ou de tous les présents). */
function profondeurReference(ctx: ContexteImage, t: number): number {
  if (!ctx.plan) return 0.6;
  const cam = cameraDuPlan(ctx.projet, ctx.indexPlan, ctx.ressources);
  const ids = ctx.plan.cadrage.sujets && ctx.plan.cadrage.sujets.length > 0 ? ctx.plan.cadrage.sujets : undefined;
  const sujets = cam ? cam.sujets(t, ids) : [];
  if (sujets.length === 0) return profondeurSol(ctx.decor, ctx.decor?.fit.floor ?? 0.95);
  return sujets.reduce((s, g) => s + profondeurSol(ctx.decor, g.v), 0) / sujets.length;
}

/** Décor du plan actif. */
export const fournisseurDecor: FournisseurDecor = (ctx: ContexteImage, camera: EtatCamera): EtatDecor | null => {
  if (!ctx.plan) return null;
  const etat = decorNeutre(ctx.plan.decor, ctx.tJeu);
  const ambiance = ctx.plan.ambiance ?? {};
  const vie = borner(ambiance.vie ?? 1, 0, 1);
  etat.figurants = { actifs: ambiance.figurants ?? true, temps: ctx.tJeu, amplitude: vie };
  etat.ciel = {
    actif: ambiance.ciel ?? true,
    decalage: (REGLAGES_DECOR.cielDerive * ctx.tJeu) / REGLAGES_DECOR.cielPeriode,
    temps: ctx.tJeu,
  };
  etat.lumieres = { amplitude: vie, temps: ctx.tJeu };

  const cam = cameraDuPlan(ctx.projet, ctx.indexPlan, ctx.ressources);
  // La référence de profondeur est figée au début du plan : une référence qui varierait ferait glisser le décor.
  const dRef = profondeurReference(ctx, ctx.plan.debut);
  let decalage = { x: 0, y: 0 };
  let poussee = 0;
  if (cam) {
    const b = cam.base(ctx.t);
    const r = cam.reference;
    const k = REGLAGES_DECOR.parallaxeTranslation;
    decalage = { x: -k * (b.centre.x - r.centre.x), y: -k * (b.centre.y - r.centre.y) };
    poussee = REGLAGES_DECOR.parallaxePoussee * Math.log(b.zoom / r.zoom);
    // Budget : |d − dRef| ≤ max(dRef, 1 − dRef) ; demi-diagonale de la fenêtre pour la poussée.
    const ppu = camera.zoom * ctx.projet.sortie.hauteur;
    const dMax = Math.max(dRef, 1 - dRef);
    const demiDiag = Math.hypot(ctx.projet.sortie.largeur, ctx.projet.sortie.hauteur) / 2; // px
    const depl = Math.hypot(decalage.x, decalage.y) * dMax * ppu + Math.abs(poussee) * dMax * demiDiag;
    if (depl > REGLAGES_DECOR.budgetPx) {
      const f = REGLAGES_DECOR.budgetPx / depl;
      decalage = { x: decalage.x * f, y: decalage.y * f };
      poussee *= f;
    }
  }
  // Arrondi (états identiques dans Node et dans la page) ; `+ 0` normalise −0.
  const r9 = (x: number) => Math.round(x * 1e9) / 1e9 + 0;
  etat.parallaxe = {
    decalage: { x: r9(decalage.x), y: r9(decalage.y) },
    poussee: r9(poussee),
    profondeurReference: r9(dRef),
  };
  return etat;
};

/**
 * Position déplacée par la parallaxe (contrat d'`EtatDecor`) :
 * `p' = c + (p − c)·(1 + (d − dRef)·poussee) + (d − dRef)·decalage`, `c` = centre de la caméra.
 */
export function deplacerParallaxe(
  p: { x: number; y: number },
  d: number,
  parallaxe: EtatDecor['parallaxe'],
  centre: { x: number; y: number },
): { x: number; y: number } {
  const e = d - parallaxe.profondeurReference;
  const k = 1 + e * parallaxe.poussee;
  return {
    x: centre.x + (p.x - centre.x) * k + e * parallaxe.decalage.x,
    y: centre.y + (p.y - centre.y) * k + e * parallaxe.decalage.y,
  };
}
