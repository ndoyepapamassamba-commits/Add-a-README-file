// Sound: SFX proposals deduced from the action (never random), music specification, and the pure parts of the local
// synthesis (note tables, rhythm patterns) so they can be tested without an audio device.

export type SfxLabel =
  | 'door'
  | 'phone'
  | 'crowd'
  | 'impact'
  | 'surprise'
  | 'whoosh'
  | 'steps'
  | 'laugh'
  | 'market'
  | 'slap'
  | 'money';
const RULES: [RegExp, SfxLabel][] = [
  [/(porte|claque|door|frappe)/i, 'door'],
  [/(téléphone|telephone|phone|sonne|appel)/i, 'phone'],
  [/(foule|crowd|public|voisins|quartier)/i, 'crowd'],
  [/(marché|market|marchand)/i, 'market'],
  [/(choc|stup|surpris|shock|sursaut|découvre|decouvre)/i, 'surprise'],
  [/(tombe|chute|impact|coup|cogne|explos)/i, 'impact'],
  [/(gifle|claque la main|slap)/i, 'slap'],
  [/(court|fuit|cours|run|rapide)/i, 'whoosh'],
  [/(marche|pas\b|steps|entre|sort)/i, 'steps'],
  [/(rire|laugh|éclate|eclate)/i, 'laugh'],
  [/(argent|billet|money|banane|pagne.*billets)/i, 'money'],
];
/** SFX suggested for a scene, from its action / sound / dialogue text. Deterministic, no duplicates, max 4. */
export function proposeSfx(text: string): SfxLabel[] {
  const out: SfxLabel[] = [];
  for (const [re, l] of RULES) if (re.test(text) && !out.includes(l)) out.push(l);
  return out.slice(0, 4);
}

export interface MusicSpec {
  genre: string;
  mood: string;
  tempo: number;
  instruments: ('balafon' | 'djembe' | 'kora')[];
  seconds: number;
  /** 0..1 */
  energy: number;
  culture: string;
  /** Section lengths as shares of the duration. */
  sections: { intro: number; build: number; climax: number; outro: number };
}
export const DEFAULT_MUSIC: MusicSpec = {
  genre: 'afro-comédie',
  mood: 'joyeux, espiègle',
  tempo: 112,
  instruments: ['balafon', 'djembe'],
  seconds: 64,
  energy: 0.7,
  culture: 'Afrique de l’Ouest (Sénégal)',
  sections: { intro: 0.12, build: 0.4, climax: 0.35, outro: 0.13 },
};
/** Pentatonic balafon scale (C D E G A) as frequencies over two octaves. */
export const PENTATONIC = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880];
/** Intensity (0..1) of the music at time t according to the sections and the energy. */
export function intensityAt(spec: MusicSpec, t: number): number {
  const f = Math.max(0, Math.min(1, t / spec.seconds));
  const { intro, build, climax } = spec.sections;
  const e = spec.energy;
  if (f < intro) return e * 0.35;
  if (f < intro + build) return e * (0.35 + 0.45 * ((f - intro) / build));
  if (f < intro + build + climax) return e;
  return e * Math.max(0.1, 1 - (f - intro - build - climax) / Math.max(0.01, 1 - intro - build - climax));
}
/** Djembé pattern (1 = bass, 2 = slap, 0 = rest) on 8 steps, deterministic per index. */
export const DJEMBE = [1, 0, 2, 0, 1, 2, 0, 2];
/** Balafon melody step → scale index; a small deterministic walk (seeded), never random per run. */
export function melody(steps: number, seed = 7): number[] {
  let x = seed;
  const out: number[] = [];
  let pos = 2;
  for (let i = 0; i < steps; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    const d = [-2, -1, -1, 0, 1, 1, 2][x % 7]!;
    pos = Math.max(0, Math.min(PENTATONIC.length - 1, pos + d));
    out.push(pos);
  }
  return out;
}
/** 16-bit PCM WAV from mono float samples. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++)
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i]!)) * 0x7fff, true);
  return new Uint8Array(buf);
}
