// Secret redaction. Applied to every tool output (before it reaches the LLM or
// the UI), to agent events, to logs and to the audit trail.

export const REDACTED = '[REDACTED]';

const PRECISE_PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED:private-key]'],
  [/sk-or-v1-[A-Za-z0-9]{16,}/g, '[REDACTED:openrouter-key]'],
  [/sk-ant-[A-Za-z0-9_-]{16,}/g, '[REDACTED:anthropic-key]'],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/g, '[REDACTED:api-key]'],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, '[REDACTED:github-token]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED:github-token]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED:aws-key]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '[REDACTED:slack-token]'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, '[REDACTED:google-key]'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED:jwt]'],
  // credentials embedded in URLs: scheme://user:password@host
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]{3,}@/gi, '$1[REDACTED]@'],
];

// Broad key=value detection. Only used for logs and audit: applying it to
// source code would corrupt files the agent edits.
const LOG_PATTERNS: [RegExp, string][] = [
  [
    /((?:api[_-]?key|secret|password|passwd|authorization|bearer)["']?\s*[:=]\s*["']?(?:Bearer\s+)?)([^\s"',;]{8,})/gi,
    '$1[REDACTED]',
  ],
];

const SECRET_ENV_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE)/i;
let envSecrets: string[] = [];
const extraSecrets = new Set<string>();

/** Re-reads secret-looking environment values (call after the env changes). */
export function refreshSecretValues(): void {
  const values = new Set<string>();
  for (const [name, value] of Object.entries(process.env)) {
    if (value && value.length >= 8 && SECRET_ENV_NAME.test(name)) values.add(value);
  }
  for (const v of extraSecrets) values.add(v);
  // Longest first so overlapping values are fully masked.
  envSecrets = [...values].sort((a, b) => b.length - a.length);
}

export function registerSecret(value: string): void {
  if (value && value.length >= 8) {
    extraSecrets.add(value);
    refreshSecretValues();
  }
}

refreshSecretValues();

export function redactSecrets(text: string): string {
  if (!text) return text;
  let out = text;
  for (const secret of envSecrets) {
    if (out.includes(secret)) out = out.split(secret).join(REDACTED);
  }
  for (const [re, rep] of PRECISE_PATTERNS) out = out.replace(re, rep);
  return out;
}

export function redactForLogs(text: string): string {
  let out = redactSecrets(text);
  for (const [re, rep] of LOG_PATTERNS) out = out.replace(re, rep);
  return out;
}

/** True when the text contains a redaction placeholder produced by this module. */
export function containsRedaction(text: string): boolean {
  return text.includes(REDACTED) || /\[REDACTED:[a-z-]+\]/.test(text);
}

/** Deeply redacts every string inside a JSON-like value. */
export function redactDeep<T>(value: T, fn: (s: string) => string = redactSecrets): T {
  if (typeof value === 'string') return fn(value) as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, fn)) as T;
  if (value && typeof value === 'object') {
    if (value instanceof Uint8Array || value instanceof Date) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactDeep(v, fn);
    return out as T;
  }
  return value;
}

/** Environment for child processes: secret-looking variables removed. */
export function scrubbedEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (SECRET_ENV_NAME.test(name) && !/^(NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|REQUESTS_CA_BUNDLE)$/.test(name))
      continue;
    if (name.startsWith('WORKBENCH_') || name.startsWith('OPENROUTER_')) continue;
    env[name] = value;
  }
  return { ...env, ...extra };
}
