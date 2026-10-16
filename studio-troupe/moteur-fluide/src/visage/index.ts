/**
 * Module VISAGE : lèvres françaises (visèmes coarticulés, piste discrète), yeux (clignements, saccades, regard),
 * sourcils (expression, prosodie, prises), expressions d'émotion, indications des actions du corps.
 *
 * - `phonetique.ts` : texte → phonèmes (règles du français), durées, accents de groupe.
 * - `visemes.ts` : table phonème → visème (API, SAMPA, espeak), coarticulation à dominances, contraintes M/B/P
 *   et F/V, piste discrète à durée minimale.
 * - `parole.ts` : piste de parole par réplique (visèmes manuels > phonèmes > mots > texte).
 * - `bouche.ts`, `yeux.ts`, `sourcils.ts`, `expression.ts` : les parties du visage.
 *
 * Temps : la bouche et les levées prosodiques suivent le temps réel de l'audio (`t`, figé pendant un gel) ; les
 * yeux, les expressions et les indications du corps suivent le temps de jeu (`tJeu`).
 * Contrat : `fournisseurVisage(ctx) → EtatVisage`, fonction pure (compilation mémorisée par plan).
 */
import { graineDe } from '../noyau/aleatoire';
import { smoothstep } from '../noyau/courbes';
import { borner } from '../noyau/maths2d';
import { compilerAnimation, type AnimationCompilee } from '../anim/couches';
import { visageParDefaut } from '../timeline/fournisseursNeutres';
import type { ContextePersonnage, EtatVisage, FournisseurVisage, Projet, Viseme } from '../timeline/types';
import { etatBouche } from './bouche';
import { chronologieEmotions, visageDepuisPoids, type ChronologieEmotions, type NomExpression } from './expression';
import { pistesPersonnage, tempsParole, versJeu, type PisteParole } from './parole';
import { bossesProsodiques, etatSourcils, hausseProsodique, type BosseSourcil } from './sourcils';
import { formeCoarticulee, CIBLES_VISEMES, visemeA, type FormeBouche } from './visemes';
import { genererClignements, genererFixations, paupiereA, regardA, type Clignement, type Fixation } from './yeux';

/** Avance de la bouche sur le son (s) : l'image qui précède légèrement le son est mieux tolérée. */
export const AVANCE_BOUCHE = 0.04;

/** Taux de clignement (par minute). */
export const TAUX_CLIGNEMENT = { repos: 15, parole: 21, ecoute: 9 } as const;

/** Visage compilé d'un personnage dans un plan. */
export interface VisageCompile {
  readonly anim: AnimationCompilee;
  readonly clignements: readonly Clignement[];
  readonly fixations: readonly Fixation[];
  readonly bosses: readonly BosseSourcil[];
  readonly pistes: readonly PisteParole[];
  readonly emotions: ChronologieEmotions;
  /** État du visage (t réel, temps de jeu). */
  etat(t: number, tJeu: number): EtatVisage;
}

/** Bouche articulée à l'instant de parole `tp` : forme, poids de la parole, visème discret, volume. */
export function boucheParlante(
  pistes: readonly PisteParole[],
  tp: number,
): { forme: FormeBouche; parole: number; viseme: Viseme; volume: number } {
  let meilleur: { forme: FormeBouche; parole: number; viseme: Viseme; volume: number } | null = null;
  for (const p of pistes) {
    if (tp < p.debut - 0.6 || tp > p.fin + 0.6) continue;
    const w = smoothstep(p.debut - 0.12, p.debut, tp) * (1 - smoothstep(p.fin, p.fin + 0.15, tp));
    if (meilleur && w <= meilleur.parole) continue;
    meilleur = {
      forme: formeCoarticulee(p.segments, tp + AVANCE_BOUCHE),
      parole: w,
      viseme: visemeA(p.visemes, tp + AVANCE_BOUCHE),
      volume: p.replique.volume ?? 1,
    };
  }
  return meilleur ?? { forme: { ...CIBLES_VISEMES.repos }, parole: 0, viseme: 'repos', volume: 1 };
}

/** Intensité de mâchoire selon les émotions et le volume. */
function intensiteMachoire(poids: Partial<Record<NomExpression, number>>, volume: number): number {
  const w = (n: NomExpression): number => Math.max(0, poids[n] ?? 0);
  return borner(1 + 0.35 * w('colere') + 0.2 * (w('surprise') + w('choc')) + 0.12 * w('joie') + 0.25 * w('rire') + 0.15 * (volume - 1), 1, 1.6);
}

function dans(intervalles: ReadonlyArray<readonly [number, number]>, t: number): boolean {
  return intervalles.some(([a, b]) => t >= a && t < b);
}

const cache = new WeakMap<object, WeakMap<object, Map<string, VisageCompile>>>();

/** Visage compilé (mémorisé), ou `null` sans rig ou sans plan. */
export function compilerVisage(ctx: ContextePersonnage): VisageCompile | null {
  const anim = compilerAnimation(ctx);
  if (!anim || !ctx.rig) return null;
  let parRig = cache.get(ctx.projet);
  if (!parRig) cache.set(ctx.projet, (parRig = new WeakMap()));
  let m = parRig.get(ctx.rig);
  if (!m) parRig.set(ctx.rig, (m = new Map()));
  const d = ctx.decor;
  const cle = `${ctx.declaration.id}|${ctx.indexPlan}|${d ? `${d.id}:${d.aspect}:${d.fit.floor}:${d.fit.mH}` : '-'}`;
  let v = m.get(cle);
  if (!v) {
    v = construire(ctx.projet, anim);
    m.set(cle, v);
  }
  return v;
}

function construire(projet: Projet, anim: AnimationCompilee): VisageCompile {
  const cc = anim.cc;
  const id = cc.declaration.id;
  const W0 = versJeu(projet, cc.plan.debut) - 1;
  const W1 = versJeu(projet, cc.plan.fin) + 1;
  const graine = graineDe(projet.sortie?.graine ?? 1, id, 'visage');
  const pistes = pistesPersonnage(projet, id);
  const emotions = chronologieEmotions(projet, id);
  const parle = (t: number): boolean => dans(anim.parole, t);
  const ecoute = (t: number): boolean => !parle(t) && dans(anim.ecoute, t);
  const bornes = [...anim.parole.flat(), ...anim.ecoute.flat()];
  // Clignements forcés : ceux des actions, plus les grands changements de regard (> 20°).
  const forces = [...anim.clignementsForces];
  for (const c of anim.changementsRegard) {
    const a = anim.cibleRegard(c - 0.01);
    const b = anim.cibleRegard(c + 0.01);
    if (Math.hypot(b.x - a.x, b.y - a.y) > 0.67) forces.push(c);
  }
  const clignements = genererClignements({
    graine,
    debut: W0,
    fin: W1,
    taux: (t) => (parle(t) ? TAUX_CLIGNEMENT.parole : ecoute(t) ? TAUX_CLIGNEMENT.ecoute : TAUX_CLIGNEMENT.repos),
    bornes,
    forces,
    interdit: (t) => anim.indicesVisage(t).sansClignement > 0.5,
  });
  const fixations = genererFixations({
    graine: graine ^ 0x9e37,
    debut: W0,
    fin: W1,
    cibleBase: (t) => anim.cibleRegard(t),
    changements: anim.changementsRegard,
    parle,
    ecoute,
  });
  const bosses = bossesProsodiques(
    pistes.flatMap((p) => p.accents),
    graine ^ 0x51,
  );

  return {
    anim,
    clignements,
    fixations,
    bosses,
    pistes,
    emotions,
    etat(t, tJeu) {
      const tp = tempsParole(projet, t);
      const poids = emotions.poids(tJeu);
      const expr = visageDepuisPoids(poids);
      const ind = anim.indicesVisage(tJeu);
      const bouche = boucheParlante(pistes, tp);
      const etatB = etatBouche({
        forme: bouche.forme,
        parole: bouche.parole,
        visemeParole: bouche.viseme,
        expr,
        indices: ind,
        ja: intensiteMachoire(poids, bouche.volume),
        li: 1 + 0.1 * Math.max(0, poids.joie ?? 0),
      });
      // Yeux.
      const clin = paupiereA(clignements, tJeu);
      const ecarq = borner(expr.ecarquillement + ind.ecarquillement, 0, 1);
      const plisser = (base: number): number => borner(base + ind.plisser - 0.4 * ecarq, 0, 0.9);
      const pG = plisser(expr.plisserG);
      const pD = plisser(expr.plisserD);
      const base = regardA(fixations, tJeu);
      // Regard fuyant de l'expression : à l'opposé de la cible de base (ou du sens du regard).
      const cote = Math.sign(anim.cibleRegard(tJeu).x) || anim.sens(tJeu);
      const regard = {
        x: borner(base.x + ind.regardX - cote * expr.regard.x, -1, 1),
        y: borner(base.y + ind.regardY + expr.regard.y, -1, 1),
      };
      const sourcils = etatSourcils(expr, ind, hausseProsodique(bosses, tp));
      return {
        ...etatB,
        paupiereG: borner(pG + (1 - pG) * clin, 0, 1),
        paupiereD: borner(pD + (1 - pD) * clin, 0, 1),
        ecarquillement: ecarq,
        regard,
        sourcilG: sourcils.G,
        sourcilD: sourcils.D,
      };
    },
  };
}

/** État du visage d'un personnage (visage neutre si le rig ou le plan manque). */
export const fournisseurVisage: FournisseurVisage = (ctx) => {
  const v = compilerVisage(ctx);
  if (!v) return visageParDefaut(ctx);
  return v.etat(ctx.t, ctx.tJeu);
};

export { pisteParole, pistesPersonnage, tempsParole, type PisteParole, type Accent } from './parole';
export {
  CIBLES_VISEMES,
  COARTICULATION_DEFAUT,
  formeCoarticulee,
  infoPhoneme,
  normaliserPhoneme,
  phonemeConnu,
  pisteVisemesDiscrete,
  visemeA,
  visemeDe,
  visemeLePlusProche,
  type FormeBouche,
  type InfoPhoneme,
  type SegmentArticule,
  type SegmentViseme,
} from './visemes';
export { texteVersPhonemes, phonemesDepuisTexte, dureesHeuristiques, motVersPhonemes, VOYELLES_API } from './phonetique';
export {
  PRESETS,
  EXPRESSIONS,
  chronologieEmotions,
  segmentsEmotion,
  visageDepuisPoids,
  postureDe,
  type NomExpression,
  type PresetExpression,
} from './expression';
export { genererClignements, paupiereA, genererFixations, regardA, dureeSaccade, type Clignement, type Fixation } from './yeux';
export { etatBouche } from './bouche';
export { etatSourcils, bossesProsodiques, hausseProsodique } from './sourcils';
