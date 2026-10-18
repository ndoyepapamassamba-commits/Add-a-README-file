// Store contract: identical scenarios against MemoryStore, SqlStore (PGlite + real migration) and
// SupabaseStore (PostgREST stand-in over the same PGlite database).
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.13";
import { MemoryStore } from "../lib/store_memory.ts";
import { computePayoutAmount } from "../lib/payout.ts";
import { RPC_SIGNATURES } from "../lib/store_sql.ts";
import type { OrderRow, Store } from "../lib/types.ts";
import { insertPaid, orderRow, T0 } from "./fixtures/backend_harness.ts";
import { openTestDb, sqlStore, supabaseStore } from "./fixtures/backend_pglite.ts";
import type { TestDb } from "./fixtures/backend_pglite.ts";

const db: TestDb = await openTestDb();

interface Impl {
  name: string;
  make(): Promise<Store>;
  seedSettings(store: Store, values: Record<string, string>): Promise<void>;
}

async function seedSqlSettings(values: Record<string, string>) {
  for (const [k, v] of Object.entries(values)) {
    await db.query("insert into tcv.settings (key, value) values ($1, $2)", [k, v]);
  }
}

const IMPLS: Impl[] = [
  {
    name: "MemoryStore",
    make: () => Promise.resolve(new MemoryStore()),
    seedSettings: (store, values) => {
      (store as MemoryStore).settings = { ...values };
      return Promise.resolve();
    },
  },
  {
    name: "SqlStore(PGlite)",
    make: async () => {
      await db.reset();
      return sqlStore(db);
    },
    seedSettings: (_store, values) => seedSqlSettings(values),
  },
  {
    name: "SupabaseStore(PostgREST stand-in)",
    make: async () => {
      await db.reset();
      return supabaseStore(db);
    },
    seedSettings: (_store, values) => seedSqlSettings(values),
  },
];

/** JSON round-trip: what any store can faithfully return for a row (undefined keys dropped). */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const payoutArgs = (over: Partial<Parameters<Store["createPayout"]>[0]> = {}) => ({
  id: "PO-20261018",
  day: "2026-10-18",
  mobile: "+221771234567",
  idempotencyKey: "teranga-cv-PO-20261018",
  feeRate: 0.01,
  payoutFeeRate: 0.01,
  maxAmount: null,
  minAmount: 1000,
  nowIso: "2026-10-18T20:30:00.000Z",
  ...over,
});

const paidArgs = (over: Partial<Parameters<Store["markPaid"]>[1]> = {}) => ({
  method: "wave" as const,
  paidAmount: 1500,
  transactionId: "T_123",
  sessionId: null,
  paidAt: "2026-10-18T10:05:00.000Z",
  ...over,
});

function contract(name: string, fn: (store: Store, impl: Impl) => Promise<void>) {
  for (const impl of IMPLS) {
    Deno.test({
      name: `store contract [${impl.name}] ${name}`,
      sanitizeOps: false,
      sanitizeResources: false,
      fn: async () => fn(await impl.make(), impl),
    });
  }
}

contract("insertOrder / getOrder round-trip every field", async (store) => {
  const row = orderRow({
    status: "checkout",
    checkout_session_id: "cos-rt",
    wave_launch_url: "https://pay.wave.com/c/cos-rt",
    checkout_expires_at: "2026-10-18T10:30:00.000Z",
    document: {
      cv: null,
      lettre: {
        sender: ["Awa NDIAYE"],
        recipient: ["Banque"],
        placeDate: "Dakar, le 18 octobre 2026",
        subject: "Objet : Candidature",
        salutation: "Madame, Monsieur,",
        paragraphs: ["Un", "Deux"],
        closing: "Salutations",
        signature: "Awa NDIAYE",
      },
    },
  });
  await store.insertOrder(row);
  assertEquals(await store.getOrder(row.id), plain(row));
  assertEquals(await store.getOrder("TCV-ZZZZZZZZ"), null);
});

contract("insertOrder refuses a duplicate id", async (store) => {
  const row = orderRow();
  await store.insertOrder(row);
  await assertRejects(() => store.insertOrder(row));
});

contract("updateOrder patches whitelisted fields only", async (store) => {
  const row = orderRow();
  await store.insertOrder(row);
  await store.updateOrder(row.id, {
    template: "elegant",
    status: "checkout",
    checkout_session_id: "cos-1",
    wave_launch_url: "https://pay.wave.com/c/cos-1",
    checkout_expires_at: "2026-10-18T10:30:00.000Z",
  });
  const got = await store.getOrder(row.id);
  assertEquals([got?.template, got?.status, got?.checkout_session_id, got?.checkout_expires_at], [
    "elegant",
    "checkout",
    "cos-1",
    "2026-10-18T10:30:00.000Z",
  ]);
  await store.updateOrder(row.id, { status: "awaiting_manual", manual_payer_phone: "+221771234567" });
  assertEquals((await store.getOrder(row.id))?.manual_payer_phone, "+221771234567");

  await assertRejects(() => store.updateOrder(row.id, { status: "paid" }));
  await assertRejects(() => store.updateOrder(row.id, { paid_amount: 1500 }));
  await assertRejects(() => store.updateOrder(row.id, { paid_at: T0 }));
  await assertRejects(() => store.updateOrder(row.id, { payment_method: "wave" }));
  await assertRejects(() => store.updateOrder(row.id, { payout_id: "PO-1" }));
  await assertRejects(() => store.updateOrder(row.id, { amount: 1 } as Partial<OrderRow>));
  assertEquals((await store.getOrder(row.id))?.status, "awaiting_manual");
  await store.updateOrder("TCV-NOPE0000", { template: "moderne" }); // unknown id: no-op
});

contract("updateOrder never moves a paid order out of paid", async (store) => {
  const row = orderRow();
  await store.insertOrder(row);
  assert(await store.markPaid(row.id, paidArgs()));
  await store.updateOrder(row.id, { status: "checkout", template: "moderne" });
  const got = await store.getOrder(row.id);
  assertEquals([got?.status, got?.template], ["paid", "moderne"]);
});

contract("markPaid transitions exactly once and records payment fields", async (store) => {
  const row = orderRow({ status: "checkout", checkout_session_id: "cos-9", wave_transaction_id: null });
  await store.insertOrder(row);
  assertEquals(await store.markPaid("TCV-UNKNOWN0", paidArgs()), false);
  assertEquals(await store.markPaid(row.id, paidArgs({ sessionId: "cos-9" })), true);
  assertEquals(await store.markPaid(row.id, paidArgs({ paidAmount: 9999, method: "manual" })), false);
  const got = await store.getOrder(row.id);
  assertEquals(
    [got?.status, got?.payment_method, got?.paid_amount, got?.wave_transaction_id, got?.checkout_session_id, got?.paid_at],
    ["paid", "wave", 1500, "T_123", "cos-9", "2026-10-18T10:05:00.000Z"],
  );
});

contract("markPaid is atomic under concurrent calls", async (store) => {
  const row = orderRow();
  await store.insertOrder(row);
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) => store.markPaid(row.id, paidArgs({ transactionId: `T_${i}` }))),
  );
  assertEquals(results.filter(Boolean).length, 1);
  const winner = results.indexOf(true);
  assertEquals((await store.getOrder(row.id))?.wave_transaction_id, `T_${winner}`);
});

contract("listOpenCheckouts filters, orders newest first and limits", async (store) => {
  const mk = (min: number, over: Partial<OrderRow> = {}) =>
    orderRow({
      status: "checkout",
      checkout_session_id: `cos-${min}-${Math.random()}`,
      created_at: new Date(Date.parse(T0) + min * 60_000).toISOString(),
      ...over,
    });
  const old = mk(-25 * 60);
  const a = mk(1);
  const b = mk(2);
  const c = mk(3);
  const noSession = mk(4, { checkout_session_id: null });
  const preview = mk(5, { status: "preview" });
  for (const r of [old, a, b, c, noSession, preview]) await store.insertOrder(r);
  const since = new Date(Date.parse(T0) - 24 * 3_600_000).toISOString();
  assertEquals((await store.listOpenCheckouts(since, 50)).map((o) => o.id), [c.id, b.id, a.id]);
  assertEquals((await store.listOpenCheckouts(since, 2)).map((o) => o.id), [c.id, b.id]);
  assertEquals((await store.listOpenCheckouts(since, 50))[0], plain(c));
});

contract("recordEvent reports duplicates", async (store) => {
  assertEquals(await store.recordEvent("AE_1", "checkout.session.completed", "cos-1", { id: "AE_1" }), true);
  assertEquals(await store.recordEvent("AE_1", "checkout.session.completed", "cos-1", { id: "AE_1" }), false);
  assertEquals(await store.recordEvent("AE_2", "merchant.payment_received", null, null), true);
});

contract("hitRateLimit uses fixed windows per key", async (store) => {
  const at = (s: number) => new Date(Date.parse(T0) + s * 1000).toISOString();
  const hits = [];
  for (let i = 0; i < 4; i++) hits.push(await store.hitRateLimit("preview:ip1", 3600, 3, at(i)));
  assertEquals(hits, [true, true, true, false]);
  assertEquals(await store.hitRateLimit("preview:ip2", 3600, 3, at(5)), true, "keys are independent");
  assertEquals(await store.hitRateLimit("preview:ip1", 3600, 3, at(3599)), false, "same window");
  assertEquals(await store.hitRateLimit("preview:ip1", 3600, 3, at(3600)), true, "window restarts after windowSeconds");
  assertEquals(await store.hitRateLimit("preview:ip1", 3600, 3, at(3601)), true);
  assertEquals(await store.hitRateLimit("preview:ip1", 3600, 3, at(3602)), true);
  assertEquals(await store.hitRateLimit("preview:ip1", 3600, 3, at(3603)), false);
});

contract("createPayout attaches only paid, wave, unattached orders and computes the amount", async (store) => {
  const w1 = await insertPaid(store, { amount: 1500 });
  const w2 = await insertPaid(store, { amount: 1000 });
  const manual = await insertPaid(store, { amount: 1500, method: "manual" });
  const unpaid = orderRow();
  await store.insertOrder(unpaid);

  const row = await store.createPayout(payoutArgs());
  assert(row);
  assertEquals(row.amount, computePayoutAmount(2500, 0.01, 0.01, null));
  assertEquals(row.amount, 2449);
  assertEquals(
    [row.id, row.day, row.mobile, row.status, row.idempotency_key, row.request_body, row.wave_payout_id, row.fee, row.error],
    ["PO-20261018", "2026-10-18", "+221771234567", "pending", "teranga-cv-PO-20261018", "", null, null, null],
  );
  assertEquals([row.created_at, row.updated_at], ["2026-10-18T20:30:00.000Z", "2026-10-18T20:30:00.000Z"]);
  assertEquals((await store.getOrder(w1.id))?.payout_id, row.id);
  assertEquals((await store.getOrder(w2.id))?.payout_id, row.id);
  assertEquals((await store.getOrder(manual.id))?.payout_id, null);
  assertEquals((await store.getOrder(unpaid.id))?.payout_id, null);

  assertEquals(await store.createPayout(payoutArgs()), null, "second payout for the same day");
  await insertPaid(store, { amount: 1500 });
  const next = await store.createPayout(payoutArgs({ id: "PO-20261019", day: "2026-10-19", idempotencyKey: "teranga-cv-PO-20261019" }));
  assertEquals(next?.amount, computePayoutAmount(1500, 0.01, 0.01, null), "only orders not yet paid out");
});

contract("createPayout is all-or-nothing below the minimum and caps at maxAmount", async (store) => {
  const o = await insertPaid(store, { amount: 1000 });
  assertEquals(await store.createPayout(payoutArgs({ minAmount: 1000 })), null, "979 < 1000");
  assertEquals((await store.getOrder(o.id))?.payout_id, null, "nothing attached");
  assertEquals(await store.listUnsettledPayouts(), []);
  assertEquals(await store.createPayout(payoutArgs({ maxAmount: -50, minAmount: 0 })).then((r) => r?.amount), 0);

  await store.failPayout("PO-20261018", "test", T0);
  const capped = await store.createPayout(payoutArgs({ id: "PO-20261020", day: "2026-10-20", idempotencyKey: "teranga-cv-PO-20261020", maxAmount: 500, minAmount: 1 }));
  assertEquals(capped?.amount, computePayoutAmount(1000, 0.01, 0.01, 500));
  assertEquals(capped?.amount, 494);
});

contract("createPayout refuses a reused payout id or idempotency key", async (store) => {
  const o = await insertPaid(store, { amount: 5000 });
  assert(await store.createPayout(payoutArgs()));
  await store.failPayout("PO-20261018", "x", T0);
  assertEquals(await store.createPayout(payoutArgs({ day: "2026-10-19" })), null, "same id, other day");
  assertEquals(await store.createPayout(payoutArgs({ id: "PO-X", day: "2026-10-19" })), null, "same idempotency key");
  assertEquals((await store.getOrder(o.id))?.payout_id, null);
});

contract("updatePayout, failPayout and listUnsettledPayouts", async (store) => {
  const o = await insertPaid(store, { amount: 5000 });
  const d1 = await store.createPayout(payoutArgs());
  await insertPaid(store, { amount: 5000 });
  const d2 = await store.createPayout(payoutArgs({ id: "PO-20261019", day: "2026-10-19", idempotencyKey: "teranga-cv-PO-20261019" }));
  assert(d1 && d2);
  await store.updatePayout(d2.id, { status: "processing", wave_payout_id: "pt-2", updated_at: "2026-10-19T20:31:00.000Z" });
  await store.updatePayout(d1.id, { status: "unknown", request_body: '{"a":1}', error: "timeout", updated_at: "2026-10-18T20:31:00.000Z" });
  const unsettled = await store.listUnsettledPayouts();
  assertEquals(unsettled.map((p) => [p.id, p.status]), [[d1.id, "unknown"], [d2.id, "processing"]]);
  assertEquals([unsettled[0].request_body, unsettled[0].error, unsettled[0].updated_at], ['{"a":1}', "timeout", "2026-10-18T20:31:00.000Z"]);
  await assertRejects(() => store.updatePayout(d1.id, { amount: 1 }));

  await store.updatePayout(d2.id, { status: "succeeded", fee: 50, updated_at: "2026-10-20T20:31:00.000Z" });
  await store.failPayout(d1.id, "insufficient-funds", "2026-10-19T20:30:00.000Z");
  assertEquals(await store.listUnsettledPayouts(), []);
  assertEquals((await store.getOrder(o.id))?.payout_id, null, "failed payout detaches its orders");
  const stats = await store.stats("2026-10-20T21:00:00.000Z");
  const byId = Object.fromEntries(stats.payouts.map((p) => [p.id, p]));
  assertEquals([byId[d1.id].status, byId[d1.id].error, byId[d1.id].updated_at], ["failed", "insufficient-funds", "2026-10-19T20:30:00.000Z"]);
  assertEquals([byId[d2.id].status, byId[d2.id].fee, byId[d2.id].wave_payout_id], ["succeeded", 50, "pt-2"]);
});

contract("purge removes personal data by age and status", async (store) => {
  const now = "2026-12-01T12:00:00.000Z";
  const daysAgo = (d: number) => new Date(Date.parse(now) - d * 86_400_000).toISOString();
  const oldUnpaid = orderRow({ created_at: daysAgo(4), status: "awaiting_manual", manual_payer_phone: "+221771234567" });
  const freshUnpaid = orderRow({ created_at: daysAgo(2) });
  await store.insertOrder(oldUnpaid);
  await store.insertOrder(freshUnpaid);
  const oldPaid = await insertPaid(store, { paidAt: daysAgo(31), createdAt: daysAgo(31) });
  const recentPaid = await insertPaid(store, { paidAt: daysAgo(10), createdAt: daysAgo(40) });

  const n = await store.purge(daysAgo(3), daysAgo(30), now);
  assertEquals(n, 2);
  for (const id of [oldUnpaid.id, oldPaid.id]) {
    const o = await store.getOrder(id);
    assertEquals([o?.input, o?.document, o?.manual_payer_phone, o?.ip_hash, o?.purged_at], [null, null, null, null, now]);
  }
  for (const id of [freshUnpaid.id, recentPaid.id]) {
    const o = await store.getOrder(id);
    assertEquals(o?.purged_at, null);
    assert(o?.input && o?.document);
  }
  assertEquals((await store.getOrder(oldPaid.id))?.status, "paid", "payment facts are kept");
  assertEquals(await store.purge(daysAgo(3), daysAgo(30), now), 0, "already purged rows are not counted again");
});

contract("stats aggregates by UTC day", async (store) => {
  const now = "2026-10-18T21:00:00.000Z";
  await insertPaid(store, { amount: 1500, paidAt: "2026-10-18T00:00:00.000Z" }); // today, first instant
  await insertPaid(store, { amount: 1000, paidAt: "2026-10-18T20:59:00.000Z", method: "manual" }); // today, manual
  await insertPaid(store, { amount: 1000, paidAt: "2026-10-17T23:59:59.999Z" }); // yesterday
  await insertPaid(store, { amount: 1500, paidAt: "2026-10-12T08:00:00.000Z" }); // 6 days ago: in last7
  await insertPaid(store, { amount: 1500, paidAt: "2026-10-11T08:00:00.000Z" }); // 7 days ago: last30 only
  await insertPaid(store, { amount: 1000, paidAt: "2026-09-01T08:00:00.000Z" }); // all time only
  await store.insertOrder(orderRow({ created_at: "2026-10-18T09:00:00.000Z", status: "awaiting_manual", manual_payer_phone: "+221770000001" }));
  const attached = await insertPaid(store, { amount: 1500, paidAt: "2026-10-10T08:00:00.000Z" });
  assert(await store.createPayout(payoutArgs({ day: "2026-10-10", id: "PO-20261010", idempotencyKey: "k-1010", nowIso: "2026-10-10T20:30:00.000Z" })));

  const s = await store.stats(now);
  assertEquals(s.today, { orders: 3, paid: 2, revenue: 2500 });
  assertEquals(s.yesterday, { orders: 1, paid: 1, revenue: 1000 });
  assertEquals(s.last7, { orders: 5, paid: 4, revenue: 5000 });
  assertEquals(s.last30, { orders: 7, paid: 6, revenue: 8000 });
  assertEquals(s.allTime, { paid: 7, revenue: 9000 });
  assertEquals(s.pendingPayout, 0, "everything wave was attached to PO-20261010");
  assertEquals(s.payouts.map((p) => p.id), ["PO-20261010"]);
  assertEquals(s.recentOrders.length, 8);
  assertEquals(s.recentOrders[0].paid_at, "2026-10-18T20:59:00.000Z", "newest first");
  assertEquals(s.recentOrders.find((o) => o.status === "awaiting_manual")?.manual_payer_phone, "+221770000001");
  assertEquals(Object.keys(s.recentOrders[0]).sort(), [
    "amount",
    "created_at",
    "id",
    "manual_amount",
    "manual_payer_phone",
    "paid_at",
    "payment_detected_at",
    "payment_method",
    "product",
    "status",
  ]);
  assert(s.recentOrders.some((o) => o.id === attached.id));

  await insertPaid(store, { amount: 1500, paidAt: "2026-10-18T20:00:00.000Z" });
  assertEquals((await store.stats(now)).pendingPayout, 1500);
});

contract("getSettings returns the stored key/value pairs", async (store, impl) => {
  assertEquals(await store.getSettings(), {});
  await impl.seedSettings(store, { ADMIN_KEY: "k1", OWNER_WAVE_MOBILE: "77 123 45 67" });
  assertEquals(await store.getSettings(), { ADMIN_KEY: "k1", OWNER_WAVE_MOBILE: "77 123 45 67" });
});

// --- Cross-implementation equivalence ---------------------------------------------------------

Deno.test({
  name: "store contract: Memory and SQL produce identical stats for the same history",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await db.reset();
    const stores = [new MemoryStore(), sqlStore(db)];
    for (const store of stores) {
      const ids = ["TCV-00000A01", "TCV-00000A02", "TCV-00000A03", "TCV-00000A04"];
      for (const [i, id] of ids.entries()) {
        await store.insertOrder(orderRow({ id, created_at: `2026-10-1${i + 5}T10:00:00.000Z`, amount: 1000 + 250 * i }));
      }
      await store.markPaid(ids[0], paidArgs({ paidAmount: 1000, paidAt: "2026-10-16T10:00:00.000Z" }));
      await store.markPaid(ids[2], paidArgs({ paidAmount: 1500, paidAt: "2026-10-18T09:00:00.000Z", method: "manual" }));
      await store.markPaid(ids[3], paidArgs({ paidAmount: 1750, paidAt: "2026-10-18T09:30:00.000Z" }));
      await store.createPayout(payoutArgs({ minAmount: 1, nowIso: "2026-10-18T20:30:00.000Z" }));
    }
    const [mem, sql] = await Promise.all(stores.map((s) => s.stats("2026-10-18T21:00:00.000Z")));
    assertEquals(mem, sql);
  },
});

// --- SQL-only guarantees ----------------------------------------------------------------------

Deno.test({
  name: "schema: migration is idempotent and leaves data intact",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await db.reset();
    const store = sqlStore(db);
    const row = orderRow();
    await store.insertOrder(row);
    await db.migrate();
    assertEquals(await store.getOrder(row.id), plain(row));
  },
});

Deno.test({
  name: "schema: only service_role may execute tcv_* functions; RLS on every table",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const fns = await db.query(
      `select p.oid::regprocedure::text as sig,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
              has_function_privilege('service_role', p.oid, 'execute') as service_role,
              p.prosecdef as definer,
              coalesce(array_to_string(p.proconfig, ','), '') as config
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'tcv\\_%'`,
      [],
    );
    assertEquals(fns.rows.length, Object.keys(RPC_SIGNATURES).length);
    for (const f of fns.rows) {
      assertEquals([f.anon, f.authenticated, f.service_role, f.definer], [false, false, true, true], String(f.sig));
      assertEquals(f.config, 'search_path=""', String(f.sig));
    }
    const tables = await db.query(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'tcv' and c.relkind = 'r' order by c.relname`,
      [],
    );
    assertEquals(tables.rows.map((t) => [t.relname, t.relrowsecurity]), [
      ["events", true],
      ["orders", true],
      ["payouts", true],
      ["rate_limits", true],
      ["settings", true],
    ]);
    const helpers = await db.query(
      `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'tcv' and has_function_privilege('anon', p.oid, 'execute')`,
      [],
    );
    assertEquals(helpers.rows[0].n, 0);
  },
});

Deno.test({
  name: "schema: createPayout rolls back entirely when attaching orders fails",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await db.reset();
    const store = sqlStore(db);
    const o = await insertPaid(store, { amount: 5000 });
    await db.db.exec(`
      create or replace function tcv.test_block_attach() returns trigger language plpgsql as $$
      begin raise exception 'attach blocked'; end $$;
      create trigger test_block_attach before update of payout_id on tcv.orders
        for each row execute function tcv.test_block_attach();`);
    try {
      await assertRejects(() => store.createPayout(payoutArgs()));
      assertEquals(await store.listUnsettledPayouts(), [], "payout row rolled back");
      assertEquals((await store.getOrder(o.id))?.payout_id, null);
    } finally {
      await db.db.exec("drop trigger test_block_attach on tcv.orders; drop function tcv.test_block_attach();");
    }
    assert(await store.createPayout(payoutArgs()));
  },
});

Deno.test({
  name: "schema: tcv.payout_amount mirrors computePayoutAmount",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const cases: Array<[number, number, number, number | null]> = [];
    let x = 12345;
    const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 300; i++) {
      const gross = Math.floor(rnd() * 2_000_000);
      const fee = [0, 0.01, 0.015, 0.02, 0.1][i % 5];
      const pfee = [0.01, 0, 0.005, 0.02][i % 4];
      const max = i % 3 === 0 ? null : Math.floor(rnd() * 2_000_000) - 1000;
      cases.push([gross, fee, pfee, max]);
    }
    for (const g of [0, 1, 2, 100, 999, 1000, 1001, 1500, 3000, 99_999]) cases.push([g, 0.01, 0.01, null]);
    const res = await db.query(
      `select tcv.payout_amount((e.v ->> 'g')::bigint, (e.v ->> 'f')::float8, (e.v ->> 'p')::float8,
                                (e.v ->> 'm')::float8) as amount
         from jsonb_array_elements($1::jsonb) with ordinality as e(v, n)
        order by e.n`,
      [JSON.stringify(cases.map(([g, f, p, m]) => ({ g, f, p, m })))],
    );
    assertEquals(res.rows.map((r) => r.amount), cases.map(([g, f, p, m]) => computePayoutAmount(g, f, p, m)));
  },
});

globalThis.addEventListener("unload", () => {
  db.close();
});
