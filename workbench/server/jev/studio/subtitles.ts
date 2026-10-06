// Subtitles: timing from the text and the voice duration (word-level, active word highlighted), contextual emojis
// (derived from emotion/action, never random), SRT export. Real transcription is used only when a capability exists.
import type { DialogueLine, Scene } from './types';

export type SubtitleStyle = 'CLEAN' | 'COMEDY' | 'CINEMATIC' | 'SOCIAL' | 'DYNAMIC';
export interface Word {
  text: string;
  start: number;
  end: number;
}
export interface SubLine {
  sceneId: string;
  /** Index of the line in the scene's dialogue (links a subtitle to its voice file). */
  index: number;
  start: number;
  end: number;
  speaker: string;
  text: string;
  emoji?: string;
  words: Word[];
}
/** Speaking rate (words / second) at pace 1 — a conservative estimate used only when the voice duration is unknown. */
export const WORDS_PER_SECOND = 2.6;

const EMOJI: [RegExp, string][] = [
  [/(shock|surpris|stup|choc|sidér|incroy)/i, '😱'],
  [/(angry|colère|furieu|énerv|fâch)/i, '😡'],
  [/(laugh|rire|mdr|drôle|hilar|joie|joy|happy|content)/i, '😂'],
  [/(smug|fier|triomph|malin|sournois)/i, '😏'],
  [/(sad|triste|pleur|cry)/i, '😢'],
  [/(peur|fear|effray|scared)/i, '😨'],
  [/(amour|love|tendre|romant)/i, '😍'],
  [/(argent|billet|money|cash|payer|prix)/i, '💰'],
  [/(téléphone|phone|appel)/i, '📱'],
  [/(mange|repas|riz|thieb|cuisine|food)/i, '🍲'],
  [/(marché|market|foule|crowd)/i, '🛍️'],
];
/** Deterministic: the same emotion/action always gives the same emoji (or none). */
export function emojiFor(emotion: string, action = ''): string | undefined {
  const t = `${emotion} ${action}`;
  return EMOJI.find(([re]) => re.test(t))?.[1];
}

export const dialogueSeconds = (l: DialogueLine) =>
  Math.max(0.6, l.text.trim().split(/\s+/).filter(Boolean).length / (WORDS_PER_SECOND * (l.pace || 1)));

/** Lays the dialogue of every scene on the global timeline. `voiceSeconds[sceneId][i]` (measured) overrides the estimate. */
export function timeSubtitles(
  scenes: Scene[],
  o: { voiceSeconds?: Record<string, number[]>; useTranslation?: boolean } = {},
): SubLine[] {
  const out: SubLine[] = [];
  let t0 = 0;
  for (const sc of scenes) {
    let t = t0 + 0.3;
    sc.dialogue.forEach((l, i) => {
      const dur = o.voiceSeconds?.[sc.scene_id]?.[i] ?? dialogueSeconds(l);
      const text = o.useTranslation && l.translation ? l.translation : l.text;
      const ws = text.trim().split(/\s+/).filter(Boolean);
      const total = ws.reduce((a, w) => a + Math.max(1, w.replace(/[^\p{L}\p{N}]/gu, '').length), 0) || 1;
      let c = t;
      const words: Word[] = ws.map((w) => {
        const d = (Math.max(1, w.replace(/[^\p{L}\p{N}]/gu, '').length) / total) * dur;
        const word = { text: w, start: c, end: c + d };
        c += d;
        return word;
      });
      out.push({
        sceneId: sc.scene_id,
        index: i,
        start: t,
        end: t + dur,
        speaker: l.speaker,
        text,
        emoji: emojiFor(l.emotion, sc.action),
        words,
      });
      t += dur + l.pauseAfterMs / 1000;
    });
    t0 += Math.max(sc.duration, t - t0);
  }
  return out;
}
const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0');
const ts = (s: number) =>
  `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)},${pad(((s % 1) * 1000) | 0, 3)}`;
export const toSrt = (lines: SubLine[]): string =>
  lines
    .map((l, i) => `${i + 1}\n${ts(l.start)} --> ${ts(l.end)}\n${l.emoji ? `${l.emoji} ` : ''}${l.text}\n`)
    .join('\n');

export const SUBTITLE_STYLES: Record<
  SubtitleStyle,
  { font: string; size: number; fill: string; stroke: string; active: string; weight: number; upper: boolean }
> = {
  CLEAN: {
    font: 'system-ui, sans-serif',
    size: 0.045,
    fill: '#ffffff',
    stroke: '#000000',
    active: '#ffffff',
    weight: 600,
    upper: false,
  },
  COMEDY: {
    font: '"Comic Sans MS", "Chalkboard SE", system-ui, sans-serif',
    size: 0.06,
    fill: '#ffffff',
    stroke: '#111111',
    active: '#ffd400',
    weight: 800,
    upper: true,
  },
  CINEMATIC: {
    font: 'Georgia, serif',
    size: 0.04,
    fill: '#f4f1e8',
    stroke: '#000000',
    active: '#f4f1e8',
    weight: 400,
    upper: false,
  },
  SOCIAL: {
    font: 'Impact, system-ui, sans-serif',
    size: 0.065,
    fill: '#ffffff',
    stroke: '#000000',
    active: '#00e5a8',
    weight: 800,
    upper: true,
  },
  DYNAMIC: {
    font: 'system-ui, sans-serif',
    size: 0.058,
    fill: '#ffffff',
    stroke: '#101010',
    active: '#ff4d6d',
    weight: 900,
    upper: true,
  },
};
export const ASPECTS: Record<string, [number, number]> = {
  '9:16': [1080, 1920],
  '16:9': [1920, 1080],
  '1:1': [1080, 1080],
};
/** The line (and active word) shown at time t, or null. */
export function activeAt(lines: SubLine[], t: number): { line: SubLine; wordIndex: number } | null {
  const line = lines.find((l) => t >= l.start && t <= l.end);
  if (!line) return null;
  const wordIndex = line.words.findIndex((w) => t >= w.start && t <= w.end);
  return { line, wordIndex: wordIndex < 0 ? line.words.length - 1 : wordIndex };
}

/**
 * SOCIAL EMOTION ENGINE — decides IF, WHICH and WHEN: at most one emoji per scene and one per `minGap` seconds, only where the
 * emotion / action maps to an emoji; never decorative. Same input → same plan.
 */
export function planEmojis(
  lines: SubLine[],
  minGap = 3,
): { sceneId: string; start: number; duration: number; emoji: string }[] {
  const out: { sceneId: string; start: number; duration: number; emoji: string }[] = [];
  const seen = new Set<string>();
  let last = -Infinity;
  for (const l of lines) {
    if (!l.emoji || seen.has(l.sceneId) || l.start - last < minGap) continue;
    seen.add(l.sceneId);
    last = l.start;
    out.push({
      sceneId: l.sceneId,
      start: l.start + 0.15,
      duration: Math.min(1.4, Math.max(0.8, l.end - l.start)),
      emoji: l.emoji,
    });
  }
  return out;
}
