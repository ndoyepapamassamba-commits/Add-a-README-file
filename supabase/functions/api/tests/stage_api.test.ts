// Pack Stage through the HTTP API: create → blurred preview → manual checkout → owner unlock → full
// document with every letter and the sending message; Wave checkout amount; price by company count;
// field errors; body size; no LLM rewrite; and the same flow on SqlStore (PGlite + stage migration).
import { assert, assertEquals, assertMatch, assertRejects } from "jsr:@std/assert@1.0.13";
import type { Document } from "../lib/types.ts";
import { makeEnhancer } from "../lib/llm.ts";
import { generateDocument } from "../lib/generator/index.ts";
import { ADMIN_KEY, makeHarness, orderRow, RETURN_BASE } from "./fixtures/backend_harness.ts";
import type { Harness, Json } from "./fixtures/backend_harness.ts";
import { migrationFiles, openTestDb, sqlStore, STAGE_MIGRATION } from "./fixtures/backend_pglite.ts";
import { randomStageData, randomStageInput } from "./fixtures/stage_inputs.ts";
import { STAGE_PERSONAS } from "./fixtures/stage_personas.ts";

const MASKED = /^[█ ]+$/;
const MANUAL = { wave: null, env: { MANUAL_WAVE_NUMBER: "+221 77 000 11 22" } } as const;

function stageBody(data: Record<string, unknown>) {
  return { product: "stage", template: "moderne", data, website: "" };
}

async function createStage(h: Harness, data: Record<string, unknown>) {
  const res = await h.call("POST", "/orders", { body: stageBody(data) });
  assertEquals(res.status, 201, JSON.stringify(res.body));
  return res;
}

/** Full manual-mode purchase: preview, checkout instructions, "J'ai payé", owner unlock, full document. */
async function manualFlow(h: Harness, data: Record<string, unknown>, expectedAmount: number) {
  const created = await createStage(h, data);
  const { id, token, amount, product, status } = created.body.order;
  assertEquals([product, status, amount], ["stage", "preview", expectedAmount]);
  const nCompanies = (data.internship as { companies: unknown[] }).companies.length;

  // Blurred preview: cv, every letter header, the first letter's opening, the e-mail subject.
  const preview: Document = created.body.preview;
  assertEquals(preview.lettre, null);
  assert(preview.cv && preview.cv.fullName.length > 0);
  assertEquals(preview.lettres!.length, nCompanies);
  assert(!MASKED.test(preview.lettres![0].paragraphs[0]), "the first letter's opening is readable");
  for (const l of preview.lettres!.slice(1)) {
    assert(l.recipient.length >= 2 && l.subject.startsWith("Objet : Demande de stage"));
    for (const p of l.paragraphs) assertMatch(p, MASKED);
  }
  assert(preview.envoi!.emailSubject.startsWith("Candidature — Stage"));
  assertMatch(preview.envoi!.emailBody, MASKED);
  assertMatch(preview.envoi!.whatsapp, MASKED);

  const before = await h.call("GET", `/orders/${id}?t=${token}`);
  assertEquals([before.status, "document" in before.body, before.body.preview], [200, false, preview]);

  const checkout = await h.call("POST", `/orders/${id}/checkout`, { body: { t: token, returnBase: RETURN_BASE } });
  assertEquals([checkout.status, checkout.body.mode, checkout.body.amount, checkout.body.reference], [200, "manual", expectedAmount, id]);
  // Autopay: the customer is asked for a unique amount just below the price (first free offset: 1 F).
  assertEquals(checkout.body.exactAmount, expectedAmount - 1);

  const paidClaim = await h.call("POST", `/orders/${id}/manual-paid`, { body: { t: token, payerPhone: "78 111 22 33" } });
  assertEquals([paidClaim.status, paidClaim.body.order.status], [200, "awaiting_manual"]);
  const still = await h.call("GET", `/orders/${id}?t=${token}`);
  assert(!("document" in still.body), "nothing is unlocked before the owner confirms");

  const unlock = await h.call("POST", `/admin/orders/${id}/unlock`, { headers: { authorization: `Bearer ${ADMIN_KEY}` } });
  assertEquals([unlock.status, unlock.body], [200, { ok: true, changed: true }]);
  const stored = (await h.store.getOrder(id))!;
  assertEquals([stored.status, stored.paid_amount, stored.payment_method], ["paid", expectedAmount - 1, "manual"]);

  const after = await h.call("GET", `/orders/${id}?t=${token}`);
  assertEquals([after.status, after.body.order.status, "preview" in after.body], [200, "paid", false]);
  const doc: Document = after.body.document;
  assertEquals(doc, stored.document);
  assertEquals(doc.lettres!.length, nCompanies);
  for (const l of doc.lettres!) for (const p of l.paragraphs) assert(!/█/.test(p) && p.length > 40);
  assert(doc.envoi!.emailBody.endsWith("Pièces jointes : CV, lettre de motivation"));
  assert(doc.envoi!.whatsapp.startsWith("Bonjour Madame, Monsieur,"));
  return { id, token, doc };
}

Deno.test("stage API: create → preview → manual checkout → unlock → full document (3 companies, 2 500 FCFA)", async () => {
  const h = makeHarness(MANUAL);
  const { doc } = await manualFlow(h, STAGE_PERSONAS[1].data, 2500);
  assertEquals(doc.lettres!.map((l) => l.recipient[1]), ["Sonatel", "Wave Mobile Money", "Orange Digital Center"]);
});

Deno.test("stage API: one company costs 1 500 FCFA; 2 to 5 cost 2 500 FCFA", async () => {
  const h = makeHarness(MANUAL);
  await manualFlow(h, STAGE_PERSONAS[0].data, 1500);
  for (const n of [1, 2, 3, 4, 5]) {
    const res = await createStage(h, randomStageData(40 + n, { companies: n }));
    assertEquals(res.body.order.amount, n === 1 ? 1500 : 2500, `${n} companies`);
    assertEquals(res.body.preview.lettres.length, n);
  }
});

Deno.test("stage API: prices follow PRICE_STAGE / PRICE_STAGE_MULTI and GET /config shows them", async () => {
  const h = makeHarness({ ...MANUAL, env: { ...MANUAL.env, PRICE_STAGE: "2000", PRICE_STAGE_MULTI: "3500" } });
  assertEquals((await createStage(h, randomStageData(1, { companies: 1 }))).body.order.amount, 2000);
  assertEquals((await createStage(h, randomStageData(2, { companies: 4 }))).body.order.amount, 3500);
  const config = await h.call("GET", "/config");
  assertEquals(config.body.prices, { cv: 1000, lettre: 1000, pack: 1500, stage: 2000, premium: 5000, stageMulti: 3500 });
  const defaults = await makeHarness().call("GET", "/config");
  assertEquals([defaults.body.prices.stage, defaults.body.prices.stageMulti], [1500, 2500]);
});

Deno.test("stage API: Wave checkout charges the order amount and a paid session unlocks the letters", async () => {
  const h = makeHarness();
  const created = await createStage(h, randomStageData(9, { companies: 3 }));
  const { id, token } = created.body.order;
  const res = await h.call("POST", `/orders/${id}/checkout`, { body: { t: token, returnBase: RETURN_BASE } });
  assertEquals([res.status, res.body.mode], [200, "wave"]);
  const [args] = h.wave!.callsOf("createCheckoutSession")[0] as [Record<string, unknown>];
  assertEquals([args.amount, args.clientReference], [2500, id]);
  h.wave!.completeSession((await h.store.getOrder(id))!.checkout_session_id!);
  const paid = await h.call("GET", `/orders/${id}?t=${token}`);
  assertEquals([paid.body.order.status, paid.body.document.lettres.length], ["paid", 3]);
});

Deno.test("stage API: validation errors use the internship paths; a full 5-company form fits in 32 KB", async () => {
  const h = makeHarness(MANUAL);
  const data = randomStageData(3, { companies: 2 }) as Json;
  data.internship.companies[1].reason = "Trop court";
  data.internship.school = "";
  const bad = await h.call("POST", "/orders", { body: stageBody(data) });
  assertEquals([bad.status, bad.body.error], [400, "validation"]);
  assertEquals(bad.body.fields["internship.companies.1.reason"], "20 caractères minimum.");
  assertEquals(bad.body.fields["internship.school"], "Ce champ est obligatoire.");

  const big = randomStageData(4, { companies: 5 }) as Json;
  Object.assign(big.internship, {
    school: "s".repeat(100),
    program: "p".repeat(100),
    studyLevel: "Master 2",
    department: "d".repeat(80),
    start: "s".repeat(30),
    end: "e".repeat(30),
    durationText: "3 mois".padEnd(30, "."),
    projects: Array.from({ length: 4 }, (_, i) => `${i} ${"projet ".repeat(28)}`.slice(0, 200)),
    qualities: Array.from({ length: 4 }, () => "q".repeat(40)),
  });
  big.internship.companies = Array.from({ length: 5 }, (_, i) => ({
    name: `${i}${"n".repeat(99)}`,
    city: "c".repeat(60),
    recipient: "r".repeat(100),
    department: "d".repeat(80),
    reason: `${i} ${"raison ".repeat(42)}`.slice(0, 300),
  }));
  big.skills = Array.from({ length: 20 }, (_, i) => `${i}${"k".repeat(55)}`);
  const body = JSON.stringify(stageBody(big));
  assert(body.length < 32 * 1024, `${body.length} bytes`);
  const res = await h.call("POST", "/orders", { rawBody: body, headers: { "content-type": "application/json" } });
  assertEquals(res.status, 201, JSON.stringify(res.body).slice(0, 300));
  assertEquals([res.body.order.amount, res.body.preview.lettres.length], [2500, 5]);
});

Deno.test("stage API: the LLM enhancer is never asked to rewrite a Pack Stage", async () => {
  let calls = 0;
  const enhance = makeEnhancer({
    apiKey: "k",
    model: "m",
    fetchFn: () => {
      calls++;
      return Promise.resolve(new Response("{}", { status: 500 }));
    },
  });
  const input = randomStageInput(5, { companies: 2 });
  const doc = generateDocument(input, "stage", { seed: "LLM", now: new Date() });
  assertEquals(await enhance(doc, input, "stage"), null);
  assertEquals(calls, 0);

  const h = makeHarness({ ...MANUAL, enhance });
  const created = await createStage(h, randomStageData(6, { companies: 2 }));
  assertEquals(calls, 0);
  const stored = (await h.store.getOrder(created.body.order.id))!;
  assertEquals(stored.document, generateDocument(stored.input!, "stage", { seed: stored.id, now: new Date(stored.created_at) }));
});

Deno.test({
  name: "stage API on SqlStore (PGlite): the migration allows 'stage' and the whole flow works",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const db = await openTestDb();
    try {
      const h = makeHarness({ ...MANUAL, store: sqlStore(db) });
      const { id } = await manualFlow(h, STAGE_PERSONAS[3].data, 2500);
      const row = await db.query("select product, amount, status, jsonb_array_length(document->'lettres') as n from tcv.orders where id = $1", [id]);
      assertEquals(row.rows[0], { product: "stage", amount: 2500, status: "paid", n: 2 });

      // Idempotent migrations (the whole chain, in order, run again); the constraint still refuses unknown products.
      assert((await migrationFiles()).some((u) => u.href === STAGE_MIGRATION.href));
      await db.migrate();
      const constraint = await db.query(
        "select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'orders_product_check'",
        [],
      );
      assertEquals(constraint.rows.length, 1);
      assertMatch(String(constraint.rows[0].def), /'stage'/);
      const store = sqlStore(db);
      await store.insertOrder(orderRow({ product: "stage" }));
      for (const product of ["cv", "lettre", "pack", "premium"] as const) await store.insertOrder(orderRow({ product }));
      await assertRejects(() => store.insertOrder(orderRow({ product: "stages" as "cv" })));
    } finally {
      await db.close();
    }
  },
});
