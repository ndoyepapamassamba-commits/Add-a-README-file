// Error classification and retry policy for media calls. Retries only for transient errors.
import type { ErrorClass } from './types';

export interface Classified {
  cls: ErrorClass;
  /** Safe to retry automatically (429, 5xx, network) — never for a call that was already paid. */
  transient: boolean;
  message: string;
}

const MSG: Record<ErrorClass, string> = {
  AUTH_ERROR: 'Clé OpenRouter refusée (401/403). Vérifiez-la dans Réglages.',
  RATE_LIMIT: 'Limite de débit atteinte (429). Nouvelle tentative espacée.',
  INVALID_PARAMETER: 'Paramètre invalide pour ce modèle.',
  UNSUPPORTED_CAPABILITY:
    'Capability unavailable in current environment : ce modèle ne supporte pas la configuration demandée.',
  TIMEOUT: 'Délai dépassé.',
  SERVER_ERROR: 'Erreur du fournisseur ou du réseau.',
  CONTENT_ERROR: 'Contenu refusé par le filtre du fournisseur.',
  INSUFFICIENT_CREDITS: 'Crédits OpenRouter insuffisants (402).',
  UNKNOWN: 'Erreur inconnue.',
};

/** Classifies an HTTP status + provider message (or a thrown error) into the studio's error classes. */
export function classifyError(input: { status?: number; message?: string; name?: string }): Classified {
  const status = input.status ?? 0;
  const text = (input.message ?? '').toLowerCase();
  const done = (cls: ErrorClass, transient: boolean): Classified => ({
    cls,
    transient,
    message: `${MSG[cls]}${input.message ? ` — ${input.message.slice(0, 200)}` : ''}`,
  });
  if (input.name === 'AbortError' || /timeout|timed out|délai/.test(text) || status === 408 || status === 504)
    return done('TIMEOUT', true);
  if (status === 401 || status === 403) return done('AUTH_ERROR', false);
  if (status === 402 || (/insufficient|credits|quota exceeded/.test(text) && status !== 429))
    return done('INSUFFICIENT_CREDITS', false);
  if (status === 429 || /rate.?limit|too many/.test(text)) return done('RATE_LIMIT', true);
  if (/moderat|safety|policy|content.?filter|blocked|nsfw|prohibited/.test(text))
    return done('CONTENT_ERROR', false);
  if (status === 404 || /no endpoints|not support|unsupported|does not support/.test(text))
    return done('UNSUPPORTED_CAPABILITY', false);
  if (status === 400 || status === 422 || /invalid|must be|unknown parameter|required/.test(text))
    return done('INVALID_PARAMETER', false);
  if (status >= 500 || (status === 0 && /failed to fetch|network|load failed|econn/.test(text)))
    return done('SERVER_ERROR', true);
  return done('UNKNOWN', false);
}

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Called before each retry. */
  onRetry?: (attempt: number, c: Classified) => void;
  shouldStop?: () => boolean;
}
export class StudioError extends Error {
  constructor(
    public cls: ErrorClass,
    message: string,
    public status = 0,
    public transient = false,
    public paid = false,
  ) {
    super(message);
  }
}

/** Runs `fn` with exponential back-off, retrying ONLY transient errors. Returns the number of retries used. */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  o: RetryOptions = {},
): Promise<{ value: T; retries: number }> {
  const max = o.retries ?? 2;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: unknown;
  for (let attempt = 0; attempt <= max; attempt++) {
    try {
      return { value: await fn(attempt), retries: attempt };
    } catch (e) {
      last = e;
      const c =
        e instanceof StudioError
          ? { cls: e.cls, transient: e.transient && !e.paid, message: e.message }
          : classifyError({ message: (e as Error)?.message, name: (e as Error)?.name });
      if (!c.transient || attempt >= max || o.shouldStop?.()) throw e;
      o.onRetry?.(attempt + 1, c);
      await sleep(Math.min(o.maxMs ?? 8000, (o.baseMs ?? 800) * 2 ** attempt));
    }
  }
  throw last;
}
