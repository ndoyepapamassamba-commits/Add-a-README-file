// OMNIPOTENT — shared text helpers (pure, no imports from the runtime).
import { keywords } from '../../agent/intelligence';

export const normText = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s./_-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
/** Crude French/English stem: the first 6 letters (« régression » ≈ « regressions »). */
const stem = (w: string) => w.slice(0, 6);
export const topicKeys = (text: string, max = 40): Set<string> => new Set(keywords(text, max).map(stem));
/** Share of the SMALLER keyword set found in the other: tolerant to a short request vs a long past turn. */
export function affinity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const k of a) if (b.has(k)) hit++;
  return hit / Math.min(a.size, b.size, 12);
}
export const estTok = (s: string) => Math.ceil(s.length / 3.8);
export const contentText = (c: unknown): string =>
  typeof c === 'string'
    ? c
    : Array.isArray(c)
      ? c.map((p) => (p && typeof p === 'object' && 'text' in p ? String((p as { text: unknown }).text ?? '') : '')).join(' ')
      : '';
/** Names that look like files / artifacts (report.xlsx, index.html, src/app.ts…). */
export const fileNames = (text: string): string[] => [
  ...new Set((text.match(/[\w@./-]+\.(?:xlsx?|xlsb|csv|json|pdf|docx?|pptx?|ts|tsx|js|jsx|py|html?|css|md|txt|png|jpe?g|svg|sql|ya?ml)\b/gi) ?? []).map((x) => x.toLowerCase())),
];
export const hashStr = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
