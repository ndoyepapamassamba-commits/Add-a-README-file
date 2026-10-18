/**
 * CONTRÔLE QUALITÉ CALÉ SUR LES RÉFÉRENCES — three measured verdicts for every produced video:
 *  1. FIDÉLITÉ VISUELLE: the same pixel metrics (sharpness, colourfulness, brightness, contrast, motion, smoothness,
 *     shot length) as the reference clip 041701 and the user's own TikTok videos; a % per metric and overall;
 *  2. DEGRÉ D'HUMOUR: an AI judge with a fixed grid (hook, recognisable Abidjan situation, escalation, punchline,
 *     timing, readable physical acting, short Ivorian lines, callback) — 0–10 per criterion → %;
 *  3. POTENTIEL VIRAL: conformity to what the most viewed videos of the niche share (format length, hook, reaction
 *     insert, bilingual captions, shot rhythm, vertical frame, humour).
 * Only statistics are stored (no image, sound or text of the reference videos). The user can recalibrate the profile
 * from their own reference videos (profileFrom).
 */
export type MetricKey = 'sharpness' | 'colorfulness' | 'brightness' | 'contrast' | 'motion' | 'jerk' | 'shotSeconds';
export type VideoMetrics = Record<MetricKey, number>;
export interface ReferenceProfile {
  name: string;
  /** The target (the reference clip) and the band covered by the reference set. */
  target: VideoMetrics;
  min: VideoMetrics;
  max: VideoMetrics;
  sources: number;
}
/**
 * Measured on 10/2026 (frames 180×320, first 12 s, 25 i/s): target = clip 041701 (the user's reference); band = 041701
 * + 5 most viewed channel videos + 2 most viewed of the niche (8.3 M and 1.9 M views).
 */
export const REFERENCE_041701: ReferenceProfile = {
  name: '041701 + vidéos TikTok de référence',
  target: { sharpness: 8.83, colorfulness: 57.55, brightness: 105.74, contrast: 42.33, motion: 1.16, jerk: 1.97, shotSeconds: 6 },
  min: { sharpness: 8.83, colorfulness: 45.3, brightness: 69.93, contrast: 42.33, motion: 0.52, jerk: 0.85, shotSeconds: 4 },
  max: { sharpness: 18.34, colorfulness: 87.81, brightness: 128.19, contrast: 59.14, motion: 2.33, jerk: 4.06, shotSeconds: 6 },
  sources: 8,
};
export const METRIC_LABELS: Record<MetricKey, string> = {
  sharpness: 'Netteté',
  colorfulness: 'Richesse des couleurs',
  brightness: 'Luminosité',
  contrast: 'Contraste',
  motion: 'Quantité de mouvement',
  jerk: 'Fluidité (saccades)',
  shotSeconds: 'Rythme des plans',
};
/** % for one metric: 100 inside the reference band, decreasing outside it; fewer jerks than the reference is never a fault. */
export function metricScore(k: MetricKey, x: number, p: ReferenceProfile): number {
  if (!Number.isFinite(x)) return 0;
  const lo = p.min[k];
  const hi = p.max[k];
  if (k === 'jerk' && x <= hi) return 100;
  if (x >= lo && x <= hi) return 100;
  const span = Math.max(hi - lo, Math.abs(p.target[k]) * 0.25, 1e-6);
  const out = x < lo ? lo - x : x - hi;
  return Math.max(0, Math.round(100 * (1 - out / span)));
}
const WEIGHTS: Record<MetricKey, number> = { sharpness: 1.2, colorfulness: 1, brightness: 0.8, contrast: 0.8, motion: 1.2, jerk: 1.5, shotSeconds: 0.8 };
export function visualFidelity(m: VideoMetrics, p: ReferenceProfile = REFERENCE_041701): { score: number; items: { key: MetricKey; label: string; value: number; target: number; score: number }[] } {
  const items = (Object.keys(WEIGHTS) as MetricKey[]).map((key) => ({ key, label: METRIC_LABELS[key], value: m[key], target: p.target[key], score: metricScore(key, m[key], p) }));
  const tw = items.reduce((a, i) => a + WEIGHTS[i.key], 0);
  return { score: Math.round(items.reduce((a, i) => a + i.score * WEIGHTS[i.key], 0) / tw), items };
}
/** A profile built from the user's own reference videos (target = the first one, band = all of them). */
export function profileFrom(name: string, list: VideoMetrics[]): ReferenceProfile {
  if (!list.length) return REFERENCE_041701;
  const keys = Object.keys(WEIGHTS) as MetricKey[];
  const pick = (f: (v: number[]) => number) => Object.fromEntries(keys.map((k) => [k, f(list.map((m) => m[k]))])) as VideoMetrics;
  return { name, target: list[0]!, min: pick((v) => Math.min(...v)), max: pick((v) => Math.max(...v)), sources: list.length };
}

/** The humour grid (each 0–10). Anchors describe a 10 as seen in the reference videos. */
export const HUMOR_CRITERIA: { id: string; label: string; weight: number; ten: string }[] = [
  { id: 'hook', label: 'Accroche (2 premières secondes)', weight: 1.4, ten: 'on comprend la situation absurde ou le conflit dès la première image / réplique' },
  { id: 'situation', label: 'Situation reconnaissable (vie à Abidjan)', weight: 1.1, ten: 'tout le monde a vécu ça (belle-mère, voisin, maquis, gbaka, dot…)' },
  { id: 'escalation', label: 'Escalade', weight: 1, ten: 'chaque réplique pousse la situation un cran plus loin' },
  { id: 'punchline', label: 'Chute / retournement', weight: 1.6, ten: 'la dernière réplique retourne tout ou fait exploser le malentendu, en moins de 10 mots' },
  { id: 'timing', label: 'Timing', weight: 1, ten: 'installation courte, pause, punch ; aucune réplique de trop' },
  { id: 'physical', label: 'Jeu physique lisible', weight: 1, ten: 'gestes et réactions exagérés qui font rire même sans le son' },
  { id: 'language', label: 'Répliques ivoiriennes', weight: 0.9, ten: 'répliques courtes, naturelles, expressions d’Abidjan bien placées' },
  { id: 'callback', label: 'Rappel / gag récurrent', weight: 0.5, ten: 'un élément revient et paie à la fin' },
];
/** Prompt of the humour judge (returns JSON only). */
export function humorPrompt(script: string): string {
  return [
    'Tu es juge de comédie pour des sketchs TikTok ivoiriens (format « à mourir de rire » : 1 sketch de 6–10 s ou compilation, deux personnages qui se disputent, chute nette).',
    'Note chaque critère de 0 à 10, sévèrement (5 = moyen, 8 = très drôle, 10 = niveau des vidéos les plus vues). Un 10 ressemble à :',
    ...HUMOR_CRITERIA.map((c) => `- ${c.id} — ${c.label} : ${c.ten}`),
    'Réponds UNIQUEMENT en JSON : {"scores":{"hook":0,...},"best":"ce qui marche le mieux","fix":"LA correction qui ferait le plus rire"}',
    '',
    'SCRIPT :',
    script.slice(0, 6000),
  ].join('\n');
}
export interface HumorVerdict {
  scores: Record<string, number>;
  degree: number;
  label: string;
  best: string;
  fix: string;
}
export const humorLabel = (d: number) => (d >= 85 ? 'à mourir de rire' : d >= 70 ? 'très drôle' : d >= 55 ? 'drôle' : d >= 40 ? 'fait sourire' : 'plat');
export function parseHumor(text: string): HumorVerdict | null {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { scores?: Record<string, unknown>; best?: unknown; fix?: unknown };
    const scores: Record<string, number> = {};
    for (const c of HUMOR_CRITERIA) {
      const v = Number(j.scores?.[c.id]);
      if (!Number.isFinite(v)) return null;
      scores[c.id] = Math.max(0, Math.min(10, v));
    }
    const tw = HUMOR_CRITERIA.reduce((a, c) => a + c.weight, 0);
    const degree = Math.round((10 * HUMOR_CRITERIA.reduce((a, c) => a + scores[c.id]! * c.weight, 0)) / tw);
    return { scores, degree, label: humorLabel(degree), best: String(j.best ?? '').slice(0, 300), fix: String(j.fix ?? '').slice(0, 300) };
  } catch {
    return null;
  }
}

export interface ViralFeatures {
  seconds: number;
  aspect: string;
  /** Time of the first line or visual gag (s). */
  hookAt: number;
  reactionInsert: boolean;
  bilingualCaptions: boolean;
  shotSeconds: number;
  humorDegree: number | null;
}
/**
 * Virality = conformity to the measured top videos: 8 s single sketch (the 8.3 M and 1.9 M views) or ≈ 65 s compilation
 * of 6 s sketches (the user's account), hook before 1.5 s, reaction insert, bilingual karaoke captions, 4–7 s shots,
 * vertical 9:16, and the humour degree (the biggest weight).
 */
export function viralityScore(f: ViralFeatures): { score: number; items: { label: string; score: number; why: string }[] } {
  const len = f.seconds <= 12 ? (f.seconds >= 6 ? 100 : 60) : f.seconds >= 55 && f.seconds <= 75 ? 100 : f.seconds <= 30 ? 60 : 45;
  const items = [
    { label: 'Format (8 s ou ≈ 65 s)', score: len, why: `${f.seconds.toFixed(0)} s` },
    { label: 'Accroche avant 1,5 s', score: f.hookAt <= 1.5 ? 100 : f.hookAt <= 3 ? 50 : 0, why: `première réplique à ${f.hookAt.toFixed(1)} s` },
    { label: 'Réaction (émoji) après la chute', score: f.reactionInsert ? 100 : 0, why: f.reactionInsert ? 'présente' : 'absente' },
    { label: 'Sous-titres bilingues mot à mot', score: f.bilingualCaptions ? 100 : 30, why: f.bilingualCaptions ? 'oui' : 'français seul' },
    { label: 'Rythme des plans (4–7 s)', score: f.shotSeconds >= 4 && f.shotSeconds <= 7 ? 100 : 50, why: `${f.shotSeconds.toFixed(1)} s par plan` },
    { label: 'Vertical 9:16', score: f.aspect === '9:16' ? 100 : 20, why: f.aspect },
    { label: 'Degré d’humour', score: f.humorDegree ?? 0, why: f.humorDegree === null ? 'non jugé' : `${f.humorDegree} %` },
  ];
  const w = [1, 1.2, 0.6, 0.8, 0.6, 0.8, 2.5];
  return { score: Math.round(items.reduce((a, it, i) => a + it.score * w[i]!, 0) / w.reduce((a, b) => a + b, 0)), items };
}
