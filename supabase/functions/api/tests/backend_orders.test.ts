// Orders API (create, read, template), validation errors, honeypot, rate limits and HTTP plumbing.
import { assert, assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1.0.13";
import { ORDER_ID_RE } from "../lib/ids.ts";
import type { Document } from "../lib/types.ts";
import { ADMIN_KEY, createOrder, DAY, HOUR, makeHarness, orderBody, orderData } from "./fixtures/backend_harness.ts";
import type { Json } from "./fixtures/backend_harness.ts";

const MASKED = /^[█\s]*$/;

Deno.test("POST /orders creates a preview order with its token and a redacted preview", async () => {
  const h = makeHarness();
  const res = await h.call("POST", "/orders", { body: orderBody("pack") });
  assertEquals(res.status, 201);
  const { order, preview } = res.body;
  assertMatch(order.id, ORDER_ID_RE);
  assertMatch(order.token, /^[A-Za-z0-9_-]{32}$/);
  assertEquals(
    { ...order, id: "", token: "", createdAt: "" },
    { id: "", token: "", product: "pack", template: "classique", amount: 1500, currency: "XOF", status: "preview", paymentMethod: null, paidAt: null, createdAt: "" },
  );
  assertEquals(order.createdAt, h.clock.iso());
  assert(preview.cv && preview.lettre);
  assertMatch(preview.cv.experiences[0].bullets[0], MASKED);

  const row = await h.store.getOrder(order.id);
  assert(row && row.access_token_hash !== order.token && row.access_token_hash.length === 64);
  assertEquals(row.input?.identity.phone, "+221771234567", "Senegal numbers are stored in E.164");
  assertEquals([row.ip_hash?.length, row.status], [32, "preview"]);
  assertEquals(JSON.stringify(row).includes("203.0.113.7"), false, "the raw IP is never stored");
  assertNotEquals(JSON.stringify(preview), JSON.stringify(row.document));
});

Deno.test("prices follow the product and the PRICE_* settings", async () => {
  const h = makeHarness({ env: { PRICE_CV: "900" } });
  const cv = await h.call("POST", "/orders", { body: orderBody("cv") });
  const lettre = await h.call("POST", "/orders", { body: orderBody("lettre") });
  assertEquals([cv.body.order.amount, lettre.body.order.amount], [900, 1000]);
  assertEquals([cv.body.preview.lettre, lettre.body.preview.cv], [null, null]);
});

Deno.test("GET /orders/:id returns the redacted preview before payment and the full document after", async () => {
  const h = makeHarness();
  const { id, token } = await createOrder(h);
  const before = await h.call("GET", `/orders/${id}?t=${token}`);
  assertEquals(before.status, 200);
  assertEquals(Object.keys(before.body).sort(), ["order", "preview"]);
  assertEquals(before.body.order.status, "preview");
  assertMatch(before.body.preview.cv.experiences[0].bullets[0], MASKED);

  const unlock = await h.call("POST", `/admin/orders/${id}/unlock`, { headers: { authorization: `Bearer ${ADMIN_KEY}` } });
  assertEquals(unlock.body, { ok: true, changed: true });
  const after = await h.call("GET", `/orders/${id}?t=${token}`);
  assertEquals(Object.keys(after.body).sort(), ["document", "order"]);
  assertEquals([after.body.order.status, after.body.order.paymentMethod], ["paid", "manual"]);
  const stored = (await h.store.getOrder(id))!.document as Document;
  assertEquals(after.body.document, stored);
  assertEquals(after.body.document.cv.experiences[0].bullets[0], "Saisie des pièces comptables");
});

Deno.test("GET /orders/:id: unknown id, wrong or missing token are all 404", async () => {
  const h = makeHarness();
  const { id, token } = await createOrder(h);
  for (const path of [`/orders/${id}?t=${token}x`, `/orders/${id}`, `/orders/${id}?t=`, `/orders/TCV-ZZZZZZZZ?t=${token}`, `/orders/nope?t=${token}`, `/orders/%E0%A4%A?t=x`]) {
    const res = await h.call("GET", path);
    assertEquals([res.status, res.body.error], [404, "not_found"], path);
  }
});

Deno.test("GET /orders/:id on a purged order is 410", async () => {
  const h = makeHarness();
  const { id, token } = await createOrder(h);
  const later = new Date(h.clock.t + 4 * DAY).toISOString();
  assertEquals(await h.store.purge(later, later, later), 1);
  const res = await h.call("GET", `/orders/${id}?t=${token}`);
  assertEquals([res.status, res.body.error], [410, "purged"]);
  const wrong = await h.call("GET", `/orders/${id}?t=bad`);
  assertEquals(wrong.status, 404, "the token is checked before revealing the purge");
  const tpl = await h.call("POST", `/orders/${id}/template`, { body: { t: token, template: "moderne" } });
  assertEquals(tpl.status, 410);
});

Deno.test("POST /orders/:id/template changes the template in any status", async () => {
  const h = makeHarness();
  const { id, token } = await createOrder(h);
  const res = await h.call("POST", `/orders/${id}/template`, { body: { t: token, template: "moderne" } });
  assertEquals([res.status, res.body.order.template], [200, "moderne"]);
  assertEquals((await h.call("GET", `/orders/${id}?t=${token}`)).body.order.template, "moderne");

  await h.call("POST", `/admin/orders/${id}/unlock`, { headers: { authorization: `Bearer ${ADMIN_KEY}` } });
  const paid = await h.call("POST", `/orders/${id}/template`, { body: { t: token, template: "elegant" } });
  assertEquals([paid.status, paid.body.order.template, paid.body.order.status], [200, "elegant", "paid"]);

  const bad = await h.call("POST", `/orders/${id}/template`, { body: { t: token, template: "fancy" } });
  assertEquals([bad.status, bad.body.error, bad.body.fields], [400, "validation", { template: "Valeur invalide." }]);
  const wrongToken = await h.call("POST", `/orders/${id}/template`, { body: { t: "x", template: "moderne" } });
  assertEquals(wrongToken.status, 404);
});

Deno.test("POST /orders: validation errors carry dotted field paths in French", async () => {
  const h = makeHarness();
  const data = orderData("pack") as Json;
  data.identity.firstName = "   ";
  data.identity.email = "pas-un-email";
  data.identity.phone = "12";
  data.target.jobTitle = "x".repeat(81);
  data.target.sector = "spatial";
  data.experiences = [{ title: "A" }, { title: "B" }, { company: "Sans titre" }];
  data.languages = [{ name: "Français", level: "Expert" }];
  data.skills = Array.from({ length: 21 }, (_, i) => `S${i}`);
  data.letter = { company: "" };
  const res = await h.call("POST", "/orders", { body: { product: "pack", template: "classique", data } });
  assertEquals([res.status, res.body.error], [400, "validation"]);
  assertEquals(res.body.fields, {
    "identity.firstName": "Ce champ est obligatoire.",
    "identity.email": "Adresse e-mail invalide.",
    "identity.phone": "Numéro de téléphone invalide.",
    "target.jobTitle": "80 caractères maximum.",
    "target.sector": "Valeur invalide.",
    "experiences.2.title": "Ce champ est obligatoire.",
    "languages.0.level": "Valeur invalide.",
    "skills": "20 éléments maximum.",
    "letter.company": "Indiquez l'entreprise à qui vous écrivez.",
  });
  assertEquals(typeof res.body.message, "string");
});

Deno.test("POST /orders: product rules (education or experience; letter only when needed)", async () => {
  const h = makeHarness();
  const cv = orderData("cv") as Json;
  cv.education = [];
  cv.experiences = [{ title: "", company: " ", missions: "" }];
  const res = await h.call("POST", "/orders", { body: { product: "cv", data: cv } });
  assertEquals(res.body.fields, { education: "Ajoutez au moins une formation ou une expérience." });

  const lettre = orderData("lettre") as Json;
  lettre.education = [];
  lettre.experiences = [];
  delete lettre.letter;
  const res2 = await h.call("POST", "/orders", { body: { product: "lettre", data: lettre } });
  assertEquals(res2.body.fields, { "letter.company": "Indiquez l'entreprise à qui vous écrivez." });

  const bad = await h.call("POST", "/orders", { body: { product: "poster", data: orderData() } });
  assertEquals(bad.body.fields.product, "Valeur invalide.");
  const noData = await h.call("POST", "/orders", { body: { product: "cv" } });
  assertEquals(noData.body.fields, { data: "Ce champ est obligatoire." });
});

Deno.test("POST /orders cleans the input (trim, whitespace, control characters, empty optionals)", async () => {
  const h = makeHarness();
  const data = orderData("pack") as Json;
  data.identity.firstName = "  Awa \u0007 ";
  data.identity.lastName = "Ndiaye\u200b";
  data.identity.address = "   ";
  data.identity.phone = "+33 6 12 34 56 78";
  data.target.jobTitle = "Assistante\t  comptable";
  data.experiences[0].missions = "  Saisie   des pièces \r\n\r\n\n  Rapprochements  ";
  data.skills = ["  Sage  ", "", "Excel"];
  data.letter.motivation = "Ligne 1\n\n\nLigne   2";
  const res = await h.call("POST", "/orders", { body: { product: "pack", template: "moderne", data } });
  assertEquals(res.status, 201);
  const input = (await h.store.getOrder(res.body.order.id))!.input!;
  assertEquals(input.identity.firstName, "Awa");
  assertEquals(input.identity.lastName, "Ndiaye");
  assertEquals("address" in input.identity, false);
  assertEquals(input.identity.phone, "+33 6 12 34 56 78", "foreign numbers are kept as typed");
  assertEquals(input.target.jobTitle, "Assistante comptable");
  assertEquals(input.experiences[0].missions, "Saisie des pièces\nRapprochements");
  assertEquals(input.skills, ["Sage", "Excel"]);
  assertEquals(input.letter?.motivation, "Ligne 1\nLigne 2");
  assertEquals(res.body.order.template, "moderne");
});

Deno.test("POST /orders: a filled honeypot is refused and nothing is stored", async () => {
  const h = makeHarness();
  const res = await h.call("POST", "/orders", { body: orderBody("cv", { website: "http://spam.example" }) });
  assertEquals([res.status, res.body.error], [400, "validation"]);
  assertEquals((await h.store.stats(h.clock.iso())).today.orders, 0);
});

Deno.test("POST /orders: per-IP hourly limit → 429, other IPs unaffected, reset after an hour", async () => {
  const h = makeHarness({ env: { PREVIEW_RATE_LIMIT_PER_HOUR: "2" } });
  assertEquals((await h.call("POST", "/orders", { body: orderBody(), ip: "198.51.100.1" })).status, 201);
  assertEquals((await h.call("POST", "/orders", { body: orderBody(), ip: "198.51.100.1" })).status, 201);
  const third = await h.call("POST", "/orders", { body: orderBody(), ip: "198.51.100.1" });
  assertEquals([third.status, third.body.error], [429, "rate_limited"]);
  assertEquals((await h.call("POST", "/orders", { body: orderBody(), ip: "198.51.100.2" })).status, 201);
  h.clock.advance(HOUR);
  assertEquals((await h.call("POST", "/orders", { body: orderBody(), ip: "198.51.100.1" })).status, 201);
});

Deno.test("POST /orders: the global daily cap → 429", async () => {
  const h = makeHarness();
  const day = h.clock.iso().slice(0, 10);
  for (let i = 0; i < 5000; i++) await h.store.hitRateLimit(`preview:global:${day}`, 86400, 5000, h.clock.iso());
  const res = await h.call("POST", "/orders", { body: orderBody() });
  assertEquals([res.status, res.body.error], [429, "rate_limited"]);
  h.clock.advance(DAY);
  assertEquals((await h.call("POST", "/orders", { body: orderBody() })).status, 201, "a new day has its own bucket");
});

Deno.test("POST /orders uses the optional enhancer and ignores its failures", async () => {
  const better = makeHarness({
    enhance: (doc) => Promise.resolve({ ...doc, cv: doc.cv && { ...doc.cv, profile: "Profil réécrit par le modèle." } }),
  });
  const { id } = await createOrder(better);
  assertEquals((await better.store.getOrder(id))!.document!.cv!.profile, "Profil réécrit par le modèle.");

  const failing = makeHarness({ enhance: () => Promise.reject(new Error("LLM down")) });
  const res = await failing.call("POST", "/orders", { body: orderBody() });
  assertEquals(res.status, 201);
  const nullish = makeHarness({ enhance: () => Promise.resolve(null) });
  assertEquals((await nullish.call("POST", "/orders", { body: orderBody() })).status, 201);
});

Deno.test("HTTP: CORS, preflight, routing prefixes, 404, 413 and bad JSON", async () => {
  const h = makeHarness();
  const pre = await h.app(new Request("http://x/functions/v1/api/orders", { method: "OPTIONS" }));
  assertEquals(pre.status, 204);
  assertEquals(pre.headers.get("access-control-allow-origin"), "*");
  assertEquals(pre.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
  assertEquals(pre.headers.get("access-control-allow-headers"), "content-type, authorization, x-cron-secret");

  for (const url of ["http://x/functions/v1/api/health", "http://x/api/health", "http://x/api/health/"]) {
    const res = await h.app(new Request(url));
    assertEquals(res.status, 200, url);
    assertEquals(res.headers.get("content-type"), "application/json; charset=utf-8");
    assertEquals(res.headers.get("access-control-allow-origin"), "*");
    assertEquals(await res.json(), { ok: true, time: h.clock.iso() });
  }

  const missing = await h.call("GET", "/nope");
  assertEquals([missing.status, missing.body.error], [404, "not_found"]);
  assertEquals(missing.headers.get("access-control-allow-origin"), "*");
  assertEquals((await h.call("DELETE", "/orders")).status, 404);

  const big = await h.call("POST", "/orders", { rawBody: JSON.stringify({ pad: "x".repeat(33 * 1024) }), headers: { "content-type": "application/json" } });
  assertEquals([big.status, big.body.error], [413, "payload_too_large"]);

  const bad = await h.call("POST", "/orders", { rawBody: "{oops", headers: { "content-type": "application/json" } });
  assertEquals([bad.status, bad.body.error], [400, "bad_request"]);
  const arr = await h.call("POST", "/orders", { rawBody: "[1]" });
  assertEquals(arr.status, 400);
});

Deno.test("HTTP: unexpected errors become 500 internal without leaking details", async () => {
  const h = makeHarness();
  h.store.getOrder = () => Promise.reject(new Error("db exploded at line 42"));
  const { status, body } = await h.call("GET", "/orders/TCV-AAAAAAAA?t=abc");
  assertEquals(status, 500);
  assertEquals(body.error, "internal");
  assertEquals(JSON.stringify(body).includes("exploded"), false);
  assert(h.logs.error.length > 0);
});

Deno.test("GET /config exposes prices and the payment modes", async () => {
  const wave = await makeHarness().call("GET", "/config");
  assertEquals(wave.body, {
    brandName: "Teranga CV",
    currency: "XOF",
    prices: { cv: 1000, lettre: 1000, pack: 1500 },
    payment: { wave: true, manual: false, manualWaveNumber: null, ownerWhatsapp: "221771234567" },
  });
  const manual = await makeHarness({ wave: null, env: { MANUAL_WAVE_NUMBER: "77 000 11 22", OWNER_WHATSAPP: "+221 78 999 88 77", BRAND_NAME: "TCV" } })
    .call("GET", "/config");
  assertEquals(manual.body.brandName, "TCV");
  assertEquals(manual.body.payment, { wave: false, manual: true, manualWaveNumber: "+221 77 000 11 22", ownerWhatsapp: "221789998877" });
  const none = await makeHarness({ wave: null, env: { OWNER_WAVE_MOBILE: undefined } }).call("GET", "/config");
  assertEquals(none.body.payment, { wave: false, manual: false, manualWaveNumber: null, ownerWhatsapp: null });
});
