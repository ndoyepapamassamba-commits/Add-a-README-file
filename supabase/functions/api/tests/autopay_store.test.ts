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

/** holdManualAmount at T0 (holds: unpaid 72 h, paid 48 h), or `at` another time. */
const hold = (store: Store, id: string, base = 1500, at = T0, maxOffset = 49) =>
  store.holdManualAmount(id, {
    base,
    maxOffset,
    nowIso: at,
    unpaidSinceIso: new Date(Date.parse(at) - 72 * 3_600_000).toISOString(),
    paidSinceIso: new Date(Date.parse(at) - 48 * 3_600_000).toISOString(),
  });
const later = (h: number) => new Date(Date.parse(T0) + h * 3_600_000).toISOString();
/**
 * The daily purge, at `at`, of the unpaid orders created before `createdBefore` (their customers can no longer open
 * them): only the 72 h display hold is left to them.
 */
const purgeUnpaid = (store: Store, createdBefore: string, at: string) => store.purge(createdBefore, "2000-01-01T00:00:00.000Z", at);

contract("holdManualAmount: smallest free offset, stable, per amount value; showing it again restarts the hold", async (store) => {
  const a = await openOrder(store);
  const b = await openOrder(store);
  const cv = await openOrder(store, { amount: 1000 });
  assertEquals(await hold(store, a.id), 1499);
  assertEquals(await hold(store, b.id), 1498);
  assertEquals((await store.getOrder(a.id))?.manual_amount_at, T0, "the hold starts when the amount is shown");
  assertEquals(await hold(store, a.id, 1500, later(1)), 1499, "same amount when the customer comes back");
  assertEquals((await store.getOrder(a.id))?.manual_amount_at, later(1), "…and its hold restarts");
  assertEquals(await hold(store, cv.id, 1000), 999, "another price has its own range");
  assertEquals((await store.getOrder(b.id))?.manual_amount, 1498);
  assertEquals(await hold(store, "TCV-ZZZZZZZZ"), null);
});

contract("holdManualAmount: the hold runs from the last display, not from the order's creation", async (store) => {
  // Created 70 h ago, shown now: the amount is held for 72 h from now even though the order is old (and purged).
  const old = await openOrder(store, { created_at: hoursAgo(70) });
  assertEquals(await hold(store, old.id), 1499);
  assertEquals(await purgeUnpaid(store, hoursAgo(69), later(1)), 1);
  assertEquals(await hold(store, (await openOrder(store)).id, 1500, later(71)), 1498, "71 h later 1 499 is still held");
  const c = await openOrder(store);
  assertEquals(await hold(store, c.id, 1500, later(73)), 1499, "73 h after the last display 1 499 is free again");
});

contract("holdManualAmount: an open order that is not purged keeps its amount, however long ago it was shown", async (store) => {
  // The daily purge takes unpaid orders 3 days after their creation: until then the customer may still pay late.
  const a = await openOrder(store, { created_at: hoursAgo(5) });
  assertEquals(await hold(store, a.id), 1499);
  const b = await openOrder(store);
  assertEquals(await hold(store, b.id, 1500, later(90)), 1498, "90 h later A is still open: 1 499 stays A's");
  assertEquals(await hold(store, a.id, 1500, later(91)), 1499, "A comes back: the same amount");
  assertEquals(await purgeUnpaid(store, hoursAgo(4), later(92)), 1);
  const c = await openOrder(store);
  assertEquals(await hold(store, c.id, 1500, later(92)), 1497, "purged, but shown 1 h ago: still held");
  const d = await openOrder(store);
  assertEquals(await hold(store, d.id, 1500, later(164)), 1499, "purged and 73 h after its last display: free");
});

contract("holdManualAmount: an expired hold is never handed back as is", async (store) => {
  const a = await openOrder(store, { created_at: hoursAgo(5) });
  assertEquals(await hold(store, a.id), 1499);
  assertEquals(await purgeUnpaid(store, hoursAgo(4), later(75)), 1);
  const b = await openOrder(store);
  assertEquals(await hold(store, b.id, 1500, later(80)), 1499, "A's hold ran out: B gets 1 499");
  assertEquals(await hold(store, a.id, 1500, later(81)), 1498, "A comes back: a new amount, never B's");
  assertEquals((await store.getOrder(a.id))?.manual_amount_at, later(81));
  // When the previous amount is still free, the order keeps it (the customer sees the same figure).
  const c = await openOrder(store);
  assertEquals(await hold(store, c.id, 1500, later(81)), 1497);
  assertEquals(await hold(store, c.id, 1500, later(160)), 1497, "kept, although smaller offsets are free again");
});

contract("holdManualAmount: a paid order keeps its amount 48 h; old, unpaid-preview and Wave-paid orders do not block", async (store) => {
  const paid = await openOrder(store);
  assertEquals(await hold(store, paid.id), 1499);
  await store.markPaid(paid.id, { method: "manual", paidAmount: 1499, transactionId: null, sessionId: null, paidAt: T0 });
  assertEquals(await hold(store, paid.id), 1499, "a paid order keeps its amount, unchanged");
  const next = await openOrder(store);
  assertEquals(await hold(store, next.id), 1498, "1 499 is held by the paid order for 48 h");
  const after = await openOrder(store);
  assertEquals(await hold(store, after.id, 1500, later(49)), 1499, "49 h after the payment it is free again");
  const preview = await openOrder(store, { status: "preview", manual_amount: 1497, manual_amount_at: T0 });
  const d = await openOrder(store);
  assertEquals(await hold(store, d.id), 1497, "a preview order holds nothing");
  assertEquals((await store.getOrder(preview.id))?.manual_amount, 1497);
});

contract("holdManualAmount: 49 concurrent orders get 49 distinct amounts, the 50th gets none", async (store) => {
  const rows: OrderRow[] = [];
  for (let i = 0; i < 50; i++) rows.push(await openOrder(store, { created_at: new Date(Date.parse(T0) - i * 1000).toISOString() }));
  const got = await Promise.all(rows.map((r) => hold(store, r.id)));
  const assigned = got.filter((v): v is number => v !== null);
  assertEquals(assigned.length, 49);
  assertEquals(new Set(assigned).size, 49);
  assertEquals([Math.min(...assigned), Math.max(...assigned)], [1451, 1499]);
  assertEquals(got.filter((v) => v === null).length, 1);
  const unassigned = rows[got.indexOf(null)];
  assertEquals([(await store.getOrder(unassigned.id))?.manual_amount, (await store.getOrder(unassigned.id))?.manual_amount_at], [null, null]);
});

contract("holdManualAmount: an expired amount that cannot be replaced is cleared", async (store) => {
  const a = await openOrder(store, { created_at: hoursAgo(5) });
  assertEquals(await hold(store, a.id, 1500, T0, 1), 1499);
  assertEquals(await purgeUnpaid(store, hoursAgo(4), later(72)), 1);
  const b = await openOrder(store);
  assertEquals(await hold(store, b.id, 1500, later(73), 1), 1499, "B takes 1 499 after A's hold");
  assertEquals(await hold(store, a.id, 1500, later(74), 1), null, "no free amount for A");
  const row = (await store.getOrder(a.id))!;
  assertEquals([row.manual_amount, row.manual_amount_at], [null, null], "A no longer shows (or matches) B's amount");
});

contract("listHeldManualOrders: open manual orders not purged (unique amount, or asked the catalogue price), newest first", async (store) => {
  const a = await openOrder(store, { created_at: hoursAgo(3) });
  const b = await openOrder(store, { status: "awaiting_manual", created_at: hoursAgo(1) });
  await openOrder(store, { status: "preview", created_at: hoursAgo(1), manual_amount: 1490, manual_amount_at: T0 });
  // Shown 80 h ago and not purged yet: its customer may still pay, it still holds 1 491 (and matches it).
  const stale = await openOrder(store, { created_at: hoursAgo(80), manual_amount: 1491 });
  const purged = await openOrder(store, { created_at: hoursAgo(2), manual_amount: 1492, manual_amount_at: T0, purged_at: T0 });
  // Asked the catalogue price (no free amount): listed, it turns the near match off for its price.
  const catalogue = await openOrder(store, { created_at: hoursAgo(4) });
  const wave = await openOrder(store, { created_at: hoursAgo(2), checkout_session_id: "cos-held-test" });
  const purgedCatalogue = await openOrder(store, { created_at: hoursAgo(5), purged_at: T0 });
  const paid = await openOrder(store, { created_at: hoursAgo(2) });
  assertEquals(await hold(store, a.id), 1499);
  assertEquals(await hold(store, b.id), 1498);
  assertEquals(await hold(store, paid.id), 1497);
  await store.markPaid(paid.id, { method: "manual", paidAmount: 1497, transactionId: null, sessionId: null, paidAt: T0 });
  const held = await store.listHeldManualOrders();
  assertEquals(held.map((o) => o.id), [b.id, a.id, catalogue.id, stale.id]);
  assertEquals([held[0].manual_amount, held[0].manual_amount_at], [1498, T0]);
  assertEquals([held[2].manual_amount, held[3].manual_amount], [null, 1491]);
  assertEquals(held[0].input !== null, true, "full rows");
  for (const left of [purged, wave, purgedCatalogue, paid]) assert(!held.some((o) => o.id === left.id), left.id);
  // Its amount stays its own: another order never gets 1 491.
  const other = await openOrder(store);
  assertEquals(await hold(store, other.id, 1500, T0, 9), 1496);
  assertEquals(await hold(store, stale.id), 1491, "shown again: the same amount");
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

contract("purge erases the notification text and payer phone 30 days after the detection, even on a paid course", async (store) => {
  const text = "Vous avez reçu 24 999F de Moussa Sarr (77 123 45 67). Nouveau solde : 80 000F";
  const detected = "2026-11-01T10:00:00.000Z";
  const course = orderRow({ product: "pq_essentiel", amount: 25000, input: null, document: null, status: "checkout", created_at: detected, manual_payer_phone: "+221771234567" });
  await store.insertOrder(course);
  await store.recordPaymentDetection(course.id, text, detected);
  await store.markPaid(course.id, { method: "manual", paidAmount: 24999, transactionId: null, sessionId: null, paidAt: detected });
  const unlocked = orderRow({ product: "pq_essentiel", amount: 25000, input: null, document: null, status: "awaiting_manual", created_at: detected, manual_payer_phone: "+221781112233" });
  await store.insertOrder(unlocked);
  await store.markPaid(unlocked.id, { method: "manual", paidAmount: 24998, transactionId: null, sessionId: null, paidAt: detected });
  const purge = (now: string) =>
    store.purge(new Date(Date.parse(now) - 3 * 86_400_000).toISOString(), new Date(Date.parse(now) - 30 * 86_400_000).toISOString(), now);
  assertEquals(await purge("2026-11-30T09:00:00.000Z"), 0);
  assertEquals((await store.getOrder(course.id))?.payment_detected_text, text, "29 days: kept (claims)");
  assertEquals(await purge("2026-12-01T10:00:01.000Z"), 0, "not counted as a purge");
  for (const id of [course.id, unlocked.id]) {
    const got = (await store.getOrder(id))!;
    assertEquals([got.payment_detected_text, got.manual_payer_phone, got.purged_at, got.status], [null, null, null, "paid"], id);
  }
  assertEquals((await store.getOrder(course.id))?.payment_detected_at, detected, "the detection time stays (accounts)");
});

contract("stats: recent orders expose manual_amount / payment_detected_at; last phone notification time", async (store) => {
  const o = await openOrder(store);
  await hold(store, o.id);
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
        await hold(store, id);
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
    await hold(store, o.id);
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
          and p.proname in ('tcv_assign_manual_amount', 'tcv_list_open_manual_orders', 'tcv_record_payment_detection',
                            'tcv_hold_manual_amount', 'tcv_list_held_manual_orders')
        order by p.proname`,
      [],
    );
    assertEquals(res.rows.map((r) => [r.name, r.anon, r.authenticated, r.service_role, r.definer, r.config]), [
      ["tcv_assign_manual_amount", false, false, true, true, 'search_path=""'],
      ["tcv_hold_manual_amount", false, false, true, true, 'search_path=""'],
      ["tcv_list_held_manual_orders", false, false, true, true, 'search_path=""'],
      ["tcv_list_open_manual_orders", false, false, true, true, 'search_path=""'],
      ["tcv_record_payment_detection", false, false, true, true, 'search_path=""'],
    ]);
  },
});

globalThis.addEventListener("unload", () => {
  db.close();
});
