/**
 * Sourcils : expression (émotion) + indications des actions (surprise, colère…) + prosodie (levées sur une
 * minorité d'accents : au plus un sur trois, plus les fins de question). Une levée prosodique monte en 0,27 s,
 * culmine 100 ms avant l'accent, tient 150 ms et redescend en 0,3 s.
 */
import { hash01 } from '../noyau/aleatoire';
import { smoothstep } from '../noyau/courbes';
import { borner } from '../noyau/maths2d';
import type { EtatSourcil } from '../timeline/types';
import type { IndicesVisage } from '../anim/canaux';
import type { VisageExpression } from './expression';
import type { Accent } from './parole';

/** Levée prosodique. */
export interface BosseSourcil {
  t: number;
  amplitude: number;
}

/** Choisit les accents qui lèvent les sourcils (≈ 1 sur 3 par hachage, toujours les fins de question). */
export function bossesProsodiques(accents: readonly Accent[], graine: number): BosseSourcil[] {
  const r: BosseSourcil[] = [];
  accents.forEach((a, i) => {
    if (a.question) r.push({ t: a.t, amplitude: 0.6 });
    else if (hash01(graine, Math.round(a.t * 1000), i) < 0.33) r.push({ t: a.t, amplitude: 0.45 * a.force });
  });
  return r;
}

/** Hausse prosodique des sourcils à `t` (maximum des levées en cours). */
export function hausseProsodique(bosses: readonly BosseSourcil[], t: number): number {
  let v = 0;
  for (const b of bosses) {
    if (t < b.t - 0.37 || t > b.t + 0.36) continue;
    const montee = smoothstep(b.t - 0.37, b.t - 0.1, t);
    const descente = 1 - smoothstep(b.t + 0.05, b.t + 0.35, t);
    v = Math.max(v, b.amplitude * montee * descente);
  }
  return v;
}

/** États des deux sourcils. */
export function etatSourcils(
  expr: VisageExpression,
  ind: IndicesVisage,
  prosodie: number,
): { G: EtatSourcil; D: EtatSourcil } {
  const un = (e: EtatSourcil, asym: number): EtatSourcil => ({
    hauteur: borner(e.hauteur + ind.sourcilHauteur + asym + prosodie, -1, 1),
    froncement: borner(e.froncement + ind.sourcilFroncement, 0, 1),
    inclinaison: borner(e.inclinaison + ind.sourcilInclinaison, -1, 1),
  });
  return { G: un(expr.sourcilG, 0.5 * ind.sourcilAsymetrie), D: un(expr.sourcilD, -0.5 * ind.sourcilAsymetrie) };
}
