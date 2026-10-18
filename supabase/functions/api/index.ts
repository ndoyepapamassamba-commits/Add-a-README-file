// Supabase Edge Function `api`. Config = env (wins) over tcv.settings, reloaded at most every 60 s per instance.
import { createApp } from "./lib/app.ts";
import { loadConfig, SETTINGS_TTL_MS } from "./lib/config.ts";
import { log } from "./lib/http.ts";
import { makeEnhancer } from "./lib/llm.ts";
import { createSupabaseStore, serviceKeyFromEnv } from "./lib/store_supabase.ts";
import { HttpWaveClient } from "./lib/wave.ts";
import type { Store } from "./lib/types.ts";

const envGet = (key: string) => Deno.env.get(key);

const supabaseUrl = envGet("SUPABASE_URL");
const serviceKey = serviceKeyFromEnv(envGet);
if (!supabaseUrl || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEYS) must be set");
}
const store: Store = createSupabaseStore(supabaseUrl, serviceKey);

type Handler = (req: Request) => Promise<Response>;

let current: { handler: Handler; settings: Record<string, string>; loadedAt: number } | null = null;
let loading: Promise<Handler> | null = null;

async function buildHandler(): Promise<Handler> {
  let settings = current?.settings ?? {};
  try {
    settings = await store.getSettings();
  } catch (err) {
    log.error("settings: tcv_get_settings failed, keeping the previous values", err);
  }
  const config = loadConfig(envGet, settings);
  const handler = createApp({
    store,
    config,
    wave: config.waveApiKey ? new HttpWaveClient({ apiKey: config.waveApiKey }) : null,
    enhance: config.openrouterApiKey ? makeEnhancer({ apiKey: config.openrouterApiKey, model: config.llmModel }) : undefined,
    now: () => new Date(),
  });
  current = { handler, settings, loadedAt: Date.now() };
  return handler;
}

function handlerForRequest(): Promise<Handler> {
  if (current && Date.now() - current.loadedAt < SETTINGS_TTL_MS) return Promise.resolve(current.handler);
  loading ??= buildHandler().finally(() => {
    loading = null;
  });
  return loading;
}

Deno.serve(async (req) => (await handlerForRequest())(req));
