/**
 * FIGURANTS — the life behind the actors: in a public place (market, maquis, ceremony, village, beach, school,
 * hospital…) a few characters of the owner's own troupe pass by or chat in the background, smaller with the distance,
 * in the lens blur. Never in a private room (a stranger in the living room would tell another story). Pure and
 * deterministic: the same scene always gets the same figurants at the same places.
 */

export interface ExtraPlan {
  /** Index of the figurant in the pool of available characters. */
  pick: number;
  /** Mark on the ground (m) and depth (behind the actors, in front of the set). */
  x0: number;
  z: number;
  walking: boolean;
  /** Walking speed (m/s) and direction. */
  speed: number;
  dir: 1 | -1;
  phase: number;
  /** Chatting (standing figurants talk with each other, without sound). */
  talk: boolean;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** How many figurants a place holds (0 in a private room). */
export function crowdSize(location: string, outdoor: boolean): number {
  const l = fold(location);
  if (/coiffure|bureau|hopital|clinique|douane|guichet/.test(l)) return 1;
  if (/ecole|classe|tribunal|eglise|mosquee|gare|boutique/.test(l)) return 2;
  if (/marche|maquis|ceremon|mariage|bapteme|fete|village|plage|rue|quartier|stade|place/.test(l)) return 3;
  if (/salon|maison|chambre|cuisine|taxi|voiture|lit|cour /.test(l)) return 0;
  return outdoor ? 2 : 0;
}

/** The figurants of scene `k` among `available` characters. */
export function extrasPlan(location: string, outdoor: boolean, k: number, available: number): ExtraPlan[] {
  const n = Math.min(crowdSize(location, outdoor), available);
  let seed = (k + 1) * 2654435761;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const used = new Set<number>();
  const out: ExtraPlan[] = [];
  for (let i = 0; i < n; i++) {
    let pick = Math.floor(rnd() * available);
    while (used.has(pick)) pick = (pick + 1) % available;
    used.add(pick);
    // The first one or two cross the set, the others stand and chat on one side.
    const walking = i === 0 || (i === 2 && outdoor);
    const side = rnd() < 0.5 ? -1 : 1;
    out.push({
      pick,
      x0: walking ? (rnd() - 0.5) * 4.8 : side * (0.75 + rnd() * 0.35),
      z: walking ? -0.95 - rnd() * 0.25 : -1.25 - rnd() * 0.15,
      walking,
      speed: 0.28 + rnd() * 0.14,
      dir: rnd() < 0.5 ? -1 : 1,
      phase: rnd() * 10,
      talk: !walking,
    });
  }
  return out;
}

/** Where a walking figurant is at time t: it crosses the set and comes back from the other side (no pop in the frame). */
export function walkerX(p: ExtraPlan, t: number, span = 2.8): number {
  if (!p.walking) return p.x0 + Math.sin(t * 0.3 + p.phase) * 0.04;
  const L = 2 * span;
  const x = p.x0 + span + p.dir * p.speed * t;
  return (((x % L) + L) % L) - span;
}
