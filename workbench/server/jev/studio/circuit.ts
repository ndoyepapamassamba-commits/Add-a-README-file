// CIRCUIT GROK 0,30 $ — real generative motion (an image → video model animates the scene image) with a HARD budget per
// film: 0,30 $ per minute of film, everything included (writing, images, voices, video). Pure: no DOM, no network.
// Only models whose price is CERTAIN per second (pricing_skus announced by the provider) are eligible: a token-billed
// model cannot be held under a cap before the call, so it is never picked here.
import type { MediaModel } from './capabilities';
import type { Scene } from './types';

export const CIRCUIT = {
  /** USD per started minute of film, everything included. */
  usdPerMinute: 0.3,
  /** Lowest resolution: the montage frames the clip in a 540 px wide band, a higher one costs more for nothing. */
  resolution: '480p',
  /** Kept for the stages that run AFTER the animation (voices, QA judge) when their price is not known. */
  reserveUsd: 0.03,
  /** The video stops at 80 % of the cap: the governor asks a confirmation for an UNCERTAIN price (voices) above that
   *  line, which would stall an unattended Autopilot. */
  videoShare: 0.8,
} as const;
export const CIRCUIT_PREFIX = 'circuit:';
export const isCircuit = (id: string | undefined): boolean => Boolean(id?.startsWith(CIRCUIT_PREFIX));
export const circuitModelId = (id: string): string => id.slice(CIRCUIT_PREFIX.length);

/** Hard cap of one film: 0,30 $ for a film up to 1 min, 0,30 $ per started minute beyond. */
export const circuitCap = (seconds: number): number =>
  Math.round(CIRCUIT.usdPerMinute * Math.max(1, Math.ceil(Math.max(0, seconds) / 60)) * 100) / 100;

export interface CircuitRate {
  id: string;
  name: string;
  usdPerS: number;
  /** Billed once per clip for the first-frame image (0 when the provider does not bill it). */
  usdPerClip: number;
  durations: number[];
  sku: string;
}
const num = (s: string | undefined): number | null => {
  if (s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
/** Certain $/s of an image → video model at a resolution, or null (token billing, unknown format, no first frame). */
export function circuitRate(m: MediaModel, aspect: string, res: string = CIRCUIT.resolution): CircuitRate | null {
  if (!m.caps.includes('IMAGE_TO_VIDEO') || !m.video) return null;
  if (m.video.aspectRatios.length && !m.video.aspectRatios.includes(aspect)) return null;
  if (m.video.resolutions.length && !m.video.resolutions.includes(res)) return null;
  const sk = m.pricing.skus ?? {};
  if (num(sk.minimum_cents_per_generation)) return null;
  const perS: [string, number | null][] = [
    [`image_to_video_duration_seconds_${res}`, num(sk[`image_to_video_duration_seconds_${res}`])],
    [`duration_seconds_without_audio_${res}`, num(sk[`duration_seconds_without_audio_${res}`])],
    [`duration_seconds_${res}`, num(sk[`duration_seconds_${res}`])],
    [`cents_per_video_output_second_${res}`, num(sk[`cents_per_video_output_second_${res}`]) === null ? null : num(sk[`cents_per_video_output_second_${res}`])! / 100],
    [`cents_per_second_output_${res}`, num(sk[`cents_per_second_output_${res}`]) === null ? null : num(sk[`cents_per_second_output_${res}`])! / 100],
  ];
  const hit = perS.find(([, v]) => v !== null && v > 0);
  if (!hit) return null;
  const img = num(sk.cents_per_image_input);
  return {
    id: m.id,
    name: m.name,
    usdPerS: hit[1]!,
    usdPerClip: img === null ? 0 : img / 100,
    durations: m.video.durations.length ? [...m.video.durations].sort((a, b) => a - b) : [],
    sku: hit[0],
  };
}
/** Clip length: the scene duration rounded, within the durations the model accepts (never longer than needed). */
export function clipSeconds(r: CircuitRate, sceneSeconds: number): number | null {
  const want = Math.max(1, Math.round(sceneSeconds));
  if (!r.durations.length) return want;
  return r.durations.find((d) => d >= want) ?? r.durations[r.durations.length - 1] ?? null;
}
export const clipUsd = (r: CircuitRate, seconds: number): number =>
  Math.round((r.usdPerS * seconds + r.usdPerClip) * 10000) / 10000;

/**
 * The circuit's model: the cheapest certain price for a typical 8 s clip; prices within 15 % are a tie, broken by the
 * quality prior (Grok Imagine, Seedance… ahead of a talking-avatar engine).
 */
export function pickCircuitModel(models: MediaModel[], aspect: string, prior: (m: MediaModel) => number): CircuitRate | null {
  const rated = models
    .map((m) => ({ m, r: circuitRate(m, aspect) }))
    .filter((x): x is { m: MediaModel; r: CircuitRate } => Boolean(x.r) && !/avatar|talking.?head|heygen|edit|upscale/i.test(x.m.id + ' ' + x.m.name));
  if (!rated.length) return null;
  const c8 = (r: CircuitRate) => clipUsd(r, 8);
  const best = Math.min(...rated.map((x) => c8(x.r)));
  const near = rated.filter((x) => c8(x.r) <= best * 1.15);
  near.sort((a, b) => prior(b.m) - prior(a.m) || c8(a.r) - c8(b.r));
  return near[0]!.r;
}

/** Scenes that carry the joke first: the hook (first scene) and the punchline (last scene / twist / chute). */
const BEAT_RANK = (s: Pick<Scene, 'beat'>, i: number, n: number): number => {
  const b = (s.beat || '').toLowerCase();
  if (i === 0 || /hook|accroche/.test(b)) return 0;
  if (i === n - 1 || /chute|punch|twist|r[ée]v[ée]l/.test(b)) return 1;
  if (/escalad|climax|tension/.test(b)) return 2;
  return 3;
};
export interface CircuitShot {
  sceneId: string;
  seconds: number;
  usd: number;
}
export interface CircuitPlan {
  shots: CircuitShot[];
  usd: number;
  seconds: number;
  /** Scenes left to the free Marionnette engine because the budget is used up. */
  skipped: string[];
}
/** Picks the shots that fit `budgetUsd` (priority: hook, punchline, escalation, the rest in order). Never exceeds it. */
export function planCircuit(scenes: Pick<Scene, 'scene_id' | 'beat' | 'duration' | 'imageAssetId' | 'videoAssetId'>[], r: CircuitRate, budgetUsd: number): CircuitPlan {
  const todo = scenes
    .map((s, i) => ({ s, i, rank: BEAT_RANK(s, i, scenes.length) }))
    .filter((x) => x.s.imageAssetId && !x.s.videoAssetId)
    .sort((a, b) => a.rank - b.rank || a.i - b.i);
  const shots: CircuitShot[] = [];
  const skipped: string[] = [];
  let usd = 0;
  for (const { s } of todo) {
    const sec = clipSeconds(r, s.duration);
    const cost = sec === null ? Infinity : clipUsd(r, sec);
    if (usd + cost <= budgetUsd + 1e-9) {
      shots.push({ sceneId: s.scene_id, seconds: sec!, usd: cost });
      usd = Math.round((usd + cost) * 10000) / 10000;
    } else skipped.push(s.scene_id);
  }
  return { shots, usd, seconds: shots.reduce((a, x) => a + x.seconds, 0), skipped };
}
/** What the video may still spend: the cap minus what was REALLY spent, minus the stages still to come. */
export const circuitBudget = (capUsd: number, spentUsd: number, laterUsd: number, share: number = CIRCUIT.videoShare): number =>
  Math.max(0, Math.round((capUsd * share - spentUsd - laterUsd) * 10000) / 10000);
/** A short sketch (≤ 20 s) under the circuit: every shot gets its clip — the character sheets are not drawn (each clip
 *  starts from its scene picture, so the sheets would only eat the motion budget). */
export const circuitShort = (seconds: number): boolean => seconds <= 20;
/** Margin kept, once the voices are done, for the quality judge's text calls after the video. */
export const CIRCUIT_TAIL_USD = 0.006;
