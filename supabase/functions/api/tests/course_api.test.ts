// Course HTTP API (SPEC_COURSE §3): /config, POST /orders (course branch), Wave/manual checkout, GET /orders/:id
// course view and receipt, GET /orders/:id/course (gating, payload, 503 on missing content, 410 once purged) and
// the admin additions.
import { assert, assertEquals, assertFalse, assertMatch } from "jsr:@std/assert@1.0.13";
import { MemoryStore } from "../lib/store_memory.ts";
import {
  COURSE_CATALOG,
  COURSE_CGV_VERSION,
  COURSE_MESSAGES,
  parseManifest,
  parseQuiz,
  parseQuizKey,
  RECEIPT_SELLER_TEXT,
} from "../lib/course.ts";
import { COURSE_PURGED_MESSAGE } from "../lib/order_access.ts";
import { ADMIN_KEY, createOrder, DAY, makeHarness, T0 } from "./fixtures/backend_harness.ts";
import {
  BUYER_NAME,
  courseCheckout,
  courseHarness,
  courseOrderBody,
  createCourseOrder,
  encodeJson,
  FIXTURE_MODULE_TITLES,
  fixtureAsset,
  FORMATION_RETURN_BASE,
  nextIp,
  paidCourseOrder,
  payCourseOrder,
  seedCourseMemory,
} from "./fixtures/course_harness.ts";

const NOT_FOUND = { error: "not_found", message: "Commande introuvable." };
const UNAVAILABLE = { error: "course_unavailable", message: COURSE_MESSAGES.unavailable };
const admin = { authorization: `Bearer ${ADMIN_KEY}` };

Deno.test("GET /config: courses.pq_essentiel = { price, open }; prices unchanged", async () => {
  const closed = await makeHarness().call("GET", "/config");
  assertEquals(closed.body.courses, { pq_essentiel: { price: 25000, open: false } });
  assertEquals(closed.body.prices, { cv: 1000, lettre: 1000, pack: 1500, stage: 1500, premium: 5000, stageMulti: 2500 });
  const open = await makeHarness({ env: { PQ_SALES_OPEN: "true", PRICE_PQ_ESSENTIEL: "20000" } }).call("GET", "/config");
  assertEquals(open.body.courses, { pq_essentiel: { price: 20000, open: true } });
});

Deno.test("POST /orders course: closed sales → 403 sales_closed before any rate-limit slot is used", async () => {
  const store = new MemoryStore();
  const h = makeHarness({ store, wave: null, env: { MANUAL_WAVE_NUMBER: "770001122" } });
  for (let i = 0; i < 3; i++) {
    const res = await h.call("POST", "/orders", { body: courseOrderBody() });
    assertEquals(res.status, 403);
    assertEquals(res.body, { error: "sales_closed", message: COURSE_MESSAGES.salesClosed });
  }
  assertEquals(store.rateLimits.size, 0, "no rate-limit bucket touched");
  assertEquals(store.orders.size, 0);
  // Even an invalid course body is answered « closed » (the switch comes first).
  assertEquals((await h.call("POST", "/orders", { body: { product: "pq_essentiel" } })).body.error, "sales_closed");
  // The honeypot still comes before everything.
  assertEquals((await h.call("POST", "/orders", { body: courseOrderBody({ website: "spam" }) })).status, 400);
});

Deno.test("POST /orders course: open → 201 without preview; the row carries the buyer, no input, no document", async () => {
  const h = await courseHarness();
  const res = await h.call("POST", "/orders", { body: courseOrderBody() });
  assertEquals(res.status, 201);
  assertEquals(Object.keys(res.body), ["order"], "no preview for a course");
  const o = res.body.order;
  assertEquals(Object.keys(o).sort(), ["amount", "createdAt", "currency", "id", "paidAt", "paymentMethod", "product", "status", "template", "token"]);
  assertEquals([o.product, o.template, o.amount, o.currency, o.status, o.paymentMethod, o.paidAt, o.createdAt], [
    "pq_essentiel",
    "classique",
    25000,
    "XOF",
    "preview",
    null,
    null,
    T0,
  ]);
  assertMatch(o.id, /^TCV-[0-9A-HJKMNP-TV-Z]{8}$/);
  const row = (await h.store.getOrder(o.id))!;
  assertEquals([row.input, row.document, row.amount, row.status], [null, null, 25000, "preview"]);
  assertEquals(row.buyer, {
    fullName: BUYER_NAME,
    email: "aissatou@example.com",
    phone: "+2250707070707",
    acceptCgv: true,
    acceptedAt: T0,
    cgvVersion: COURSE_CGV_VERSION,
  });
  assert(row.ip_hash && row.ip_hash.length === 32);
  assertFalse(JSON.stringify(res.body).includes("aissatou@"), "contact data is not echoed back");
});

Deno.test("POST /orders course: validation errors carry dotted fields; reserved ids go to the document path", async () => {
  const h = await courseHarness();
  const bad = await h.call("POST", "/orders", { body: courseOrderBody({ acceptCgv: false }, { fullName: "Awa2", email: "x" }) });
  assertEquals(bad.status, 400);
  assertEquals(bad.body.error, "validation");
  assertEquals(Object.keys(bad.body.fields).sort(), ["acceptCgv", "buyer.email", "buyer.fullName"]);
  for (const product of ["pq_complet", "imf_kit"]) {
    const res = await h.call("POST", "/orders", { body: courseOrderBody({ product }) });
    assertEquals([res.status, res.body.error, res.body.fields?.product], [400, "validation", "Valeur invalide."], product);
  }
  assertEquals((await h.call("POST", "/orders", { body: courseOrderBody({ website: "http://spam" }) })).body, {
    error: "validation",
    message: "Votre demande n'a pas pu être traitée.",
  });
});

Deno.test("POST /orders course: the same per-IP and daily limits as the document path", async () => {
  const h = await courseHarness({ env: { PREVIEW_RATE_LIMIT_PER_HOUR: "2" } });
  const ip = "192.0.2.44";
  assertEquals((await h.call("POST", "/orders", { body: courseOrderBody(), ip })).status, 201);
  assertEquals((await h.call("POST", "/orders", { body: courseOrderBody(), ip })).status, 201);
  const third = await h.call("POST", "/orders", { body: courseOrderBody(), ip });
  assertEquals(third.body, { error: "rate_limited", message: "Trop de demandes. Réessayez dans un moment." });
  assertEquals((await createOrder(h, "cv", ip).catch((e) => e.message)).includes("429"), true, "shared with documents");
  assertEquals((await h.call("POST", "/orders", { body: courseOrderBody(), ip: "192.0.2.45" })).status, 201);
});

Deno.test("checkout course (Wave): success_url is the reader lecture.html, error_url the sales page", async () => {
  const h = makeHarness({ env: { PQ_SALES_OPEN: "true" } });
  const { id, token } = await createCourseOrder(h);
  const res = await courseCheckout(h, id, token);
  assertEquals(res.body.mode, "wave");
  const sessionId = (await h.store.getOrder(id))!.checkout_session_id!;
  const t = encodeURIComponent(token);
  assertEquals(h.wave!.successUrlOf(sessionId), `${FORMATION_RETURN_BASE}/lecture.html?o=${id}&t=${t}`);
  assertEquals(h.wave!.errorUrlOf(sessionId), `${FORMATION_RETURN_BASE}/index.html?o=${id}&t=${t}&paiement=echec`);
  assertEquals(h.wave!.sessions.get(sessionId)?.amount, "25000");
  // Documents still return to resultat.html.
  const doc = await createOrder(h, "cv", nextIp());
  await h.call("POST", `/orders/${doc.id}/checkout`, { body: { t: doc.token, returnBase: FORMATION_RETURN_BASE } });
  const docSession = (await h.store.getOrder(doc.id))!.checkout_session_id!;
  assertMatch(h.wave!.successUrlOf(docSession), /\/resultat\.html\?o=/);
});

Deno.test("checkout course (manual): unique amounts 24 999 then 24 998; already paid → 409", async () => {
  const h = await courseHarness();
  const a = await createCourseOrder(h);
  const b = await createCourseOrder(h);
  const ra = await courseCheckout(h, a.id, a.token);
  assertEquals(ra.body, {
    mode: "manual",
    waveNumber: "+221 77 000 11 22",
    amount: 25000,
    exactAmount: 24999,
    exactAmountFormatted: "24 999 FCFA",
    autoUnlock: true,
    reference: a.id,
    whatsapp: "221770001122",
  });
  assertEquals((await courseCheckout(h, b.id, b.token)).body.exactAmount, 24998);
  assertEquals((await courseCheckout(h, a.id, a.token)).body.exactAmount, 24999, "stable");
  const manualPaid = await h.call("POST", `/orders/${a.id}/manual-paid`, { body: { t: a.token } });
  assertEquals([manualPaid.status, manualPaid.body.order.status], [200, "awaiting_manual"]);
  await payCourseOrder(h, a.id);
  assertEquals((await courseCheckout(h, a.id, a.token)).body.error, "already_paid");
});

Deno.test("GET /orders/:id course view: buyer and course before payment, the receipt once paid", async () => {
  const h = await courseHarness();
  const { id, token } = await createCourseOrder(h);
  const before = await h.call("GET", `/orders/${id}?t=${encodeURIComponent(token)}`);
  assertEquals(before.status, 200);
  assertEquals(before.body, {
    order: { id, product: "pq_essentiel", template: "classique", amount: 25000, currency: "XOF", status: "preview", paymentMethod: null, paidAt: null, createdAt: T0 },
    buyer: { fullName: BUYER_NAME },
    course: { id: "pq_essentiel", title: "Power Query pour le reporting bancaire", edition: "Essentiel" },
  });
  await payCourseOrder(h, id);
  const after = await h.call("GET", `/orders/${id}?t=${encodeURIComponent(token)}`);
  assertEquals(after.body.order.status, "paid");
  assertEquals(after.body.receipt, {
    number: id,
    paidAt: T0,
    amount: 24999,
    currency: "XOF",
    paymentMethod: "manual",
    label: COURSE_CATALOG.pq_essentiel.label,
    buyerName: BUYER_NAME,
    seller: RECEIPT_SELLER_TEXT,
  });
  assertFalse("document" in after.body || "preview" in after.body);
  const text = JSON.stringify(after.body);
  assertFalse(text.includes("aissatou@") || text.includes("2250707"), "the receipt carries no contact data");
  // An admin unlock without a detected transfer records the catalogue price.
  const other = await createCourseOrder(h);
  await h.call("POST", `/admin/orders/${other.id}/unlock`, { headers: admin });
  const unlocked = await h.call("GET", `/orders/${other.id}?t=${encodeURIComponent(other.token)}`);
  assertEquals(unlocked.body.receipt.amount, 25000);
});

Deno.test("GET /orders/:id/course: unpaid, wrong token, unknown id and document orders are the same 404", async () => {
  const h = await courseHarness();
  const { id, token } = await createCourseOrder(h);
  const t = encodeURIComponent(token);
  const unknown = await h.call("GET", `/orders/TCV-ZZZZZZZZ/course?t=${t}`);
  const unpaid = await h.call("GET", `/orders/${id}/course?t=${t}`);
  const wrong = await h.call("GET", `/orders/${id}/course?t=nope`);
  const none = await h.call("GET", `/orders/${id}/course`);
  for (const r of [unknown, unpaid, wrong, none]) assertEquals([r.status, r.body], [404, NOT_FOUND]);
  assertEquals(JSON.stringify(unpaid.body), JSON.stringify(unknown.body), "byte-identical: no enumeration");
  await courseCheckout(h, id, token);
  assertEquals((await h.call("GET", `/orders/${id}/course?t=${t}`)).body, NOT_FOUND, "checkout is not paid");
  // A paid document order has no course.
  const doc = await createOrder(h, "cv", nextIp());
  await h.call("POST", `/admin/orders/${doc.id}/unlock`, { headers: admin });
  assertEquals((await h.call("GET", `/orders/${doc.id}/course?t=${encodeURIComponent(doc.token)}`)).body, NOT_FOUND);
});

Deno.test("GET /orders/:id/course: paid → the full CourseView (modules in order, html verbatim, no quiz key)", async () => {
  const h = await courseHarness();
  const { id, token } = await paidCourseOrder(h);
  const res = await h.call("GET", `/orders/${id}/course?t=${encodeURIComponent(token)}`);
  assertEquals(res.status, 200);
  const v = res.body;
  assertEquals(Object.keys(v).sort(), ["buyer", "course", "files", "modules", "order", "quiz"], "no attestation before a pass");
  assertEquals(v.course, {
    id: "pq_essentiel",
    title: "Power Query pour le reporting bancaire",
    subtitle: "Automatisez vos états mensuels sous Excel — édition UEMOA",
    edition: "Essentiel",
    version: "0.0-test",
    updatedAt: "2026-10-21",
  });
  assertEquals(v.buyer, { fullName: BUYER_NAME });
  assertEquals(v.order, { id, paidAt: T0 });
  assertEquals(v.modules.map((m: { n: number; id: string; title: string }) => [m.n, m.id, m.title]), [
    [1, "module-01", FIXTURE_MODULE_TITLES[0]],
    [2, "module-02", FIXTURE_MODULE_TITLES[1]],
  ]);
  assertEquals(Object.keys(v.modules[0]).sort(), ["files", "html", "id", "minutes", "n", "objectives", "title"]);
  assertEquals([v.modules[0].minutes, v.modules[0].files, v.modules[1].files], [20, ["module-1.xlsx", "donnees-module-1.zip"], []]);
  for (const [i, n] of [[0, "01"], [1, "02"]] as const) {
    const fragment = new TextDecoder().decode((await fixtureAsset(`pq_essentiel/modules/module-${n}.html`)).bytes);
    assertEquals(v.modules[i].html, fragment, "verbatim, not sanitized by the server");
  }
  const xlsx = await fixtureAsset("pq_essentiel/files/module-1.xlsx");
  const zip = await fixtureAsset("pq_essentiel/files/donnees-module-1.zip");
  assertEquals(v.files, [
    { name: "module-1.xlsx", label: "Classeur d'exercices — module 1 (test)", size: xlsx.bytes.length, module: 1 },
    { name: "donnees-module-1.zip", label: "Données du module 1 (test)", size: zip.bytes.length, module: 1 },
  ]);
  assertEquals(v.quiz.passPercent, 70);
  assertEquals(v.quiz.questions.length, 4);
  for (const q of v.quiz.questions) assertEquals(Object.keys(q), ["id", "text", "choices"], "module and other keys dropped");
  const text = JSON.stringify(v);
  assertFalse(text.includes('"answers"'), "the key is never serialised");
  assertFalse(text.includes("quiz-key") || text.includes("pq_essentiel/"), "no asset names either");
  assertFalse(text.includes("aissatou@"));
});

Deno.test("GET /orders/:id/course: manifest missing / invalid, a module or the quiz missing → 503 (asset named in the log)", async () => {
  const cases: Array<[string, (s: MemoryStore) => Promise<void>, string]> = [
    ["no content at all", () => Promise.resolve(), "pq_essentiel/manifest.json is missing"],
    ["manifest invalid", async (s) => {
      await seedCourseMemory(s);
      await s.putCourseAsset("pq_essentiel/manifest.json", "application/json", encodeJson({ schema: 2 }));
    }, "pq_essentiel/manifest.json is invalid"],
    ["manifest not JSON", async (s) => {
      await seedCourseMemory(s);
      await s.putCourseAsset("pq_essentiel/manifest.json", "application/json", new TextEncoder().encode("{"));
    }, "pq_essentiel/manifest.json is invalid"],
    ["module missing", async (s) => {
      await seedCourseMemory(s);
      s.courseAssets.delete("pq_essentiel/modules/module-02.html");
    }, "pq_essentiel/modules/module-02.html is missing"],
    ["module not UTF-8", async (s) => {
      await seedCourseMemory(s);
      await s.putCourseAsset("pq_essentiel/modules/module-01.html", "text/html; charset=utf-8", new Uint8Array([0xff, 0xfe, 0x00]));
    }, "pq_essentiel/modules/module-01.html is invalid"],
    ["quiz missing", async (s) => {
      await seedCourseMemory(s);
      s.courseAssets.delete("pq_essentiel/quiz.json");
    }, "pq_essentiel/quiz.json is missing"],
    ["key without an answer for q04", async (s) => {
      await seedCourseMemory(s);
      await s.putCourseAsset("pq_essentiel/quiz-key.json", "application/json", encodeJson({ schema: 1, answers: { q01: 0, q02: 1, q03: 2 } }));
    }, "pq_essentiel/quiz-key.json is invalid"],
  ];
  for (const [label, prepare, logged] of cases) {
    const store = new MemoryStore();
    await prepare(store);
    const h = await courseHarness({ store });
    const { id, token } = await paidCourseOrder(h);
    const res = await h.call("GET", `/orders/${id}/course?t=${encodeURIComponent(token)}`);
    assertEquals([res.status, res.body], [503, UNAVAILABLE], label);
    assert(h.logs.error.some((l) => l === `course asset ${logged}`), `${label}: ${h.logs.error.join(" | ")}`);
    assertFalse(h.logs.error.some((l) => l.includes("Lorem")), "content never logged");
    // The order view does not depend on the content.
    assertEquals((await h.call("GET", `/orders/${id}?t=${encodeURIComponent(token)}`)).status, 200, label);
  }
});

Deno.test("GET /orders/:id/course: text assets are memoised per Deps; a new app (settings reload) sees a re-upload", async () => {
  const store = new MemoryStore();
  await seedCourseMemory(store);
  const h = await courseHarness({ store });
  const { id, token } = await paidCourseOrder(h);
  const path = `/orders/${id}/course?t=${encodeURIComponent(token)}`;
  assertEquals((await h.call("GET", path)).body.course.version, "0.0-test");
  const manifest = JSON.parse(new TextDecoder().decode((await fixtureAsset("pq_essentiel/manifest.json")).bytes));
  await store.putCourseAsset("pq_essentiel/manifest.json", "application/json", encodeJson({ ...manifest, version: "1.1" }));
  assertEquals((await h.call("GET", path)).body.course.version, "0.0-test", "same Deps: cached");
  const reloaded = await courseHarness({ store, clock: h.clock });
  assertEquals((await reloaded.call("GET", path)).body.course.version, "1.1", "fresh Deps: re-read");
});

Deno.test("course orders: kept 24 months after payment, then 410 with the course message", async () => {
  const h = await courseHarness();
  const { id, token } = await paidCourseOrder(h);
  const t = encodeURIComponent(token);
  const purgeAt = (days: number) => {
    h.clock.set(new Date(Date.parse(T0) + days * DAY).toISOString());
    const now = h.clock.now().getTime();
    return h.store.purge(new Date(now - 3 * DAY).toISOString(), new Date(now - 30 * DAY).toISOString(), h.clock.iso());
  };
  assertEquals(await purgeAt(31), 0);
  assertEquals((await h.call("GET", `/orders/${id}/course?t=${t}`)).status, 200, "a document would be gone after 30 days");
  assertEquals(await purgeAt(731), 1);
  const order = await h.call("GET", `/orders/${id}?t=${t}`);
  assertEquals([order.status, order.body], [410, { error: "purged", message: COURSE_PURGED_MESSAGE }]);
  assertEquals((await h.call("GET", `/orders/${id}/course?t=${t}`)).status, 410);
  assert(COURSE_PURGED_MESSAGE.startsWith(`Cet accès a expiré${String.fromCharCode(0xa0)}: les données`));
  assertEquals((await h.store.getOrder(id))?.buyer, null, "the buyer's name is erased");
  // An unpaid course order goes after 3 days, like every unpaid order.
  const unpaid = await createCourseOrder(h);
  h.clock.advance(4 * DAY);
  const now = h.clock.now().getTime();
  await h.store.purge(new Date(now - 3 * DAY).toISOString(), new Date(now - 30 * DAY).toISOString(), h.clock.iso());
  assertEquals((await h.call("GET", `/orders/${unpaid.id}?t=${encodeURIComponent(unpaid.token)}`)).status, 410);
});

Deno.test("GET /admin/stats: course status line and the per-product funnel", async () => {
  const h = await courseHarness();
  await paidCourseOrder(h);
  await createCourseOrder(h);
  await createOrder(h, "cv", nextIp());
  const res = await h.call("GET", "/admin/stats", { headers: admin });
  assertEquals(res.status, 200);
  assertEquals(res.body.course, { salesOpen: true, price: 25000, content: true, version: "0.0-test", modules: 2 });
  assertEquals(res.body.stats.funnel.last30, [
    { product: "cv", orders: 1, checkouts: 0, paid: 0, revenue: 0 },
    { product: "pq_essentiel", orders: 2, checkouts: 1, paid: 1, revenue: 24999 },
  ]);
  assertEquals(res.body.stats.leads, { total: 0, last30: 0, active: 0 });
  assertEquals(res.body.stats.quizPasses, { total: 0, last30: 0 });
  assertEquals(Object.keys(res.body.health).sort(), [
    "llm",
    "manual",
    "ownerWaveMobile",
    "payout",
    "phoneHook",
    "phoneHookUrl",
    "lastPhoneNotificationAt",
    "wave",
    "webhook",
  ].sort(), "health unchanged");
  const empty = await makeHarness().call("GET", "/admin/stats", { headers: admin });
  assertEquals(empty.body.course, { salesOpen: false, price: 25000, content: false, version: null, modules: 0 });
  assertEquals(empty.body.stats.funnel, { last30: [], allTime: [] });
});

// --- Content validation (manifest, quiz, key) -------------------------------------------------------

Deno.test("parseManifest / parseQuiz / parseQuizKey: the fixture passes; each broken rule is refused", async () => {
  const base = JSON.parse(new TextDecoder().decode((await fixtureAsset("pq_essentiel/manifest.json")).bytes));
  assert(parseManifest(encodeJson(base), "pq_essentiel"));
  // deno-lint-ignore no-explicit-any
  type M = Record<string, any>;
  const broken: Array<[string, (m: M) => void]> = [
    ["schema", (m) => (m.schema = 2)],
    ["id", (m) => (m.id = "pq_complet")],
    ["title empty", (m) => (m.title = " ")],
    ["version too long", (m) => (m.version = "1".repeat(21))],
    ["updatedAt", (m) => (m.updatedAt = "21/10/2026")],
    ["no module", (m) => (m.modules = [])],
    ["n not from 1", (m) => (m.modules[0].n = 2)],
    ["n not ascending", (m) => (m.modules[1].n = 1)],
    ["module id", (m) => (m.modules[0].id = "module-1")],
    ["minutes", (m) => (m.modules[0].minutes = 0)],
    ["objectives", (m) => (m.modules[0].objectives = Array(13).fill("x"))],
    ["html prefix", (m) => (m.modules[0].html = "autre/modules/module-01.html")],
    ["unknown file in a module", (m) => m.modules[0].files.push("nope.zip")],
    ["download name", (m) => (m.files[0].name = "Module 1.xlsx")],
    ["download extension", (m) => (m.files[0].name = "module-1.pdf")],
    ["duplicate name", (m) => (m.files[1].name = m.files[0].name)],
    ["file module", (m) => (m.files[0].module = 9)],
    ["file asset prefix", (m) => (m.files[0].asset = "pq_essentiel/quiz-key.json")],
    ["size", (m) => (m.files[0].size = -1)],
    ["passPercent", (m) => (m.quiz.passPercent = 50)],
    ["quiz asset prefix", (m) => (m.quiz.key = "other/quiz-key.json")],
    ["key = questions", (m) => (m.quiz.key = m.quiz.questions)],
    ["a download pointing at the key", (m) => {
      m.quiz.key = "pq_essentiel/files/key.json";
      m.files[0].asset = "pq_essentiel/files/key.json";
    }],
  ];
  for (const [label, mutate] of broken) {
    const m = structuredClone(base);
    mutate(m);
    assertEquals(parseManifest(encodeJson(m), "pq_essentiel"), null, label);
  }
  assertEquals(parseManifest(new TextEncoder().encode("not json"), "pq_essentiel"), null);
  const parsed = parseManifest(encodeJson({ ...base, extra: "dropped" }), "pq_essentiel")!;
  assertFalse("extra" in parsed);

  const quizJson = JSON.parse(new TextDecoder().decode((await fixtureAsset("pq_essentiel/quiz.json")).bytes));
  const quiz = parseQuiz(encodeJson(quizJson))!;
  assertEquals(quiz.questions.map((q) => Object.keys(q)), Array(4).fill(["id", "text", "choices"]));
  assert(parseQuiz(encodeJson({ questions: quizJson.questions })), "schema may be omitted");
  for (
    const bad of [
      { schema: 2, questions: quizJson.questions },
      { questions: [] },
      { questions: [{ ...quizJson.questions[0], id: "Q1" }] },
      { questions: [quizJson.questions[0], quizJson.questions[0]] },
      { questions: [{ ...quizJson.questions[0], choices: ["seul"] }] },
      { questions: [{ ...quizJson.questions[0], text: "x".repeat(501) }] },
    ]
  ) assertEquals(parseQuiz(encodeJson(bad)), null, JSON.stringify(bad).slice(0, 60));
  assert(parseQuizKey(encodeJson({ schema: 1, answers: { q01: 0, q02: 1, q03: 2, q04: 3, q99: 0 } }), quiz));
  for (const answers of [{ q01: 0, q02: 1, q03: 2 }, { q01: 0, q02: 1, q03: 2, q04: 4 }, { q01: 0, q02: 1, q03: 2, q04: "3" }]) {
    assertEquals(parseQuizKey(encodeJson({ schema: 1, answers }), quiz), null, JSON.stringify(answers));
  }
});
