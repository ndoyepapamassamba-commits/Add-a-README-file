// createReloadingApp (index.ts): env over tcv.settings, 60 s snapshot, shared reloads, failure tolerance.
import { assertEquals } from "jsr:@std/assert@1.0.13";
import { createReloadingApp } from "../lib/app.ts";
import { envFrom } from "../lib/config.ts";
import { MemoryStore } from "../lib/store_memory.ts";
import type { Config } from "../lib/types.ts";
import { captureLogs, Clock } from "./fixtures/backend_harness.ts";

function setup(env: Record<string, string>, settings: Record<string, string>) {
  captureLogs();
  const clock = new Clock();
  const store = new MemoryStore({ settings });
  const built: Config[] = [];
  const app = createReloadingApp({
    store,
    envGet: envFrom(env),
    now: clock.now,
    services: (config) => {
      built.push(config);
      return { wave: null };
    },
  });
  const config = async () => (await app(new Request("http://x/functions/v1/api/config"))).json();
  const stats = (key: string) => app(new Request("http://x/api/admin/stats", { headers: { authorization: `Bearer ${key}` } }));
  return { clock, store, built, app, config, stats };
}

Deno.test("reloading app: settings rows configure the function, env vars win", async () => {
  const s = setup({ BRAND_NAME: "Env Brand" }, { BRAND_NAME: "Db Brand", MANUAL_WAVE_NUMBER: "770001122", ADMIN_KEY: "db-key" });
  const cfg = await s.config();
  assertEquals(cfg.brandName, "Env Brand");
  assertEquals(cfg.payment.manualWaveNumber, "+221 77 000 11 22");
  assertEquals((await s.stats("db-key")).status, 200, "ADMIN_KEY read from tcv.settings");
});

Deno.test("reloading app: PHONE_HOOK_KEY and PUBLIC_API_BASE from tcv.settings build the admin MacroDroid link", async () => {
  const s = setup({}, {
    ADMIN_KEY: "db-key",
    PHONE_HOOK_KEY: "db-phone-secret",
    PUBLIC_API_BASE: "https://api.example.org/functions/v1/api",
  });
  const stats = await s.stats("db-key");
  assertEquals(stats.status, 200);
  assertEquals((await stats.json()).health.phoneHookUrl, "https://api.example.org/functions/v1/api/payments/notify?k=db-phone-secret");
  const refused = await s.stats("wrong");
  assertEquals(refused.status, 401);
  assertEquals((await refused.text()).includes("db-phone-secret"), false);
  assertEquals(JSON.stringify(await s.config()).includes("db-phone-secret"), false, "/config never shows the key");
});

Deno.test("reloading app: settings are reloaded at most once per 60 s", async () => {
  const s = setup({}, { PRICE_CV: "1000" });
  assertEquals((await s.config()).prices.cv, 1000);
  s.store.settings.PRICE_CV = "1200";
  s.clock.advance(59_000);
  assertEquals((await s.config()).prices.cv, 1000, "still the cached snapshot");
  s.clock.advance(1_000);
  assertEquals((await s.config()).prices.cv, 1200);
  assertEquals(s.built.length, 2);
});

Deno.test("reloading app: concurrent requests share one reload; a failed reload keeps the last values", async () => {
  const s = setup({}, { BRAND_NAME: "Teranga" });
  let loads = 0;
  const original = s.store.getSettings.bind(s.store);
  s.store.getSettings = () => {
    loads++;
    return original();
  };
  await Promise.all(Array.from({ length: 5 }, () => s.config()));
  assertEquals(loads, 1);

  s.store.getSettings = () => Promise.reject(new Error("db unavailable"));
  s.clock.advance(60_000);
  const cfg = await s.config();
  assertEquals(cfg.brandName, "Teranga", "previous settings kept");
});
