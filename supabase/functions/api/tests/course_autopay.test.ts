// Autopay hardening for high-ticket orders (SPEC_COURSE §5): a course order (25 000 F) is unlocked by the owner's
// phone ONLY on its exact unique amount. A round 25 000 F family transfer, or any figure close to the price,
// unlocks nothing. Document products keep their rounded-up near match.
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { HIGH_TICKET_MIN_AMOUNT, matchManualOrder, NEAR_MATCH_WINDOW_MS } from "../lib/autopay.ts";
import { ADMIN_KEY, createOrder, DAY, HOUR, MIN, orderRow, T0 } from "./fixtures/backend_harness.ts";
import type { Harness } from "./fixtures/backend_harness.ts";
import { openTestDb, sqlStore } from "./fixtures/backend_pglite.ts";
import { courseCheckout, courseHarness, createCourseOrder, notify, RETURN_BASE, seedCourseSql, waveReceived } from "./fixtures/course_harness.ts";
import type { OrderRow, Store } from "../lib/types.ts";

const NOW = new Date(Date.parse(T0) + 10 * MIN);

function open(over: Partial<OrderRow>): OrderRow {
  return orderRow({ status: "checkout", created_at: T0, ...over });
}

Deno.test("matchManualOrder: high-ticket orders match their exact amount only", () => {
  assertEquals(HIGH_TICKET_MIN_AMOUNT, 10_000);
  const course = open({ product: "pq_essentiel", amount: 25000, manual_amount: 24999 });
  const course2 = open({ product: "pq_essentiel", amount: 25000, manual_amount: 24998 });
  const table: Array<[number, string | null, string]> = [
    [24999, course.id, "exact"],
    [24998, course2.id, "exact"],
    [25000, null, "none"], // round family transfer
    [24990, null, "none"],
    [24997, null, "none"], // one below the second order's amount
    [25099, null, "none"],
    [25100, null, "none"],
  ];
  for (const [amount, id, how] of table) {
    const m = matchManualOrder([course, course2], amount, NOW);
    assertEquals([m.order?.id ?? null, m.how], [id, how], String(amount));
  }
  // Alone, a course order is still never near-matched.
  for (const amount of [25000, 25050, 25100]) assertEquals(matchManualOrder([course], amount, NOW).how, "none", String(amount));
  // No unique amount (all 49 taken): the order never unlocks by itself.
  const unassigned = open({ product: "pq_essentiel", amount: 25000, manual_amount: null });
  assertEquals(matchManualOrder([unassigned], 25000, NOW), { order: null, how: "none" });
});

Deno.test("matchManualOrder: the rule follows the catalogue price `amount` (9 999 still near-matches, 10 000 does not)", () => {
  const below = open({ product: "premium", amount: 9999, manual_amount: 9998 });
  assertEquals(matchManualOrder([below], 10000, NOW).how, "near");
  const at = open({ product: "premium", amount: 10000, manual_amount: 9999 });
  assertEquals(matchManualOrder([at], 10000, NOW).how, "none");
  assertEquals(matchManualOrder([at], 9999, NOW).how, "exact");
  // Document products keep today's behaviour.
  const pack = open({ product: "pack", amount: 1500, manual_amount: 1487 });
  assertEquals(matchManualOrder([pack], 1500, NOW), { order: pack, how: "near" });
  const late = new Date(Date.parse(T0) + NEAR_MATCH_WINDOW_MS + MIN);
  assertEquals(matchManualOrder([pack], 1500, late).how, "none", "the near window still applies");
  // A course order next to a pack order: 1 500 F still goes to the pack, 25 000 F to nobody.
  const course = open({ product: "pq_essentiel", amount: 25000, manual_amount: 24999 });
  assertEquals(matchManualOrder([course, pack], 1500, NOW).order?.id, pack.id);
  assertEquals(matchManualOrder([course, pack], 25000, NOW).how, "none");
});

Deno.test("course autopay over HTTP: 25 000 F, 25.000 FCFA, 24 990 F and 24 997 F unlock nothing; 24 999 F does", async () => {
  const h = await courseHarness();
  const a = await createCourseOrder(h);
  const checkout = await courseCheckout(h, a.id, a.token);
  assertEquals([checkout.status, checkout.body.amount, checkout.body.exactAmount], [200, 25000, 24999]);
  for (const text of [
    "Vous avez reçu 25 000F de Maman. Nouveau solde : 105 000F",
    "Vous avez reçu 25.000 FCFA de Papa",
    "Vous avez reçu 24 990F de Moussa Sarr",
    "Vous avez reçu 24 997F de Moussa Sarr",
    "Vous avez reçu 25 099F de Moussa Sarr",
  ]) {
    const res = await notify(h, text);
    assertEquals([res.status, res.body.matched, res.body.paid], [200, null, false], text);
    assertEquals((await h.store.getOrder(a.id))?.status, "checkout", text);
  }
  const ok = await notify(h, "Vous avez reçu 24 999F de Moussa Sarr. Nouveau solde : 80 000F");
  assertEquals(ok.body, { ok: true, matched: a.id, amount: 24999, paid: true });
  const paid = (await h.store.getOrder(a.id))!;
  assertEquals([paid.status, paid.payment_method, paid.paid_amount], ["paid", "manual", 24999]);
  assert(paid.payment_detected_text?.includes("24 999F"));
  // The notification texts never reach the logs.
  assert(![...h.logs.warn, ...h.logs.error].some((l) => /Maman|Papa|Moussa/.test(l)));
});

Deno.test("course autopay over HTTP: thousands separated by dots ('24.998 FCFA') unlock the right order", async () => {
  const h = await courseHarness();
  const a = await createCourseOrder(h);
  const b = await createCourseOrder(h);
  assertEquals((await courseCheckout(h, a.id, a.token)).body.exactAmount, 24999);
  const second = await courseCheckout(h, b.id, b.token);
  assertEquals([second.body.exactAmount, second.body.exactAmountFormatted], [24998, "24 998 FCFA"]);
  const rb = await notify(h, "Vous avez reçu 24.998 FCFA de Awa Ndiaye");
  assertEquals([rb.body.matched, rb.body.paid], [b.id, true]);
  assertEquals((await h.store.getOrder(a.id))?.status, "checkout", "the other order is untouched");
  const ra = await notify(h, "Vous avez reçu 24.999 FCFA de Fatou Diop");
  assertEquals([ra.body.matched, ra.body.paid], [a.id, true]);
  assertEquals((await h.store.getOrder(a.id))?.paid_amount, 24999);
});

Deno.test("course autopay over HTTP: a pack order still near-matches a rounded 1 500 F (regression)", async () => {
  const h = await courseHarness();
  const course = await createCourseOrder(h);
  await courseCheckout(h, course.id, course.token);
  const pack = await createOrder(h, "pack", "192.0.2.10");
  const res = await h.call("POST", `/orders/${pack.id}/checkout`, { body: { t: pack.token, returnBase: RETURN_BASE } });
  assertEquals(res.body.exactAmount, 1499);
  const n = await notify(h, "Vous avez reçu 1 500F de Awa Ndiaye");
  assertEquals([n.body.matched, n.body.paid], [pack.id, true]);
  assertEquals((await h.store.getOrder(course.id))?.status, "checkout");
});

Deno.test("course autopay: the owner can still unlock a course order from admin.html", async () => {
  const h = await courseHarness();
  const a = await createCourseOrder(h);
  await courseCheckout(h, a.id, a.token);
  await notify(h, "Vous avez reçu 25 000F de Maman");
  const res = await h.call("POST", `/admin/orders/${a.id}/unlock`, { headers: { authorization: `Bearer ${ADMIN_KEY}` } });
  assertEquals(res.body, { ok: true, changed: true });
  const order = (await h.store.getOrder(a.id))!;
  assertEquals([order.status, order.paid_amount], ["paid", 24999], "the amount the buyer was asked to send");
});

// --- Review of 22/10/2026: a 25 000 F course order must never be unlocked by another buyer's transfer ------------

/** Runs `scenario` on a MemoryStore harness and on SqlStore over PGlite with every migration (000001 … 000007). */
function bothStores(name: string, scenario: (h: Harness, store: Store) => Promise<void>) {
  Deno.test(`course autopay [MemoryStore] ${name}`, async () => {
    const h = await courseHarness();
    await scenario(h, h.store);
  });
  Deno.test({
    name: `course autopay [SqlStore(PGlite)] ${name}`,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      const t = await openTestDb();
      try {
        const store = sqlStore(t);
        await seedCourseSql(t, 100_000);
        await scenario(await courseHarness({ store }), store);
      } finally {
        await t.close();
      }
    },
  });
}

bothStores("C1: an amount re-shown after 48 h stays with its order; the late payer unlocks only himself", async (h, store) => {
  const a = await createCourseOrder(h);
  assertEquals((await courseCheckout(h, a.id, a.token)).body.exactAmount, 24999);
  h.clock.advance(48 * HOUR + 5 * MIN);
  const b = await createCourseOrder(h);
  assertEquals((await courseCheckout(h, b.id, b.token)).body.exactAmount, 24998, "24 999 is still A's");
  assertEquals((await courseCheckout(h, a.id, a.token)).body.exactAmount, 24999, "A re-opens the payment panel");
  const r = await notify(h, waveReceived(24999, "Awa Ndiaye"));
  assertEquals([r.body.matched, r.body.paid], [a.id, true]);
  assertEquals([(await store.getOrder(a.id))?.status, (await store.getOrder(b.id))?.status], ["paid", "checkout"]);
  assertEquals((await h.call("GET", `/orders/${b.id}/course?t=${b.token}`)).status, 404, "B reads nothing");
});

bothStores("C1b: checkout 47 h after the order, transfer 65 min later → the same order", async (h) => {
  const a = await createCourseOrder(h);
  h.clock.advance(47 * HOUR);
  assertEquals((await courseCheckout(h, a.id, a.token)).body.exactAmount, 24999);
  h.clock.advance(65 * MIN);
  const b = await createCourseOrder(h);
  assertEquals((await courseCheckout(h, b.id, b.token)).body.exactAmount, 24998);
  assertEquals((await notify(h, waveReceived(24999, "Awa Ndiaye"))).body.matched, a.id);
});

bothStores("R1: the same Wave notification delivered again (+61 s, +1 h) unlocks no other order", async (h, store) => {
  const a = await createCourseOrder(h);
  await courseCheckout(h, a.id, a.token);
  const text = waveReceived(24999, "Moussa Sarr");
  assertEquals((await notify(h, text)).body.matched, a.id);
  h.clock.advance(30_000);
  const b = await createCourseOrder(h);
  assertEquals((await courseCheckout(h, b.id, b.token)).body.exactAmount, 24998, "the paid order keeps 24 999");
  h.clock.advance(31_000);
  assertEquals((await notify(h, text)).body, { ok: true, duplicate: true });
  h.clock.advance(HOUR);
  assertEquals((await notify(h, text)).body, { ok: true, duplicate: true });
  const ob = await store.getOrder(b.id);
  assertEquals([ob?.status, ob?.paid_amount], ["checkout", null]);
});

bothStores("C2: when the 49 amounts are held, the checkout says the owner verifies (autoUnlock false)", async (h, store) => {
  for (let i = 0; i < 49; i++) {
    const o = await createCourseOrder(h);
    assertEquals((await courseCheckout(h, o.id, o.token)).status, 200);
  }
  const victim = await createCourseOrder(h);
  const c = await courseCheckout(h, victim.id, victim.token);
  assertEquals([c.body.amount, c.body.exactAmount, c.body.autoUnlock], [25000, 25000, false]);
  h.clock.advance(MIN);
  assertEquals((await notify(h, waveReceived(25000, "Victime Payeuse"))).body.matched, null);
  assertEquals((await store.getOrder(victim.id))?.status, "checkout", "left to the owner (admin « Débloquer »)");
  assert(h.logs.warn.some((l) => l.includes("no automatic unlock")));
});

bothStores("P1: the notification text of a paid course order is erased after 30 days, the access stays", async (h, store) => {
  const a = await createCourseOrder(h);
  await courseCheckout(h, a.id, a.token);
  const text = "Vous avez reçu 24 999F de Moussa Sarr (77 123 45 67). Nouveau solde : 80 000F";
  assertEquals((await notify(h, text)).body.paid, true);
  const purgeAt = async (days: number) => {
    const now = new Date(h.clock.t + days * DAY);
    await store.purge(new Date(now.getTime() - 3 * DAY).toISOString(), new Date(now.getTime() - 30 * DAY).toISOString(), now.toISOString());
  };
  await purgeAt(29);
  assertEquals((await store.getOrder(a.id))?.payment_detected_text, `Wave ${text}`, "29 days: kept (title + text)");
  await purgeAt(31);
  const o = (await store.getOrder(a.id))!;
  assertEquals([o.payment_detected_text, o.manual_payer_phone, o.purged_at, o.status], [null, null, null, "paid"]);
  assertEquals(o.buyer?.fullName, "Aïssatou N'Diaye-Bâ", "the buyer's name stays for the 24-month access");
});
