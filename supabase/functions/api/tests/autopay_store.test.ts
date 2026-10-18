// Autopay store methods: identical scenarios on MemoryStore, SqlStore (PGlite + every migration) and
// SupabaseStore (PostgREST stand-in), plus the SQL-only guarantees of 20261018000005_autopay.sql.
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { MemoryStore } from "../lib/store_memory.ts";
import type { OrderRow, Store } from "../lib/types.ts";
import { PHONE_EVENT_TYPE } from "../lib/autopay.ts";
import { orderRow, T0 } from "./fixtures/backend_harness.ts";
import { openTestDb, sqlStore, supabaseStore } from "./fixtures/backend_pglite.ts";
import type { TestDb } from "./fixtures/backend_pglite.ts";

const db: TestDb = await openTestDb();

const IMPLS: Array<{ name: string; make(): Promise<Store> }> = [
  { name: "MemoryStore", make: () => Promise.resolve(new MemoryStore()) },
  { name: "SqlStore(PGlite)", make: async () => (await db.reset(), sqlStore(db)) },
  { name: "SupabaseStore(PostgREST stand-in)", make: async () => (await db.reset(), supabaseStore(db)) },
];

function contract(name: string, fn: (store: Store) => Promise<void>) {
  for (const impl of IMPLS) {
    Deno.test({
      name: `autopay store [${impl.name}] ${name}`,
      sanitizeOps: false,
      sanitizeResources: false,
      fn: async () => fn(await impl.make()),
    });
  }
}

const SINCE = new Date(Date.parse(T0) - 48 * 3_600_000).toISOString();
const hoursAgo = (h: number) => new Date(Date.parse(T0) - h * 3_600_000).toISOString();
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));

async function openOrder(store: Store, over: Partial<OrderRow> = {}): Promise<OrderRow> {
  const row = orderRow({ status: "checkout", amount: 1500, created_at: hoursAgo(1), ...over });
  await store.insertOrder(row);
  return row;
}

contract("insertOrder / getOrder round-trip the autopay fields", async (store) => {
  const row = orderRow({
    status: "checkout",
    manual_amount: 1487,
    payment_detected_at: "2026-10-18T10:01:00.000Z",
    payment_detected_text: "Vous avez reçu 1 487F de Awa",
  });
  await store.insertOrder(row);
  assertEquals(await store.getOrder(row.id), plain(row));
});

contract("assignManualAmount: smallest free offset, idempotent, per amount value", async (store) => {
  const a = await openOrder(store);
  const b = await openOrder(store);
  const cv = await openOrder(store, { amount: 1000 });
  assertEquals(await store.assignManualAmount(a.id, 1500, 49, SINCE), 1499);
  assertEquals(await store.assignManualAmount(b.id, 1500, 49, SINCE), 1498);
  assertEquals(await store.assignManualAmount(a.id, 1500, 49, SINCE), 1499, "idempotent");
  assertEquals(await store.assignManualAmount(cv.id, 1000, 49, SINCE), 999, "another price has its own range");
  assertEquals((await store.getOrder(b.id))?.manual_amount, 1498);
  assertEquals(await store.assignManualAmount("TCV-ZZZZZZZZ", 1500, 49, SINCE), null);
});

contract("assignManualAmount: paid, old and non-manual orders free their amount", async (store) => {
  const paid = await openOrder(store);
  assertEquals(await store.assignManualAmount(paid.id, 1500, 49, SINCE), 1499);
  await store.markPaid(paid.id, { method: "manual", paidAmount: 1499, transactionId: null, sessionId: null, paidAt: T0 });
  const old = await openOrder(store, { created_at: hoursAgo(50) });
  assertEquals(await store.assignManualAmount(old.id, 1500, 49, hoursAgo(60)), 1499, "the paid order's amount is free again");
  const fresh = await openOrder(store);
  assertEquals(await store.assignManualAmount(fresh.id, 1500, 49, SINCE), 1499, "the 50 h old order is outside the window");
  const preview = await openOrder(store, { status: "preview" });
  assertEquals(await store.assignManualAmount(preview.id, 1500, 49, SINCE), 1498);
});

contract("assignManualAmount: 49 concurrent orders get 49 distinct amounts, the 50th falls back", async (store) => {
  const rows: OrderRow[] = [];
  for (let i = 0; i < 50; i++) rows.push(await openOrder(store, { created_at: new Date(Date.parse(T0) - i * 1000).toISOString() }));
  const got = await Promise.all(rows.map((r) => store.assignManualAmount(r.id, 1500, 49, SINCE)));
  const assigned = got.filter((v): v is number => v !== null);
  assertEquals(assigned.length, 49);
  assertEquals(new Set(assigned).size, 49);
  assertEquals([Math.min(...assigned), Math.max(...assigned)], [1451, 1499]);
  assertEquals(got.filter((v) => v === null).length, 1);
  const unassigned = rows[got.indexOf(null)];
  assertEquals((await store.getOrder(unassigned.id))?.manual_amount, null);
});

contract("listOpenManualOrders: unpaid checkout/awaiting_manual orders since the window, newest first", async (store) => {
  const a = await openOrder(store, { created_at: hoursAgo(3) });
  const b = await openOrder(store, { status: "awaiting_manual", created_at: hoursAgo(1) });
  await openOrder(store, { status: "preview", created_at: hoursAgo(1) });
  await openOrder(store, { created_at: hoursAgo(49) });
  const paid = await openOrder(store, { created_at: hoursAgo(2) });
  await store.markPaid(paid.id, { method: "manual", paidAmount: 1500, transactionId: null, sessionId: null, paidAt: T0 });
  await store.assignManualAmount(b.id, 1500, 49, SINCE);
  const open = await store.listOpenManualOrders(SINCE);
  assertEquals(open.map((o) => o.id), [b.id, a.id]);
  assertEquals(open[0].manual_amount, 1499);
  assertEquals(open[0].input !== null, true, "full rows");
});

contract("recordPaymentDetection stores the text without marking the order paid", async (store) => {
  const o = await openOrder(store);
  await store.recordPaymentDetection(o.id, "Vous avez reçu 1 499F de Awa", "2026-10-18T10:02:00.000Z");
  const got = await store.getOrder(o.id);
  assertEquals([got?.status, got?.payment_detected_at, got?.payment_detected_text, got?.paid_at], [
    "checkout",
    "2026-10-18T10:02:00.000Z",
    "Vous avez reçu 1 499F de Awa",
    null,
  ]);
  await store.recordPaymentDetection("TCV-ZZZZZZZZ", "x", T0);
});

contract("purge clears the payer's notification text with the other personal data", async (store) => {
  const now = "2026-12-01T12:00:00.000Z";
  const o = orderRow({ status: "checkout", created_at: "2026-11-20T10:00:00.000Z", manual_amount: 1499 });
  await store.insertOrder(o);
  await store.recordPaymentDetection(o.id, "Vous avez reçu 1 499F de Awa Ndiaye", "2026-11-20T10:05:00.000Z");
  assertEquals(await store.purge("2026-11-28T12:00:00.000Z", "2026-11-01T12:00:00.000Z", now), 1);
  const got = await store.getOrder(o.id);
  assertEquals([got?.payment_detected_text, got?.payment_detected_at, got?.manual_amount, got?.purged_at], [
    null,
    "2026-11-20T10:05:00.000Z",
    1499,
    now,
  ]);
});

contract("stats: recent orders expose manual_amount / payment_detected_at; last phone notification time", async (store) => {
  const o = await openOrder(store);
  await store.assignManualAmount(o.id, 1500, 49, SINCE);
  await store.recordPaymentDetection(o.id, "Vous avez reçu 1 499F", "2026-10-18T10:03:00.000Z");
  const before = (await store.stats(T0)) as unknown as Record<string, unknown> & { recentOrders: Array<Record<string, unknown>> };
  assertEquals([before.recentOrders[0].manual_amount, before.recentOrders[0].payment_detected_at], [1499, "2026-10-18T10:03:00.000Z"]);
  assertEquals(before.lastPhoneNotificationAt, null);
  await store.recordEvent("evt-wave-1", "checkout.session.completed", null, {});
  assertEquals(((await store.stats(T0)) as unknown as Record<string, unknown>).lastPhoneNotificationAt, null, "other events do not count");
  const t0 = Date.now();
  await store.recordEvent("phone:abc", PHONE_EVENT_TYPE, null, { ignored: "not_incoming" });
  const last = ((await store.stats(T0)) as unknown as Record<string, unknown>).lastPhoneNotificationAt as string;
  assert(typeof last === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(last), String(last));
  assert(Math.abs(Date.parse(last) - t0) < 60_000, "recorded at the time it arrived");
});

Deno.test({
  name: "autopay store: Memory and SQL agree on stats with manual amounts and detections",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await db.reset();
    const stores = [new MemoryStore(), sqlStore(db)];
    for (const store of stores) {
      for (const [i, id] of ["TCV-00000B01", "TCV-00000B02", "TCV-00000B03"].entries()) {
        await store.insertOrder(orderRow({ id, status: "checkout", created_at: `2026-10-18T0${i + 1}:00:00.000Z` }));
        await store.assignManualAmount(id, 1500, 49, SINCE);
      }
      await store.recordPaymentDetection("TCV-00000B02", "Vous avez reçu 1 498F", "2026-10-18T09:00:00.000Z");
      await store.markPaid("TCV-00000B02", { method: "manual", paidAmount: 1498, transactionId: null, sessionId: null, paidAt: "2026-10-18T09:00:00.000Z" });
    }
    const [mem, sql] = await Promise.all(stores.map((s) => s.stats("2026-10-18T21:00:00.000Z")));
    assertEquals(mem, sql);
  },
});

Deno.test({
  name: "autopay schema: re-running every migration keeps manual amounts and detections",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await db.reset();
    const store = sqlStore(db);
    const o = orderRow({ status: "checkout" });
    await store.insertOrder(o);
    await store.assignManualAmount(o.id, 1500, 49, SINCE);
    await store.recordPaymentDetection(o.id, "Vous avez reçu 1 499F", T0);
    const before = await store.getOrder(o.id);
    await db.migrate();
    assertEquals(await store.getOrder(o.id), before);
    assertEquals(before?.manual_amount, 1499);
  },
});

Deno.test({
  name: "autopay schema: the new functions are service_role only, security definer, empty search_path",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const res = await db.query(
      `select p.proname as name,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
              has_function_privilege('service_role', p.oid, 'execute') as service_role,
              p.prosecdef as definer,
              coalesce(array_to_string(p.proconfig, ','), '') as config
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('tcv_assign_manual_amount', 'tcv_list_open_manual_orders', 'tcv_record_payment_detection')
        order by p.proname`,
      [],
    );
    assertEquals(res.rows.map((r) => [r.name, r.anon, r.authenticated, r.service_role, r.definer, r.config]), [
      ["tcv_assign_manual_amount", false, false, true, true, 'search_path=""'],
      ["tcv_list_open_manual_orders", false, false, true, true, 'search_path=""'],
      ["tcv_record_payment_detection", false, false, true, true, 'search_path=""'],
    ]);
  },
});

globalThis.addEventListener("unload", () => {
  db.close();
});
