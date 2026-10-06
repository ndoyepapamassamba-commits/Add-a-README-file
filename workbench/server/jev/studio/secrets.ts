// Secret scanning: nothing that looks like a key or token may leave the studio (prompts, exports, blueprints, logs).
const PATTERNS: [string, RegExp][] = [
  ['openrouter-key', /sk-or-v\d-[A-Za-z0-9_-]{8,}/g],
  ['api-key', /\bsk-[A-Za-z0-9_-]{16,}/g],
  ['bearer', /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{20,}/g],
  ['aws-key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g],
  [
    'secret-assignment',
    /\b(?:api[_-]?key|secret|token|password|passwd|mot de passe)\s*[:=]\s*["']?[^\s"',;]{6,}/gi,
  ],
];
export interface SecretHit {
  kind: string;
  /** Masked sample (never the secret itself). */
  sample: string;
}
export function scanSecrets(text: string): SecretHit[] {
  const hits: SecretHit[] = [];
  for (const [kind, re] of PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) hits.push({ kind, sample: `${m[0].slice(0, 4)}…(${m[0].length})` });
  }
  return hits;
}
export const redactSecrets = (text: string): string => {
  let t = text;
  for (const [, re] of PATTERNS) t = t.replace(re, '[SECRET MASQUÉ]');
  return t;
};
/** Deep scan of any JSON-able value. */
export function scanValue(v: unknown): SecretHit[] {
  return scanSecrets(typeof v === 'string' ? v : JSON.stringify(v ?? null));
}
