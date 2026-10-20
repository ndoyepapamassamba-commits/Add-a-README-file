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
/** Vision models known to answer plain API calls reliably (a free model may be restricted to some apps). */
const RELIABLE = /gemini[^/]*flash|qwen[^/]*vl|gpt-4o-mini|gpt-4\.1-mini|gpt-[5-9][^/]*mini|llama[^/]*vision|pixtral|claude[^/]*haiku|gemma-3|mistral-small/i;
/**
 * Ordered vision candidates. « cheap »: free first, then the cheapest paid (the chat bridge, cost first).
 * « reliable »: known-reliable cheap paid models first, then free, then other paid (a one-shot read the user waits for).
 * Models that refused before (blocked) are skipped; batch-only models never.
 */
/**
 * Best at LOCATING things on an image (layout reading for the design reproduction), strongest first: Gemini (trained to
 * output boxes), Claude Sonnet / Haiku / Opus, GPT-6 / GPT-5, large Qwen-VL. Paid is fine: one read costs a cent or so.
 */
const DESIGN_TIERS = [
  /google\/gemini-[3-9][^/]*(pro|flash)(?![^/]*lite)/i,
  /google\/gemini-2\.5[^/]*(pro|flash)(?![^/]*lite)/i,
  /anthropic\/claude[^/]*(sonnet|haiku|opus)[^/]*-[4-9]/i,
  /openai\/gpt-[5-9](?![^/]*nano)/i,
  /qwen[^/]*vl[^/]*(max|plus|72b|235b)|qwen3[^/]*vl/i,
];
export function designVisionCandidates(models: ModelInfo[], blocked: ReadonlySet<string> = new Set(), max = 5): string[] {
  const vis = models.filter((m) => m.capabilities.vision && !blocked.has(m.id) && !/:batch\b|:free\b/.test(m.id) && ((m.inputPrice ?? 0) > 0 || (m.outputPrice ?? 0) > 0));
  const out: string[] = [];
  for (const re of DESIGN_TIERS) out.push(...vis.filter((m) => re.test(m.id)).sort((a, b) => price(a) - price(b)).map((m) => m.id));
  return [...new Set(out)].slice(0, max);
}
export function visionCandidates(models: ModelInfo[], preferred?: string | null, blocked: ReadonlySet<string> = new Set(), mode: 'cheap' | 'reliable' | 'design' = 'cheap', max = 5): string[] {
  if (mode === 'design') {
    const best = designVisionCandidates(models, blocked, max);
    return [...new Set([...(preferred ? [preferred] : []), ...best, ...visionCandidates(models, null, blocked, 'reliable', max)])].slice(0, max + 2);
  }
  const vis = models.filter((m) => m.capabilities.vision && m.inputPrice !== null && m.outputPrice !== null && !blocked.has(m.id) && !/:batch\b/.test(m.id));
  const pref = preferred ? vis.find((m) => m.id === preferred) : undefined;
  const free = vis.filter((m) => m.inputPrice === 0 && m.outputPrice === 0).sort((a, b) => b.contextLength - a.contextLength);
  const paid = vis.filter((m) => (m.inputPrice ?? 0) > 0 || (m.outputPrice ?? 0) > 0).sort((a, b) => price(a) - price(b));
  const reliable = paid.filter((m) => RELIABLE.test(m.id));
  const order =
    mode === 'reliable'
      ? [...(pref ? [pref] : []), ...reliable.slice(0, 3), ...free.slice(0, 2), ...paid.slice(0, 2)]
      : [...(pref ? [pref] : []), ...free.slice(0, 2), ...reliable.slice(0, 2), ...paid.slice(0, 2)];
  return [...new Set(order.map((m) => m.id))].slice(0, max);
}

export function pickVisionModel(models: ModelInfo[], preferred?: string | null, blocked: ReadonlySet<string> = new Set()): VisionPick | null {
  const uniq = visionCandidates(models, preferred, blocked, 'cheap');
  if (!uniq.length) return null;
  const hasFree = models.some((m) => m.id === uniq[0] && m.inputPrice === 0 && m.outputPrice === 0);
  return {
    model: uniq[0]!,
    fallbacks: uniq.slice(1, 4),
    why: preferred && uniq[0] === preferred ? 'modèle vision choisi dans les réglages' : hasFree ? 'modèle vision gratuit (repli : le moins cher payant)' : 'modèle vision le moins cher',
  };
}
/** An error that means « this model will never take this call » (not a transient failure). */
export const permanentVisionError = (status: number | undefined, message: string) =>
  (status !== undefined && [400, 401, 402, 403, 404, 405, 422].includes(status)) || /only available|not (?:support|available)|no endpoints|agentic|image input|does not support|unsupported/i.test(message);

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
