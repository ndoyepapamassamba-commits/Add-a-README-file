// MediaCapabilityRegistry — built ONLY from the public discovery endpoints of OpenRouter:
//   GET /images/models · GET /videos/models · GET /models?output_modalities=speech|audio
// No model name is hard-coded. A request is validated against the capabilities discovered; an invalid configuration
// is never sent.
import type { MediaCap, MediaKind } from './types';

export interface ImageParams {
  aspectRatios: string[];
  resolutions: string[];
  sizes: boolean;
  seed: boolean;
  n: { min: number; max: number } | null;
  inputReferences: { min: number; max: number } | null;
  outputFormats: string[];
  passthrough: string[];
}
export interface VideoParams {
  aspectRatios: string[];
  resolutions: string[];
  sizes: string[];
  durations: number[];
  frameImages: ('first_frame' | 'last_frame')[];
  generateAudio: boolean;
  seed: boolean;
  passthrough: string[];
}
export interface ImagePrice {
  billable: string;
  unit: string;
  usd: number;
  variant?: string;
}
export interface MediaModel {
  id: string;
  name: string;
  kind: MediaKind;
  created: number | null;
  description: string;
  caps: MediaCap[];
  image?: ImageParams;
  video?: VideoParams;
  /** Voices announced by the model (speech) — [] when it announces none. */
  voices: string[];
  /** Raw pricing exactly as the provider announced it. */
  pricing: {
    skus?: Record<string, string>;
    tokenPrices?: { prompt: number; completion: number };
    /** Per-endpoint prices of an image model (loaded lazily from /images/models/{id}/endpoints). */
    image?: ImagePrice[];
    imageLoaded?: boolean;
  };
  /** Measured latency of the last call (ms), null until measured. */
  latencyMs: number | null;
  free: boolean;
}
export interface Registry {
  at: number;
  models: MediaModel[];
  /** Models that appeared / disappeared since the previous registry. */
  added: string[];
  removed: string[];
  sources: { endpoint: string; ok: boolean; count: number; error?: string }[];
}

type Dict = Record<string, unknown>;
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const strs = (x: unknown): string[] => arr(x).filter((v): v is string => typeof v === 'string');
const nums = (x: unknown): number[] => arr(x).filter((v): v is number => typeof v === 'number');
const rec = (x: unknown): Dict => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Dict) : {});
const num = (x: unknown): number | null => {
  const n = typeof x === 'string' ? Number(x) : x;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const enumValues = (p: unknown): string[] => {
  const r = rec(p);
  return r.type === 'enum' ? strs(r.values) : [];
};
const range = (p: unknown): { min: number; max: number } | null => {
  const r = rec(p);
  return r.type === 'range' && num(r.min) !== null && num(r.max) !== null
    ? { min: r.min as number, max: r.max as number }
    : null;
};
const unwrap = (payload: unknown): Dict[] => {
  const d = Array.isArray(payload) ? payload : rec(payload).data;
  return arr(d).map(rec);
};

export function parseImageModels(payload: unknown): MediaModel[] {
  return unwrap(payload)
    .filter((m) => typeof m.id === 'string')
    .map((m) => {
      const sp = rec(m.supported_parameters);
      const inputs = strs(rec(m.architecture).input_modalities);
      const refs = range(sp.input_references);
      const image: ImageParams = {
        aspectRatios: enumValues(sp.aspect_ratio),
        resolutions: enumValues(sp.resolution),
        sizes: sp.size !== undefined,
        seed: sp.seed !== undefined,
        n: range(sp.n),
        inputReferences: refs,
        outputFormats: enumValues(sp.output_format),
        passthrough: strs(m.allowed_passthrough_parameters),
      };
      const caps: MediaCap[] = ['IMAGE_GENERATION'];
      if (inputs.includes('image') || (refs && refs.max > 0)) caps.push('IMAGE_EDITING');
      if (refs && refs.max > 0) caps.push('REFERENCE_IMAGES');
      return {
        id: m.id as string,
        name: String(m.name ?? m.id),
        kind: 'image' as const,
        created: num(m.created),
        description: String(m.description ?? ''),
        caps,
        image,
        voices: [],
        pricing: {},
        latencyMs: null,
        free: /:free$/.test(m.id as string),
      };
    });
}

export function parseVideoModels(payload: unknown): MediaModel[] {
  return unwrap(payload)
    .filter((m) => typeof m.id === 'string')
    .map((m) => {
      const frames = strs(m.supported_frame_images).filter(
        (f): f is 'first_frame' | 'last_frame' => f === 'first_frame' || f === 'last_frame',
      );
      const skus: Record<string, string> = {};
      for (const [k, v] of Object.entries(rec(m.pricing_skus))) skus[k] = String(v);
      const video: VideoParams = {
        aspectRatios: strs(m.supported_aspect_ratios),
        resolutions: strs(m.supported_resolutions),
        sizes: strs(m.supported_sizes),
        durations: nums(m.supported_durations),
        frameImages: frames,
        generateAudio: m.generate_audio === true,
        seed: m.seed === true,
        passthrough: strs(m.allowed_passthrough_parameters),
      };
      const caps: MediaCap[] = ['VIDEO_GENERATION'];
      if (frames.includes('first_frame')) caps.push('IMAGE_TO_VIDEO');
      if (frames.includes('first_frame') && frames.includes('last_frame')) caps.push('FIRST_LAST_FRAME');
      if (/reference/i.test(JSON.stringify(skus)) || video.passthrough.some((p) => /reference/i.test(p)))
        caps.push('REFERENCE_TO_VIDEO');
      if (video.generateAudio) caps.push('AUDIO');
      return {
        id: m.id as string,
        name: String(m.name ?? m.id),
        kind: 'video' as const,
        created: num(m.created),
        description: String(m.description ?? ''),
        caps,
        video,
        voices: [],
        pricing: { skus },
        latencyMs: null,
        free: false,
      };
    });
}

export function parseSpeechModels(payload: unknown): MediaModel[] {
  return unwrap(payload)
    .filter((m) => typeof m.id === 'string')
    .map((m) => {
      const pr = rec(m.pricing);
      const desc = String(m.description ?? '');
      const caps: MediaCap[] = ['SPEECH'];
      // Cloning is not a structured field: only the provider's own description can announce it.
      if (/voice clon|clone|cloning|clonage/i.test(desc)) caps.push('VOICE_CLONING');
      const prompt = num(pr.prompt) ?? 0;
      const completion = num(pr.completion) ?? 0;
      return {
        id: m.id as string,
        name: String(m.name ?? m.id),
        kind: 'speech' as const,
        created: num(m.created),
        description: desc,
        caps,
        voices: strs(m.supported_voices),
        pricing: { tokenPrices: { prompt, completion } },
        latencyMs: null,
        free: /:free$/.test(m.id as string) || (prompt === 0 && completion === 0),
      };
    });
}

/** Chat models that announce audio output (music): the exact output format is NOT documented — it must be probed. */
export function parseMusicModels(payload: unknown): MediaModel[] {
  return unwrap(payload)
    .filter((m) => typeof m.id === 'string')
    .map((m) => {
      const pr = rec(m.pricing);
      const prompt = num(pr.prompt) ?? 0;
      const completion = num(pr.completion) ?? 0;
      return {
        id: m.id as string,
        name: String(m.name ?? m.id),
        kind: 'music' as const,
        created: num(m.created),
        description: String(m.description ?? ''),
        caps: ['MUSIC_GENERATION'] as MediaCap[],
        voices: [],
        pricing: { tokenPrices: { prompt, completion } },
        latencyMs: null,
        free: /:free$/.test(m.id as string) || (prompt === 0 && completion === 0),
      };
    });
}

export interface Discovery {
  images?: unknown;
  videos?: unknown;
  speech?: unknown;
  audio?: unknown;
  sources?: Registry['sources'];
}
/** Builds the registry; `prev` is used to report new / removed models and to keep measured latencies. */
export function buildRegistry(d: Discovery, prev?: Registry | null, now = Date.now()): Registry {
  const models = [
    ...(d.images ? parseImageModels(d.images) : []),
    ...(d.videos ? parseVideoModels(d.videos) : []),
    ...(d.speech ? parseSpeechModels(d.speech) : []),
    ...(d.audio ? parseMusicModels(d.audio) : []),
  ];
  const before = new Map((prev?.models ?? []).map((m) => [m.id + '|' + m.kind, m]));
  for (const m of models) {
    const o = before.get(m.id + '|' + m.kind);
    if (o) {
      m.latencyMs = o.latencyMs;
      if (o.pricing.imageLoaded) m.pricing = { ...m.pricing, image: o.pricing.image, imageLoaded: true };
    }
  }
  const now_ = new Set(models.map((m) => m.id + '|' + m.kind));
  // A source that failed must not make its models look "removed".
  const failed = new Set((d.sources ?? []).filter((s) => !s.ok).map((s) => s.endpoint));
  const kindFailed = (k: MediaKind) =>
    failed.has(k === 'image' ? 'images' : k === 'video' ? 'videos' : k === 'speech' ? 'speech' : 'audio');
  return {
    at: now,
    models,
    added: prev ? models.filter((m) => !before.has(m.id + '|' + m.kind)).map((m) => m.id) : [],
    removed: prev
      ? [...before].filter(([k, m]) => !now_.has(k) && !kindFailed(m.kind)).map(([, m]) => m.id)
      : [],
    sources: d.sources ?? [],
  };
}

// ───────────────────────── request validation ─────────────────────────

export interface ImageRequest {
  aspect_ratio?: string;
  resolution?: string;
  n?: number;
  references?: number;
  seed?: number;
}
export interface VideoRequest {
  aspect_ratio?: string;
  resolution?: string;
  duration?: number;
  size?: string;
  frames?: ('first_frame' | 'last_frame')[];
  generate_audio?: boolean;
  seed?: number;
  passthrough?: string[];
}
export interface Validation {
  ok: boolean;
  errors: string[];
}
const oneOf = (name: string, v: string | undefined, list: string[], errors: string[]) => {
  if (v === undefined) return;
  if (!list.length)
    errors.push(`${name} « ${v} » : le modèle ne déclare aucune valeur ${name} (paramètre non supporté)`);
  else if (!list.includes(v))
    errors.push(`${name} « ${v} » non supporté (valeurs déclarées : ${list.join(', ')})`);
};
export function validateImageRequest(m: MediaModel, r: ImageRequest): Validation {
  const errors: string[] = [];
  const p = m.image;
  if (!p) return { ok: false, errors: ['modèle sans capacités image'] };
  oneOf('aspect_ratio', r.aspect_ratio, p.aspectRatios, errors);
  oneOf('resolution', r.resolution, p.resolutions, errors);
  if (r.n !== undefined && p.n && (r.n < p.n.min || r.n > p.n.max))
    errors.push(`n=${r.n} hors des bornes déclarées (${p.n.min}–${p.n.max})`);
  if (r.n !== undefined && !p.n && r.n > 1) errors.push('n>1 : le modèle ne déclare pas de nombre d’images');
  if (r.references && r.references > 0) {
    if (!p.inputReferences || p.inputReferences.max < 1)
      errors.push('images de référence non supportées par ce modèle');
    else if (r.references > p.inputReferences.max)
      errors.push(`${r.references} références > ${p.inputReferences.max} déclarées`);
    else if (r.references < p.inputReferences.min)
      errors.push(`au moins ${p.inputReferences.min} référence(s) requise(s)`);
  } else if (p.inputReferences && p.inputReferences.min > 0) {
    errors.push(`au moins ${p.inputReferences.min} image(s) de référence requise(s) par ce modèle`);
  }
  if (r.seed !== undefined && !p.seed) errors.push('seed non supportée par ce modèle');
  return { ok: !errors.length, errors };
}
export function validateVideoRequest(m: MediaModel, r: VideoRequest): Validation {
  const errors: string[] = [];
  const p = m.video;
  if (!p) return { ok: false, errors: ['modèle sans capacités vidéo'] };
  oneOf('aspect_ratio', r.aspect_ratio, p.aspectRatios, errors);
  oneOf('resolution', r.resolution, p.resolutions, errors);
  oneOf('size', r.size, p.sizes, errors);
  if (r.duration !== undefined) {
    if (!p.durations.length) errors.push('le modèle ne déclare aucune durée');
    else if (!p.durations.includes(r.duration))
      errors.push(`durée ${r.duration}s non supportée (déclarées : ${p.durations.join(', ')})`);
  }
  for (const f of r.frames ?? [])
    if (!p.frameImages.includes(f))
      errors.push(`${f} non supporté (déclarés : ${p.frameImages.join(', ') || 'aucun'})`);
  if (r.generate_audio && !p.generateAudio) errors.push('génération audio native non déclarée par ce modèle');
  if (r.seed !== undefined && !p.seed) errors.push('seed non supportée par ce modèle');
  for (const x of r.passthrough ?? [])
    if (!p.passthrough.includes(x))
      errors.push(`paramètre « ${x} » absent de allowed_passthrough_parameters`);
  return { ok: !errors.length, errors };
}
export function validateSpeechRequest(m: MediaModel, r: { voice?: string }): Validation {
  const errors: string[] = [];
  if (r.voice && m.voices.length && !m.voices.includes(r.voice))
    errors.push(`voix « ${r.voice} » non déclarée par ${m.id}`);
  return { ok: !errors.length, errors };
}

export const hasCap = (m: MediaModel, c: MediaCap) => m.caps.includes(c);
export const modelsWith = (r: Registry, kind: MediaKind, ...caps: MediaCap[]) =>
  r.models.filter((m) => m.kind === kind && caps.every((c) => m.caps.includes(c)));

/** Capability fabric entry (added to the existing Capability Fabric under `media`, add-only). */
export function fabricEntry(r: Registry) {
  const by = (k: MediaKind) => r.models.filter((m) => m.kind === k).length;
  return {
    at: r.at,
    counts: { image: by('image'), video: by('video'), speech: by('speech'), music: by('music') },
    caps: [...new Set(r.models.flatMap((m) => m.caps))].sort(),
    added: r.added,
    removed: r.removed,
  };
}
