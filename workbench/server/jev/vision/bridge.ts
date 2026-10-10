// JEV VISION BRIDGE — gives eyes to a text-only model (e.g. a fast non-vision Qwen) without changing the chat's model.
// A small vision model reads the image ONCE (exhaustive description + verbatim OCR + tables + chart values) and the text
// is handed to the chat model. The result is cached per image × question, so the same image is never paid twice.
import type { ModelInfo } from '../../../shared/types';

export interface VisionPick {
  model: string;
  fallbacks: string[];
  why: string;
}
const price = (m: ModelInfo) => (m.inputPrice ?? Infinity) + (m.outputPrice ?? Infinity) / 4;
/** Cheapest reliable vision models first (free ones are tried first, a cheap paid one stays as safety net). */
export function pickVisionModel(models: ModelInfo[], preferred?: string | null): VisionPick | null {
  const vis = models.filter((m) => m.capabilities.vision && m.inputPrice !== null && m.outputPrice !== null);
  if (!vis.length) return null;
  const pref = preferred ? vis.find((m) => m.id === preferred) : undefined;
  const free = vis.filter((m) => m.inputPrice === 0 && m.outputPrice === 0).sort((a, b) => b.contextLength - a.contextLength);
  const paid = vis.filter((m) => (m.inputPrice ?? 0) > 0 || (m.outputPrice ?? 0) > 0).sort((a, b) => price(a) - price(b));
  const order = [...(pref ? [pref] : []), ...free.slice(0, 2), ...paid.slice(0, 2)].map((m) => m.id);
  const uniq = [...new Set(order)];
  return {
    model: uniq[0]!,
    fallbacks: uniq.slice(1, 4),
    why: pref ? 'modèle vision choisi dans les réglages' : free.length ? 'modèle vision gratuit (repli : le moins cher payant)' : 'modèle vision le moins cher',
  };
}

export function visionPrompt(question: string): string {
  return [
    'You are the EYES of another AI that cannot see images. It will only get your text, so it must be complete and exact.',
    'Report, in the language of the question:',
    '1. TEXT — transcribe EVERY visible text verbatim (titles, labels, numbers, code, UI text), keeping line order.',
    '2. TABLES — reproduce any table as a Markdown table with all rows and values.',
    '3. CHARTS — type, axes, series, every readable value, trend.',
    '4. LAYOUT & VISUALS — what the image is, regions, colours, objects, people, UI elements and their state (errors, disabled, selected).',
    '5. PROBLEMS — anything broken, cut, misaligned, overlapping or unreadable.',
    'Never guess unreadable values: write [illisible]. No opinions, no advice, no preamble.',
    `The user's request about this image (focus on what it needs): «${question.slice(0, 600)}»`,
  ].join('\n');
}

export const bridgeBlock = (path: string, model: string, text: string) =>
  `<image_description path="${path}" seen_by="${model}" note="JEV vision bridge: this is what the image shows; you cannot see it yourself, rely on this text">\n${text.trim()}\n</image_description>`;

/** Stable cache key: image content + normalised question. */
export function bridgeKey(dataB64: string, question: string): string {
  let h = 5381;
  const s = `${dataB64.length}:${dataB64.slice(0, 2000)}:${dataB64.slice(-2000)}|${question.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 300)}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
