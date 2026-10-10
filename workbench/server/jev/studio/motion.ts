// 2.5D MOTION ENGINE for the 2D animatic: a still storyboard image becomes a moving shot. Every scene gets a camera move
// chosen from its content (camera / action / emotion / beat), consecutive scenes never repeat the same move, the camera
// punches in on whoever speaks, the frame "breathes" with the voice energy, and scenes cross-fade. Pure and deterministic.
export type Move = 'push' | 'pull' | 'panL' | 'panR' | 'tiltUp' | 'tiltDown' | 'shake' | 'drift';
export interface Cam {
  zoom: number;
  /** Offsets as a fraction of the frame (−0.1 … 0.1). */
  dx: number;
  dy: number;
  /** Rotation in radians (tiny). */
  rot: number;
}
const RULES: [RegExp, Move][] = [
  [/(zoom avant|gros plan|close|push|rapproch|se penche|r[ée]v[ée]lation|choc|surprise|twist)/i, 'push'],
  [/(zoom arri[èe]re|plan large|wide|pull|recul|s['’][ée]loign|panorama|d[ée]couvre la sc[èe]ne)/i, 'pull'],
  [/(panoramique gauche|pan left|vers la gauche|arrive de droite)/i, 'panL'],
  [/(panoramique|pan|travelling|suit|court|march|traverse|vers la droite|arrive de gauche)/i, 'panR'],
  [/(plong[ée]e|regarde en bas|tombe|chute|descend)/i, 'tiltDown'],
  [/(contre-plong[ée]e|regarde en haut|monte|s['’][ée]l[èe]ve|saute)/i, 'tiltUp'],
  [/(explos|tremble|crie|hurle|col[èe]re|panique|bagarre|claque|boom|crash|fuit)/i, 'shake'],
];
const CYCLE: Move[] = ['push', 'panR', 'pull', 'panL', 'tiltUp', 'drift'];
export function moveFor(s: { camera?: string; action?: string; emotion?: string; beat?: string }, index: number, prev?: Move): Move {
  const txt = `${s.camera ?? ''} ${s.beat ?? ''} ${s.emotion ?? ''} ${s.action ?? ''}`;
  let m = RULES.find(([rx]) => rx.test(txt))?.[1] ?? CYCLE[index % CYCLE.length]!;
  if (m === prev) m = CYCLE[(CYCLE.indexOf(m) + 1 + index) % CYCLE.length]!;
  if (m === prev) m = m === 'push' ? 'pull' : 'push';
  return m;
}
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/**
 * Camera at progress f (0…1) of the shot. `punch` (0…1) = how much a character is speaking now (smoothed), `side` = which
 * third of the frame to punch towards (−1 left, 0 centre, 1 right), `energy` (0…1) = voice loudness now, `t` = seconds.
 */
export function cameraAt(move: Move, f: number, o: { punch?: number; side?: number; energy?: number; t?: number; dim3d?: boolean } = {}): Cam {
  const e = ease(Math.min(1, Math.max(0, f)));
  const t = o.t ?? 0;
  let zoom = 1.08;
  let dx = 0;
  let dy = 0;
  let rot = 0;
  switch (move) {
    case 'push': zoom = 1.04 + 0.16 * e; break;
    case 'pull': zoom = 1.22 - 0.16 * e; break;
    case 'panR': zoom = 1.16; dx = -0.06 + 0.12 * e; break;
    case 'panL': zoom = 1.16; dx = 0.06 - 0.12 * e; break;
    case 'tiltUp': zoom = 1.16; dy = 0.05 - 0.1 * e; break;
    case 'tiltDown': zoom = 1.16; dy = -0.05 + 0.1 * e; break;
    case 'shake':
      zoom = 1.14 + 0.04 * e;
      dx = 0.012 * Math.sin(t * 37) * (1 - e * 0.6);
      dy = 0.01 * Math.cos(t * 43) * (1 - e * 0.6);
      rot = 0.006 * Math.sin(t * 29);
      break;
    default: zoom = 1.08 + 0.07 * e; dx = 0.025 * Math.sin(e * Math.PI) + 0.02 * e; dy = 0.012 * Math.sin(e * Math.PI * 2);
  }
  const punch = Math.min(1, Math.max(0, o.punch ?? 0));
  zoom += 0.1 * punch;
  dx += -0.05 * punch * (o.side ?? 0);
  // Breathing / talking bounce: the frame lives with the voice.
  const en = Math.min(1, Math.max(0, o.energy ?? 0));
  zoom += 0.012 * en + 0.004 * Math.sin(t * 1.7);
  dy += -0.006 * en * Math.abs(Math.sin(t * 9));
  // 3D look: a slow orbit (tiny roll + lateral sweep) gives depth to rendered 3D frames.
  if (o.dim3d) {
    rot += 0.012 * (e - 0.5) * (move === 'panL' ? -1 : 1);
    dx += 0.015 * Math.sin(e * Math.PI) * (move === 'panL' ? -1 : 1);
    zoom += 0.02;
  }
  return { zoom, dx, dy, rot };
}
/** Opacity of the incoming shot during a cross-fade of `d` seconds at the start of a scene. */
export const fadeIn = (sinceStart: number, d = 0.35) => (d <= 0 ? 1 : Math.min(1, Math.max(0, sinceStart / d)));
/** Normalised loudness envelope of a voice (one value per `hop` seconds), for the talking bounce. */
export function rmsEnvelope(samples: Float32Array, sampleRate: number, hop = 0.04): number[] {
  const n = Math.max(1, Math.round(sampleRate * hop));
  const out: number[] = [];
  let max = 1e-6;
  for (let i = 0; i < samples.length; i += n) {
    let s = 0;
    const end = Math.min(samples.length, i + n);
    for (let j = i; j < end; j++) s += samples[j]! * samples[j]!;
    const v = Math.sqrt(s / Math.max(1, end - i));
    out.push(v);
    if (v > max) max = v;
  }
  return out.map((v) => v / max);
}
/** Which side of the frame a speaker sits on: the order of characters in the scene (first left, second right…). */
export function speakerSide(characters: string[], speaker: string): number {
  const i = characters.findIndex((c) => c.toUpperCase() === speaker.toUpperCase());
  if (characters.length <= 1 || i < 0) return 0;
  return i % 2 === 0 ? -1 : 1;
}

// ── VOICE CASTING: distinct, gender-coherent voices instead of the same default voice for everybody ──────────────────
const FEMALE = ['nova', 'shimmer', 'coral', 'sage', 'aria', 'alloy'];
const MALE = ['onyx', 'echo', 'ash', 'ballad', 'verse', 'fable'];
const isFemale = (g: string) => /\b(f|femme|fille|female|woman|girl|m[èe]re|maman|tante|grand-m[èe]re|dame|madame|elle)\b/i.test(g);
const isChild = (a: string) => /\b(enfant|child|kid|gar[çc]on|fillette|b[ée]b[ée]|\d{1}\s?ans|1[0-2]\s?ans)\b/i.test(a);
export function castVoices(
  chars: { id: string; name: string; gender?: string; age?: string; voice?: string }[],
  available: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!available.length) return out;
  const used = new Set<string>();
  const pick = (pref: string[]) => {
    const p = pref.find((v) => available.includes(v) && !used.has(v)) ?? available.find((v) => !used.has(v)) ?? available[0]!;
    used.add(p);
    return p;
  };
  for (const c of chars) {
    const g = `${c.gender ?? ''} ${c.voice ?? ''}`;
    const fem = isFemale(g);
    const child = isChild(`${c.age ?? ''} ${c.voice ?? ''}`);
    out[c.name.toUpperCase()] = pick(child ? (fem ? ['shimmer', 'nova', 'coral'] : ['fable', 'echo', 'alloy']) : fem ? FEMALE : MALE);
  }
  return out;
}
/** A spoken pace in the natural range (TTS « speed » outside 0.85–1.15 sounds robotic). */
export const naturalSpeed = (pace: unknown) => {
  const n = typeof pace === 'number' && Number.isFinite(pace) ? pace : 1;
  return Math.min(1.15, Math.max(0.85, n));
};
