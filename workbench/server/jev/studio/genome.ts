// Prompt Genome — a COMPOSITION ENGINE (not a list of prompts). A prompt is built from dimensions, a template and the
// constraints of the chosen model; every compiled prompt is versioned and the Style DNA / consistency profiles are
// injected in all generations.
import { comicDirection } from './humor';
import type { CharacterSheet, Scene, StyleDNA, WorldSheet } from './types';
import { qualityLine, redrawInstruction, styleLine } from './style';
import { redactSecrets } from './secrets';

export const GENOME_DIMENSIONS = [
  'SUBJECT',
  'CHARACTER',
  'LOCATION',
  'ACTION',
  'EMOTION',
  'CAMERA',
  'LENS',
  'LIGHTING',
  'COLOR',
  'STYLE',
  'MATERIAL',
  'COMPOSITION',
  'DEPTH',
  'MOTION',
  'CINEMATOGRAPHY',
  'DIALOGUE',
  'AUDIO',
  'AMBIENCE',
  'SFX',
  'MUSIC',
  'QUALITY',
  'NEGATIVE',
  'PLATFORM',
  'ASPECT',
  'DURATION',
] as const;
export type GenomeDimension = (typeof GENOME_DIMENSIONS)[number];
export type Dims = Partial<Record<GenomeDimension, string>>;

export type TemplateId =
  | 'image'
  | 'video'
  | 'image_to_video'
  | 'character'
  | 'set'
  | 'dialogue'
  | 'voice'
  | 'sfx'
  | 'music'
  | 'subtitles';

/** Which dimensions each template consumes, in order, with the label used in the compiled text. */
export const TEMPLATES: Record<TemplateId, [GenomeDimension, string][]> = {
  image: [
    ['STYLE', ''],
    ['SUBJECT', ''],
    ['CHARACTER', 'Characters'],
    ['ACTION', 'Action'],
    ['EMOTION', 'Emotion'],
    ['LOCATION', 'Setting'],
    ['COMPOSITION', 'Composition'],
    ['CAMERA', 'Camera'],
    ['LIGHTING', 'Lighting'],
    ['COLOR', 'Color'],
    ['QUALITY', 'Quality'],
    ['NEGATIVE', 'Avoid'],
  ],
  video: [
    ['STYLE', ''],
    ['SUBJECT', ''],
    ['CHARACTER', 'Characters'],
    ['ACTION', 'Action'],
    ['MOTION', 'Motion'],
    ['EMOTION', 'Emotion'],
    ['LOCATION', 'Setting'],
    ['CAMERA', 'Camera'],
    ['CINEMATOGRAPHY', 'Cinematography'],
    ['DIALOGUE', 'Dialogue'],
    ['AMBIENCE', 'Ambience'],
    ['SFX', 'Sound effects'],
    ['DURATION', 'Duration'],
    ['NEGATIVE', 'Avoid'],
  ],
  image_to_video: [
    ['MOTION', 'Animate'],
    ['ACTION', 'Action'],
    ['EMOTION', 'Emotion'],
    ['CAMERA', 'Camera'],
    ['DIALOGUE', 'Dialogue'],
    ['SFX', 'Sound effects'],
    ['DURATION', 'Duration'],
    ['NEGATIVE', 'Avoid'],
  ],
  character: [
    ['STYLE', ''],
    ['CHARACTER', 'Character'],
    ['EMOTION', 'Expression'],
    ['ACTION', 'Pose'],
    ['COMPOSITION', 'Framing'],
    ['COLOR', 'Color'],
    ['QUALITY', 'Quality'],
    ['NEGATIVE', 'Avoid'],
  ],
  set: [
    ['STYLE', ''],
    ['LOCATION', 'Location'],
    ['AMBIENCE', 'Ambience'],
    ['LIGHTING', 'Lighting'],
    ['COLOR', 'Palette'],
    ['COMPOSITION', 'Composition'],
    ['CAMERA', 'Camera'],
    ['QUALITY', 'Quality'],
    ['NEGATIVE', 'Avoid'],
  ],
  dialogue: [
    ['CHARACTER', 'Speaker'],
    ['EMOTION', 'Emotion'],
    ['DIALOGUE', 'Line'],
    ['AUDIO', 'Delivery'],
  ],
  voice: [
    ['CHARACTER', 'Voice of'],
    ['AUDIO', 'Voice'],
    ['EMOTION', 'Emotion'],
    ['DIALOGUE', 'Text'],
  ],
  sfx: [
    ['SFX', 'Sound'],
    ['AMBIENCE', 'Ambience'],
    ['DURATION', 'Duration'],
  ],
  music: [
    ['MUSIC', 'Music'],
    ['EMOTION', 'Mood'],
    ['DURATION', 'Duration'],
    ['AUDIO', 'Instruments'],
  ],
  subtitles: [
    ['DIALOGUE', 'Text'],
    ['PLATFORM', 'Platform'],
    ['ASPECT', 'Aspect'],
    ['STYLE', 'Style'],
  ],
};

export interface ModelConstraints {
  /** Prompt language the model handles best; default English for image/video models. */
  language?: 'en' | 'fr';
  maxChars?: number;
  /** When the model has no negative-prompt parameter the negatives are written into the prompt as « Avoid: ». */
  negativeInline?: boolean;
  /** Parameters actually supported (aspect_ratio, duration…) — used for the compiled params. */
  params?: Record<string, unknown>;
}
export interface Compiled {
  text: string;
  version: string;
  template: TemplateId;
  model?: string;
  truncated: boolean;
  /** Dimensions that were used / left empty. */
  used: GenomeDimension[];
  missing: GenomeDimension[];
  warnings: string[];
}

/** Stable short hash (FNV-1a) used as the prompt version. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function compose(
  template: TemplateId,
  dims: Dims,
  c: ModelConstraints = {},
  model?: string,
): Compiled {
  const used: GenomeDimension[] = [];
  const missing: GenomeDimension[] = [];
  const warnings: string[] = [];
  const parts: string[] = [];
  for (const [d, label] of TEMPLATES[template]) {
    const v = (dims[d] ?? '').toString().trim();
    if (!v) {
      if (!['NEGATIVE', 'QUALITY', 'COLOR', 'LIGHTING', 'COMPOSITION', 'CAMERA'].includes(d)) missing.push(d);
      continue;
    }
    if (d === 'NEGATIVE' && c.negativeInline === false) continue;
    used.push(d);
    parts.push(label ? `${label}: ${v}` : v);
  }
  let text = redactSecrets(parts.join('. ').replace(/\.\s*\./g, '.'));
  let truncated = false;
  if (c.maxChars && text.length > c.maxChars) {
    // Drop the least important trailing dimensions first, keeping style + subject.
    const keep = parts.slice();
    while (keep.length > 2 && keep.join('. ').length > c.maxChars) keep.pop();
    text = redactSecrets(keep.join('. '));
    if (text.length > c.maxChars) text = `${text.slice(0, c.maxChars - 1)}…`;
    truncated = true;
    warnings.push(`prompt tronqué à ${c.maxChars} caractères (dimensions finales retirées)`);
  }
  if (missing.length) warnings.push(`dimensions vides : ${missing.join(', ')}`);
  return {
    text,
    version: `pg-${template}-${hash(`${template}|${c.language ?? 'en'}|${text}`)}`,
    template,
    model,
    truncated,
    used,
    missing,
    warnings,
  };
}

// ───────── scene-level compilation with injected context ─────────

const charLine = (c: CharacterSheet) =>
  c.consistency ||
  `${c.name}: ${[c.age, c.skin, c.hair, c.clothing, c.accessories].filter(Boolean).join(', ')}`;
export interface SceneContext {
  style: StyleDNA;
  characters: CharacterSheet[];
  worlds: WorldSheet[];
  previous?: Scene | null;
  next?: Scene | null;
  platform?: string;
  aspect?: string;
}
/** Dimensions of a scene, with the Style DNA, consistency profiles and the world sheet injected. */
/** The first moment of an action written as a sequence of beats. */
export function singleMoment(action: string): string {
  const a = (action ?? '').trim();
  const first = a.split(/\s*(?:,?\s+(?:puis|ensuite|après quoi|et enfin|then|and then|afterwards)\s+|→|->|;|\n)\s*/i)[0] ?? a;
  return first.length >= 12 ? first : a;
}
/**
 * ANIMATION-READY staging (the app animates its own pictures): characters whole and apart, limbs clear of the body,
 * a background that contrasts with skin and clothes — the cut-out and the motion are then clean.
 */
export const ANIMATION_READY =
  'animation-ready staging: every character fully visible head to feet, standing apart (not touching, not overlapping), arms clearly separated from the torso, face in three-quarter view, mouth visible; the background right behind each character contrasts with their skin, hair and clothes (no dark doorway behind dark skin), no foreground object crossing a character';
export function sceneDims(sc: Scene, ctx: SceneContext): Dims {
  const chars = ctx.characters.filter((c) =>
    sc.characters.some((n) => n.toUpperCase() === c.name.toUpperCase()),
  );
  const world = ctx.worlds.find((w) => w.name.toLowerCase() === sc.location.toLowerCase());
  // ONE moment per image: a beat written as a sequence (« X, puis Y, puis Z ») becomes its first moment — the rest is
  // motion for the video, never extra panels in the picture.
  const moment = singleMoment(sc.action);
  return {
    STYLE: styleLine(ctx.style),
    SUBJECT: moment,
    CHARACTER: chars.map(charLine).join(' | '),
    LOCATION: world
      ? `${world.name} — ${world.architecture}; ${world.palette}; ${world.objects}. The whole shot takes place here: every prop belongs to this place`
      : `${sc.location}. The whole shot takes place here: every prop belongs to this place`,
    ACTION: moment,
    EMOTION: `${sc.emotion}${sc.emotion ? '; ' : ''}exaggerated readable cartoon expressions`,
    CAMERA: sc.camera,
    LIGHTING: sc.lighting || world?.lighting || '',
    COLOR: world?.palette ?? '',
    COMPOSITION: `ONE single full-frame shot of one moment, one camera, full bleed (no panels, no borders, no split screen, no speech bubbles); each character appears once; ${ANIMATION_READY}${ctx.next ? `; framed so the next scene (${ctx.next.location}) can cut in naturally` : ''}`,
    QUALITY: qualityLine(ctx.style, 'illustration'),
    NEGATIVE: ctx.style.negative,
    DIALOGUE: sc.dialogue.map((d) => `${d.speaker}: "${d.text}"`).join(' / '),
    SFX: sc.sound,
    AMBIENCE: world ? `${world.weather}, ${world.time}` : sc.time,
    MUSIC: sc.music,
    MOTION: `${sc.action}; ${comicDirection((sc as { beat?: string }).beat, sc.emotion, ctx.characters.length + (sc.scene_id?.length ?? 0))}; characters move and talk: lips synced to their lines, head and hand gestures, body language`,
    CINEMATOGRAPHY: `${sc.camera}, ${sc.transition}`,
    DURATION: `${sc.duration}s`,
    PLATFORM: ctx.platform ?? '',
    ASPECT: ctx.aspect ?? '9:16',
  };
}
export function compileScene(
  sc: Scene,
  ctx: SceneContext,
  template: TemplateId,
  c: ModelConstraints = {},
  model?: string,
): Compiled {
  return compose(template, sceneDims(sc, ctx), c, model);
}
export function compileCharacter(
  ch: CharacterSheet,
  style: StyleDNA,
  pose: string,
  c: ModelConstraints = {},
  model?: string,
): Compiled {
  return compose(
    'character',
    {
      STYLE: styleLine(style),
      CHARACTER: charLine(ch),
      EMOTION: pose,
      ACTION: `${pose} pose`,
      COMPOSITION: pose.includes('profil')
        ? 'profile view, full body'
        : 'full body, centered, plain white background',
      QUALITY: qualityLine(style, 'character sheet'),
      NEGATIVE: style.negative,
    },
    c,
    model,
  );
}

/** The consistency instruction of a redraw: keep identity, pose, outfit, patterns, proportions; plain white background; no logo. */
export { redrawInstruction };
export const REDRAW_INSTRUCTION =
  'Redraw this exact character in the target 2D style. Keep the same face, pose, outfit, fabric patterns and proportions. Plain white background. No logo, no text.';

// ───────── library of composable motifs ─────────

export const MOTIFS: Record<string, { label: string; dims: Dims }> = {
  comedie_stupeur: {
    label: 'Comédie : stupeur',
    dims: {
      EMOTION: 'shock, jaw dropped, eyes huge, frozen pose',
      COMPOSITION: 'tight close-up on the face',
    },
  },
  comedie_chute: {
    label: 'Comédie : chute',
    dims: { EMOTION: 'smug triumphant grin', COMPOSITION: 'low angle, character dominates the frame' },
  },
  belle_famille: {
    label: 'Belle-famille',
    dims: {
      LOCATION: 'family living room in Abidjan, sofa, tv, wax-print cushions',
      EMOTION: 'tense polite smiles',
    },
  },
  marche: {
    label: 'Marché',
    dims: {
      LOCATION: 'busy Adjamé market in Abidjan, colourful stalls, fabrics, fruit crates',
      AMBIENCE: 'crowd chatter, merchants calling',
    },
  },
  sketch_social: {
    label: 'Vidéo sociale 9:16',
    dims: {
      ASPECT: '9:16',
      COMPOSITION: 'vertical framing, subject in the central safe area, space for subtitles at the bottom',
    },
  },
  anim_2d: {
    label: 'Animation 2D',
    dims: { MOTION: 'limited 2D cut-out animation, quick squash and stretch on reactions' },
  },
  anim_3d: {
    label: 'Animation 3D',
    dims: {
      MOTION: 'expressive 3D character animation, snappy comedic timing, squash and stretch on reactions',
    },
  },
};
export const withMotifs = (dims: Dims, ids: string[]): Dims =>
  ids.reduce<Dims>((acc, id) => {
    const m = MOTIFS[id];
    if (!m) return acc;
    const next = { ...acc };
    for (const [k, v] of Object.entries(m.dims)) {
      const key = k as GenomeDimension;
      next[key] = next[key] ? `${next[key]}; ${v}` : v;
    }
    return next;
  }, dims);
