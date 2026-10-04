import fs from 'node:fs';
import path from 'node:path';
import type { ModelInfo } from '@shared/types';
import type { LLMProvider } from './types';

const TTL_MS = 60 * 60 * 1000;

/**
 * Live model catalog fetched from the provider, cached in memory (1h) and on
 * disk so the app still knows prices/capabilities when offline.
 */
export class ModelCatalog {
  private models: ModelInfo[] = [];
  private byId = new Map<string, ModelInfo>();
  private fetchedAt = 0;
  private inflight: Promise<ModelInfo[]> | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly provider: LLMProvider,
    private readonly cacheFile: string,
  ) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as { fetchedAt: number; models: ModelInfo[] };
      if (Array.isArray(cached.models) && cached.models[0]?.efforts) this.set(cached.models, cached.fetchedAt);
    } catch {
      /* no cache yet */
    }
  }

  private set(models: ModelInfo[], fetchedAt: number): void {
    // Hide batch-only variants: they cannot stream interactive answers.
    this.models = models.filter((m) => !m.id.endsWith(':batch'));
    this.byId = new Map(this.models.map((m) => [m.id, m]));
    this.fetchedAt = fetchedAt;
  }

  async list(force = false): Promise<ModelInfo[]> {
    if (!force && this.models.length && Date.now() - this.fetchedAt < TTL_MS) return this.models;
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const models = await this.provider.listModels();
        this.set(models, Date.now());
        this.lastError = null;
        fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
        fs.writeFileSync(this.cacheFile, JSON.stringify({ fetchedAt: this.fetchedAt, models }));
      } catch (err) {
        this.lastError = (err as Error).message;
        if (!this.models.length) throw err;
      } finally {
        this.inflight = null;
      }
      return this.models;
    })();
    return this.inflight;
  }

  get(id: string): ModelInfo | undefined {
    return this.byId.get(id);
  }

  get all(): ModelInfo[] {
    return this.models;
  }

  get status(): { count: number; fetchedAt: number; error: string | null } {
    return { count: this.models.length, fetchedAt: this.fetchedAt, error: this.lastError };
  }

  /** Cost estimate from published prices (USD). Null when prices are unknown. */
  estimateCost(modelId: string, promptTokens: number, completionTokens: number): number | null {
    const m = this.byId.get(modelId);
    if (!m || m.inputPrice === null || m.outputPrice === null) return null;
    return (promptTokens * m.inputPrice + completionTokens * m.outputPrice) / 1_000_000;
  }
}
