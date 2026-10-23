// FILM CIRCUIT (23/10/2026) — the user's requests: « intégrer un circuit vidéo contenant générateur d'image et de vidéos
// avec les modèles adéquats » then « Seedance ou n'importe quel, ou faire appel à mon crédit OpenRouter pour tourner un
// film de 1 minute ». Pure logic, no network:
//  - video models, capabilities and prices as OpenRouter publishes them live (GET /api/v1/videos/models, pricing_skus);
//  - cost of a whole film BEFORE anything is paid, and a HARD spending cap enforced by `Budget` (every paid call is
//    reserved first; a reservation above the cap throws, so the call is never sent);
//  - the script: plans of the length the chosen model accepts, characters described by what a vision model SAW in the
//    troupe's scene image (so the video model gives each line to the right mouth);
//  - image and video prompts that pin the troupe exactly: the scene image is the reference of every plan image, and the
//    plan image is the FIRST FRAME of the clip (frame_images, field names checked in @openrouter/sdk 1.5.6:
//    models/frameimage.js l. 32-39, models/imagegenerationrequest.js l. 95 and 113).

export interface VideoModel {
  id: string;
  name: string;
  durations: number[];
  resolutions: string[];
  aspects: string[];
  frames: string[];
  /** null: the model decides (Grok Imagine speaks by default), false: never, true: optional sound. */
  audio: boolean | null;
  skus: Record<string, string>;
  description: string;
}

type RawVideoModel = {
  id?: string;
  name?: string;
  description?: string;
  supported_durations?: number[] | null;
  supported_resolutions?: string[] | null;
  supported_aspect_ratios?: string[] | null;
  supported_frame_images?: string[] | null;
  generate_audio?: boolean | null;
  pricing_skus?: Record<string, string | number> | null;
};

export function toVideoModel(raw: RawVideoModel): VideoModel {
  const skus: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw.pricing_skus ?? {})) skus[k] = String(v);
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? raw.id ?? ''),
    durations: [...(raw.supported_durations ?? [])].filter((d) => Number.isFinite(d)).sort((a, b) => a - b),
    resolutions: raw.supported_resolutions ?? [],
    aspects: raw.supported_aspect_ratios ?? [],
    frames: raw.supported_frame_images ?? [],
    audio: raw.generate_audio ?? null,
    skus,
    description: String(raw.description ?? ''),
  };
}

/** The models able to start a clip from OUR image (the troupe stays exact): first_frame support is required. */
export const canPinFirstFrame = (m: VideoModel) => m.frames.includes('first_frame');

/** Preferred order shown to the user: the Grok family first (the user's TikToks), then Seedance, Kling, Veo, Wan. */
export const PREFERRED_VIDEO = [
  'x-ai/grok-imagine-video-1.5',
  'x-ai/grok-imagine-video-1.5-lite',
  'x-ai/grok-imagine-video',
  'bytedance/seedance-2.0',
  'bytedance/seedance-2.0-fast',
  'kwaivgi/kling-v3.0-pro',
  'kwaivgi/kling-v3.0-std',
  'google/veo-3.1-fast',
  'alibaba/wan-2.7',
];
export function sortVideoModels(list: VideoModel[]): VideoModel[] {
  const rank = (id: string) => {
    const i = PREFERRED_VIDEO.indexOf(id);
    return i < 0 ? PREFERRED_VIDEO.length : i;
  };
  return [...list].sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));
}

// ── prices ────────────────────────────────────────────────────────────────
/** Output frame size for each resolution label, vertical 9:16 (used by token-priced models). */
export const DIMS: Record<string, [number, number]> = {
  '480p': [480, 854],
  '720p': [720, 1280],
  '768p': [768, 1366],
  '1080p': [1080, 1920],
  '2K': [1440, 2560],
  '4K': [2160, 3840],
};

export interface Rate {
  usdPerS: number;
  /** true when the price is derived (token-priced models): shown with « ≈ ». */
  approx: boolean;
  /** pricing_skus key used, shown in the cost detail. */
  basis: string;
}

/** Price of one second of output for this model and resolution, read from its pricing_skus. */
export function ratePerSecond(
  m: VideoModel,
  resolution: string,
  o: { audio: boolean; startFrame: boolean },
): Rate | null {
  const s = m.skus;
  const r = resolution.toLowerCase();
  const pick = (keys: string[]) => {
    for (const k of keys) {
      const v = Number(s[k]);
      if (s[k] !== undefined && s[k] !== '' && Number.isFinite(v)) return { k, v };
    }
    return null;
  };
  const cents = pick([
    `cents_per_video_output_second_${r}`,
    `cents_per_second_output_${r}`,
    'cents_per_second_output',
  ]);
  if (cents) return { usdPerS: cents.v / 100, approx: false, basis: cents.k };
  const mode = o.startFrame ? 'image_to_video' : 'text_to_video';
  const sound = o.audio ? 'with_audio' : 'without_audio';
  const usd = pick([
    `duration_seconds_${sound}_${r}`,
    `duration_seconds_${sound}`,
    `${mode}_duration_seconds_${r}`,
    `duration_seconds_${r}`,
    'duration_seconds',
  ]);
  if (usd) return { usdPerS: usd.v, approx: false, basis: usd.k };
  // Seedance bills video tokens: width × height × frames per second ÷ 1024 tokens per second (24 frames per second).
  const tok = pick(
    o.audio
      ? [`video_tokens_${r}`, 'video_tokens']
      : [
          `video_tokens_without_audio_${r}`,
          'video_tokens_without_audio',
          `video_tokens_${r}`,
          'video_tokens',
        ],
  );
  if (tok) {
    const [w, h] = DIMS[resolution] ?? DIMS['720p']!;
    return { usdPerS: (tok.v * w * h * 24) / 1024, approx: true, basis: `${tok.k} × ${w}×${h}×24/1024` };
  }
  return null;
}

/** Fixed price per call (image inputs), in dollars. */
export function perCallUsd(m: VideoModel, startFrame: boolean): number {
  const c = Number(m.skus['cents_per_image_input']);
  return startFrame && Number.isFinite(c) ? c / 100 : 0;
}

/** Image models offered for the plan images (all accept reference images and a 9:16 ratio on OpenRouter, 23/10/2026). */
export interface ImageModel {
  id: string;
  name: string;
  /** Approximate price of one edited image (input image + 1K output), in dollars, read from the endpoints that day. */
  usd: number;
}
export const IMAGE_MODELS: ImageModel[] = [
  {
    id: 'x-ai/grok-imagine-image-2.0',
    name: 'Grok Imagine Image 2.0 (même famille que la vidéo Grok)',
    usd: 0.05,
  },
  {
    id: 'google/gemini-3.1-flash-image',
    name: 'Gemini 3.1 Flash Image (jusqu’à 14 images de référence)',
    usd: 0.07,
  },
  { id: 'google/gemini-nano-banana-2.1', name: 'Nano Banana 2.1 (Google)', usd: 0.04 },
  { id: 'bytedance-seed/seedream-5-0-pro', name: 'Seedream 5.0 Pro (ByteDance)', usd: 0.05 },
];
/** Vision text models that write the script while looking at the scene image (first available one is used). */
export const SCRIPT_MODELS = ['google/gemini-3.8-flash', 'anthropic/claude-haiku-5.5', 'x-ai/grok-4.7'];
/** Generous ceiling for one script call (a few thousand tokens on a flash model costs well under a cent). */
export const SCRIPT_USD = 0.02;

// ── layout of the film ────────────────────────────────────────────────────
/** Number and length of the plans: the longest duration the model accepts up to `preferS`, repeated to reach `totalS`. */
export function planLayout(m: VideoModel | null, totalS = 60, preferS = 10): { n: number; duree: number } {
  const ds = m?.durations.length ? m.durations : [preferS];
  const fit = ds.filter((d) => d <= preferS);
  const duree = fit.length ? Math.max(...fit) : Math.min(...ds);
  return { n: Math.max(1, Math.round(totalS / duree)), duree };
}

export interface FilmEstimate {
  video: number;
  images: number;
  script: number;
  total: number;
  approx: boolean;
  rate: Rate | null;
}
export function estimateFilm(
  m: VideoModel,
  o: {
    resolution: string;
    plans: { duree: number }[];
    audio: boolean;
    startFrame: boolean;
    imageUsd: number;
    nImages: number;
    script: boolean;
  },
): FilmEstimate {
  const rate = ratePerSecond(m, o.resolution, { audio: o.audio, startFrame: o.startFrame });
  const seconds = o.plans.reduce((a, p) => a + p.duree, 0);
  const video = rate ? rate.usdPerS * seconds + perCallUsd(m, o.startFrame) * o.plans.length : NaN;
  const images = o.imageUsd * o.nImages;
  const script = o.script ? SCRIPT_USD : 0;
  return {
    video,
    images,
    script,
    total: video + images + script,
    approx: !rate || rate.approx || o.nImages > 0,
    rate,
  };
}

/** Estimated price of ONE clip (used for the per-call reservation). */
export function clipUsd(
  m: VideoModel,
  resolution: string,
  duree: number,
  o: { audio: boolean; startFrame: boolean },
): number {
  const rate = ratePerSecond(m, resolution, o);
  return rate ? rate.usdPerS * duree + perCallUsd(m, o.startFrame) : NaN;
}

// ── HARD spending cap ─────────────────────────────────────────────────────
export class BudgetError extends Error {}
export const fmtUsd = (v: number) => (Number.isFinite(v) ? `${v.toFixed(2).replace('.', ',')} $` : '? $');

/**
 * Every paid call is reserved BEFORE it is sent (`hold` throws above the cap: the call is never made), then settled
 * with the real cost OpenRouter reports (usage.cost) or, when none is reported, with the reservation itself.
 * A call that failed without a reported cost is released (OpenRouter does not bill failed generations).
 */
export class Budget {
  spent = 0;
  private held = new Map<string, number>();
  constructor(public readonly cap: number) {}
  get reserved(): number {
    let s = 0;
    for (const v of this.held.values()) s += v;
    return s;
  }
  get committed(): number {
    return this.spent + this.reserved;
  }
  hold(id: string, usd: number): void {
    if (!Number.isFinite(usd))
      throw new BudgetError(
        'Prix inconnu pour ce modèle : appel refusé (le plafond ne pourrait pas être tenu).',
      );
    if (this.committed + usd > this.cap + 1e-9)
      throw new BudgetError(
        `Plafond de ${fmtUsd(this.cap)} atteint : ${fmtUsd(this.committed)} déjà engagés, cet appel en coûterait ${fmtUsd(usd)}. Rien n’a été envoyé.`,
      );
    this.held.set(id, usd);
  }
  /** A job submitted before a reload is already engaged at OpenRouter: it is counted without being refused. */
  carry(id: string, usd: number): void {
    this.held.set(id, Number.isFinite(usd) ? usd : 0);
  }
  settle(id: string, actual: number | null | undefined): void {
    const h = this.held.get(id) ?? 0;
    this.held.delete(id);
    this.spent += typeof actual === 'number' && Number.isFinite(actual) ? actual : h;
  }
  release(id: string): void {
    this.held.delete(id);
  }
}

// ── script ────────────────────────────────────────────────────────────────
export interface Character {
  nom: string;
  /** What the character looks like in the scene image, in English (for the image and video models). */
  apparence: string;
}
export interface Line {
  qui: string;
  texte: string;
}
export interface Shot {
  n: number;
  duree: number;
  cadrage: string;
  dansLeCadre: string[];
  action: string;
  visuelEn: string;
  cameraEn: string;
  repliques: Line[];
}
export interface Script {
  titre: string;
  personnages: Character[];
  plans: Shot[];
}
export interface SceneInfo {
  id: string;
  titre: string;
  acteurs: string[];
}

export const CADRAGES: Record<string, string> = {
  'plan large': 'wide shot showing the whole set',
  'plan moyen': 'medium shot, characters from the knees up',
  'plan rapproché': 'medium close-up, chest and face',
  'gros plan': 'close-up on the face',
};
/** French speech pace: about 2.6 words per second leaves room for reactions inside a plan. */
export const WORDS_PER_S = 2.6;

export function scriptPrompt(
  scene: SceneInfo,
  idee: string,
  layout: { n: number; duree: number },
  ton: string,
): { system: string; user: string } {
  const system = [
    'Tu es scénariste et réalisateur de sketchs courts pour TikTok (Côte d’Ivoire, humour du quotidien).',
    'Tu reçois l’image d’une scène : décris FIDÈLEMENT ce que tu vois, n’invente aucun personnage.',
    `Écris un film de ${layout.n} plans de ${layout.duree} secondes chacun, avec une chute drôle au dernier plan.`,
    `Chaque plan contient au plus ${Math.floor(layout.duree * WORDS_PER_S)} mots de dialogue au total, en français ivoirien naturel.`,
    'Réponds UNIQUEMENT par un objet JSON de cette forme :',
    '{"titre":"…","personnages":[{"nom":"NOM EXACT","apparence":"English: age, gender, skin tone, hair, outfit colours, position in the image (left/right/center)"}],',
    '"plans":[{"cadrage":"plan large|plan moyen|plan rapproché|gros plan","dans_le_cadre":["NOM"],"action":"ce qui se passe, en français",',
    '"visuel_en":"what we see and how the characters move, in English, no names of real people","camera_en":"camera movement in English",',
    '"repliques":[{"qui":"NOM","texte":"…"}]}]}',
  ].join('\n');
  const user = [
    `Scène : ${scene.titre}.`,
    `Personnages présents (noms exacts à utiliser) : ${scene.acteurs.join(', ')}.`,
    idee.trim()
      ? `Idée du film : ${idee.trim()}`
      : 'Idée du film : propose une situation comique du quotidien dans ce lieu.',
    ton.trim() ? `Ton : ${ton.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user };
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toUpperCase();
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Turns the model's answer into a checked Script; `alertes` lists what was fixed or must be looked at. */
export function parseScript(
  text: string,
  scene: SceneInfo,
  layout: { n: number; duree: number },
): { script: Script; alertes: string[] } {
  const alertes: string[] = [];
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('Le scénariste n’a pas renvoyé de JSON.');
  let j: {
    titre?: unknown;
    personnages?: { nom?: unknown; apparence?: unknown }[];
    plans?: {
      cadrage?: unknown;
      dans_le_cadre?: unknown;
      action?: unknown;
      visuel_en?: unknown;
      camera_en?: unknown;
      repliques?: { qui?: unknown; texte?: unknown }[];
    }[];
  };
  try {
    j = JSON.parse(text.slice(a, b + 1));
  } catch {
    throw new Error('Le JSON du scénariste est illisible.');
  }
  const known = new Map(scene.acteurs.map((n) => [fold(n), n]));
  const nameOf = (raw: unknown): string | null => {
    const f = fold(String(raw ?? ''));
    if (!f) return null;
    if (known.has(f)) return known.get(f)!;
    for (const [k, v] of known) if (k.includes(f) || f.includes(k)) return v;
    return null;
  };
  const personnages: Character[] = scene.acteurs.map((nom) => {
    const p = (j.personnages ?? []).find((x) => nameOf(x?.nom) === nom);
    if (!p) alertes.push(`Apparence de ${nom} non décrite par le scénariste.`);
    return { nom, apparence: String(p?.apparence ?? '').trim() };
  });
  const raw = Array.isArray(j.plans) ? j.plans : [];
  if (!raw.length) throw new Error('Aucun plan dans le script.');
  if (raw.length !== layout.n)
    alertes.push(
      `${raw.length} plans reçus, ${layout.n} attendus : ${raw.length > layout.n ? 'les derniers sont retirés' : 'film plus court'}.`,
    );
  const plans: Shot[] = raw.slice(0, layout.n).map((p, i) => {
    let cadrage = String(p.cadrage ?? '')
      .trim()
      .toLowerCase();
    if (!CADRAGES[cadrage]) cadrage = i === 0 ? 'plan large' : 'plan moyen';
    const dansLeCadre = (Array.isArray(p.dans_le_cadre) ? p.dans_le_cadre : [])
      .map(nameOf)
      .filter((x): x is string => !!x);
    const repliques: Line[] = [];
    for (const r of Array.isArray(p.repliques) ? p.repliques : []) {
      const qui = nameOf(r?.qui);
      const texte = String(r?.texte ?? '').trim();
      if (!texte) continue;
      if (!qui) {
        alertes.push(
          `Plan ${i + 1} : réplique d’un personnage absent de la scène (« ${String(r?.qui)} ») retirée.`,
        );
        continue;
      }
      repliques.push({ qui, texte });
    }
    const nMots = repliques.reduce((s, r) => s + words(r.texte), 0);
    if (nMots > layout.duree * WORDS_PER_S)
      alertes.push(
        `Plan ${i + 1} : ${nMots} mots pour ${layout.duree} s, dialogue trop long (au plus ${Math.floor(layout.duree * WORDS_PER_S)}).`,
      );
    return {
      n: i + 1,
      duree: layout.duree,
      cadrage,
      dansLeCadre: dansLeCadre.length ? dansLeCadre : [...new Set(repliques.map((r) => r.qui))],
      action: String(p.action ?? '').trim(),
      visuelEn: String(p.visuel_en ?? '').trim(),
      cameraEn: String(p.camera_en ?? '').trim() || 'static camera with a subtle slow push-in',
      repliques,
    };
  });
  return {
    script: { titre: String(j.titre ?? scene.titre).trim() || scene.titre, personnages, plans },
    alertes,
  };
}

// ── prompts ───────────────────────────────────────────────────────────────
const who = (s: Script, names: string[]) =>
  names
    .map((n) => {
      const a = s.personnages.find((p) => p.nom === n)?.apparence;
      return a ? `${n} (${a})` : n;
    })
    .join('; ');

/** Plan image: the scene image is the reference; same characters, same set, recomposed for the plan. */
export function imagePrompt(s: Script, p: Shot, aspect: string): string {
  return [
    'Use the reference image as the exact source of this frame.',
    'Keep the same characters with identical faces, skin tones, hairstyles, ages, outfits and body proportions,',
    'the same location and props, the same 3D animated film style and lighting.',
    `Recompose it as a ${aspect} frame: ${CADRAGES[p.cadrage] ?? CADRAGES['plan moyen']}${p.dansLeCadre.length ? ` on ${who(s, p.dansLeCadre)}` : ''}.`,
    p.visuelEn ? `Starting pose: ${p.visuelEn}` : '',
    'Do not add any other person. No text, no captions, no watermark.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Clip: the plan image is pinned as the first frame; the lines are spoken in French by the right character. */
export function videoPrompt(s: Script, p: Shot, o: { accent: string; sound: boolean }): string {
  const parts = [
    'The video starts exactly on the provided first frame.',
    'Keep every character exactly as in that frame (faces, outfits, proportions) and keep the same set; no new characters, no on-screen text or subtitles.',
    p.visuelEn ? `Action: ${p.visuelEn}` : '',
    `Camera: ${p.cameraEn}.`,
  ];
  if (o.sound && p.repliques.length) {
    parts.push(
      `Spoken dialogue in French with ${o.accent}, natural lip-sync, each line said by the right character, in this order:`,
    );
    for (const r of p.repliques) parts.push(`${who(s, [r.qui])} says: "${r.texte}"`);
    parts.push('Natural ambient sound of the place under the voices, no music.');
  } else if (o.sound) parts.push('No dialogue; natural ambient sound of the place.');
  return parts.filter(Boolean).join(' ');
}

// ── captions ──────────────────────────────────────────────────────────────
export interface Cue {
  start: number;
  end: number;
  qui: string;
  texte: string;
}
/** Captions for the burnt-in subtitles: each plan's real duration shared between its lines by word count. */
export function captionCues(plans: { repliques: Line[] }[], durations: number[]): Cue[] {
  const cues: Cue[] = [];
  let t0 = 0;
  plans.forEach((p, i) => {
    const d = durations[i] ?? 0;
    const total = p.repliques.reduce((s, r) => s + Math.max(1, words(r.texte)), 0);
    const lead = Math.min(0.3, d * 0.05);
    let t = t0 + lead;
    const usable = Math.max(0, d - 2 * lead);
    for (const r of p.repliques) {
      const span = total ? (usable * Math.max(1, words(r.texte))) / total : 0;
      cues.push({ start: t, end: t + span, qui: r.qui, texte: r.texte });
      t += span;
    }
    t0 += d;
  });
  return cues;
}
