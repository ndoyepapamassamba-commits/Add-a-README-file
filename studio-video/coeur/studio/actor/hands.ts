// MAINS — the hand shapes of the acting (J2 of the 3D troupe): open (greeting, presenting, applause, shock), fist
// (anger, threat), point (showing), thumb up, relaxed (default). Expressed as ENGINE joint rotations (index chain and
// thumb of each hand, T-pose convention: palms down, fingers along ±X) BEFORE the retarget, so every rig — VRM, Mixamo,
// the body inflated from a drawing — closes its fingers correctly. Shapes blend over a quarter second (no popping).
import { JOINT_INDEX } from './skeleton';
import { qAxis, qMul, type Q } from './math';

export type HandShape = 'relaxed' | 'open' | 'fist' | 'point' | 'thumb';
export interface Hands {
  l: HandShape;
  r: HandShape;
}
export const RELAXED: Hands = { l: 'relaxed', r: 'relaxed' };
/** Curl (rad) of the index phalanges and the thumb joints of each shape. */
export const CURLS: Record<HandShape, { index: [number, number, number]; thumb: [number, number] }> = {
  relaxed: { index: [0.35, 0.3, 0.2], thumb: [0.15, 0.1] },
  open: { index: [0.04, 0, 0], thumb: [0, 0] },
  fist: { index: [1.3, 1.25, 0.8], thumb: [0.6, 0.5] },
  point: { index: [0, 0, 0], thumb: [0.4, 0.3] },
  thumb: { index: [1.3, 1.25, 0.8], thumb: [-0.3, 0] },
};
/** French gesture / emotion words → shape (first rule wins); the right hand shows, both hands greet or threaten. */
const RULES: [RegExp, HandShape, 'both' | 'r'][] = [
  [/poing|menace|frapp|rage|serre|col[èe]re|furieu|f[âa]ch/, 'fist', 'both'],
  [/pointe|d[ée]signe|montre|index|accuse|l[àa]-bas|vers/, 'point', 'r'],
  [/pouce|bravo|\bok\b|super|top|g[ée]nial/, 'thumb', 'r'],
  [/salue|bonjour|applaud|pr[ée]sente|ouvre|bras ouverts|hausse|explique|invite|stop|refuse|calme|supplie|prie/, 'open', 'both'],
];
export function handShapesFor(i: { gesture?: string | null; emotion?: string; react?: 'choc' | 'rire' | null }): Hands {
  if (i.react === 'choc') return { l: 'open', r: 'open' };
  if (i.react === 'rire') return RELAXED;
  const text = `${i.gesture ?? ''} ${i.emotion ?? ''}`.toLowerCase();
  for (const [re, shape, side] of RULES) if (re.test(text)) return side === 'both' ? { l: shape, r: shape } : { l: 'relaxed', r: shape };
  return RELAXED;
}
/**
 * The pose rotations with the hands shaped; `prev` + `mix` (0..1) blend the previous shape into the new one.
 * Fingers fold toward the palm (−Y): about −Z on the left hand, +Z on the right; the thumb closes toward the fingers:
 * about +Y on the left, −Y on the right. Joints absent from the pose are left alone.
 */
export function applyHands(rot: Q[], hands: Hands, prev: Hands = hands, mix = 1): Q[] {
  const out = rot.slice();
  const k = Math.max(0, Math.min(1, mix));
  for (const side of ['l', 'r'] as const) {
    const to = CURLS[hands[side]];
    const from = CURLS[prev[side]];
    const sz = side === 'l' ? -1 : 1;
    const sy = side === 'l' ? 1 : -1;
    to.index.forEach((a, n) => {
      const j = JOINT_INDEX.get(`${side}_index${n + 1}`);
      if (j !== undefined && out[j]) out[j] = qMul(out[j]!, qAxis([0, 0, 1], sz * (from.index[n]! * (1 - k) + a * k)));
    });
    to.thumb.forEach((a, n) => {
      const j = JOINT_INDEX.get(`${side}_thumb${n + 1}`);
      if (j !== undefined && out[j]) out[j] = qMul(out[j]!, qAxis([0, 1, 0], sy * (from.thumb[n]! * (1 - k) + a * k)));
    });
  }
  return out;
}
export const sameHands = (a: Hands, b: Hands) => a.l === b.l && a.r === b.r;
