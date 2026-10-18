// POST /cron/reconcile, cron and admin authentication, GET /admin/stats and manual unlock.
import { assertEquals } from "jsr:@std/assert@1.0.13";
import { WaveError } from "../lib/types.ts";
import { ADMIN_KEY, createCheckout, createOrder, CRON_SECRET, DAY, makeHarness } from "./fixtures/backend_harness.ts";
import type { Harness } from "./fixtures/backend_harness.ts";

const cron = (h: Harness, path: string, secret: string | null = CRON_SECRET) =>
  h.call("POST", path, { headers: secret === null ? {} : { "x-cron-secret": secret } });
const admin = (h: Harness, method: string, path: string, key: string | null = ADMIN_KEY) =>
  h.call(method, path, { headers: key === null ? {} : { authorization: `Bearer ${key}` } });

Deno.test("reconcile: confirms paid sessions that missed their webhook", async () => {
  const h = makeHarness();
  const a = await createCheckout(h);
  const b = await createCheckout(h);
  const c = await createCheckout(h);
  h.wave!.completeSession(a.sessionId);
  h.wave!.completeSession(c.sessionId, { amount: "100" }); // underpaid: not confirmed
  const res = await cron(h, "/cron/reconcile");
  assertEquals([res.status, res.body], [200, { ok: true, checked: 3, paid: 1 }]);
  assertEquals((await h.store.getOrder(a.id))?.status, "paid");
  assertEquals((await h.store.getOrder(b.id))?.status, "checkout");
  assertEquals((await h.store.getOrder(c.id))?.status, "checkout");
  assertEquals((await cron(h, "/cron/reconcile")).body, { ok: true, checked: 2, paid: 0 });
});

Deno.test("reconcile: ignores checkouts older than 24 h and stops on a Wave 429", async () => {
  const h = makeHarness();
  const old = await createCheckout(h);
  h.wave!.completeSession(old.sessionId);
  h.clock.advance(DAY + 1000);
  const fresh = await createCheckout(h);
  h.wave!.completeSession(fresh.sessionId);
  h.clock.advance(1000); // newest first: fresh2 is looked up before fresh
  const fresh2 = await createCheckout(h);
  h.wave!.failNext("getCheckoutSession", new WaveError("slow down", 429, "rate-limit-exceeded", true));
  const limited = await cron(h, "/cron/reconcile");
  assertEquals(limited.body, { ok: true, checked: 0, paid: 0 });
  assertEquals(h.wave!.callsOf("getCheckoutSession").length, 1, "stopped after the 429");

  h.wave!.failNext("getCheckoutSession", new WaveError("boom", 500, "internal", true));
  const partial = await cron(h, "/cron/reconcile");
  assertEquals(partial.body, { ok: true, checked: 1, paid: 1 }, "other errors skip only that order");
  assertEquals((await h.store.getOrder(fresh.id))?.status, "paid");
  const next = await cron(h, "/cron/reconcile");
  assertEquals(next.body, { ok: true, checked: 1, paid: 0 });
  assertEquals((await h.store.getOrder(old.id))?.status, "checkout", "older than 24 h: left alone");
  assertEquals((await h.store.getOrder(fresh2.id))?.status, "checkout");
});

Deno.test("reconcile without a Wave client is skipped", async () => {
  const h = makeHarness({ wave: null });
  assertEquals((await cron(h, "/cron/reconcile")).body, { ok: true, skipped: "no_wave" });
});

Deno.test("cron endpoints require the exact x-cron-secret", async () => {
  const h = makeHarness();
  for (const path of ["/cron/reconcile", "/cron/daily"]) {
    assertEquals((await cron(h, path, null)).status, 401, path);
    assertEquals((await cron(h, path, "wrong")).status, 401, path);
    assertEquals((await cron(h, path, CRON_SECRET + "x")).status, 401, path);
    assertEquals((await cron(h, path)).status, 200, path);
  }
  const unset = makeHarness({ env: { CRON_SECRET: undefined } });
  assertEquals((await cron(unset, "/cron/daily", "")).status, 401);
  assertEquals((await cron(unset, "/cron/daily", null)).body.error, "unauthorized");
});

Deno.test("admin endpoints require the bearer ADMIN_KEY", async () => {
  const h = makeHarness();
  const { id } = await createOrder(h);
  assertEquals((await admin(h, "GET", "/admin/stats", null)).status, 401);
  assertEquals((await admin(h, "GET", "/admin/stats", "nope")).status, 401);
  assertEquals((await admin(h, "POST", `/admin/orders/${id}/unlock`, "nope")).status, 401);
  assertEquals((await h.call("GET", "/admin/stats", { headers: { authorization: ADMIN_KEY } })).status, 401);
  const unset = makeHarness({ env: { ADMIN_KEY: undefined } });
  assertEquals((await admin(unset, "GET", "/admin/stats", "")).status, 401);
  assertEquals((await admin(unset, "GET", "/admin/stats", "undefined")).status, 401);
});

Deno.test("admin stats report revenue, orders and configuration health", async () => {
  const h = makeHarness();
  const { id } = await createOrder(h);
  await createOrder(h, "cv");
  await admin(h, "POST", `/admin/orders/${id}/unlock`);
  const res = await admin(h, "GET", "/admin/stats");
  assertEquals(res.status, 200);
  assertEquals(res.body.stats.today, { orders: 2, paid: 1, revenue: 1500 });
  assertEquals(res.body.stats.pendingPayout, 0, "manual payments never enter payouts");
  assertEquals(res.body.stats.recentOrders.length, 2);
  assertEquals(res.body.health, {
    wave: true,
    webhook: true,
    payout: true,
    manual: false,
    llm: false,
    ownerWaveMobile: "+221 77 123 45 67",
  });
  const bare = makeHarness({ wave: null, env: { MANUAL_WAVE_NUMBER: "770000000", OWNER_WAVE_MOBILE: "123", WAVE_WEBHOOK_SECRET: undefined } });
  assertEquals((await admin(bare, "GET", "/admin/stats")).body.health, {
    wave: false,
    webhook: false,
    payout: false,
    manual: true,
    llm: false,
    ownerWaveMobile: null,
  });
});

Deno.test("admin unlock marks an order paid once (manual method, order amount)", async () => {
  const h = makeHarness();
  const { id } = await createOrder(h, "lettre");
  const first = await admin(h, "POST", `/admin/orders/${id}/unlock`);
  assertEquals([first.status, first.body], [200, { ok: true, changed: true }]);
  const second = await admin(h, "POST", `/admin/orders/${id}/unlock`);
  assertEquals(second.body, { ok: true, changed: false });
  const order = (await h.store.getOrder(id))!;
  assertEquals([order.status, order.payment_method, order.paid_amount, order.paid_at], ["paid", "manual", 1000, h.clock.iso()]);
  assertEquals((await admin(h, "POST", "/admin/orders/TCV-ZZZZZZZZ/unlock")).status, 404);
  assertEquals((await admin(h, "POST", "/admin/orders/garbage/unlock")).status, 404);
});
