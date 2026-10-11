/**
 * MARIONNETTE AFRIKATOON — our own animation engine for still scene images (0 $, no quota, in the browser):
 *  - RIG: a vision model locates, once per image, each character's head, eyes, mouth, body and arms (fractions);
 *  - POSE at time t: head turn and nods while speaking, breathing, body sway, squash & stretch on emphasis, an arm
 *    wave when the action asks for it, eye blinks at natural intervals, mouth openness from the voice energy;
 *  - MESH WARP: a grid over each character, every vertex moved by its bones with a smooth falloff to the edges, so the
 *    drawing itself moves (the background stays still around it).
 * Pure: prompts, parsing, poses and vertex positions. The browser draws the triangles (preview.ts).
 */
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
  /** Body sway (radians around the feet) and vertical squash (1 = rest). */
  sway: number;
  squash: number;
  /** Arm wave angle (radians around the shoulder), 0 when not waving. */
  wave: number;
  /** 0 = open, 1 = closed. */
  blink: number;
  /** 0..1 mouth opening. */
  mouth: number;
}
const WAVE_MAX = 0.28;
const WAVE = /\b(salue|saluer|coucou|wave|waves|waving|bye|au revoir|hello|bonjour|lève la main|raises? (his|her) hand|points?|montre)\b/i;
/** Deterministic pseudo-random per character (blinks never in sync). */
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
/**
 * Pose of one character at time t. `speaking` = this character is the one talking now; `energy` its voice level
 * (0..1, from the audio envelope); `emphasis` a short accent (punchline) — squash & stretch.
 */
export function poseAt(c: PuppetCharacter, t: number, o: { speaking: boolean; energy: number; emphasis?: number; action?: string }): Pose {
  const seed = hash(c.name) % 1000;
  const ph = seed / 159;
  // Blinks: every 2.6–4.6 s, 140 ms closed (smooth in / out).
  const period = 2.6 + (seed % 20) / 10;
  const k = ((t + ph) % period) / 0.14;
  const blink = k < 1 ? Math.sin(k * Math.PI) : 0;
  const talk = o.speaking ? Math.min(1, o.energy * 2.4) : 0;
  const emph = o.emphasis ?? 0;
  return {
    headRot: 0.035 * Math.sin(t * 1.3 + ph) + (o.speaking ? 0.05 * Math.sin(t * 5.2 + ph) * talk : 0),
    headNod: o.speaking ? 0.04 * Math.abs(Math.sin(t * 6.5 + ph)) * talk : 0.01 * Math.sin(t * 1.1 + ph),
    sway: 0.012 * Math.sin(t * 0.9 + ph) + (o.speaking ? 0.01 * Math.sin(t * 3.1) : 0),
    squash: 1 + 0.012 * Math.sin(t * 2.2 + ph) - 0.06 * emph,
    wave: c.arms.length && WAVE.test(o.action ?? '') ? WAVE_MAX * Math.sin(t * 7 + ph) : 0,
    blink,
    mouth: o.speaking ? Math.max(0, Math.min(1, talk * (0.65 + 0.35 * Math.sin(t * 18 + ph)))) : 0,
  };
}

/** A rotation of point p around pivot q by angle a. */
const rot = (p: { x: number; y: number }, q: { x: number; y: number }, a: number) => {
  const [s, cs] = [Math.sin(a), Math.cos(a)];
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  return { x: q.x + dx * cs - dy * s, y: q.y + dx * s + dy * cs };
};
const smooth = (e: number) => (e <= 0 ? 0 : e >= 1 ? 1 : e * e * (3 - 2 * e));
/**
 * The deformed grid of one character (cols × rows vertices over its box, image fractions): head vertices turn around
 * the neck and nod, body vertices sway around the feet and squash, arm vertices wave around the shoulder; every
 * displacement fades to 0 at the edge of the box so the drawing stays attached to its background.
 */
export function warpGrid(c: PuppetCharacter, p: Pose, cols = 10, rows = 14): { src: { x: number; y: number }[]; dst: { x: number; y: number }[]; cols: number; rows: number } {
  const b = { x: c.box.x - c.box.w * 0.06, y: c.box.y - c.box.h * 0.04, w: c.box.w * 1.12, h: c.box.h * 1.06 };
  const neck = { x: c.head.x + c.head.w / 2, y: c.head.y + c.head.h };
  const feet = { x: c.body.x + c.body.w / 2, y: c.body.y + c.body.h };
  const src: { x: number; y: number }[] = [];
  const dst: { x: number; y: number }[] = [];
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= cols; i++) {
      const s = { x: b.x + (b.w * i) / cols, y: b.y + (b.h * j) / rows };
      src.push(s);
      // Edge falloff: 0 on the border of the warp box, 1 inside.
      const edge = smooth(Math.min(i, cols - i, j, rows - j) / 2);
      // Body: sway around the feet + squash towards the feet.
      let d = rot(s, feet, p.sway);
      d = { x: feet.x + (d.x - feet.x) * (2 - p.squash), y: feet.y + (d.y - feet.y) * p.squash };
      // Head: weight 1 above the neck, fading over a short band below it.
      const hw = smooth((neck.y + c.head.h * 0.15 - s.y) / (c.head.h * 0.3)) * smooth(1 - Math.abs(s.x - neck.x) / (c.head.w * 0.9));
      if (hw > 0) {
        const hd = rot(d, { x: neck.x, y: neck.y }, p.headRot * hw);
        d = { x: hd.x, y: hd.y + p.headNod * c.head.h * hw };
      }
      // Arms: points near the shoulder → hand segment turn around the shoulder.
      for (const a of c.arms) {
        if (!p.wave) break;
        const L = Math.hypot(a.hand.x - a.shoulder.x, a.hand.y - a.shoulder.y) || 1e-6;
        const t = ((s.x - a.shoulder.x) * (a.hand.x - a.shoulder.x) + (s.y - a.shoulder.y) * (a.hand.y - a.shoulder.y)) / (L * L);
        const px = a.shoulder.x + (a.hand.x - a.shoulder.x) * Math.max(0, Math.min(1, t));
        const py = a.shoulder.y + (a.hand.y - a.shoulder.y) * Math.max(0, Math.min(1, t));
        const dist = Math.hypot(s.x - px, s.y - py);
        const aw = smooth(1 - dist / (L * 0.35)) * smooth(t * 3);
        if (aw > 0) d = rot(d, a.shoulder, p.wave * aw);
      }
      dst.push({ x: s.x + (d.x - s.x) * edge, y: s.y + (d.y - s.y) * edge });
    }
  return { src, dst, cols, rows };
}

/** Where a point of the character (eye, mouth) goes with the pose (same bones as the grid, no edge falloff). */
export function deformPoint(c: PuppetCharacter, p: Pose, s: { x: number; y: number }): { x: number; y: number } {
  const neck = { x: c.head.x + c.head.w / 2, y: c.head.y + c.head.h };
  const feet = { x: c.body.x + c.body.w / 2, y: c.body.y + c.body.h };
  let d = rot(s, feet, p.sway);
  d = { x: feet.x + (d.x - feet.x) * (2 - p.squash), y: feet.y + (d.y - feet.y) * p.squash };
  const hd = rot(d, neck, p.headRot);
  return { x: hd.x, y: hd.y + p.headNod * c.head.h };
}
