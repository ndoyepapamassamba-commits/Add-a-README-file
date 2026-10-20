// COFFRE-FORT DE CLÉS — the provider keys are kept in this browser, ENCRYPTED with a master password:
//  - PBKDF2-SHA-256 (310 000 iterations, random 16-byte salt) derives an AES-GCM 256-bit key from the password;
//  - the key list is encrypted (random 12-byte IV per save); only the ciphertext reaches localStorage;
//  - unlocked keys live in memory only (lost on reload / lock); the password is never stored.
// Several keys per provider: ROTATION (least recently used first), a key that hits a rate limit (429) rests until its
// Retry-After, a key refused (401 / 403) is set aside. Usage per key (calls, tokens, cost, remaining quota reported by
// the provider) is kept in clear — it holds no secret.
import type { ProviderId } from './universal';

export interface StoreLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}
export interface VaultKey {
  id: string;
  provider: ProviderId | 'openrouter';
  label: string;
  key: string;
  /** Custom base URL (local server port, proxy). */
  base?: string;
  addedAt: number;
}
export interface KeyUsage {
  calls: number;
  errors: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  lastUsed: number;
  /** Rate limited until (ms epoch); refused = 401/403 seen. */
  restUntil: number;
  refused: boolean;
  lastError: string | null;
  remainingRequests: number | null;
  remainingTokens: number | null;
}
const VAULT = 'wbd.vault.v1';
const USAGE = 'wbd.vault.usage.v1';
const ITER = 310_000;
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const subtle = () => globalThis.crypto.subtle;

async function derive(password: string, salt: Uint8Array, iter = ITER): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export class KeyVault {
  private keys: VaultKey[] | null = null;
  private aes: CryptoKey | null = null;
  private salt: Uint8Array | null = null;
  private usage: Record<string, KeyUsage>;
  constructor(
    private store: StoreLike,
    private iter = ITER,
    private now: () => number = () => Date.now(),
  ) {
    try {
      this.usage = JSON.parse(store.getItem(USAGE) ?? '{}') as Record<string, KeyUsage>;
    } catch {
      this.usage = {};
    }
  }
  get exists(): boolean {
    return this.store.getItem(VAULT) !== null;
  }
  get unlocked(): boolean {
    return this.keys !== null;
  }
  /** Creates the vault (first use) or opens it. Wrong password → false (nothing is erased). */
  async unlock(password: string): Promise<boolean> {
    if (password.length < 8) throw new Error('Mot de passe maître : 8 caractères minimum.');
    const raw = this.store.getItem(VAULT);
    if (!raw) {
      this.salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
      this.aes = await derive(password, this.salt, this.iter);
      this.keys = [];
      await this.save();
      return true;
    }
    const v = JSON.parse(raw) as { salt: string; iv: string; data: string; iter?: number };
    const salt = unb64(v.salt);
    const aes = await derive(password, salt, v.iter ?? this.iter);
    try {
      const plain = await subtle().decrypt(
        { name: 'AES-GCM', iv: unb64(v.iv) as BufferSource },
        aes,
        unb64(v.data) as BufferSource,
      );
      this.keys = JSON.parse(dec.decode(plain)) as VaultKey[];
      this.aes = aes;
      this.salt = salt;
      return true;
    } catch {
      return false;
    }
  }
  lock(): void {
    this.keys = null;
    this.aes = null;
  }
  private async save(): Promise<void> {
    if (!this.aes || !this.salt || !this.keys) throw new Error('Coffre verrouillé.');
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(
      await subtle().encrypt(
        { name: 'AES-GCM', iv: iv as BufferSource },
        this.aes,
        enc.encode(JSON.stringify(this.keys)) as BufferSource,
      ),
    );
    this.store.setItem(
      VAULT,
      JSON.stringify({ v: 1, iter: this.iter, salt: b64(this.salt), iv: b64(iv), data: b64(data) }),
    );
  }
  private need(): VaultKey[] {
    if (!this.keys) throw new Error('Coffre verrouillé : saisissez le mot de passe maître.');
    return this.keys;
  }
  /** The keys WITHOUT their secret (for display). */
  list(): (Omit<VaultKey, 'key'> & { masked: string; usage: KeyUsage })[] {
    return this.need().map(({ key, ...k }) => ({
      ...k,
      masked: key ? `${key.slice(0, 6)}…${key.slice(-4)}` : '(aucune)',
      usage: this.use(k.id),
    }));
  }
  async add(provider: VaultKey['provider'], key: string, label = '', base?: string): Promise<string> {
    const id = `k${this.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    this.need().push({
      id,
      provider,
      label: label || provider,
      key: key.trim(),
      base: base?.trim() || undefined,
      addedAt: this.now(),
    });
    await this.save();
    return id;
  }
  async remove(id: string): Promise<void> {
    this.keys = this.need().filter((k) => k.id !== id);
    delete this.usage[id];
    this.persistUsage();
    await this.save();
  }
  /** Changes the master password (the vault is re-encrypted with a new salt). */
  async rekey(password: string): Promise<void> {
    const keys = this.need();
    this.salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    this.aes = await derive(password, this.salt, this.iter);
    this.keys = keys;
    await this.save();
  }
  private use(id: string): KeyUsage {
    return (this.usage[id] ??= {
      calls: 0,
      errors: 0,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      lastUsed: 0,
      restUntil: 0,
      refused: false,
      lastError: null,
      remainingRequests: null,
      remainingTokens: null,
    });
  }
  private persistUsage() {
    try {
      this.store.setItem(USAGE, JSON.stringify(this.usage));
    } catch {
      /* quota: usage kept in memory */
    }
  }
  /** ROTATION: the usable key of this provider used the longest ago (resting / refused keys are skipped). */
  pick(provider: VaultKey['provider']): VaultKey | null {
    const t = this.now();
    const ok = this.need().filter(
      (k) => k.provider === provider && !this.use(k.id).refused && this.use(k.id).restUntil <= t,
    );
    ok.sort((a, b) => this.use(a.id).lastUsed - this.use(b.id).lastUsed);
    return ok[0] ?? null;
  }
  /** How many keys of the provider can be used now. */
  available(provider: VaultKey['provider']): number {
    const t = this.now();
    return this.need().filter(
      (k) => k.provider === provider && !this.use(k.id).refused && this.use(k.id).restUntil <= t,
    ).length;
  }
  record(
    id: string,
    r: {
      tokensIn?: number;
      tokensOut?: number;
      costUsd?: number | null;
      remainingRequests?: number | null;
      remainingTokens?: number | null;
    },
  ): void {
    const u = this.use(id);
    u.calls++;
    u.lastUsed = this.now();
    u.tokensIn += r.tokensIn ?? 0;
    u.tokensOut += r.tokensOut ?? 0;
    u.costUsd += r.costUsd ?? 0;
    if (r.remainingRequests !== undefined && r.remainingRequests !== null)
      u.remainingRequests = r.remainingRequests;
    if (r.remainingTokens !== undefined && r.remainingTokens !== null) u.remainingTokens = r.remainingTokens;
    u.lastError = null;
    this.persistUsage();
  }
  /** An error on a key: 429 → rest (Retry-After, else 60 s), 401 / 403 → refused until the key is replaced. */
  fail(id: string, status: number, message: string, retryAfterS?: number | null): void {
    const u = this.use(id);
    u.errors++;
    u.lastUsed = this.now();
    u.lastError = message.slice(0, 200);
    if (status === 429) u.restUntil = this.now() + Math.max(1, retryAfterS ?? 60) * 1000;
    if (status === 401 || status === 403) u.refused = true;
    this.persistUsage();
  }
  /** Puts a set-aside key back in rotation (after the user fixed it). */
  reset(id: string): void {
    const u = this.use(id);
    u.refused = false;
    u.restUntil = 0;
    u.lastError = null;
    this.persistUsage();
  }
  /** The secret of a key — only for the HTTP call itself. */
  secret(id: string): string {
    return this.need().find((k) => k.id === id)?.key ?? '';
  }
}
