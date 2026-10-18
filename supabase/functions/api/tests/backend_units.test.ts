// Small pure modules: phone numbers, configuration loading, identifiers and routing helpers.
import { assert, assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1.0.13";
import { formatSnMobile, normalizeSnMobile } from "../lib/phone.ts";
import { DEFAULT_RETURN_PREFIXES, envFrom, loadConfig } from "../lib/config.ts";
import { constantTimeEqual, hashIp, newAccessToken, newOrderId, ORDER_ID_RE, sha256Hex } from "../lib/ids.ts";
import { routePath } from "../lib/http.ts";
import { cleanText, validateOrderRequest } from "../lib/validate.ts";
import { generateDocument } from "../lib/generator/index.ts";
import { serviceKeyFromEnv } from "../lib/store_supabase.ts";

Deno.test("normalizeSnMobile accepts the usual ways of writing a Senegal mobile", () => {
  for (const input of ["77 123 45 67", "771234567", "+221771234567", "00221771234567", "221 77 123 45 67", " +221 77-123-45-67 ", "(77) 123.45.67"]) {
    assertEquals(normalizeSnMobile(input), "+221771234567", input);
  }
  for (const prefix of ["70", "71", "75", "76", "77", "78"]) assertEquals(normalizeSnMobile(`${prefix}1234567`), `+221${prefix}1234567`);
  for (const bad of ["", "33 123 45 67", "72 123 45 67", "79 123 45 67", "7712345678", "77123456", "+33612345678", "+221 77 123 45 6x", "abc"]) {
    assertEquals(normalizeSnMobile(bad), null, bad);
  }
  assertEquals(normalizeSnMobile(undefined as unknown as string), null);
});

Deno.test("formatSnMobile groups digits for display", () => {
  assertEquals(formatSnMobile("+221771234567"), "+221 77 123 45 67");
  assertEquals(formatSnMobile("781112233"), "+221 78 111 22 33");
  assertEquals(formatSnMobile(" +33 6 12 "), "+33 6 12");
});

Deno.test("loadConfig: defaults from SPEC.md", () => {
  const c = loadConfig(envFrom({}));
  assertEquals(c, {
    waveApiKey: null,
    waveWebhookSecret: null,
    waveWebhookMode: "signing",
    ownerWaveMobile: null,
    payoutEnabled: false,
    payoutMin: 1000,
    payoutReserve: 0,
    waveFeeRate: 0.01,
    payoutFeeRate: 0.01,
    manualWaveNumber: null,
    phoneHookKey: null,
    manualAutoConfirm: true,
    ownerWhatsapp: null,
    adminKey: null,
    cronSecret: null,
    allowedReturnPrefixes: [...DEFAULT_RETURN_PREFIXES],
    prices: { cv: 1000, lettre: 1000, pack: 1500, stage: 1500, premium: 5000 },
    stageMultiPrice: 2500,
    openrouterApiKey: null,
    llmModel: "google/gemini-2.5-flash",
    previewRateLimitPerHour: 12,
    brandName: "Teranga CV",
  });
  assert(c.allowedReturnPrefixes.every((p) => p.startsWith("https://")), "production never allows http");
});

Deno.test("loadConfig: env wins over tcv.settings, blank env falls back to settings", () => {
  const settings = { ADMIN_KEY: "from-db", CRON_SECRET: "cron-db", OWNER_WAVE_MOBILE: "77 123 45 67", PRICE_PACK: "2000", PAYOUT_ENABLED: "true" };
  const c = loadConfig(envFrom({ ADMIN_KEY: "from-env", CRON_SECRET: "   ", PRICE_PACK: "1800" }), settings);
  assertEquals([c.adminKey, c.cronSecret, c.ownerWaveMobile, c.prices.pack, c.payoutEnabled], ["from-env", "cron-db", "+221771234567", 1800, true]);
  assertEquals(c.ownerWhatsapp, "221771234567");
});

Deno.test("loadConfig: parsing rules and fallbacks", () => {
  const c = loadConfig(envFrom({
    WAVE_WEBHOOK_MODE: "shared",
    OWNER_WAVE_MOBILE: "+33 6 12 34 56 78",
    PAYOUT_ENABLED: "TRUE",
    PAYOUT_MIN: "abc",
    PAYOUT_RESERVE: "-5",
    WAVE_FEE_RATE: "1.5",
    PAYOUT_FEE_RATE: "0.02",
    MANUAL_WAVE_NUMBER: "770001122",
    PRICE_CV: "0",
    PREVIEW_RATE_LIMIT_PER_HOUR: "30",
    ALLOWED_RETURN_PREFIXES: "http://evil.example/, https://example.org/site ,https://ok.example/",
  }));
  assertEquals(c.waveWebhookMode, "shared");
  assertEquals(c.ownerWaveMobile, null, "invalid number disables payouts");
  assertEquals(c.payoutEnabled, false, 'only the exact string "true" enables payouts');
  assertEquals([c.payoutMin, c.payoutReserve, c.waveFeeRate, c.payoutFeeRate], [1000, 0, 0.01, 0.02]);
  assertEquals([c.manualWaveNumber, c.ownerWhatsapp], ["+221770001122", "221770001122"]);
  assertEquals([c.prices.cv, c.previewRateLimitPerHour], [1000, 30]);
  assertEquals(c.allowedReturnPrefixes, ["https://example.org/site/", "https://ok.example/"]);
  assertEquals(loadConfig(envFrom({ ALLOWED_RETURN_PREFIXES: "http://x/" })).allowedReturnPrefixes, [...DEFAULT_RETURN_PREFIXES]);
  assertEquals(loadConfig(envFrom({ OWNER_WHATSAPP: "+221 70 111 22 33", MANUAL_WAVE_NUMBER: "770001122" })).ownerWhatsapp, "221701112233");
});

Deno.test("serviceKeyFromEnv: legacy service role key or SUPABASE_SECRET_KEYS.default", () => {
  assertEquals(serviceKeyFromEnv(envFrom({ SUPABASE_SERVICE_ROLE_KEY: "legacy", SUPABASE_SECRET_KEYS: '{"default":"new"}' })), "legacy");
  assertEquals(serviceKeyFromEnv(envFrom({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x"}' })), "sb_secret_x");
  assertEquals(serviceKeyFromEnv(envFrom({ SUPABASE_SECRET_KEYS: "not json" })), null);
  assertEquals(serviceKeyFromEnv(envFrom({})), null);
});

Deno.test("ids: order ids, tokens and hashes", async () => {
  const ids = new Set(Array.from({ length: 2000 }, newOrderId));
  assertEquals(ids.size, 2000);
  for (const id of ids) assertMatch(id, ORDER_ID_RE);
  assertEquals(ORDER_ID_RE.test("TCV-ABCDEFGI"), false, "I is not Crockford");
  const t = newAccessToken();
  assertMatch(t, /^[A-Za-z0-9_-]{32}$/);
  assertNotEquals(t, newAccessToken());
  assertEquals(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assertEquals((await hashIp("1.2.3.4", "p")).length, 32);
  assertNotEquals(await hashIp("1.2.3.4", "p"), await hashIp("1.2.3.4", "q"));
});

Deno.test("constantTimeEqual", () => {
  assert(constantTimeEqual("abc", "abc"));
  assert(constantTimeEqual("", ""));
  assertEquals(constantTimeEqual("abc", "abd"), false);
  assertEquals(constantTimeEqual("abc", "abcd"), false);
  assertEquals(constantTimeEqual("abcd", "abc"), false);
  assertEquals(constantTimeEqual("", "a"), false);
  assertEquals(constantTimeEqual("é", "e"), false);
});

Deno.test("routePath strips everything up to the first api segment", () => {
  assertEquals(routePath("/functions/v1/api/orders/TCV-1/checkout"), "/orders/TCV-1/checkout");
  assertEquals(routePath("/api/orders"), "/orders");
  assertEquals(routePath("/api"), "/");
  assertEquals(routePath("/api/orders/"), "/orders");
  assertEquals(routePath("/orders"), "/orders");
});

Deno.test("cleanText", () => {
  assertEquals(cleanText("  a \t b  "), "a b");
  assertEquals(cleanText("a\nb"), "a b");
  assertEquals(cleanText(" a \n\n  b  \r\n c ", true), "a\nb\nc");
  assertEquals(cleanText("x\u0000y\u001fz\u007f"), "xyz");
  // Decomposed accents (e + U+0301, as pasted from some documents) are composed: "é" is one character.
  assertEquals(cleanText("Université Assane Seck"), "Université Assane Seck");
  assertEquals(cleanText("Diplôme\npièces", true), "Diplôme\npièces");
});

Deno.test("decomposed accents typed by the customer are never doubled in the documents", () => {
  // Regression: the copy-editor restores accents on words typed without one, and its word pattern stops at a
  // combining mark, so "Universite" + U+0301 came out as "Université" + U+0301 (two accents on the "e").
  const data = {
    identity: { civility: "M", firstName: "Sékou", lastName: "Diatta", phone: "77 900 12 12", city: "Ziguinchor" },
    target: { jobTitle: "Comptable", kind: "emploi", sector: "comptabilite", level: "junior" },
    education: [{ degree: "Diplôme universitaire de technologie", school: "Université Assane Seck", year: "2022" }],
    experiences: [{ title: "Aide-comptable", company: "Groupe Kirène", missions: "Préparation des déclarations" }],
    skills: ["Comptabilité générale"],
    it: [],
    languages: [],
    interests: [],
    letter: { company: "Société générale", qualities: ["Rigueur"], motivation: "Votre réseau d'agences me motive." },
  };
  const v = validateOrderRequest({ product: "pack", template: "classique", data });
  assert(v.ok);
  const doc = generateDocument(v.data, "pack", { seed: "TCV-NFC00001", now: new Date("2026-10-18T10:00:00Z") });
  const text = JSON.stringify(doc);
  assert(!/\p{M}/u.test(text), "no combining mark left in the document");
  for (const w of ["Université Assane Seck", "Comptabilité générale", "Diplôme universitaire", "Groupe Kirène", "Sékou", "réseau"]) {
    assert(text.includes(w), w);
  }
});
