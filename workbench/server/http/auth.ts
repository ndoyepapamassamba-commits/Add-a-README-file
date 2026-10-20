import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { registerSecret } from '../security/redact';

/** Resolves the access token: WORKBENCH_AUTH_TOKEN, else a persisted random token. */
export function resolveAuthToken(configured: string | undefined, file: string): string {
  if (configured) {
    registerSecret(configured);
    return configured;
  }
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 24) {
      registerSecret(existing);
      return existing;
    }
  } catch {
    /* create below */
  }
  const token = randomBytes(24).toString('base64url');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${token}\n`, { mode: 0o600 });
  registerSecret(token);
  return token;
}

export function tokenMatches(expected: string, provided: string | undefined | null): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1]!.trim() : null;
}
