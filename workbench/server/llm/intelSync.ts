import fs from 'node:fs';
import path from 'node:path';
import type { ModelInfo } from '@shared/types';
import { INTEL_ENDPOINT, intelData, parseIntel, setIntelData, type IntelData } from './modelIntel';

const TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Keeps the routing scores current: Artificial Analysis indices as published by
 * OpenRouter, refreshed server-side (no CORS limits) and cached on disk, so
 * models added to OpenRouter later get measured scores without a new release.
 */
export class IntelSync {
  private inflight: Promise<IntelData> | null = null;
  lastError: string | null = null;

  constructor(
    private readonly cacheFile: string,
    private readonly fetchJson: (url: string) => Promise<unknown>,
    private readonly enabled: boolean,
  ) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as IntelData;
      if (cached.fetchedAt > intelData().fetchedAt) setIntelData(cached);
    } catch {
      /* no cache yet: built-in snapshot */
    }
  }

  get stale(): boolean {
    return Date.now() - Date.parse(intelData().fetchedAt || '1970-01-01') > TTL_MS;
  }

  /** Fetches the latest scores; on failure the current ones stay in use. */
  refresh(models: ModelInfo[]): Promise<IntelData> {
    if (!this.enabled)
      return Promise.reject(new Error('actualisation désactivée (fournisseur non OpenRouter)'));
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const payload = (await this.fetchJson(INTEL_ENDPOINT)) as { data?: never[] };
        const d = parseIntel(
          payload,
          models.map((m) => ({ id: m.id, canonical_slug: m.slug })),
        );
        if (!setIntelData(d)) throw new Error('réponse sans score');
        fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
        fs.writeFileSync(this.cacheFile, JSON.stringify(d));
        this.lastError = null;
        return d;
      } catch (err) {
        this.lastError = (err as Error).message;
        throw err;
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }
}
