// Local, free audio synthesis in the browser (WebAudio, OfflineAudioContext): balafon / djembé / kora loop and basic SFX.
// No network, no model, cost 0 $. These are SYNTHESISED sounds, labelled as such.
import {
  DJEMBE,
  PENTATONIC,
  encodeWav,
  intensityAt,
  melody,
  type MusicSpec,
  type SfxLabel,
} from '../../../server/jev/studio/sound';

const SR = 22050;
const wavBlob = (samples: Float32Array) =>
  new Blob([encodeWav(samples, SR) as BlobPart], { type: 'audio/wav' });

function noise(ctx: BaseAudioContext, seconds: number): AudioBufferSourceNode {
  const b = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const d = b.getChannelData(0);
  // Deterministic noise: the same call always gives the same sound.
  let x = 12345;
  for (let i = 0; i < d.length; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    d[i] = (x / 0xffffffff) * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = b;
  return s;
}
function tone(
  ctx: OfflineAudioContext,
  f: number,
  t: number,
  dur: number,
  gain: number,
  type: OscillatorType = 'sine',
  decay = 0.25,
) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(decay, 0.05));
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur);
}
function drum(ctx: OfflineAudioContext, t: number, kind: 1 | 2, gain: number) {
  const n = noise(ctx, 0.25);
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  f.type = kind === 1 ? 'lowpass' : 'highpass';
  f.frequency.value = kind === 1 ? 180 : 1800;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 1 ? 0.22 : 0.09));
  n.connect(f).connect(g).connect(ctx.destination);
  n.start(t);
  n.stop(t + 0.25);
  if (kind === 1) tone(ctx, 70, t, 0.25, gain * 0.8, 'sine', 0.2);
}
/** Balafon (marimba-like) + djembé + kora arpeggio loop following the spec's sections (intro / montée / climax / outro). */
export async function renderMusic(spec: MusicSpec): Promise<Blob> {
  const ctx = new OfflineAudioContext(1, Math.floor(SR * spec.seconds), SR);
  const beat = 60 / spec.tempo;
  const step = beat / 2;
  const steps = Math.floor(spec.seconds / step);
  const mel = melody(steps);
  for (let i = 0; i < steps; i++) {
    const t = i * step;
    const e = intensityAt(spec, t);
    if (spec.instruments.includes('balafon') && (i % 2 === 0 || e > 0.6)) {
      const f = PENTATONIC[mel[i]!]!;
      tone(ctx, f, t, 0.5, 0.18 * (0.4 + e), 'sine', 0.35);
      tone(ctx, f * 3.9, t, 0.3, 0.05 * e, 'sine', 0.12);
    }
    if (spec.instruments.includes('djembe')) {
      const p = DJEMBE[i % 8]!;
      if (p && e > 0.15) drum(ctx, t, p as 1 | 2, 0.35 * (0.4 + e));
    }
    if (spec.instruments.includes('kora') && i % 4 === 0)
      for (let k = 0; k < 3; k++)
        tone(
          ctx,
          PENTATONIC[(mel[i]! + k * 2) % PENTATONIC.length]! / 2,
          t + k * step * 0.33,
          0.6,
          0.08 * e,
          'triangle',
          0.45,
        );
  }
  const r = await ctx.startRendering();
  return wavBlob(r.getChannelData(0));
}
/** Basic SFX synthesised locally (a library import — CC0 packs — has priority over these when available). */
export async function renderSfx(label: SfxLabel): Promise<Blob> {
  const dur = label === 'crowd' || label === 'market' ? 3 : label === 'laugh' ? 1.6 : 1.2;
  const ctx = new OfflineAudioContext(1, Math.floor(SR * dur), SR);
  const burst = (type: BiquadFilterType, f: number, len: number, gain: number, t = 0) => {
    const n = noise(ctx, len);
    const bf = ctx.createBiquadFilter();
    const g = ctx.createGain();
    bf.type = type;
    bf.frequency.value = f;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.connect(bf).connect(g).connect(ctx.destination);
    n.start(t);
    n.stop(t + len);
  };
  switch (label) {
    case 'door':
      burst('lowpass', 400, 0.25, 0.9);
      tone(ctx, 90, 0, 0.3, 0.8, 'sine', 0.25);
      break;
    case 'phone':
      for (let i = 0; i < 4; i++) {
        tone(ctx, 880, i * 0.3, 0.12, 0.3, 'square', 0.12);
        tone(ctx, 660, i * 0.3 + 0.12, 0.12, 0.3, 'square', 0.12);
      }
      break;
    case 'crowd':
    case 'market':
      for (let i = 0; i < 6; i++) burst('bandpass', 500 + i * 250, 1.2, 0.12, i * 0.4);
      break;
    case 'impact':
      tone(ctx, 140, 0, 0.5, 0.9, 'sine', 0.45);
      burst('lowpass', 800, 0.3, 0.7);
      break;
    case 'surprise': {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(300, 0);
      o.frequency.exponentialRampToValueAtTime(1400, 0.35);
      g.gain.setValueAtTime(0.4, 0);
      g.gain.exponentialRampToValueAtTime(0.0001, 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(0);
      o.stop(0.55);
      break;
    }
    case 'whoosh':
      burst('bandpass', 1500, 0.6, 0.5);
      break;
    case 'steps':
      for (let i = 0; i < 4; i++) burst('lowpass', 300, 0.1, 0.5, i * 0.28);
      break;
    case 'slap':
      burst('highpass', 2500, 0.1, 0.9);
      break;
    case 'laugh':
      for (let i = 0; i < 5; i++) tone(ctx, 420 + (i % 2) * 90, i * 0.22, 0.18, 0.25, 'sawtooth', 0.18);
      break;
    case 'money':
      for (let i = 0; i < 5; i++) tone(ctx, 2200 + i * 150, i * 0.07, 0.1, 0.2, 'triangle', 0.1);
      break;
  }
  const r = await ctx.startRendering();
  return wavBlob(r.getChannelData(0));
}
