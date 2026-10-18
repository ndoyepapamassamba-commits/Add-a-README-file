// Supabase Edge Function `api`. Config = env (wins) over tcv.settings, reloaded at most every 60 s per instance.
import { createReloadingApp } from "./lib/app.ts";
import { makeEnhancer } from "./lib/llm.ts";
import { createSupabaseStore, serviceKeyFromEnv } from "./lib/store_supabase.ts";
import { HttpWaveClient } from "./lib/wave.ts";

const envGet = (key: string) => Deno.env.get(key);

const supabaseUrl = envGet("SUPABASE_URL");
const serviceKey = serviceKeyFromEnv(envGet);
if (!supabaseUrl || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEYS) must be set");
}

const handler = createReloadingApp({
  store: createSupabaseStore(supabaseUrl, serviceKey),
  envGet,
  services: (config) => ({
    wave: config.waveApiKey ? new HttpWaveClient({ apiKey: config.waveApiKey }) : null,
    enhance: config.openrouterApiKey ? makeEnhancer({ apiKey: config.openrouterApiKey, model: config.llmModel }) : undefined,
  }),
});

Deno.serve(handler);
