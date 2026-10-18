// Runtime configuration from environment variables, with the defaults defined in SPEC.md.
import type { Config } from "./types.ts";
import { normalizeSnMobile } from "./phone.ts";

export interface EnvReader {
  get(key: string): string | undefined;
}

/** Production return-URL prefixes. https only: `http://localhost:8787/` is added by dev.ts alone. */
export const DEFAULT_RETURN_PREFIXES = [
  "https://ndoyepapamassamba-commits.github.io/Add-a-README-file/",
  "https://rawcdn.githack.com/ndoyepapamassamba-commits/Add-a-README-file/",
  "https://raw.githack.com/ndoyepapamassamba-commits/Add-a-README-file/",
];

export const DEFAULT_LLM_MODEL = "google/gemini-2.5-flash";

function str(env: EnvReader, key: string): string | null {
  const v = env.get(key)?.trim();
  return v ? v : null;
}

function int(env: EnvReader, key: string, fallback: number, min = 0): number {
  const raw = str(env, key);
  if (raw === null || !/^-?\d+$/.test(raw)) return fallback;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= min ? n : fallback;
}

function rate(env: EnvReader, key: string, fallback: number): number {
  const raw = str(env, key);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n < 1 ? n : fallback;
}

function digits(s: string | null): string | null {
  const d = (s ?? "").replace(/\D/g, "");
  return d ? d : null;
}

/** Comma list of prefixes; non-https entries are dropped (validation refuses them outside dev). */
function returnPrefixes(env: EnvReader): string[] {
  const raw = str(env, "ALLOWED_RETURN_PREFIXES");
  if (raw === null) return [...DEFAULT_RETURN_PREFIXES];
  const list = raw.split(",").map((p) => p.trim()).filter((p) => p.startsWith("https://"))
    .map((p) => (p.endsWith("/") ? p : p + "/"));
  return list.length ? list : [...DEFAULT_RETURN_PREFIXES];
}

export function loadConfig(env: EnvReader): Config {
  const ownerWaveMobile = normalizeSnMobile(str(env, "OWNER_WAVE_MOBILE") ?? "");
  const manualWaveNumber = normalizeSnMobile(str(env, "MANUAL_WAVE_NUMBER") ?? "");
  return {
    waveApiKey: str(env, "WAVE_API_KEY"),
    waveWebhookSecret: str(env, "WAVE_WEBHOOK_SECRET"),
    waveWebhookMode: str(env, "WAVE_WEBHOOK_MODE") === "shared" ? "shared" : "signing",
    ownerWaveMobile,
    payoutEnabled: str(env, "PAYOUT_ENABLED") === "true",
    payoutMin: int(env, "PAYOUT_MIN", 1000, 1),
    payoutReserve: int(env, "PAYOUT_RESERVE", 0),
    waveFeeRate: rate(env, "WAVE_FEE_RATE", 0.01),
    payoutFeeRate: rate(env, "PAYOUT_FEE_RATE", 0.01),
    manualWaveNumber,
    ownerWhatsapp: digits(str(env, "OWNER_WHATSAPP")) ?? digits(manualWaveNumber ?? ownerWaveMobile),
    adminKey: str(env, "ADMIN_KEY"),
    cronSecret: str(env, "CRON_SECRET"),
    allowedReturnPrefixes: returnPrefixes(env),
    prices: {
      cv: int(env, "PRICE_CV", 1000, 1),
      lettre: int(env, "PRICE_LETTRE", 1000, 1),
      pack: int(env, "PRICE_PACK", 1500, 1),
    },
    openrouterApiKey: str(env, "OPENROUTER_API_KEY"),
    llmModel: str(env, "LLM_MODEL") ?? DEFAULT_LLM_MODEL,
    previewRateLimitPerHour: int(env, "PREVIEW_RATE_LIMIT_PER_HOUR", 12, 1),
    brandName: str(env, "BRAND_NAME") ?? "Teranga CV",
  };
}

/** Plain-object env reader, handy for tests and dev. */
export function envFrom(values: Record<string, string | undefined>): EnvReader {
  return { get: (k) => values[k] };
}
