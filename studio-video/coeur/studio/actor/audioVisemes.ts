/**
 * LIP-SYNC SUR LA VOIX RÉELLE — the mouth of the actors follows the SOUND of their line, not an estimate of the text
 * timing: every 20 ms of the voice, the energy of the speech band opens the jaw, the balance of the formant regions
 * shapes the lips (front vowels « i, é » stretch them, back vowels « o, ou » round them), the hiss of the fricatives
 * (« s, f, ch ») narrows the opening, silences close the mouth. The same idea as the browser lip-sync engines (MFCC /
 * formant classifiers of wLipSync, Rhubarb), computed once per line on the decoded voice. Pure.
 */

export interface MouthFrame {
  /** Jaw opening 0..1. */
  open: number;
  /** Stretched lips 0..1 (i, é). */
  wide: number;
  /** Rounded lips 0..1 (o, ou). */
  round: number;
}

/** In-place radix-2 FFT (re, im of length 2^k). */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    const wr = Math.cos(a);
    const wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const xr = re[i + k + len / 2]! * cr - im[i + k + len / 2]! * ci;
        const xi = re[i + k + len / 2]! * ci + im[i + k + len / 2]! * cr;
        re[i + k + len / 2] = re[i + k]! - xr;
        im[i + k + len / 2] = im[i + k]! - xi;
        re[i + k] = re[i + k]! + xr;
        im[i + k] = im[i + k]! + xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** Low-pass (windowed sinc, cut at 0.45 of the new Nyquist) then keep one sample in D. */
function decimate(x: Float32Array | Float64Array, D: number): Float64Array {
  if (D <= 1) return Float64Array.from(x);
  const M = 8 * D;
  const fc = 0.45 / D;
  const h = new Float64Array(2 * M + 1);
  let sum = 0;
  for (let i = -M; i <= M; i++) {
    const sinc = i === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * i) / (Math.PI * i);
    const w = 0.42 + 0.5 * Math.cos((Math.PI * i) / M) + 0.08 * Math.cos((2 * Math.PI * i) / M);
    h[i + M] = sinc * w;
    sum += sinc * w;
  }
  const out = new Float64Array(Math.floor(x.length / D));
  for (let k = 0; k < out.length; k++) {
    let s = 0;
    const c = k * D;
    for (let i = -M; i <= M; i++) s += (x[c + i] ?? 0) * h[i + M]!;
    out[k] = s / sum;
  }
  return out;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Formants of a frame by linear prediction (autocorrelation + Levinson-Durbin, like Praat's formant tracker): the
 * peaks of the LPC envelope between 180 Hz and 3.6 kHz. Returns [F1, F2] in Hz (F2 = 0 when the upper formants are
 * too weak to read — back, rounded vowels).
 */
function formants(frame: Float64Array, sr: number, order: number, env: Float64Array, envIm: Float64Array): [number, number] {
  const n = frame.length;
  const r = new Float64Array(order + 1);
  for (let k = 0; k <= order; k++) {
    let s = 0;
    for (let i = k; i < n; i++) s += frame[i]! * frame[i - k]!;
    r[k] = s;
  }
  if (r[0]! <= 1e-12) return [0, 0];
  r[0] = r[0]! * (1 + 1e-6);
  // Levinson-Durbin.
  const a = new Float64Array(order + 1);
  const tmp = new Float64Array(order + 1);
  a[0] = 1;
  let err = r[0]!;
  for (let i = 1; i <= order; i++) {
    let acc = r[i]!;
    for (let j = 1; j < i; j++) acc += a[j]! * r[i - j]!;
    const k = -acc / err;
    tmp.set(a);
    for (let j = 1; j < i; j++) a[j] = tmp[j]! + k * tmp[i - j]!;
    a[i] = k;
    err *= 1 - k * k;
    if (err <= 0) break;
  }
  // Envelope 1/|A(e^jw)|² on the FFT grid.
  const N = env.length;
  env.fill(0);
  envIm.fill(0);
  for (let i = 0; i <= order; i++) env[i] = a[i]!;
  fft(env, envIm);
  const half = N / 2;
  const g = new Float64Array(half);
  for (let k = 0; k < half; k++) g[k] = -Math.log(env[k]! ** 2 + envIm[k]! ** 2 + 1e-12);
  const hz = sr / N;
  const peaks: { f: number; v: number }[] = [];
  for (let k = 1; k < half - 1; k++) {
    const f = k * hz;
    if (f < 180 || f > 3600) continue;
    if (g[k]! > g[k - 1]! && g[k]! >= g[k + 1]!) {
      // Parabolic refinement of the peak.
      const d = (g[k - 1]! - g[k + 1]!) / (2 * (g[k - 1]! - 2 * g[k]! + g[k + 1]!) || 1);
      peaks.push({ f: (k + Math.max(-0.5, Math.min(0.5, d))) * hz, v: g[k]! });
    }
  }
  if (!peaks.length) return [0, 0];
  const top = Math.max(...peaks.map((p) => p.v));
  const strong = peaks.filter((p) => p.v > top - 6.5);
  const f1 = strong[0]!.f;
  const f2 = strong.find((p) => p.f > f1 + 180)?.f ?? 0;
  return [f1, f2];
}

/**
 * Mouth shapes of a voice, one every `hop` seconds (default 20 ms): the jaw opens with the loudness of the speech
 * (relative to the line itself) and with the first formant (open vowels « a » drop the jaw, « i, ou » keep it high);
 * the second formant shapes the lips (high F2 « i, é » stretch them, low F2 « o, ou » round them); hiss narrows.
 */
export function audioVisemes(x: Float32Array | Float64Array, sr: number, hop = 0.02): MouthFrame[] {
  const N = sr >= 32000 ? 1024 : 512;
  const step = Math.max(1, Math.round(sr * hop));
  const frames = Math.max(1, Math.ceil(x.length / step));
  const bin = (hz: number) => Math.min(N / 2 - 1, Math.max(1, Math.round((hz * N) / sr)));
  const [b0, b1, b2, b3] = [bin(250), bin(900), bin(2600), bin(6000)];
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  // The formants are read on the voice brought down to ~11 kHz (formant ceiling ~5.5 kHz, as Praat does), with a
  // windowed-sinc low-pass before the decimation; LPC order 2 + kHz.
  const D = Math.max(1, Math.round(sr / 11025));
  const sr2 = sr / D;
  const y = decimate(x, D);
  const order = Math.round(2 + sr2 / 1000);
  const NL = Math.round(sr2 * 0.025);
  const winL = new Float64Array(NL).map((_, i) => 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (NL - 1)));
  const pre = new Float64Array(NL);
  const env = new Float64Array(512);
  const envIm = new Float64Array(512);
  const E: number[] = [];
  const hiss: number[] = [];
  const F1: number[] = [];
  const F2: number[] = [];
  for (let f = 0; f < frames; f++) {
    const c = f * step - N / 2;
    for (let i = 0; i < N; i++) {
      re[i] = (x[c + i] ?? 0) * win[i]!;
      im[i] = 0;
    }
    // Pre-emphasis for the formant analysis (flattens the glottal tilt).
    const c2 = Math.round((f * step) / D - NL / 2);
    for (let i = 0; i < NL; i++) pre[i] = ((y[c2 + i] ?? 0) - 0.97 * (y[c2 + i - 1] ?? 0)) * winL[i]!;
    fft(re, im);
    let low = 0;
    let mid = 0;
    let high = 0;
    for (let k = b0; k < b1; k++) low += re[k]! ** 2 + im[k]! ** 2;
    for (let k = b1; k < b2; k++) mid += re[k]! ** 2 + im[k]! ** 2;
    for (let k = b2; k < b3; k++) high += re[k]! ** 2 + im[k]! ** 2;
    E.push(Math.sqrt(low + mid));
    hiss.push(high / (low + mid + 1e-9));
    const [a1, a2] = formants(pre, sr2, order, env, envIm);
    F1.push(a1);
    F2.push(a2);
  }
  // Levels relative to the line itself (any voice, any loudness).
  const sorted = [...E].sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.95)] || 1e-9;
  const voiced = E.map((e, i) => e / ref > 0.12 && hiss[i]! < 1.2 && F1[i]! > 0);
  // The speaker's formant scale (men's formants sit ~15 % lower): from the median F2 of the voiced frames.
  const f2v = F2.filter((v, i) => voiced[i] && v > 0).sort((a, b) => a - b);
  const scale = f2v.length ? Math.max(0.85, Math.min(1.15, f2v[Math.floor(f2v.length / 2)]! / 1550)) : 1;
  const out: MouthFrame[] = [];
  let open = 0;
  let wide = 0;
  let round = 0;
  for (let f = 0; f < frames; f++) {
    const e = E[f]! / ref;
    const v = voiced[f]!;
    const f1 = F1[f]! / scale;
    const f2 = F2[f]! / scale;
    const jaw = v ? smoothstep(260, 720, f1) : 0.5;
    // Loudness in decibels under the line's peak, as the ear hears it: every vowel opens the mouth visibly (a syllable
    // 10 dB under the loudest one is still well open), silence and breath close it.
    const level = smoothstep(-30, -6, 20 * Math.log10(Math.max(1e-6, e)));
    // Cartoon timing exaggerates the jaw (every syllable reads on screen): « i, ou » open 60 %, « a » fully.
    let target = (v ? Math.max(0.35, level) : level * 0.6) * (0.6 + 0.4 * jaw) * (level > 0.02 ? 1 : 0);
    target *= 1 - Math.min(0.6, hiss[f]! * 0.5);
    // Fast opening, slightly slower closing (the jaw has weight).
    open += (target - open) * (target > open ? 0.75 : 0.45);
    const tw = v && f2 > 0 ? smoothstep(1450, 2050, f2) * (1 - 0.5 * jaw) : 0;
    const tr = v ? (f2 > 0 ? 1 - smoothstep(850, 1200, f2) : 1) * (1 - 0.6 * jaw) : 0;
    wide += (tw - wide) * 0.6;
    round += (tr - round) * 0.6;
    const q = (z: number) => Math.round(clamp01(z) * 1000) / 1000;
    out.push({ open: q(open), wide: q(wide), round: q(round) });
  }
  return out;
}

/** The mouth at a time of the line (seconds from its start), read slightly AHEAD of the sound like animators do. */
export function mouthAt(frames: MouthFrame[], rel: number, hop = 0.02, lead = 0.04): MouthFrame | null {
  if (!frames.length || rel < -0.1) return null;
  const k = Math.floor((rel + lead) / hop);
  if (k >= frames.length) return null;
  return frames[Math.max(0, k)]!;
}
