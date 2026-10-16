/**
 * Grandeurs dérivées des pistes du projet, partagées par plusieurs modules : temps du jeu (gel, ralenti), bornes
 * des répliques, répliques actives, sous-titres, sons en cours, effets plein cadre. Fonctions pures de `(projet, t)`.
 */
import { smoothstep } from '../noyau/courbes';
import type { ContexteImage, EffetsImage, EvenementSon, Projet, Replique, SousTitre } from './types';
import { effetsNeutres } from './neutres';

/**
 * Temps du jeu des acteurs : `tJeu(t) = t + ∫_{−∞}^{t} (taux(s) − 1) ds`, où le taux vaut 0 pendant un `gel`,
 * `facteur` pendant un `ralenti` (le plus petit s'ils se chevauchent) et 1 ailleurs. Continu et croissant.
 */
export function tempsDeJeu(projet: Projet, t: number): number {
  const evts: Array<{ debut: number; fin: number; taux: number }> = [];
  for (const m of projet.pistes.camera) {
    if (m.type === 'gel') evts.push({ debut: m.debut, fin: m.debut + m.duree, taux: 0 });
    else if (m.type === 'ralenti') evts.push({ debut: m.debut, fin: m.debut + m.duree, taux: Math.max(0, m.facteur) });
  }
  if (evts.length === 0) return t;
  const bornes = Array.from(new Set(evts.flatMap((e) => [e.debut, e.fin]))).sort((a, b) => a - b);
  let ecart = 0;
  for (let i = 0; i < bornes.length - 1; i++) {
    const a = bornes[i]!;
    const b = bornes[i + 1]!;
    if (a >= t) break;
    let taux = 1;
    for (const e of evts) if (e.debut <= a && e.fin >= b) taux = Math.min(taux, e.taux);
    if (taux === 1) continue;
    const fin = Math.min(b, t);
    ecart += (taux - 1) * (fin - a);
  }
  return t + ecart;
}

/** Durée estimée d'une réplique sans audio ni phonèmes (≈ 15 caractères/s, au moins 0,8 s). */
function dureeEstimee(texte: string): number {
  return Math.max(0.8, 0.3 + texte.length * 0.065);
}

/** Fin absolue d'une réplique : `fin`, sinon fin du dernier phonème ou mot, sinon estimation depuis le texte. */
export function finReplique(r: Replique): number {
  if (r.fin !== undefined) return r.fin;
  let fin = -Infinity;
  for (const p of r.phonemes ?? []) fin = Math.max(fin, p.fin);
  for (const m of r.mots ?? []) fin = Math.max(fin, m.fin);
  if (fin > 0) return r.debut + fin;
  return r.debut + dureeEstimee(r.texte);
}

/** Répliques en cours à l'instant `t` (`[debut, fin[`), dans l'ordre de la piste. */
export function repliquesActives(projet: Projet, t: number): Replique[] {
  return projet.pistes.dialogue.filter((r) => r.debut <= t && t < finReplique(r));
}

/** Sous-titres par défaut : une ligne par réplique active, avec le mot en cours si les mots sont horodatés. */
export function sousTitresParDefaut(ctx: ContexteImage): SousTitre[] {
  return repliquesActives(ctx.projet, ctx.t).map((r) => {
    const s: SousTitre = { texte: r.texte, personnage: r.personnage, debut: r.debut, fin: finReplique(r) };
    if (r.mots && r.mots.length > 0) {
      const local = ctx.t - r.debut;
      let actif = -1;
      r.mots.forEach((m, i) => {
        if (m.debut <= local) actif = i;
      });
      if (actif >= 0) s.motActif = actif;
    }
    return s;
  });
}

/** Sons en cours par défaut : voix des répliques actives et sons de la piste. */
export function sonsParDefaut(ctx: ContexteImage): EvenementSon[] {
  const t = ctx.t;
  const r: EvenementSon[] = [];
  for (const rep of ctx.projet.pistes.dialogue) {
    if (rep.audio && rep.debut <= t && t < finReplique(rep)) {
      r.push({ id: rep.id, fichier: rep.audio, debut: rep.debut, position: t - rep.debut, volume: rep.volume ?? 1, type: 'voix' });
    }
  }
  for (const s of ctx.projet.pistes.sons) {
    const fin = s.duree !== undefined ? s.debut + s.duree : Infinity;
    if (s.debut <= t && t < fin) {
      let volume = s.volume ?? 1;
      const fe = s.fondu?.entree ?? 0;
      const fs = s.fondu?.sortie ?? 0;
      if (fe > 0) volume *= Math.min(1, (t - s.debut) / fe);
      if (fs > 0 && Number.isFinite(fin)) volume *= Math.min(1, (fin - t) / fs);
      r.push({ id: s.id, fichier: s.fichier, debut: s.debut, position: t - s.debut, volume, type: s.type });
    }
  }
  return r;
}

/**
 * Niveau de noir des fondus à l'instant `t` (0 = image, 1 = noir). Les fondus s'enchaînent : une `sortie` mène au
 * noir et y reste jusqu'à l'`entree` suivante ; avant une première `entree`, l'image est noire.
 */
export function niveauFondu(projet: Projet, t: number): number {
  const fondus = projet.pistes.camera.filter((m) => m.type === 'fondu');
  if (fondus.length === 0) return 0;
  let niveau = fondus[0]!.type === 'fondu' && fondus[0]!.sens === 'entree' ? 1 : 0;
  for (const m of fondus) {
    if (m.type !== 'fondu' || m.debut > t) break;
    const cible = m.sens === 'sortie' ? 1 : 0;
    niveau = niveau + (cible - niveau) * smoothstep(m.debut, m.debut + m.duree, t);
  }
  return niveau;
}

/** Effets plein cadre par défaut : désaturation et vignette pendant les gels, fondus au noir. */
export function effetsParDefaut(ctx: ContexteImage): EffetsImage {
  const e = effetsNeutres();
  const t = ctx.t;
  for (const m of ctx.projet.pistes.camera) {
    const fin = m.debut + m.duree;
    if (m.type === 'gel' && t >= m.debut && t < fin) {
      // Montée sèche (≈ 4 images à 30 i/s), tenue, puis relâche sur les 0,1 dernières secondes.
      const montee = smoothstep(m.debut, m.debut + 0.13, t) * (1 - smoothstep(fin - 0.1, fin, t));
      e.desaturation = Math.max(e.desaturation, (m.desaturation ?? 0.4) * montee);
      e.vignette = Math.max(e.vignette, 0.35 * montee);
    }
  }
  e.fondu = niveauFondu(ctx.projet, t);
  return e;
}
