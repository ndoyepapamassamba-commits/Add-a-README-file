// FILM AUTOPILOT — MODEL ORCHESTRATOR (pure). For each production stage it ranks the models REALLY available in the
// catalogue on four axes — expected quality, estimated cost, speed, Afrikatoon fidelity — and recommends the best
// quality/cost balance. Quality is a labelled PRIOR (model family) until the production memory holds ≥ 3 judged runs of
// that model, then the MEASURED mean replaces it. Nothing here calls the network.
import type { MediaModel } from './capabilities';
import type { Estimate } from './cost';
import type { ProdRecord } from './memory';

export type DirStage = 'writing' | 'images' | 'animation' | 'voice';
export interface DirOption {
  id: string;
  name: string;
  /** Estimated cost of the WHOLE stage for this film (USD), null when it cannot be priced. */
  stageUsd: number | null;
  costLabel: 'Gratuit' | 'Très faible' | 'Faible' | 'Moyen' | 'Élevé' | 'Non chiffré';
  /** 0–10. */
  quality: number;
  qualitySource: 'mesurée' | 'a priori';
  speed: 'Rapide' | 'Moyen' | 'Lent';
  /** 0–10: keeps the Afrikatoon art direction and the characters across shots. */
  afrikatoon: number;
  score: number;
  why: string;
  local?: boolean;
}
export interface StagePlan {
  stage: DirStage;
  label: string;
  options: DirOption[];
  recommended: string | null;
}

const PRIORS: Record<'text' | 'image' | 'video' | 'speech', [RegExp, number][]> = {
  text: [
    [/claude.*(opus|sonnet)|gpt-5(?!.*mini)|gemini-(2\.5|3)[^ ]*pro|o3\b/i, 9.5],
    [/gpt-5.*mini|gpt-4\.1|gemini.*flash|deepseek|qwen3|kimi|glm-4|mistral-large|grok-4/i, 8.6],
    [/llama|mistral|gemma|phi/i, 7.6],
  ],
  image: [
    [/gpt-image|gpt-5.*image/i, 9.5],
    [/gemini.*image|nano.?banana|imagen/i, 9.4],
    [/seedream/i, 9.0],
    [/flux.*(pro|max|kontext|ultra)/i, 9.0],
    [/flux|ideogram|recraft/i, 8.5],
    [/sdxl|stable|sd3/i, 7.6],
  ],
  video: [
    [/veo-?3/i, 9.8],
    [/sora/i, 9.5],
    [/veo|kling/i, 9.3],
    [/seedance/i, 9.0],
    [/hailuo|minimax/i, 8.8],
    [/grok.*imagine|imagine/i, 8.6],
    [/wan/i, 8.2],
    [/ltx|pika|runway/i, 8.0],
  ],
  speech: [
    [/gpt-4o.*tts|eleven/i, 9.0],
    [/tts|speech|voice/i, 8.0],
  ],
};
export function priorQuality(kind: keyof typeof PRIORS, id: string, name = ''): number {
  const s = `${id} ${name}`;
  return PRIORS[kind].find(([rx]) => rx.test(s))?.[1] ?? 7.2;
}
/** Measured quality (0-10) from the production memory, when at least 3 judged runs exist. */
export function measuredQuality(mem: ProdRecord[], model: string): number | null {
  const q = mem.filter((r) => r.model === model && typeof r.quality === 'number').map((r) => r.quality as number);
  return q.length >= 3 ? Math.round((q.reduce((a, b) => a + b, 0) / q.length / 10) * 10) / 10 : null;
}
export function costLabel(usd: number | null): DirOption['costLabel'] {
  if (usd === null) return 'Non chiffré';
  if (usd === 0) return 'Gratuit';
  if (usd < 0.02) return 'Très faible';
  if (usd < 0.15) return 'Faible';
  if (usd < 1) return 'Moyen';
  return 'Élevé';
}
const costScore = (usd: number | null) => (usd === null ? 4 : usd === 0 ? 10 : Math.max(0, 10 - 2.2 * Math.log10(1 + usd * 100)));
const speedScore = (s: DirOption['speed']) => (s === 'Rapide' ? 10 : s === 'Moyen' ? 7 : 4);
/** Balance: quality first, then Afrikatoon fidelity, then cost, then speed. */
export function scoreOf(o: Pick<DirOption, 'quality' | 'afrikatoon' | 'stageUsd' | 'speed'>): number {
  return Math.round((0.45 * o.quality + 0.25 * o.afrikatoon + 0.2 * costScore(o.stageUsd) + 0.1 * speedScore(o.speed)) * 10) / 10;
}
const speedOf = (lat: number | null | undefined, fallback: DirOption['speed']): DirOption['speed'] =>
  lat == null ? fallback : lat < 8_000 ? 'Rapide' : lat < 60_000 ? 'Moyen' : 'Lent';
const finish = (stage: DirStage, label: string, options: DirOption[], cap?: number): StagePlan => {
  const sorted = [...options].sort((a, b) => b.score - a.score);
  // The recommendation must fit the film's budget when it is known.
  const fit = sorted.filter((o) => cap === undefined || o.stageUsd === null || o.stageUsd <= cap);
  return { stage, label, options: sorted, recommended: (fit[0] ?? sorted[0])?.id ?? null };
};

export interface FilmShape {
  scenes: number;
  /** Total seconds of the film. */
  seconds: number;
  /** Characters of dialogue (voice cost). */
  dialogueChars: number;
}

export function planImages(models: MediaModel[], est: (m: MediaModel) => Estimate, shape: FilmShape, mem: ProdRecord[] = [], cap?: number): StagePlan {
  const opts = models.map((m): DirOption => {
    const e = est(m).usd;
    const stageUsd = e === null ? null : Math.round(e * shape.scenes * 1000) / 1000;
    const meas = measuredQuality(mem, m.id);
    const refs = m.caps.includes('REFERENCE_IMAGES');
    const quality = meas ?? priorQuality('image', m.id, m.name);
    const afrikatoon = Math.min(10, (refs ? 9 : 7) + (/gpt-image|gemini.*image|nano.?banana|seedream/i.test(m.id) ? 0.6 : 0));
    const speed = speedOf(m.latencyMs, 'Moyen');
    const o = { id: m.id, name: m.name, stageUsd, costLabel: costLabel(stageUsd), quality, qualitySource: meas === null ? ('a priori' as const) : ('mesurée' as const), speed, afrikatoon, score: 0, why: refs ? 'images de référence : personnages identiques d’un plan à l’autre' : 'pas d’image de référence : continuité des personnages moins sûre' };
    return { ...o, score: scoreOf(o) };
  });
  return finish('images', 'Images des scènes', opts, cap);
}

export const LOCAL_ANIMATION = 'local:2.5d';
export function planAnimation(models: MediaModel[], est: (m: MediaModel, seconds: number) => Estimate, shape: FilmShape, mem: ProdRecord[] = [], cap?: number): StagePlan {
  const per = Math.max(4, Math.min(10, Math.round(shape.seconds / Math.max(1, shape.scenes))));
  const opts: DirOption[] = models
    .filter((m) => m.caps.includes('IMAGE_TO_VIDEO') || m.caps.includes('VIDEO_GENERATION'))
    .map((m) => {
      const e = est(m, per).usd;
      const stageUsd = e === null ? null : Math.round(e * shape.scenes * 1000) / 1000;
      const meas = measuredQuality(mem, m.id);
      const i2v = m.caps.includes('IMAGE_TO_VIDEO');
      const o = {
        id: m.id,
        name: m.name,
        stageUsd,
        costLabel: costLabel(stageUsd),
        quality: meas ?? priorQuality('video', m.id, m.name),
        qualitySource: meas === null ? ('a priori' as const) : ('mesurée' as const),
        speed: speedOf(m.latencyMs, 'Lent'),
        afrikatoon: i2v ? 9.3 : 6.5,
        score: 0,
        why: i2v ? 'anime l’image de la scène : style et personnages conservés' : 'texte → vidéo : le style Afrikatoon peut dériver',
      };
      return { ...o, score: scoreOf(o) };
    });
  const local = { id: LOCAL_ANIMATION, name: 'Animation 2.5D intégrée (caméra, parallaxe, lip-bounce)', stageUsd: 0, costLabel: 'Gratuit' as const, quality: 5.5, qualitySource: 'a priori' as const, speed: 'Rapide' as const, afrikatoon: 9, score: 0, why: 'anime les images validées dans le navigateur : 0 $, style exact', local: true };
  opts.push({ ...local, score: scoreOf(local) });
  return finish('animation', 'Animation', opts, cap);
}

export function planVoices(models: MediaModel[], est: (m: MediaModel, chars: number) => Estimate, shape: FilmShape, mem: ProdRecord[] = [], cap?: number): StagePlan {
  const opts = models.map((m) => {
    const stageUsd = est(m, shape.dialogueChars).usd;
    const meas = measuredQuality(mem, m.id);
    const o = { id: m.id, name: m.name, stageUsd, costLabel: costLabel(stageUsd), quality: meas ?? priorQuality('speech', m.id, m.name), qualitySource: meas === null ? ('a priori' as const) : ('mesurée' as const), speed: speedOf(m.latencyMs, 'Rapide'), afrikatoon: Math.min(10, 6 + Math.min(4, m.voices.length / 2)), score: 0, why: `${m.voices.length} voix : une voix distincte par personnage` };
    return { ...o, score: scoreOf(o) };
  });
  return finish('voice', 'Voix', opts, cap);
}

export interface TextModelLite {
  id: string;
  name: string;
  inputPrice: number | null;
  outputPrice: number | null;
}
/** Models that cannot write a story through chat/completions (batch adapters, embeddings, media, audio…). */
export const NOT_CHAT = /(:batch|\bbatch\b|embed|moderation|tts|whisper|transcri|-image|image-|audio|realtime|search-preview|rerank)/i;
/**
 * Writing (story + scenes + dialogues): ~3k tokens in, ~7k out for a short film. The recommendation is the user's DEFAULT
 * model when one is set (never a « better » expensive one behind their back); otherwise the cheapest good writer.
 */
export function planWriting(models: TextModelLite[], cap?: number, preferred?: string | null): StagePlan {
  const usable = models.filter((m) => m.inputPrice !== null && m.outputPrice !== null && !NOT_CHAT.test(m.id));
  const opts = usable.map((m) => {
    const stageUsd = Math.round(((3000 * m.inputPrice! + 7000 * m.outputPrice!) / 1e6) * 10000) / 10000;
    const o = { id: m.id, name: m.name, stageUsd, costLabel: costLabel(stageUsd), quality: priorQuality('text', m.id, m.name), qualitySource: 'a priori' as const, speed: 'Rapide' as const, afrikatoon: /claude|gpt-5|gemini|qwen/i.test(m.id) ? 9 : 8, score: 0, why: m.id === preferred ? 'votre modèle par défaut' : 'écrit l’histoire, découpe les scènes, écrit les dialogues (FR / wolof)' };
    return { ...o, score: scoreOf(o) };
  });
  const pref = preferred ? opts.find((o) => o.id === preferred) : undefined;
  // Default (or the cheapest good writer) first, then cheaper / comparable alternatives.
  const good = opts.filter((o) => o.quality >= 8.5).sort((a, b) => (a.stageUsd ?? 9) - (b.stageUsd ?? 9));
  const rec = pref ?? good[0] ?? [...opts].sort((a, b) => (a.stageUsd ?? 9) - (b.stageUsd ?? 9))[0];
  const rest = [...good, ...opts.filter((o) => o.quality < 8.5).sort((a, b) => (a.stageUsd ?? 9) - (b.stageUsd ?? 9))].filter((o) => o !== rec);
  const list = (rec ? [rec, ...rest] : rest).slice(0, 15);
  return { stage: 'writing', label: 'Écriture', options: list, recommended: rec && (cap === undefined || rec.stageUsd === null || rec.stageUsd <= cap) ? rec.id : (list[0]?.id ?? null) };
}

export const PIPELINE = ['IDEA', 'STORY', 'SCENES', 'IMAGES', 'ANIMATION', 'MONTAGE'] as const;
export type PipeStage = (typeof PIPELINE)[number];
export const PIPE_LABEL: Record<PipeStage, string> = {
  IDEA: 'IDÉE',
  STORY: 'HISTOIRE',
  SCENES: 'SCÈNES',
  IMAGES: 'IMAGES',
  ANIMATION: 'ANIMATION',
  MONTAGE: 'MONTAGE FINAL',
};
export const totalUsd = (plans: StagePlan[], chosen: Partial<Record<DirStage, string>>) =>
  plans.reduce((a, p) => {
    const o = p.options.find((x) => x.id === (chosen[p.stage] ?? p.recommended));
    return a + (o?.stageUsd ?? 0);
  }, 0);
