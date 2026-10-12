import { describe, expect, it } from 'vitest';
import { audioVisemes, mouthAt } from '../../server/jev/studio/actor/audioVisemes';

const SR = 16000;
/** A vowel from a source-filter synthesizer (Klatt cascade): a glottal pulse train through formant resonators. */
function vowel(f1: number, f2: number, sec: number, amp = 0.4): Float32Array {
  const n = Math.round(sec * SR);
  const x = new Float64Array(n);
  // Glottal source: pulses at 130 Hz, smoothed (-12 dB/oct), then lip radiation (+6 dB/oct).
  for (let i = 0; i < n; i += Math.round(SR / 130)) x[i] = 1;
  const res = (y: Float64Array, F: number, bw: number) => {
    const T = 1 / SR;
    const C = -Math.exp(-2 * Math.PI * bw * T);
    const B = 2 * Math.exp(-Math.PI * bw * T) * Math.cos(2 * Math.PI * F * T);
    const A = 1 - B - C;
    const o = new Float64Array(y.length);
    for (let i = 0; i < y.length; i++) o[i] = A * y[i]! + B * (o[i - 1] ?? 0) + C * (o[i - 2] ?? 0);
    return o;
  };
  let y = res(x, 0, 100);
  for (const [F, bw] of [
    [f1, 80],
    [f2, 100],
    [2700, 150],
    [3500, 200],
  ] as const)
    y = res(y, F, bw);
  const out = new Float32Array(n);
  let peak = 1e-9;
  for (let i = 1; i < n; i++) peak = Math.max(peak, Math.abs(y[i]! - y[i - 1]!));
  for (let i = 1; i < n; i++) out[i] = ((y[i]! - y[i - 1]!) / peak) * amp;
  return out;
}
const cat = (...xs: Float32Array[]) => {
  const out = new Float32Array(xs.reduce((a, x) => a + x.length, 0));
  let o = 0;
  for (const x of xs) {
    out.set(x, o);
    o += x.length;
  }
  return out;
};
const mean = (fr: { open: number; wide: number; round: number }[], k: 'open' | 'wide' | 'round', a: number, b: number) => {
  const s = fr.slice(Math.round(a / 0.02), Math.round(b / 0.02));
  return s.reduce((x, y) => x + y[k], 0) / s.length;
};

describe('lip-sync sur la voix réelle', () => {
  const silence = new Float32Array(Math.round(0.4 * SR));
  const x = cat(silence, vowel(750, 1200, 0.4), silence, vowel(300, 2300, 0.4), silence, vowel(320, 750, 0.4), silence);
  const fr = audioVisemes(x, SR);
  it('the mouth opens on the voice and closes in the silences', () => {
    expect(mean(fr, 'open', 0.5, 0.75)).toBeGreaterThan(0.5);
    expect(mean(fr, 'open', 0.05, 0.3)).toBeLessThan(0.05);
    expect(mean(fr, 'open', 0.9, 1.15)).toBeLessThan(0.1);
  });
  it('« i » stretches the lips, « ou » rounds them', () => {
    const iWide = mean(fr, 'wide', 1.3, 1.55);
    const uWide = mean(fr, 'wide', 2.1, 2.35);
    const iRound = mean(fr, 'round', 1.3, 1.55);
    const uRound = mean(fr, 'round', 2.1, 2.35);
    expect(iWide).toBeGreaterThan(uWide + 0.2);
    expect(uRound).toBeGreaterThan(iRound + 0.2);
  });
  it('the jaw drops lower on « a » than on « i » and « ou » (first formant)', () => {
    const a = mean(fr, 'open', 0.5, 0.75);
    expect(a).toBeGreaterThan(mean(fr, 'open', 1.3, 1.55) + 0.3);
    expect(a).toBeGreaterThan(mean(fr, 'open', 2.1, 2.35) + 0.3);
  });
  it('reads slightly ahead of the sound; nothing outside the line', () => {
    expect(mouthAt(fr, 0.38)!.open).toBeGreaterThan(mouthAt(fr, 0.2)!.open);
    expect(mouthAt(fr, 99)).toBeNull();
  });
});
