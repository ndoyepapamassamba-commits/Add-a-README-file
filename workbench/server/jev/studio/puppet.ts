/**
 * MARIONNETTE AFRIKATOON — our own animation engine for still scene images (0 $, no quota, in the browser):
 *  - RIG: a vision model locates, once per image, each character's head, eyes, mouth, body and arms (fractions);
 *  - POSE at time t: head turn and nods while speaking, breathing, body sway, squash & stretch on emphasis, an arm
 *    wave when the action asks for it, eye blinks at natural intervals, mouth openness from the voice energy;
 *  - MESH WARP: a grid over each character, every vertex moved by its bones with a smooth falloff to the edges, so the
 *    drawing itself moves (the background stays still around it).
 * Pure: prompts, parsing, poses and vertex positions. The browser draws the triangles (preview.ts).
 */
import { gestureEnvelope } from './viralFormat';
import { EMOTION_BODY, EMOTION_FACE, emotionOf } from './emotionLayer';
export interface RBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PuppetCharacter {
  name: string;
  /** Whole character, head, body (fractions of the image). */
  box: RBox;
  head: RBox;
  body: RBox;
  eyes: { x: number; y: number; r: number }[];
  mouth: RBox | null;
  /** Arms (from shoulder to hand) when visible. */
  arms: { shoulder: { x: number; y: number }; hand: { x: number; y: number } }[];
}
export interface PuppetRig {
  characters: PuppetCharacter[];
  /** Who the rig was read by (vision model id). */
  by: string;
}

export const RIG_PROMPT = `You rig a cartoon image for 2D puppet animation. For EACH visible character (max 4) give coordinates as fractions of the image (0..1, x to the right, y down).
Answer ONLY JSON: {"characters":[{"name":"short label","box":{"x":0,"y":0,"w":0,"h":0},"head":{"x":0,"y":0,"w":0,"h":0},"body":{"x":0,"y":0,"w":0,"h":0},"eyes":[{"x":0,"y":0,"r":0.01}],"mouth":{"x":0,"y":0,"w":0,"h":0},"arms":[{"shoulder":{"x":0,"y":0},"hand":{"x":0,"y":0}}]}]}
Rules: box = whole character; head = head only; body = torso + legs; eyes = pupil centres with radius; mouth = the mouth area (null if not visible); arms only when clearly visible. No character → {"characters":[]}.`;

const clamp01 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null);
const box = (b: unknown): RBox | null => {
  const o = b as Record<string, unknown> | null;
  if (!o) return null;
  const [x, y, w, h] = [clamp01(o.x), clamp01(o.y), clamp01(o.w), clamp01(o.h)];
  return x === null || y === null || w === null || h === null || w < 0.01 || h < 0.01 ? null : { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
};
const pt = (p: unknown) => {
  const o = p as Record<string, unknown> | null;
  const [x, y] = [clamp01(o?.x), clamp01(o?.y)];
  return x === null || y === null ? null : { x, y };
};
/** The vision answer → a rig (characters with an unusable box are dropped; nothing is guessed). */
export function parseRig(text: string, by: string): PuppetRig | null {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { characters?: unknown[] };
    const characters: PuppetCharacter[] = [];
    for (const raw of (j.characters ?? []).slice(0, 4)) {
      const c = raw as Record<string, unknown>;
      const b = box(c.box);
      const head = box(c.head);
      if (!b || !head) continue;
      const body = box(c.body) ?? { x: b.x, y: head.y + head.h, w: b.w, h: Math.max(0.02, b.y + b.h - head.y - head.h) };
      const eyes = (Array.isArray(c.eyes) ? c.eyes : [])
        .map((e) => {
          const p = pt(e);
          const r = clamp01((e as Record<string, unknown>)?.r) ?? head.w * 0.08;
          return p ? { ...p, r: Math.max(0.004, Math.min(head.w * 0.25, r)) } : null;
        })
        .filter((e): e is { x: number; y: number; r: number } => Boolean(e))
        .slice(0, 2);
      const arms = (Array.isArray(c.arms) ? c.arms : [])
        .map((a) => {
          const o = a as Record<string, unknown>;
          const s = pt(o.shoulder);
          const hnd = pt(o.hand);
          return s && hnd ? { shoulder: s, hand: hnd } : null;
        })
        .filter((a): a is { shoulder: { x: number; y: number }; hand: { x: number; y: number } } => Boolean(a))
        .slice(0, 2);
      characters.push({ name: String(c.name ?? `perso ${characters.length + 1}`).slice(0, 30), box: b, head, body, eyes, mouth: box(c.mouth), arms });
    }
    return { characters, by };
  } catch {
    return null;
  }
}

export interface Pose {
  /** Head rotation (radians) around the neck, head nod offset (fraction of head height). */
  headRot: number;
  headNod: number;
  /** Body sway (radians around the feet), lean towards / away from the other character, vertical squash (1 = rest). */
  sway: number;
  lean: number;
  squash: number;
  /** Whole-body jump (fraction of the character height, up) and shake (fraction of its width). */
  jump: number;
  shake: number;
  /** Angle of each arm around its shoulder (radians, positive = hand goes UP). */
  arms: number[];
  /** Kept for compatibility: the first arm's angle. */
  wave: number;
  /** 0 = open, 1 = closed. */
  blink: number;
  /** 0..1 mouth opening (the jaw drops by it). */
  mouth: number;
  /** Preston Blair mouth shape drawn by the renderer (AI, E, O, U, MBP, FV, L, WQ, etc, rest). */
  mouthShape: string;
  /** Mouth corners: +1 smile … −1 frown (from the emotion). */
  smile: number;
  /** Brows (inner / outer raise in eye radii, + up) and squint (0..1): the facial expression of the emotion. */
  browIn: number;
  browOut: number;
  squint: number;
}
/** The gestures the engine plays — keywords of the action / the line's [gesture] → gesture id. */
export const GESTURES: { id: string; re: RegExp }[] = [
  { id: 'wave', re: /\b(salue|saluer|coucou|bonjour|au revoir|bye|wave|hello|lève la main)\b/i },
  { id: 'point', re: /\b(montre( du doigt)?|pointe|désigne|accuse|toi là|regarde[- ]?ça|points?)\b/i },
  { id: 'shrug', re: /\b(hausse les épaules|haussement|je sais pas|pas mon palabre|bof|shrug)\b/i },
  { id: 'head-hands', re: /\b(mains sur la tête|catastrophe|ehhh dieu|desperate|désespéré)\b/i },
  { id: 'laugh', re: /\b(rit|rire|éclate de rire|se moque|mdr|hahaha|laugh)/i },
  { id: 'jump', re: /\b(saute|sautille|bondit|saute de joie|jump)/i },
  { id: 'yes', re: /\b(hoche la tête|acquiesce|d'accord|oui oui|nod)\b/i },
  { id: 'no', re: /\b(secoue la tête|refuse|non non|dêh|jamais)\b/i },
  { id: 'angry', re: /\b(se fâche|fâché|colère|énervé|crie|hurle|furieux|angry|shouts?)\b/i },
  { id: 'dance', re: /\b(danse|coupé[- ]décalé|zouglou|dance)/i },
  { id: 'clap', re: /\b(applaudit|bravo|tape des mains|clap)/i },
  { id: 'think', re: /\b(réfléchit|pense|hum+|se gratte|think)/i },
  { id: 'startle', re: /\b(sursaute|choqué|surpris|stupeur|quoi ?!|startled|shocked)\b/i },
  { id: 'cry', re: /\b(pleure|sanglote|cry|cries)\b/i },
  { id: 'run', re: /\b(court|fuit|s'enfuit|cours|runs?)\b/i },
];
export const gestureOf = (text: string | undefined): string | null => (text ? (GESTURES.find((g) => g.re.test(text))?.id ?? null) : null);
/** Deterministic pseudo-random per character (blinks never in sync). */
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
/**
 * Pose of one character at time t. `speaking` = this character is the one talking now; `energy` its voice level
 * (0..1, from the audio envelope); `emphasis` a short accent (punchline); `gesture` the gesture of the line / action;
 * `facing` +1 when the other character is to the right (leans and points go towards it).
 */
export function poseAt(
  c: PuppetCharacter,
  t: number,
  o: {
    speaking: boolean;
    energy: number;
    emphasis?: number;
    action?: string;
    gesture?: string | null;
    facing?: number;
    age?: number;
    /** The emotion of the line / scene (body layer) and the Preston Blair jaw opening of what is said (0..1). */
    emotion?: string;
    viseme?: number;
    /** The mouth shape of the sound being said (Preston Blair key). */
    visemeKey?: string;
    /** Accent of the voice (0..1, a short pulse on each stressed syllable): beat gestures follow it. */
    beat?: number;
  },
): Pose {
  const seed = hash(c.name) % 1000;
  const ph = seed / 159;
  const face = o.facing ?? 1;
  // Blinks: every 2.6–4.6 s, 140 ms closed (smooth in / out).
  const period = 2.6 + (seed % 20) / 10;
  const k = ((t + ph) % period) / 0.14;
  const blink = k < 1 ? Math.sin(k * Math.PI) : 0;
  const talk = o.speaking ? Math.min(1, o.energy * 2.4) : 0;
  const beat = o.speaking ? Math.max(0, Math.min(1, o.beat ?? 0)) : 0;
  const emph = o.emphasis ?? 0;
  const g = o.gesture ?? gestureOf(o.action);
  const p: Pose = {
    // BEAT GESTURES: while talking the head and the hand mark the stressed syllables of the voice (not a metronome).
    headRot: 0.02 * Math.sin(t * 1.3 + ph) + (o.speaking ? 0.015 * Math.sin(t * 2 + ph) * talk + 0.035 * beat * face : 0),
    headNod: o.speaking ? 0.012 * talk + 0.055 * beat : 0.01 * Math.sin(t * 1.1 + ph),
    sway: 0.01 * Math.sin(t * 0.9 + ph),
    // Talkers lean in (the « dispute » posture of the reference), listeners settle back a little.
    lean: o.speaking ? face * (0.018 + 0.012 * talk) : -face * 0.005,
    squash: 1 + 0.012 * Math.sin(t * 2.2 + ph) - 0.07 * emph,
    jump: 0,
    shake: 0,
    // Speakers gesticulate with the arm towards the listener; listeners keep a slow idle.
    arms: c.arms.map((_, i) => (o.speaking ? (i === 0 ? 0.1 + 0.04 * Math.sin(t * 1.7 + ph) + 0.26 * beat : 0.04 * Math.sin(t * 1.4 + ph) + 0.08 * beat) : 0.03 * Math.sin(t * 1.2 + ph + i))),
    wave: 0,
    blink,
    mouth: o.speaking ? Math.max(0, Math.min(1, talk * (0.6 + 0.4 * Math.sin(t * 17 + ph)))) : 0,
    mouthShape: o.speaking ? 'etc' : 'rest',
    smile: 0,
    browIn: 0,
    browOut: 0,
    squint: 0,
  };
  // Emotion layer (Wallbott / Ekman): an offset on the whole body; the speaker shows it fully, the listener half.
  const em = EMOTION_BODY[emotionOf(o.emotion)]!;
  const ek = o.speaking ? 1 : 0.5;
  const tt = t * em.tempo;
  p.lean += face * em.lean * ek;
  p.headRot += face * em.headTilt * ek;
  p.headNod += em.headDrop * ek;
  p.arms = p.arms.map((v) => v + em.arms * ek);
  p.shake += em.tremble * ek * Math.sin(tt * 40 + ph);
  p.squash += em.squash * ek;
  p.jump += em.bounce * ek * Math.abs(Math.sin(tt * 6 + ph));
  // Lip-sync: the jaw follows the visemes of the words when known, the voice level gives the strength.
  // Lip-sync: the shape of the sound said now (Preston Blair), opened by the voice level and closed in the silences.
  if (o.speaking && o.viseme !== undefined) p.mouth = Math.max(0, Math.min(1, o.viseme * Math.min(1, 0.25 + talk * 1.4)));
  if (o.speaking && o.visemeKey) p.mouthShape = o.visemeKey;
  // Facial expression of the emotion (brows, squint, mouth corners); the brows also rise on the voice accents.
  const fx = EMOTION_FACE[emotionOf(o.emotion)]!;
  p.smile = fx.smile;
  p.browIn = fx.browIn * (0.6 + 0.4 * ek) + 0.5 * beat;
  p.browOut = fx.browOut * (0.6 + 0.4 * ek) + 0.3 * beat;
  p.squint = fx.squint;
  const base: Pose = { ...p, arms: [...p.arms] };
  const A = (i: number, v: number) => {
    if (i < p.arms.length) p.arms[i] = v;
  };
  switch (g) {
    case 'wave':
      A(0, 0.55 + 0.32 * Math.sin(t * 8 + ph));
      break;
    case 'point':
      // Pointing: the arm stays up and jabs on each accent of the voice.
      A(0, 0.3 + 0.16 * beat);
      p.lean += face * 0.02;
      break;
    case 'shrug': {
      const s = Math.max(0, Math.sin(t * 2.6 + ph));
      p.arms = p.arms.map(() => 0.18 * s);
      p.headRot += 0.07 * s * face;
      p.jump = 0.008 * s;
      break;
    }
    case 'head-hands':
      p.arms = p.arms.map(() => 0.95);
      p.headRot += 0.05 * Math.sin(t * 4);
      break;
    case 'laugh':
      p.shake = 0.006 * Math.sin(t * 38);
      p.lean = -face * 0.03;
      p.mouth = Math.max(p.mouth, 0.55 + 0.25 * Math.abs(Math.sin(t * 14)));
      p.headNod += 0.03 * Math.abs(Math.sin(t * 12));
      break;
    case 'jump':
      p.jump = 0.06 * Math.abs(Math.sin(t * 5.5));
      p.squash = 1 + 0.06 * Math.cos(t * 11);
      p.arms = p.arms.map(() => 0.6);
      break;
    case 'yes':
      p.headNod += 0.06 * Math.sin(t * 7) * (0.5 + beat);
      break;
    case 'no':
      p.headRot += 0.07 * Math.sin(t * 8) * (0.5 + beat);
      break;
    case 'angry':
      p.lean += face * 0.03;
      p.shake = 0.004 * Math.sin(t * 46);
      A(0, 0.22 + 0.3 * beat);
      break;
    case 'dance':
      p.sway = 0.07 * Math.sin(t * 5);
      p.jump = 0.02 * Math.abs(Math.sin(t * 5));
      p.arms = p.arms.map((_, i) => 0.3 + 0.25 * Math.sin(t * 5 + i * Math.PI));
      break;
    case 'clap':
      p.arms = p.arms.map((_, i) => 0.25 + 0.15 * Math.sin(t * 16 + i * Math.PI));
      break;
    case 'think':
      A(0, 0.75);
      p.headRot += 0.09 * face;
      break;
    case 'startle': {
      const k2 = Math.max(0, 1 - ((t + ph) % 3) / 0.5);
      p.jump = 0.04 * k2;
      p.squash = 1 + 0.08 * k2;
      p.lean = -face * 0.03;
      break;
    }
    case 'cry':
      p.headNod += 0.06;
      p.shake = 0.003 * Math.sin(t * 30);
      break;
    case 'run':
      p.jump = 0.025 * Math.abs(Math.sin(t * 11));
      p.lean = face * 0.05;
      p.arms = p.arms.map((_, i) => 0.35 * Math.sin(t * 11 + i * Math.PI));
      break;
  }
  // Animation principles: the gesture starts with an anticipation, overshoots and settles (age = time since it began).
  if (g && o.age !== undefined) {
    const k = gestureEnvelope(o.age);
    const mix = (a: number, b: number) => a + (b - a) * k;
    p.arms = p.arms.map((v, i) => mix(base.arms[i] ?? 0, v));
    p.lean = mix(base.lean, p.lean);
    p.jump = Math.max(0, mix(base.jump, p.jump));
    p.headRot = mix(base.headRot, p.headRot);
    p.headNod = mix(base.headNod, p.headNod);
  }
  p.wave = p.arms[0] ?? 0;
  return p;
}

/** A rotation of point p around pivot q by angle a. */
const rot = (p: { x: number; y: number }, q: { x: number; y: number }, a: number) => {
  const [s, cs] = [Math.sin(a), Math.cos(a)];
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  return { x: q.x + dx * cs - dy * s, y: q.y + dx * s + dy * cs };
};
const smooth = (e: number) => (e <= 0 ? 0 : e >= 1 ? 1 : e * e * (3 - 2 * e));
/** Where a point of the character goes with the pose (body + head + jaw bones), without the arms. */
function bodyMove(c: PuppetCharacter, p: Pose, s: { x: number; y: number }): { x: number; y: number } {
  const neck = { x: c.head.x + c.head.w / 2, y: c.head.y + c.head.h };
  const feet = { x: c.body.x + c.body.w / 2, y: c.body.y + c.body.h };
  // Body: sway + lean around the feet (more at the top), squash towards the feet, jump and shake.
  const hFrac = smooth((feet.y - s.y) / Math.max(1e-6, feet.y - c.box.y));
  let d = rot(s, feet, p.sway + p.lean * hFrac);
  d = { x: feet.x + (d.x - feet.x) * (2 - p.squash), y: feet.y + (d.y - feet.y) * p.squash };
  d = { x: d.x + p.shake * c.box.w, y: d.y - p.jump * c.box.h };
  // Head: weight 1 above the neck, fading over a short band below it.
  const hw = smooth((neck.y + c.head.h * 0.15 - s.y) / (c.head.h * 0.3)) * smooth(1 - Math.abs(s.x - neck.x) / (c.head.w * 0.9));
  if (hw > 0) {
    const pivot = { x: neck.x + (d.x - s.x), y: neck.y + (d.y - s.y) };
    const hd = rot(d, pivot, p.headRot * hw);
    d = { x: hd.x, y: hd.y + p.headNod * c.head.h * hw };
  }
  return d;
}
/**
 * The deformed grid of one character (cols × rows vertices over its box, image fractions): body leans / sways /
 * jumps around the feet, the head turns and nods around the neck, the jaw drops with the voice, each arm turns
 * around its shoulder; every displacement fades to 0 at the edge of the warp box (wider than the character) so the
 * drawing stays attached to its background.
 */
export function warpGrid(
  c: PuppetCharacter,
  p: Pose,
  cols = 12,
  rows = 18,
  /** 0..1 « is this point on the character? » (colour matte): the background stays straight, only the character moves. */
  weight?: (s: { x: number; y: number }) => number,
): { src: { x: number; y: number }[]; dst: { x: number; y: number }[]; cols: number; rows: number } {
  const b = { x: c.box.x - c.box.w * 0.14, y: c.box.y - c.box.h * 0.1, w: c.box.w * 1.28, h: c.box.h * 1.14 };
  const src: { x: number; y: number }[] = [];
  const dst: { x: number; y: number }[] = [];
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= cols; i++) {
      const s = { x: b.x + (b.w * i) / cols, y: b.y + (b.h * j) / rows };
      src.push(s);
      const edge = smooth(Math.min(i, cols - i, j, rows - j) / 2);
      let d = bodyMove(c, p, s);
      // Arms: points near the shoulder → hand segment turn around the (moved) shoulder; positive angle = hand up.
      c.arms.forEach((a, k) => {
        const ang = p.arms[k] ?? 0;
        if (!ang) return;
        const L = Math.hypot(a.hand.x - a.shoulder.x, a.hand.y - a.shoulder.y) || 1e-6;
        const tt = ((s.x - a.shoulder.x) * (a.hand.x - a.shoulder.x) + (s.y - a.shoulder.y) * (a.hand.y - a.shoulder.y)) / (L * L);
        const px = a.shoulder.x + (a.hand.x - a.shoulder.x) * Math.max(0, Math.min(1, tt));
        const py = a.shoulder.y + (a.hand.y - a.shoulder.y) * Math.max(0, Math.min(1, tt));
        const dist = Math.hypot(s.x - px, s.y - py);
        const aw = smooth(1 - dist / (L * 0.32)) * smooth(tt * 3);
        if (aw <= 0) return;
        const up = a.hand.x >= a.shoulder.x ? -1 : 1;
        const sh = bodyMove(c, p, a.shoulder);
        d = rot(d, sh, up * ang * aw);
      });
      const k = edge * (weight ? weight(s) : 1);
      dst.push({ x: s.x + (d.x - s.x) * k, y: s.y + (d.y - s.y) * k });
    }
  return { src, dst, cols, rows };
}
/**
 * JAW (fine local warp of the mouth / chin area, in pixels): vertical offset of a point at height y for a mouth centred
 * at my with height mh. rest = 1 when the picture shows the mouth already open: the lower lip and chin then rise until
 * the mouth closes (open = 0) and come back to the painted opening on the vowels (open = 1); otherwise the chin drops.
 */
export function jawOffset(y: number, my: number, mh: number, open: number, rest: 0 | 1): number {
  const upper = my - mh * (rest ? 0.3 : 0);
  const chin = my + mh * 1.9;
  if (y <= upper || y >= chin) return 0;
  const lowerLip = my + mh * 0.5;
  // 0 at the upper lip, 1 from the lower lip, back to 0 at the bottom of the chin (the neck does not move).
  const w = y < lowerLip ? smooth((y - upper) / Math.max(1e-6, lowerLip - upper)) : smooth((chin - y) / Math.max(1e-6, chin - lowerLip));
  return rest ? -(1 - open) * mh * 0.95 * w : open * mh * 0.55 * w;
}
/** Where a point of the character (eye, mouth) goes with the pose (no edge falloff, no arm). */
export function deformPoint(c: PuppetCharacter, p: Pose, s: { x: number; y: number }): { x: number; y: number } {
  return bodyMove(c, p, s);
}
