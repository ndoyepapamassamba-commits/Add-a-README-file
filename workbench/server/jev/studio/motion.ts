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
  // Slow breathing of the frame only: the voice moves the characters, never the camera (a camera that follows the voice
  // level frame by frame trembles).
  zoom += 0.004 * Math.sin(t * 1.7);
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
// v45 bug: only the OpenAI voice names were known — with ElevenLabs the 2nd man got the next free voice, « sarah ».
// Every voice of the live speech catalogue (OpenRouter, Oct. 2026) is now classified by its NAME.
const FEMALE = ['nova', 'shimmer', 'coral', 'sage', 'aria', 'alloy'];
const MALE = ['onyx', 'echo', 'ash', 'ballad', 'verse', 'fable'];
const F_NAMES = new Set(
  ('nova shimmer coral sage aria alloy sarah alice bella jessica laura lily matilda zephyr kore leda aoede callirrhoe autonoe despina erinome laomedeia achernar gacrux pulcherrima vindemiatrix sadachbia sulafat ' +
    'harper soleil mia emily isla priya kavya iris olivia marta valeria rosa haena lilla reka eve ara tara leah jess marie jane agathe thalia amalthea andromeda asteria athena aurora callista cora cordelia delia electra harmonia helena hera juno luna ' +
    'alexis bree brittany brooke elise gemma haley hannah heather kelsey maeve meena meghan paige sharon sienna siwis dora heart nicole sky emma isabella sara awa aya adjoua akissi aminata fatou mariam clarisse')
    .split(' '),
);
const M_NAMES = new Set(
  ('onyx echo ash ballad verse fable george adam bill brian callum charlie chris daniel eric harry liam roger will puck charon fenrir orus enceladus iapetus umbriel algieba algenib rasalgethi alnilam schedar achird zubenelgenubi sadaltager ' +
    'grant marc klaus ethan jasper dhruv arjun alejo luca junho sander bence levente rex sal leo dan zac paul oliver hector apollo arcas aries atlas draco hermes hyperion janus jupiter orion orpheus perseus zeus ' +
    'bruce cliff cole colin conor donovan drew jack marcelo marcus miles naveen rufus sean tanner wade wes michael lewis alex santa nicola omega psi kumo')
    .split(' '),
);
/** 'f' | 'm' | null from a provider voice id (kokoro « af_bella », MiniMax « English_Upbeat_Woman », MAI « fr-FR-Marc:… »). */
export function voiceGender(id: string): 'f' | 'm' | null {
  const v = id.toLowerCase();
  const k = /^([a-z])([fm])_/.exec(v);
  if (k && v.length > 3) return k[2] as 'f' | 'm';
  if (/(woman|lady|girl|queen|female)/.test(v)) return 'f';
  if (/(man\b|_man|man$|men\b|bloke|boy|gentleman|guy|male)/.test(v.replace(/woman/g, ''))) return 'm';
  const toks = v.split(/[^a-z]+/).filter(Boolean);
  for (const t of toks) {
    if (F_NAMES.has(t)) return 'f';
    if (M_NAMES.has(t)) return 'm';
  }
  return null;
}
/** The language a voice id announces (« fr-FR-Marc », « fr_marie_happy », « aura-2-hector-fr », kokoro « ff_siwis »). */
export function voiceLang(id: string): string | null {
  const v = id.toLowerCase();
  const m = /^([a-z]{2})[-_][a-z]{2}[-_]/.exec(v) ?? /^([a-z]{2})_[a-z]+_/.exec(v) ?? /-([a-z]{2})$/.exec(v);
  if (m) return m[1]!;
  const k = /^([a-z])[fm]_/.exec(v);
  return k ? ({ a: 'en', b: 'en', e: 'es', f: 'fr', h: 'hi', i: 'it', j: 'ja', p: 'pt', z: 'zh' } as Record<string, string>)[k[1]!] ?? null : null;
}
const FEM = /\b(f|femme|fille|female|woman|girl|m[èe]re|maman|tante|grand-m[èe]re|dame|madame|s[œo]eur|[ée]pouse|belle-m[èe]re|servante|vendeuse|marchande)\b/i;
const MASC = /\b(m|h|homme|gar[çc]on|male|man|boy|p[èe]re|papa|oncle|grand-p[èe]re|monsieur|fr[èe]re|mari|patron|chef|vieux|employ[ée]?)\b/i;
/** Gender of a CHARACTER: the sheet's gender field first; the voice description only when the field is empty. */
export function characterGender(c: { gender?: string; voice?: string; role?: string }): 'f' | 'm' | null {
  for (const t of [c.gender ?? '', `${c.voice ?? ''} ${c.role ?? ''}`]) {
    const f = FEM.test(t);
    const m = MASC.test(t);
    if (f !== m) return f ? 'f' : 'm';
  }
  return null;
}
const isChild = (a: string) => /\b(enfant|child|kid|gar[çc]on|fillette|b[ée]b[ée]|\d{1}\s?ans|1[0-2]\s?ans)\b/i.test(a);
export function castVoices(
  chars: { id: string; name: string; gender?: string; age?: string; voice?: string; role?: string }[],
  available: string[],
  lang = 'fr',
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!available.length) return out;
  const used = new Set<string>();
  // Same-language voices first (a French sketch is spoken by French voices when the model has some).
  const rank = (v: string) => (voiceLang(v) === lang ? 0 : voiceLang(v) === null ? 1 : 2);
  const pool = [...available].sort((a, b) => rank(a) - rank(b));
  const pick = (want: 'f' | 'm' | null, pref: string[]) => {
    const ok = (v: string) => !used.has(v) && (!want || voiceGender(v) === want);
    const p =
      pref.find((v) => pool.includes(v) && ok(v)) ??
      pool.find(ok) ??
      // All the voices of that gender are taken: re-use one of the RIGHT gender rather than the wrong one.
      (want ? pool.find((v) => voiceGender(v) === want) : undefined) ??
      pool.find((v) => !used.has(v)) ??
      pool[0]!;
    used.add(p);
    return p;
  };
  for (const c of chars) {
    const g = characterGender(c);
    const child = isChild(`${c.age ?? ''} ${c.voice ?? ''}`);
    out[c.name.toUpperCase()] = pick(g, child ? (g === 'f' ? ['shimmer', 'nova', 'coral'] : ['fable', 'echo', 'alloy']) : g === 'f' ? FEMALE : MALE);
  }
  return out;
}
/** A spoken pace in the natural range (TTS « speed » outside 0.85–1.15 sounds robotic). */
export const naturalSpeed = (pace: unknown) => {
  const n = typeof pace === 'number' && Number.isFinite(pace) ? pace : 1;
  return Math.min(1.15, Math.max(0.85, n));
};

/**
 * TALKING / LIVING 2.5D (no video model): the speaker's zone of the picture (head + upper body, on their side of
 * the frame) is re-drawn with a jaw-like vertical stretch following the voice envelope and a small head nod; the
 * rest breathes. Fractions of the frame; pivot = bottom of the zone (the body stays planted).
 */
export interface TalkWarp {
  zone: { x: number; y: number; w: number; h: number };
  scaleY: number;
  scaleX: number;
  rot: number;
  dy: number;
}
export function talkWarp(side: number, energy: number, t: number): TalkWarp {
  const e = Math.max(0, Math.min(1, energy));
  const x = side < 0 ? 0.02 : side > 0 ? 0.43 : 0.2;
  const syll = Math.abs(Math.sin(t * 13.5)) * 0.6 + Math.abs(Math.sin(t * 7.1)) * 0.4; // syllable-like pulses
  return {
    zone: { x, y: 0.1, w: 0.55, h: 0.5 },
    scaleY: 1 + 0.045 * e * syll,
    scaleX: 1 - 0.012 * e * syll,
    rot: 0.022 * e * Math.sin(t * 5.3),
    dy: -0.006 * e * syll,
  };
}
/** Idle life of the whole shot: slow breathing (vertical scale anchored at the bottom). */
export const breathing = (t: number) => 1 + 0.006 * Math.sin(t * 2.1);
