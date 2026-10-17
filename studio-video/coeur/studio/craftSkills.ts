/**
 * CRAFT SKILLS — the installed video / 3D skills turned into code the film pipeline runs (pure, no DOM, no model call):
 *
 * - `video-prompting` (square-zero-labs) → `shapeVideoPrompt`: one camera move, cinematography vocabulary, no model name /
 *   duration / aspect ratio / resolution inside the prompt, action beats sized to the clip length;
 * - `character-design` (fal-ai-community) → `characterAnchor`: an immutable identity block repeated verbatim in every
 *   prompt of the same character, and a variable block for the shot;
 * - `video-storyboard` (aicontentskills) → `shotPlan` + `visualTheme`: ~5 s shots with size, move and purpose, one
 *   visual theme every shot respects;
 * - `video-director` (zlbigger story-video-director) → `directorBeats`: one principal event per clip, 2–5 timed beats,
 *   explicit opening and final state, clips of 15 s at most;
 * - `cinema-skills` (DenisHumen + Benitoow) → `styleBible`: one look from the first frame to the last;
 * - `remotion-best-practices` (remotion-dev, captions) → `pageCaptions`: captions as short pages, never a wall of text.
 *
 * Each hook runs only when its skill is enabled in the library (the `craft` set the callers pass), so turning a skill off
 * turns its effect off. Nothing here invents data: every output is derived from the scene, the sheet or the style.
 */
import type { CharacterSheet, Scene, StyleDNA } from './types';
import type { SubLine } from './subtitles';

export type CraftSet = ReadonlySet<string>;
export const CRAFT = {
  prompt: 'video-prompting',
  character: 'character-design',
  storyboard: 'video-storyboard',
  director: 'video-director',
  cinema: 'cinema-skills',
  captions: 'remotion-best-practices',
  motion: 'remotion-motion-graphics',
  blender: 'blender-cinematic-scene',
} as const;
export const CRAFT_NAMES: string[] = Object.values(CRAFT);
export const has = (craft: CraftSet | undefined, name: string): boolean => Boolean(craft?.has(name));

// ───────── video-prompting ─────────
/** French cinematography vocabulary → the English terms video models were trained on. */
const CAMERA_FR: [RegExp, string][] = [
  [/\btr[èe]s gros plan\b/gi, 'extreme close-up'],
  [/\bgros plan\b/gi, 'close-up'],
  [/\bplan (large|d.ensemble|g[ée]n[ée]ral)\b/gi, 'wide shot'],
  [/\bplan moyen\b/gi, 'medium shot'],
  [/\bplan am[ée]ricain\b/gi, 'medium-full shot'],
  [/\bplan rapproch[ée]\b/gi, 'medium close-up'],
  [/\bcontre-plong[ée]e\b/gi, 'low angle'],
  [/\bplong[ée]e\b/gi, 'high angle'],
  [/\btravelling avant\b/gi, 'slow dolly in'],
  [/\btravelling arri[èe]re\b/gi, 'slow dolly out'],
  [/\btravelling\b/gi, 'tracking shot'],
  [/\bpanoramique\b/gi, 'slow pan'],
  [/\bzoom avant\b/gi, 'slow push-in'],
  [/\bzoom arri[èe]re\b/gi, 'slow pull-out'],
  [/\bcam[ée]ra (à l.[ée]paule|port[ée]e)\b/gi, 'handheld camera'],
  [/\bcam[ée]ra fixe\b/gi, 'locked-off camera'],
  [/\bchamp.contrechamp\b/gi, 'shot/reverse shot'],
  [/\bvue subjective\b/gi, 'POV shot'],
  [/\bpar-dessus l.[ée]paule\b/gi, 'over-the-shoulder shot'],
];
const CAMERA_TERMS =
  /\b(close-up|wide shot|medium shot|medium-full shot|medium close-up|low angle|high angle|dolly (in|out)|tracking shot|slow pan|push-in|pull-out|handheld camera|locked-off camera|shot\/reverse shot|POV shot|over-the-shoulder shot|crane (up|down)|tilt (up|down)|rack focus|orbit)\b/gi;
const MOVE_TERMS = /\b(dolly (in|out)|tracking shot|slow pan|push-in|pull-out|handheld camera|crane (up|down)|tilt (up|down)|rack focus|orbit)\b/gi;
/** Global rule of the skill: never the model name, the duration, the aspect ratio or the resolution inside the prompt. */
const BANNED: [RegExp, string][] = [
  [/\b(veo ?3(\.1)?|kling( ?[23](\.\d)?)?|seedance( ?2(\.\d)?)?|sora|runway|grok( imagine)?|wan ?2(\.\d)?|ltx-?2(\.\d)?|minimax|hailuo|pika|luma|midjourney|pollinations)\b/gi, 'nom de modèle'],
  [/\b\d+(?:[.,]\d+)? ?(s|sec|secondes?|seconds?)\b/gi, 'durée'],
  [/\b(9:16|16:9|1:1|4:5|21:9)\b/g, 'format'],
  [/\b(1080p|720p|4k|2160p|hd|uhd)\b/gi, 'résolution'],
];
/** How many action beats a clip of that length supports (the skill: duration is planning context only). */
export const beatsFor = (seconds: number | undefined): number => (!seconds || seconds <= 5 ? 2 : seconds <= 10 ? 3 : 5);

export interface ShapedPrompt {
  text: string;
  beats: number;
  /** What was removed or trimmed, for the stage log (never silent). */
  notes: string[];
}
/** The motion text of a shot, shaped by the video-prompting rules. */
export function shapeVideoPrompt(motion: string, o: { seconds?: number } = {}): ShapedPrompt {
  const notes: string[] = [];
  let t = motion.replace(/\s+/g, ' ').trim();
  for (const [re, en] of CAMERA_FR) t = t.replace(re, en);
  for (const [re, what] of BANNED) {
    const found = t.match(re);
    if (found) {
      notes.push(`${what} retiré(e) du prompt : ${[...new Set(found)].join(', ')}`);
      t = t.replace(re, '').replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1');
    }
  }
  // One camera move per shot.
  const moves = [...new Set((t.match(MOVE_TERMS) ?? []).map((m) => m.toLowerCase()))];
  if (moves.length > 1) {
    for (const m of moves.slice(1)) t = t.replace(new RegExp(`\\b${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '').replace(/\s{2,}/g, ' ');
    notes.push(`un seul mouvement de caméra gardé : ${moves[0]}`);
  }
  // Beats sized to the clip length.
  const max = beatsFor(o.seconds);
  const parts = t.split(/\s*(?:,\s*puis\s+|;\s*|\.\s+(?=[A-ZÀ-Ý])|\bpuis\b|\bensuite\b|\bthen\b)\s*/i).map((p) => p.trim()).filter(Boolean);
  let beats = parts.length;
  if (parts.length > max) {
    t = parts.slice(0, max).join(', then ');
    notes.push(`${parts.length} temps d’action pour ${o.seconds ?? '?'} s → ${max} gardés`);
    beats = max;
  }
  if (!CAMERA_TERMS.test(t)) t = `${t.replace(/[.\s]+$/, '')}. Medium shot, steady camera.`;
  CAMERA_TERMS.lastIndex = 0;
  return { text: t.replace(/\s+([,.;])/g, '$1').trim(), beats, notes };
}

// ───────── character-design ─────────
/** The immutable identity block of a character (anchor system of the skill), repeated verbatim in every prompt. */
export function characterAnchor(c: Partial<CharacterSheet> & { name: string }, style?: string): string {
  const f = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim();
  const fields = [
    f(c.age),
    f(c.gender),
    f(c.face),
    f(c.skin),
    f(c.hair),
    [f(c.body), f(c.posture)].filter(Boolean).join(', '),
    [f(c.clothing), f(c.accessories)].filter(Boolean).join(' + '),
    f(style),
  ].filter(Boolean);
  return `${c.name.toUpperCase()}: ${fields.join('; ').slice(0, 260)}`;
}
/** The variable block of a shot: what may change (expression, action, setting, camera, light, mood). */
export function shotVariable(o: { expression?: string; action?: string; setting?: string; camera?: string; lighting?: string; mood?: string }): string {
  const parts = [
    o.expression && `expression: ${o.expression}`,
    o.action && `action: ${o.action}`,
    o.setting && `setting: ${o.setting}`,
    o.camera && `camera: ${o.camera}`,
    o.lighting && `lighting: ${o.lighting}`,
    o.mood && `mood: ${o.mood}`,
  ].filter(Boolean) as string[];
  return parts.join('; ');
}

// ───────── video-storyboard ─────────
export type ShotSize = 'WS' | 'MS' | 'MCU' | 'CU' | 'ECU';
export interface Shot {
  n: number;
  start: number;
  end: number;
  size: ShotSize;
  move: string;
  purpose: string;
}
const SIZE_LABEL: Record<ShotSize, string> = { WS: 'wide shot', MS: 'medium shot', MCU: 'medium close-up', CU: 'close-up', ECU: 'extreme close-up' };
export const shotLabel = (s: Shot): string => `${SIZE_LABEL[s.size]}, ${s.move}`;
/** ~5 s shots (the sweet spot of video generators), sized and moved by the beat of the scene, one move each. */
export function shotPlan(sc: Pick<Scene, 'duration' | 'beat'>, o: { shotS?: number; maxClipS?: number } = {}): Shot[] {
  const shotS = o.shotS ?? 5;
  const maxClip = o.maxClipS ?? 8;
  const dur = Math.max(1, sc.duration || shotS);
  const n = Math.max(1, Math.ceil(dur / Math.min(shotS, maxClip)));
  const len = dur / n;
  const beat = (sc.beat || '').toLowerCase();
  const sizes: ShotSize[] = beat.includes('hook') ? ['CU', 'MS', 'WS'] : beat.includes('twist') ? ['MCU', 'CU', 'MS'] : beat.includes('chute') ? ['CU', 'WS', 'MS'] : ['WS', 'MS', 'CU'];
  const moves = ['locked-off camera', 'slow push-in', 'tracking shot', 'handheld camera'];
  const purposes = beat.includes('hook') ? ['Hook', 'Setting', 'Action'] : beat.includes('chute') ? ['Payoff', 'Reaction', 'Button'] : ['Setting', 'Action', 'Detail'];
  const out: Shot[] = [];
  for (let i = 0; i < n; i++)
    out.push({
      n: i + 1,
      start: Math.round(i * len * 10) / 10,
      end: Math.round((i + 1) * len * 10) / 10,
      size: sizes[i % sizes.length]!,
      move: moves[i % moves.length]!,
      purpose: purposes[Math.min(i, purposes.length - 1)]!,
    });
  return out;
}
/** The shared visual language every shot must respect (palette, light, lens, film look, motion language). */
export function visualTheme(style: Pick<StyleDNA, 'color' | 'lighting' | 'lens' | 'texture' | 'camera'>): string {
  const f = (s: string) => s.replace(/\s+/g, ' ').trim();
  return [
    style.color && `palette: ${f(style.color)}`,
    style.lighting && `lighting: ${f(style.lighting)}`,
    style.lens && `lens: ${f(style.lens)}`,
    style.texture && `film look: ${f(style.texture)}`,
    style.camera && `motion language: ${f(style.camera)}`,
  ]
    .filter(Boolean)
    .join('; ');
}

// ───────── video-director ─────────
export interface DirectorPlan {
  clips: number;
  beats: string[];
  opening: string;
  final: string;
  warnings: string[];
}
/** One principal event per clip, 2–5 timed beats, explicit opening and final state; clips of `maxClipS` at most. */
export function directorBeats(sc: Pick<Scene, 'action' | 'duration'> & Partial<Pick<Scene, 'dialogue' | 'emotion'>>, maxClipS = 15): DirectorPlan {
  const warnings: string[] = [];
  const action = (sc.action || '').replace(/\s+/g, ' ').trim();
  let beats = action
    .split(/(?<=[.!?])\s+|\s*;\s*|,\s*(?=puis\b|ensuite\b|then\b)|\bpuis\b|\bensuite\b/i)
    .map((b) => b.replace(/^[,;\s]+|[,;\s]+$/g, ''))
    .filter((b) => b.length > 2);
  if (!beats.length) beats = [action].filter(Boolean);
  const clips = Math.max(1, Math.ceil((sc.duration || 0) / maxClipS));
  if ((sc.duration || 0) > maxClipS) warnings.push(`scène de ${sc.duration} s > ${maxClipS} s : à tourner en ${clips} clips, un événement principal chacun`);
  if (beats.length < 2) {
    const react = sc.dialogue?.length ? `${sc.dialogue[0]!.speaker} réagit (${sc.emotion || 'expression visible'})` : `réaction visible (${sc.emotion || 'émotion'})`;
    beats = [...beats, react];
    warnings.push('un seul temps d’action : un temps de réaction ajouté');
  }
  if (beats.length > 5 * clips) {
    warnings.push(`${beats.length} temps pour ${clips} clip(s) : ${5 * clips} gardés`);
    beats = beats.slice(0, 5 * clips);
  }
  return { clips, beats, opening: beats[0]!, final: beats[beats.length - 1]!, warnings };
}
/** The beats as one motion sentence for the animation model (first…, then…, finally…). */
export const beatsSentence = (beats: string[]): string =>
  beats.map((b, i) => (i === 0 ? b : i === beats.length - 1 ? `finally ${b}` : `then ${b}`)).join(', ');

// ───────── cinema-skills ─────────
/** One look from the first frame to the last: the style bible every step of the film reads. */
export function styleBible(o: { title: string; style: StyleDNA; aspect?: string; platform?: string; duration?: number }): string {
  const s = o.style;
  const f = (x: string) => (x || '').replace(/\s+/g, ' ').trim();
  const lines = [
    `BIBLE DE STYLE — ${o.title} (un seul look du premier au dernier plan)`,
    `Format : ${o.aspect || '9:16'}${o.platform ? ` · ${o.platform}` : ''}${o.duration ? ` · ${o.duration} s` : ''}`,
    f(s.color) && `Palette : ${f(s.color)}`,
    f(s.lighting) && `Lumière : ${f(s.lighting)}`,
    f(s.lens) && `Objectif / caméra : ${f(s.lens)}${f(s.camera) ? ` ; ${f(s.camera)}` : ''}`,
    f(s.contrast) && `Contraste : ${f(s.contrast)}`,
    f(s.texture) && `Texture / grain : ${f(s.texture)}`,
    f(s.postProcessing) && `Étalonnage : ${f(s.postProcessing)}`,
    f(s.negative) && `Jamais : ${f(s.negative)}`,
    'Règle : palette, lumière, objectif et étalonnage ne changent pas d’une scène à l’autre sans raison montrée à l’image.',
  ].filter(Boolean) as string[];
  return lines.join('\n');
}

// ───────── remotion captions ─────────
/** Captions as short pages (≤ `maxChars`, one or two lines), each page timed on its words; never a wall of text. */
export function pageCaptions(lines: SubLine[], o: { maxChars?: number; minS?: number } = {}): SubLine[] {
  const maxChars = o.maxChars ?? 34;
  const minS = o.minS ?? 0.6;
  const out: SubLine[] = [];
  for (const l of lines) {
    if (l.text.length <= maxChars || l.words.length < 2) {
      out.push(l);
      continue;
    }
    const pages: SubLine['words'][] = [];
    let cur: SubLine['words'] = [];
    let len = 0;
    for (const w of l.words) {
      const wl = w.text.length;
      if (cur.length && len + 1 + wl > maxChars) {
        pages.push(cur);
        cur = [];
        len = 0;
      }
      cur.push(w);
      len += (len ? 1 : 0) + wl;
    }
    if (cur.length) pages.push(cur);
    pages.forEach((ws, i) => {
      const start = ws[0]!.start;
      const next = pages[i + 1]?.[0]?.start;
      const end = Math.max(ws[ws.length - 1]!.end, Math.min(start + minS, next ?? l.end));
      out.push({ ...l, start, end, text: ws.map((w) => w.text).join(' '), words: ws, emoji: i === 0 ? l.emoji : undefined });
    });
  }
  return out;
}

// ───────── story brief ─────────
/** The rules the enabled skills add to the story brief (read by the writing model before it writes the scenes). */
export function craftStoryRules(craft: CraftSet | undefined): string[] {
  const out: string[] = [];
  if (has(craft, CRAFT.director))
    out.push(
      'Réalisation (video-director) : chaque scène dure 15 s au plus et porte UN événement principal ; son "action" enchaîne 2 à 5 temps (début visible → fin visible), écrits comme des gestes filmables, jamais des pensées.',
    );
  if (has(craft, CRAFT.storyboard))
    out.push(
      'Découpage (video-storyboard) : "camera" nomme un cadrage (plan large, plan moyen, gros plan) et UN seul mouvement ; les scènes s’enchaînent avec le même langage visuel (palette, lumière, objectif).',
    );
  if (has(craft, CRAFT.cinema))
    out.push('Cinéma (cinema-skills) : "lighting" et "sound" gardent un seul look et une seule ambiance sonore d’une scène à l’autre, sauf changement montré à l’image.');
  if (has(craft, CRAFT.character))
    out.push('Personnages (character-design) : chaque personnage garde visage, coiffure, carnation, tenue et accessoire signature dans toutes les scènes.');
  return out;
}
