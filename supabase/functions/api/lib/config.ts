// Runtime configuration: env vars (win) merged over tcv.settings rows, with the defaults from SPEC.md.
import type { Config } from "./types.ts";
import { normalizeSnMobile } from "./phone.ts";

export type EnvGet = (key: string) => string | undefined;

/** Production return-URL prefixes. https only: `http://localhost:8787/` is added by dev.ts alone. */
export const DEFAULT_RETURN_PREFIXES: readonly string[] = [
  "https://ndoyepapamassamba-commits.github.io/Add-a-README-file/",
  "https://rawcdn.githack.com/ndoyepapamassamba-commits/Add-a-README-file/",
  "https://raw.githack.com/ndoyepapamassamba-commits/Add-a-README-file/",
];

export const DEFAULT_LLM_MODEL = "google/gemini-2.5-flash";

/** How long index.ts keeps the tcv.settings snapshot before reloading it. */
export const SETTINGS_TTL_MS = 60_000;

type Get = (key: string) => string | null;

/** Env value when non-blank, else the settings value when non-blank, else null. */
function reader(envGet: EnvGet, settings: Record<string, string>): Get {
  return (key) => {
    const fromEnv = envGet(key)?.trim();
    if (fromEnv) return fromEnv;
    const fromDb = typeof settings[key] === "string" ? settings[key].trim() : "";
    return fromDb || null;
  };
}

function int(get: Get, key: string, fallback: number, min = 0): number {
  const raw = get(key);
  if (raw === null || !/^-?\d+$/.test(raw)) return fallback;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= min ? n : fallback;
}

function rate(get: Get, key: string, fallback: number): number {
  const raw = get(key);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n < 1 ? n : fallback;
}

function digits(s: string | null): string | null {
  const d = (s ?? "").replace(/\D/g, "");
  return d || null;
}

/** Comma list of prefixes; non-https entries are dropped (only dev.ts may allow http://localhost). */
function returnPrefixes(get: Get): string[] {
  const raw = get("ALLOWED_RETURN_PREFIXES");
  if (raw === null) return [...DEFAULT_RETURN_PREFIXES];
  const list = raw.split(",").map((p) => p.trim()).filter((p) => p.startsWith("https://"))
    .map((p) => (p.endsWith("/") ? p : p + "/"));
  return list.length ? list : [...DEFAULT_RETURN_PREFIXES];
}

export function loadConfig(envGet: EnvGet, settings: Record<string, string> = {}): Config {
  const get = reader(envGet, settings);
  const ownerWaveMobile = normalizeSnMobile(get("OWNER_WAVE_MOBILE") ?? "");
  const manualWaveNumber = normalizeSnMobile(get("MANUAL_WAVE_NUMBER") ?? "");
  return {
    waveApiKey: get("WAVE_API_KEY"),
    waveWebhookSecret: get("WAVE_WEBHOOK_SECRET"),
    waveWebhookMode: get("WAVE_WEBHOOK_MODE") === "shared" ? "shared" : "signing",
    ownerWaveMobile,
    payoutEnabled: get("PAYOUT_ENABLED") === "true",
    payoutMin: int(get, "PAYOUT_MIN", 1000, 1),
    payoutReserve: int(get, "PAYOUT_RESERVE", 0),
    waveFeeRate: rate(get, "WAVE_FEE_RATE", 0.01),
    payoutFeeRate: rate(get, "PAYOUT_FEE_RATE", 0.01),
    manualWaveNumber,
    ownerWhatsapp: digits(get("OWNER_WHATSAPP")) ?? digits(manualWaveNumber ?? ownerWaveMobile),
    adminKey: get("ADMIN_KEY"),
    cronSecret: get("CRON_SECRET"),
    allowedReturnPrefixes: returnPrefixes(get),
    prices: {
      cv: int(get, "PRICE_CV", 1000, 1),
      lettre: int(get, "PRICE_LETTRE", 1000, 1),
      pack: int(get, "PRICE_PACK", 1500, 1),
    },
    openrouterApiKey: get("OPENROUTER_API_KEY"),
    llmModel: get("LLM_MODEL") ?? DEFAULT_LLM_MODEL,
    previewRateLimitPerHour: int(get, "PREVIEW_RATE_LIMIT_PER_HOUR", 12, 1),
    brandName: get("BRAND_NAME") ?? "Teranga CV",
  };
}

/** Plain-object env lookup, handy for tests and dev. */
export function envFrom(values: Record<string, string | undefined>): EnvGet {
  return (key) => values[key];
}
