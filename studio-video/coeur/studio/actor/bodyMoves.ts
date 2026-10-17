/**
 * LE CORPS EN ENTIER POUR LA MARIONNETTE DESSINÉE — every movement a drawn character can make in the picture plane, the
 * anatomical limits that keep it human, and a GUARD applied at every frame (16/10: « il faut retrouver tous les
 * mouvements du corps pour ne pas avoir de problème sur les autres scènes »).
 *
 *  - REPERTOIRE: head (nod, shake, tilt, raise, lower, turn to), shoulders (breathe, shrug, slump, puff up, shiver),
 *    torso (lean in, recoil, bow, sigh, startle, laugh), arms and hands (point at, wave, beckon, raise a hand, both arms
 *    up, open arms, hands to the head, hand on the heart, present, stop, scratch the head, hands on the hips), legs
 *    (bend the knees, bounce, tap the foot), whole body (dance, hop). Movements a single drawing cannot make honestly
 *    (crossing the arms behind the body, kneeling, sitting) are listed with `needs: 'dessin'`: the director must pick
 *    another drawing — nothing is faked. Eyes and mouth are played by the face layers (`needs: 'visage'`).
 *  - Every movement has an ENVELOPE (anticipation → action → hold → release, the animators' principles) and is aimed:
 *    `toward` is the partner's side in the drawing's x, so pointing, presenting, stopping, leaning in all go to the
 *    person addressed.
 *  - Arms and legs are placed by TWO-BONE IK (bone lengths kept) that bends the elbow / knee on its NATURAL side: the
 *    side drawn at rest, or for a straight drawn limb, the anatomical one (elbow towards the body, knee towards where the
 *    character faces).
 *  - GUARD (after everything, amplification included): an elbow or knee bent the wrong way is held at the edge of
 *    straight (a continuous stop: no one-frame flip), flexion capped (elbow 150°, knee 140°), bone lengths restored, neck tilt and torso lean capped, shoulder
 *    and pelvis widths kept. It returns what it had to correct, so a film can be checked (0 correction = clean motion).
 * Picture coordinates: pixels of the pose, y DOWN. Pure.
 */
import { BP } from './bp';

export type P = [number, number];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const len = (a: P) => Math.hypot(a[0], a[1]);
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
const rot = (v: P, a: number): P => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const rotAround = (p: P, c: P, a: number): P => add(c, rot(sub(p, c), a));
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (x: number) => { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); };
const angleBetween = (a: P, b: P) => Math.atan2(cross(a, b), a[0] * b[0] + a[1] * b[1]);

/** Anatomical limits used by the guard (degrees, picture plane). */
export const LIMITS = {
  elbowFlexMax: 155,
  kneeFlexMax: 140,
  /** A limb drawn straighter than this has no drawn bend side: the anatomical side is used. */
  straight: 8,
  neckTiltMax: 35,
  torsoLeanMax: 30,
  boneLengthTolerance: 0.01,
  widthTolerance: 0.08,
} as const;

export type Region = 'tête' | 'yeux' | 'bouche' | 'épaules' | 'buste' | 'bras' | 'mains' | 'jambes' | 'corps';
export interface MoveDef {
  /** French name used by the director and the prompts. */
  label: string;
  region: Region;
  /** 'rig' = played by the puppet; 'visage' = face layers (eyes, lids, mouth); 'dessin' = needs a drawing that shows it. */
  needs: 'rig' | 'visage' | 'dessin';
  /** Typical duration (s) and number of repeats inside it (nods, waves). */
  dur: number;
  cycles?: number;
  /** Which arm by default: the one nearer the partner ('près'), the other ('loin'), both. */
  arm?: 'près' | 'loin' | 'deux';
}
export const MOVES = {
  hocher: { label: 'hocher la tête (oui)', region: 'tête', needs: 'rig', dur: 0.9, cycles: 2 },
  secouer: { label: 'secouer la tête (non)', region: 'tête', needs: 'rig', dur: 1.0, cycles: 3 },
  pencherTete: { label: 'pencher la tête', region: 'tête', needs: 'rig', dur: 1.2 },
  leverTete: { label: 'lever la tête', region: 'tête', needs: 'rig', dur: 1.0 },
  baisserTete: { label: 'baisser la tête', region: 'tête', needs: 'rig', dur: 1.0 },
  tournerTete: { label: 'tourner la tête vers l’autre', region: 'tête', needs: 'rig', dur: 0.8 },
  respirer: { label: 'respirer', region: 'épaules', needs: 'rig', dur: 3.0 },
  hausser: { label: 'hausser les épaules', region: 'épaules', needs: 'rig', dur: 1.2 },
  affaisser: { label: 'épaules qui tombent (abattu)', region: 'épaules', needs: 'rig', dur: 1.6 },
  bomber: { label: 'bomber le torse (fier)', region: 'épaules', needs: 'rig', dur: 1.4 },
  frissonner: { label: 'frissonner', region: 'épaules', needs: 'rig', dur: 1.0 },
  pencherVers: { label: 'se pencher vers l’autre', region: 'buste', needs: 'rig', dur: 1.2 },
  reculer: { label: 'reculer (recul du buste)', region: 'buste', needs: 'rig', dur: 0.8 },
  reverence: { label: 'saluer en s’inclinant', region: 'buste', needs: 'rig', dur: 1.6 },
  soupirer: { label: 'soupirer', region: 'buste', needs: 'rig', dur: 1.8 },
  sursauter: { label: 'sursauter', region: 'corps', needs: 'rig', dur: 0.7 },
  rire: { label: 'rire (secousses)', region: 'buste', needs: 'rig', dur: 1.5, cycles: 6 },
  pointer: { label: 'pointer du doigt vers l’autre', region: 'bras', needs: 'rig', dur: 1.0, arm: 'près' },
  saluer: { label: 'saluer de la main', region: 'bras', needs: 'rig', dur: 1.4, cycles: 3, arm: 'près' },
  faireSigne: { label: 'faire signe de venir', region: 'bras', needs: 'rig', dur: 1.2, cycles: 2, arm: 'près' },
  leverMain: { label: 'lever la main', region: 'bras', needs: 'rig', dur: 1.2, arm: 'près' },
  brasEnHaut: { label: 'lever les deux bras (victoire)', region: 'bras', needs: 'rig', dur: 1.4, arm: 'deux' },
  ouvrirBras: { label: 'ouvrir les bras (accueil)', region: 'bras', needs: 'rig', dur: 1.4, arm: 'deux' },
  mainsTete: { label: 'mains sur la tête (désespoir)', region: 'bras', needs: 'rig', dur: 1.6, arm: 'deux' },
  mainCoeur: { label: 'main sur le cœur (moi ?)', region: 'bras', needs: 'rig', dur: 1.2, arm: 'loin' },
  presenter: { label: 'présenter, main ouverte vers l’autre', region: 'bras', needs: 'rig', dur: 1.2, arm: 'près' },
  stop: { label: 'stop, paume vers l’autre', region: 'bras', needs: 'rig', dur: 1.0, arm: 'près' },
  gratterTete: { label: 'se gratter la tête (perplexe)', region: 'bras', needs: 'rig', dur: 1.6, cycles: 4, arm: 'loin' },
  mainsHanches: { label: 'mains sur les hanches', region: 'bras', needs: 'rig', dur: 1.2, arm: 'deux' },
  flechir: { label: 'fléchir les genoux', region: 'jambes', needs: 'rig', dur: 1.0 },
  rebondir: { label: 'rebondir sur les genoux', region: 'jambes', needs: 'rig', dur: 0.8, cycles: 2 },
  taperPied: { label: 'taper du pied', region: 'jambes', needs: 'rig', dur: 1.2, cycles: 3 },
  danser: { label: 'danser (balancement)', region: 'corps', needs: 'rig', dur: 2.0, cycles: 2 },
  sautiller: { label: 'sautiller', region: 'corps', needs: 'rig', dur: 0.6 },
  regarder: { label: 'diriger le regard', region: 'yeux', needs: 'visage', dur: 0.3 },
  cligner: { label: 'cligner des yeux', region: 'yeux', needs: 'visage', dur: 0.15 },
  parler: { label: 'parler (visèmes)', region: 'bouche', needs: 'visage', dur: 0 },
  croiserBras: { label: 'croiser les bras', region: 'bras', needs: 'dessin', dur: 1.0 },
  agenouiller: { label: 's’agenouiller', region: 'jambes', needs: 'dessin', dur: 1.5 },
  asseoir: { label: 's’asseoir', region: 'corps', needs: 'dessin', dur: 1.5 },
  seRetourner: { label: 'se retourner (dos)', region: 'corps', needs: 'dessin', dur: 1.0 },
} as const satisfies Record<string, MoveDef>;
export type MoveName = keyof typeof MOVES;

/** One movement being played: its phase u (0 → 1 over its duration) and its weight. */
export interface MoveCue {
  name: MoveName;
  u: number;
  w?: number;
}

/**
 * Envelope of a movement: a small ANTICIPATION in the opposite direction, the ACTION eased in, a HOLD, then the RELEASE
 * (follow-through: it overshoots a little before settling).
 */
export function envelope(u: number, o: { anticip?: number; attack?: number; hold?: number } = {}): number {
  const a = o.anticip ?? 0.12, k = o.attack ?? 0.28, hd = o.hold ?? 0.3;
  if (u <= 0 || u >= 1) return 0;
  if (u < a) return -0.2 * Math.sin((Math.PI * u) / a);
  if (u < a + k) return smooth((u - a) / k);
  if (u < a + k + hd) return 1;
  const r = (u - a - k - hd) / Math.max(1e-6, 1 - a - k - hd);
  return (1 - smooth(r)) * (1 + 0.08 * Math.sin(Math.PI * r));
}

/** A working skeleton: landmark index → position (pixels). */
export type Skel = Map<number, P>;

/**
 * Two-bone IK: the end of the limb goes to `target` (clamped inside the reach), the middle joint bends on `bend`
 * (+1 / −1 = sign of cross(upper, lower)). Bone lengths are exactly those of the drawing.
 */
export function ik2(root: P, l1: number, l2: number, target: P, bend: number): { mid: P; end: P } {
  const d = sub(target, root);
  const dist = clamp(len(d), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const dir = len(d) > 1e-9 ? mul(d, 1 / len(d)) : ([1, 0] as P);
  const end = add(root, mul(dir, dist));
  // angle at the root between the root→end line and the upper bone (law of cosines)
  const a = Math.acos(clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1));
  // bend > 0 ⇒ cross(upper, lower) > 0: the upper bone turns the OTHER way from the end direction
  const mid = add(root, mul(rot(dir, -Math.sign(bend || 1) * a), l1));
  return { mid, end };
}

/** Facing of a drawing in its own x: +1 if the head is turned to the right of the shoulders' middle, −1 left, 0 frontal. */
export function facingOf(s: Skel, h: number): number {
  const n = s.get(BP.nose), l = s.get(BP.lSh), r = s.get(BP.rSh);
  if (!n || !l || !r) return 0;
  const d = n[0] - (l[0] + r[0]) / 2;
  return Math.abs(d) < 0.01 * h ? 0 : Math.sign(d);
}

interface Limb {
  a: number;
  b: number;
  c: number;
  kind: 'bras' | 'jambe';
}
const LIMBS: Limb[] = [
  { a: BP.lSh, b: BP.lEl, c: BP.lWr, kind: 'bras' },
  { a: BP.rSh, b: BP.rEl, c: BP.rWr, kind: 'bras' },
  { a: BP.lHip, b: BP.lKn, c: BP.lAn, kind: 'jambe' },
  { a: BP.rHip, b: BP.rKn, c: BP.rAn, kind: 'jambe' },
];

/** Natural bend side of each limb of a drawing: the drawn side, or the anatomical one for a straight limb. */
export function naturalBends(rest: Skel, h: number): Map<number, number> {
  const out = new Map<number, number>();
  const face = facingOf(rest, h) || 1;
  const ls = rest.get(BP.lSh), rs = rest.get(BP.rSh);
  const midX = ls && rs ? (ls[0] + rs[0]) / 2 : 0;
  for (const L of LIMBS) {
    const A = rest.get(L.a), B = rest.get(L.b), C = rest.get(L.c);
    if (!A || !B || !C) continue;
    const ang = (angleBetween(sub(B, A), sub(C, B)) * 180) / Math.PI;
    if (Math.abs(ang) >= LIMITS.straight) { out.set(L.b, Math.sign(ang)); continue; }
    // Straight limb: an elbow folds the hand towards the body's middle (the elbow itself goes out); a knee comes
    // forward, where the body faces. With ik2's convention the middle joint moves along −bend·perp(limb), and
    // perp(d)·want = cross(d, want): the knee takes −sign(cross), the elbow (which goes AWAY from the middle) +sign.
    const along = sub(C, A);
    if (L.kind === 'bras') out.set(L.b, Math.sign(cross(along, [Math.sign(midX - A[0]) || 1, 0])) || 1);
    else out.set(L.b, -Math.sign(cross(along, [face, 0])) || 1);
  }
  return out;
}

export interface GuardReport {
  /** Elbows / knees found bent the wrong way, then mirrored back. */
  flips: number;
  /** Joints opened back under the flexion limit. */
  overFlex: number;
  /** Bones whose length had drifted and was restored. */
  lengths: number;
  /** Neck tilt or torso lean capped. */
  capped: number;
}

/**
 * The anatomical guard: corrects `tg` in place (only points that are present) against the drawing's rest skeleton.
 */
export function guardBody(rest: Skel, tg: Skel, h: number, bends = naturalBends(rest, h)): GuardReport {
  const rep: GuardReport = { flips: 0, overFlex: 0, lengths: 0, capped: 0 };
  // Neck: the head may tilt at most neckTiltMax from its drawn angle on the shoulders, length within 12 %.
  const ls0 = rest.get(BP.lSh), rs0 = rest.get(BP.rSh), n0 = rest.get(BP.nose);
  const ls = tg.get(BP.lSh) ?? ls0, rs = tg.get(BP.rSh) ?? rs0, n = tg.get(BP.nose);
  if (ls0 && rs0 && n0 && ls && rs && n) {
    const m0: P = mul(add(ls0, rs0), 0.5), m: P = mul(add(ls, rs), 0.5);
    const v0 = sub(n0, m0), v = sub(n, m);
    const da = angleBetween(v0, v), lim = (LIMITS.neckTiltMax * Math.PI) / 180;
    const k = clamp(len(v) / len(v0), 0.88, 1.12);
    if (Math.abs(da) > lim || k !== len(v) / len(v0)) {
      const fixed = add(m, mul(rot(v0, clamp(da, -lim, lim)), k));
      const shift = sub(fixed, n);
      for (const kk of [BP.nose, BP.lEye, BP.rEye, BP.lEar, BP.rEar]) { const p = tg.get(kk); if (p) tg.set(kk, add(p, shift)); }
      rep.capped++;
    }
    // Shoulder width kept within tolerance.
    const w0 = len(sub(rs0, ls0)), w = len(sub(rs, ls));
    if (Math.abs(w / w0 - 1) > LIMITS.widthTolerance) {
      const k2 = clamp(w / w0, 1 - LIMITS.widthTolerance, 1 + LIMITS.widthTolerance);
      const c = mul(add(ls, rs), 0.5), half = mul(sub(rs, ls), (0.5 * k2 * w0) / w);
      tg.set(BP.lSh, sub(c, half)); tg.set(BP.rSh, add(c, half));
      rep.capped++;
    }
  }
  // Torso lean: shoulders' middle over the hips' middle, at most torsoLeanMax from the drawing.
  const lh0 = rest.get(BP.lHip), rh0 = rest.get(BP.rHip), lh = tg.get(BP.lHip) ?? lh0, rh = tg.get(BP.rHip) ?? rh0;
  const ls1 = tg.get(BP.lSh), rs1 = tg.get(BP.rSh);
  if (ls0 && rs0 && lh0 && rh0 && lh && rh && ls1 && rs1) {
    const t0 = sub(mul(add(ls0, rs0), 0.5), mul(add(lh0, rh0), 0.5)), t = sub(mul(add(ls1, rs1), 0.5), mul(add(lh, rh), 0.5));
    const da = angleBetween(t0, t), lim = (LIMITS.torsoLeanMax * Math.PI) / 180;
    if (Math.abs(da) > lim) {
      const hm = mul(add(lh, rh), 0.5), back = clamp(da, -lim, lim) - da;
      for (const kk of [BP.lSh, BP.rSh, BP.nose, BP.lEye, BP.rEye, BP.lEar, BP.rEar, BP.lEl, BP.rEl, BP.lWr, BP.rWr]) { const p = tg.get(kk); if (p) tg.set(kk, rotAround(p, hm, back)); }
      rep.capped++;
    }
  }
  // Legs first, from the PLANTED foot: a hip pushed beyond the leg's reach is pulled back (the body adapts, the foot
  // never slides), then the knee is placed on its natural side.
  const upperKeys = [BP.lSh, BP.rSh, BP.lEl, BP.rEl, BP.lWr, BP.rWr, BP.nose, BP.lEye, BP.rEye, BP.lEar, BP.rEar];
  const pull: P[] = [];
  for (const [hp, kn, an] of [[BP.lHip, BP.lKn, BP.lAn], [BP.rHip, BP.rKn, BP.rAn]] as const) {
    const H0 = rest.get(hp), K0 = rest.get(kn), A0 = rest.get(an);
    const Hh = tg.get(hp), Kk = tg.get(kn), Aa = tg.get(an) ?? A0;
    if (!H0 || !K0 || !A0 || !Hh || !Aa) continue;
    const l1 = len(sub(K0, A0)), l2 = len(sub(H0, K0)), d = len(sub(Hh, Aa));
    let hip = Hh;
    if (d > l1 + l2 - 1e-3) { hip = add(Aa, mul(sub(Hh, Aa), (l1 + l2 - 1e-3) / d)); pull.push(sub(hip, Hh)); rep.capped++; tg.set(hp, hip); }
    const bend = -(bends.get(kn) ?? 1); // the chain read from the foot: the bend side is reversed
    const knee0 = Kk ?? K0;
    const ang = (angleBetween(sub(knee0, Aa), sub(hip, knee0)) * 180) / Math.PI;
    const lenOk = Math.abs(len(sub(knee0, Aa)) / l1 - 1) <= LIMITS.boneLengthTolerance && Math.abs(len(sub(hip, knee0)) / l2 - 1) <= LIMITS.boneLengthTolerance;
    const flipped = Math.abs(ang) > LIMITS.straight + 0.5 && Math.sign(ang) !== bend;
    if (!lenOk) { rep.lengths++; tg.set(kn, ik2(Aa, l1, l2, hip, Math.sign(ang) || bend).mid); }
    if (flipped) {
      // continuous stop: the knee held at the edge of straight on the wrong side, the foot planted, the hip follows
      rep.flips++;
      const kk = tg.get(kn)!, d0 = mul(sub(kk, Aa), 1 / len(sub(kk, Aa)));
      const newHip = add(kk, mul(rot(d0, (-bend * LIMITS.straight * Math.PI) / 180), l2));
      pull.push(sub(newHip, hip)); tg.set(hp, newHip);
    }
  }
  if (pull.length) {
    const m = mul(pull.reduce((a, b) => add(a, b), [0, 0] as P), 1 / pull.length);
    for (const k of upperKeys) { const p = tg.get(k); if (p) tg.set(k, add(p, m)); }
  }
  // Arms: lengths, flexion limit, natural bend side.
  for (const L of LIMBS.filter((l) => l.kind === 'bras')) {
    const A0 = rest.get(L.a), B0 = rest.get(L.b), C0 = rest.get(L.c);
    const A = tg.get(L.a) ?? A0, B = tg.get(L.b), C = tg.get(L.c);
    if (!A0 || !B0 || !C0 || !A || !B || !C) continue;
    const l1 = len(sub(B0, A0)), l2 = len(sub(C0, B0));
    const bend = bends.get(L.b) ?? 1;
    let mid = B, end = C;
    const u = sub(mid, A), v = sub(end, mid);
    if (Math.abs(len(u) / l1 - 1) > LIMITS.boneLengthTolerance || Math.abs(len(v) / l2 - 1) > LIMITS.boneLengthTolerance) {
      rep.lengths++;
      const r = ik2(A, l1, l2, end, Math.sign(cross(u, v)) || bend);
      mid = r.mid; end = r.end;
    }
    const ang = (angleBetween(sub(mid, A), sub(end, mid)) * 180) / Math.PI;
    // the drawing itself may already fold further (hands on the cheeks): its own flexion is always allowed
    const restAng = Math.abs((angleBetween(sub(B0, A0), sub(C0, B0)) * 180) / Math.PI);
    const max = Math.max(L.kind === 'bras' ? LIMITS.elbowFlexMax : LIMITS.kneeFlexMax, restAng + 5);
    if (Math.abs(ang) > LIMITS.straight + 0.5 && Math.sign(ang) !== bend) {
      // CONTINUOUS stop (16/10, measured: mirroring the elbow made a one-frame jump when an arm went through straight):
      // a joint bent the wrong way is held at the edge of straight (`straight` degrees), the upper bone kept
      rep.flips++;
      const dir = mul(sub(mid, A), 1 / len(sub(mid, A)));
      end = add(mid, mul(rot(dir, (-bend * LIMITS.straight * Math.PI) / 180), l2));
    } else if (Math.abs(ang) > max + 0.5) {
      rep.overFlex++;
      // open the joint to its limit, the upper bone kept: the end swings out
      const dir = mul(sub(mid, A), 1 / len(sub(mid, A)));
      end = add(mid, mul(rot(dir, (Math.sign(ang) * max * Math.PI) / 180), l2));
    }
    tg.set(L.b, mid); tg.set(L.c, end);
  }
  return rep;
}

/** What one frame of movements does to the skeleton (+ a whole-body lift for hops, in pixels, up > 0). */
export interface MoveResult {
  lift: number;
  /** Feet that leave their drawn place (tap): the caller lets their ground handles follow. */
  freeFeet: number[];
}

/**
 * Applies the cues to `tg` (in place) on the drawing `rest`. `toward` = partner side in the drawing's x (+1/−1, 0 =
 * camera). The arm « près » is the one on the partner's side.
 */
export function applyMoves(rest: Skel, tg: Skel, h: number, cues: MoveCue[], toward: number, t = 0): MoveResult {
  const res: MoveResult = { lift: 0, freeFeet: [] };
  const get = (k: number) => tg.get(k) ?? rest.get(k);
  const shift = (ks: number[], d: P) => { for (const k of ks) { const p = get(k); if (p) tg.set(k, add(p, d)); } };
  const rotate = (ks: number[], c: P, a: number) => { for (const k of ks) { const p = get(k); if (p) tg.set(k, rotAround(p, c, a)); } };
  const HEAD = [BP.nose, BP.lEye, BP.rEye, BP.lEar, BP.rEar];
  const UPPER = [BP.lSh, BP.rSh, BP.lEl, BP.rEl, BP.lWr, BP.rWr, ...HEAD];
  const to = toward || facingOf(rest, h) || 1;
  const ls = rest.get(BP.lSh), rs = rest.get(BP.rSh), lh = rest.get(BP.lHip), rh = rest.get(BP.rHip), nose = rest.get(BP.nose);
  if (!ls || !rs) return res;
  const shMid: P = mul(add(ls, rs), 0.5);
  const hipMid: P = lh && rh ? mul(add(lh, rh), 0.5) : add(shMid, [0, 0.3 * h]);
  const neck: P = add(shMid, [0, -0.02 * h]);
  const bends = naturalBends(rest, h);
  // arms: « près » = the shoulder on the partner's side
  type Arm = { s: number; e: number; w: number };
  const armL: Arm = { s: BP.lSh, e: BP.lEl, w: BP.lWr }, armR: Arm = { s: BP.rSh, e: BP.rEl, w: BP.rWr };
  const near = Math.sign(ls[0] - rs[0]) === Math.sign(to) ? armL : armR, far = near === armL ? armR : armL;
  const reach = (a: Arm, target: P, k: number) => {
    const s = get(a.s), e0 = rest.get(a.e), w0 = rest.get(a.w), s0 = rest.get(a.s);
    if (!s || !e0 || !w0 || !s0 || k <= 0) return;
    const l1 = len(sub(e0, s0)), l2 = len(sub(w0, e0));
    const cur = get(a.w)!;
    const goal = add(cur, mul(sub(target, cur), clamp(k, 0, 1)));
    const r = ik2(s, l1, l2, goal, bends.get(a.e) ?? 1);
    tg.set(a.e, r.mid); tg.set(a.w, r.end);
  };
  const armLen = (a: Arm) => { const s0 = rest.get(a.s), e0 = rest.get(a.e), w0 = rest.get(a.w); return s0 && e0 && w0 ? len(sub(e0, s0)) + len(sub(w0, e0)) : 0.3 * h; };
  for (const c of cues) {
    const def: MoveDef = MOVES[c.name];
    if (def.needs !== 'rig') continue;
    const w = c.w ?? 1, u = clamp(c.u, 0, 1), e = envelope(u) * w, cyc = def.cycles ?? 1;
    const osc = Math.sin(2 * Math.PI * cyc * u) * smooth(Math.min(u, 1 - u) * 6) * w;
    switch (c.name) {
      case 'hocher': shift(HEAD, [0, 0.012 * h * Math.max(0, osc)]); break;
      case 'secouer': shift(HEAD, [0.009 * h * osc, 0]); break;
      case 'pencherTete': rotate(HEAD, neck, 0.2 * e * to); break;
      case 'leverTete': shift(HEAD, [0, -0.012 * h * e]); break;
      case 'baisserTete': shift(HEAD, [0, 0.014 * h * e]); break;
      case 'tournerTete': shift(HEAD, [0.008 * h * e * to, 0]); break;
      case 'respirer': shift([BP.lSh, BP.rSh, ...HEAD], [0, -0.004 * h * Math.sin(2 * Math.PI * u) * w]); break;
      case 'hausser': shift([BP.lSh, BP.rSh, BP.lEl, BP.rEl, BP.lWr, BP.rWr, ...HEAD], [0, -0.018 * h * e]); break;
      case 'affaisser': shift(UPPER, [0.004 * h * e * to, 0.016 * h * e]); shift(HEAD, [0, 0.008 * h * e]); break;
      case 'bomber': shift(UPPER, [-0.004 * h * e * to, -0.012 * h * e]); shift(HEAD, [0, -0.004 * h * e]); break;
      case 'frissonner': shift(UPPER, [0.003 * h * Math.sin(t * 47) * w, 0]); break;
      case 'pencherVers': rotate(UPPER, hipMid, 0.1 * e * to); break;
      case 'reculer': rotate(UPPER, hipMid, -0.12 * e * to); break;
      case 'reverence': rotate(UPPER, hipMid, 0.32 * e * (facingOf(rest, h) || to)); break;
      case 'soupirer': shift(UPPER, [0, (u < 0.4 ? -0.012 * smooth(u / 0.4) : 0.012 * (smooth((u - 0.4) / 0.6) - 1) + 0.01 * Math.sin(Math.PI * (u - 0.4) / 0.6)) * h * w]); break;
      case 'sursauter': { const k = u < 0.15 ? smooth(u / 0.15) : 1 - smooth((u - 0.15) / 0.85); rotate(UPPER, hipMid, -0.1 * k * to * w); shift(UPPER, [0, -0.015 * h * k * w]); break; }
      case 'rire': shift(UPPER, [0, -Math.abs(osc) * 0.008 * h]); rotate(UPPER, hipMid, 0.06 * e * (facingOf(rest, h) || to)); break;
      case 'pointer': {
        const s = get(near.s)!;
        reach(near, add(s, [to * 0.92 * armLen(near), -0.04 * h]), e);
        break;
      }
      case 'saluer': {
        const s = get(near.s)!, L = armLen(near);
        reach(near, add(s, [to * 0.35 * L + 0.18 * L * osc, -0.62 * L]), Math.max(0, envelope(u, { hold: 0.5 })) * w);
        break;
      }
      case 'faireSigne': {
        const s = get(near.s)!, L = armLen(near);
        reach(near, add(s, [to * (0.55 + 0.15 * osc) * L, -0.25 * L]), Math.max(0, e));
        break;
      }
      case 'leverMain': { const s = get(near.s)!; reach(near, add(s, [to * 0.15 * armLen(near), -0.9 * armLen(near)]), e); break; }
      case 'brasEnHaut': for (const a of [near, far]) { const s = get(a.s)!; const out = Math.sign(s[0] - shMid[0]) || 1; reach(a, add(s, [out * 0.3 * armLen(a), -0.88 * armLen(a)]), e); } break;
      case 'ouvrirBras': for (const a of [near, far]) { const s = get(a.s)!; const out = Math.sign(s[0] - shMid[0]) || 1; reach(a, add(s, [out * 0.85 * armLen(a), 0.15 * armLen(a)]), e); } break;
      case 'mainsTete': if (nose) for (const a of [near, far]) { const out = Math.sign(get(a.s)![0] - shMid[0]) || 1; reach(a, add(get(BP.nose)!, [out * 0.05 * h, -0.05 * h]), e); } break;
      case 'mainCoeur': reach(far, add(shMid, [0, 0.06 * h]), e); break;
      case 'presenter': { const s = get(near.s)!; reach(near, add(s, [to * 0.75 * armLen(near), 0.25 * armLen(near)]), e); break; }
      case 'stop': { const s = get(near.s)!; reach(near, add(s, [to * 0.9 * armLen(near), 0]), e); break; }
      case 'gratterTete': if (nose) { const out = Math.sign(get(far.s)![0] - shMid[0]) || 1; reach(far, add(get(BP.nose)!, [out * 0.04 * h, -0.07 * h + 0.006 * h * osc]), e); } break;
      case 'mainsHanches': for (const a of [near, far]) { const hip = a === armL ? lh : rh; if (hip) { const out = Math.sign(get(a.s)![0] - shMid[0]) || 1; reach(a, add(hip, [out * 0.02 * h, -0.03 * h]), e); } } break;
      case 'flechir':
      case 'rebondir': {
        const k = c.name === 'flechir' ? e : Math.max(0, osc);
        const dy = 0.035 * h * k, face = facingOf(rest, h) || to;
        shift([BP.lHip, BP.rHip, ...UPPER], [0, dy]);
        // knees: the leg folds (IK from the lowered hip to the planted ankle), the knee comes forward
        for (const [hp, kn, an] of [[BP.lHip, BP.lKn, BP.lAn], [BP.rHip, BP.rKn, BP.rAn]] as const) {
          const H0 = rest.get(hp), K0 = rest.get(kn), A0 = rest.get(an), Hh = get(hp);
          if (!H0 || !K0 || !A0 || !Hh) continue;
          const r = ik2(A0, len(sub(K0, A0)), len(sub(H0, K0)), Hh, -(bends.get(kn) ?? face));
          tg.set(kn, r.mid);
        }
        break;
      }
      case 'taperPied': {
        const foot = to > 0 === ((rest.get(BP.lAn)?.[0] ?? 0) > (rest.get(BP.rAn)?.[0] ?? 0)) ? [BP.lToe, BP.lHeel] : [BP.rToe, BP.rHeel];
        const toe = get(foot[0]!), heel = get(foot[1]!);
        if (toe && heel) { tg.set(foot[0]!, rotAround(toe, heel, -0.25 * Math.max(0, osc) * (to || 1))); res.freeFeet.push(foot[0]!); }
        break;
      }
      case 'danser': { shift([BP.lHip, BP.rHip], [0.012 * h * osc, 0]); rotate(UPPER, hipMid, -0.06 * osc); break; }
      case 'sautiller': res.lift += 0.04 * h * Math.sin(Math.PI * u) * w; break;
    }
  }
  return res;
}
