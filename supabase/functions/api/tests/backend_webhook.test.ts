// POST /wave/webhook: authentication, deduplication and payment confirmation.
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { WaveError } from "../lib/types.ts";
import type { WaveCheckoutSession } from "../lib/types.ts";
import { checkoutCompletedEvent, signWaveBody } from "../lib/wave.ts";
import { createCheckout, createOrder, makeHarness, WEBHOOK_SECRET } from "./fixtures/backend_harness.ts";
import type { Harness } from "./fixtures/backend_harness.ts";

async function sendWebhook(
  h: Harness,
  event: unknown,
  opts: { t?: number; secret?: string; header?: string; rawBody?: string } = {},
) {
  const raw = opts.rawBody ?? JSON.stringify(event);
  const t = String(opts.t ?? Math.floor(h.clock.t / 1000));
  const v1 = await signWaveBody(opts.secret ?? WEBHOOK_SECRET, t, raw);
  return h.call("POST", "/wave/webhook", {
    rawBody: raw,
    headers: { "content-type": "application/json", "wave-signature": opts.header ?? `t=${t},v1=${v1}` },
  });
}

async function statusOf(h: Harness, id: string) {
  return (await h.store.getOrder(id))?.status;
}

Deno.test("webhook: a valid signed checkout.session.completed marks the order paid", async () => {
  const h = makeHarness();
  const { id, token, sessionId } = await createCheckout(h);
  const res = await sendWebhook(h, checkoutCompletedEvent(h.wave!.completeSession(sessionId), "AE_valid"));
  assertEquals([res.status, res.body], [200, { ok: true, paid: true }]);
  const order = await h.store.getOrder(id);
  assertEquals([order?.status, order?.payment_method, order?.paid_amount], ["paid", "wave", 1500]);
  assert(order?.wave_transaction_id);
  const view = await h.call("GET", `/orders/${id}?t=${token}`);
  assertEquals(view.body.order.status, "paid");
  assert(view.body.document && !view.body.preview);
});

Deno.test("webhook: bad signature, wrong secret or missing header → 401", async () => {
  const h = makeHarness();
  const { id, sessionId } = await createCheckout(h);
  const event = checkoutCompletedEvent(h.wave!.completeSession(sessionId), "AE_bad");
  const t = Math.floor(h.clock.t / 1000);
  assertEquals((await sendWebhook(h, event, { header: `t=${t},v1=${"0".repeat(64)}` })).status, 401);
  assertEquals((await sendWebhook(h, event, { secret: "wrong-secret" })).status, 401);
  const noHeader = await h.call("POST", "/wave/webhook", { body: event });
  assertEquals([noHeader.status, noHeader.body.error], [401, "bad_signature"]);
  assertEquals(await statusOf(h, id), "checkout");
  assertEquals(await h.store.recordEvent("AE_bad", "x", null, null), true, "rejected deliveries are not recorded");
});

Deno.test("webhook: a header with several v1 values is accepted when one matches", async () => {
  const h = makeHarness();
  const { id, sessionId } = await createCheckout(h);
  const event = checkoutCompletedEvent(h.wave!.completeSession(sessionId), "AE_multi");
  const raw = JSON.stringify(event);
  const t = String(Math.floor(h.clock.t / 1000));
  const good = await signWaveBody(WEBHOOK_SECRET, t, raw);
  const res = await sendWebhook(h, event, { rawBody: raw, header: `t=${t},v1=${"a".repeat(64)},v1=${good}` });
  assertEquals(res.status, 200);
  assertEquals(await statusOf(h, id), "paid");
});

Deno.test("webhook: a stale timestamp (> 300 s) is refused", async () => {
  const h = makeHarness();
  const { id, sessionId } = await createCheckout(h);
  const event = checkoutCompletedEvent(h.wave!.completeSession(sessionId), "AE_stale");
  const now = Math.floor(h.clock.t / 1000);
  assertEquals((await sendWebhook(h, event, { t: now - 301 })).status, 401);
  assertEquals((await sendWebhook(h, event, { t: now + 301 })).status, 401);
  assertEquals(await statusOf(h, id), "checkout");
  assertEquals((await sendWebhook(h, event, { t: now - 299 })).status, 200);
  assertEquals(await statusOf(h, id), "paid");
});

Deno.test("webhook: shared-secret mode uses Authorization: Bearer", async () => {
  const h = makeHarness({ env: { WAVE_WEBHOOK_MODE: "shared" } });
  const { id, sessionId } = await createCheckout(h);
  const event = checkoutCompletedEvent(h.wave!.completeSession(sessionId), "AE_shared");
  const wrong = await h.call("POST", "/wave/webhook", { body: event, headers: { authorization: "Bearer nope" } });
  assertEquals(wrong.status, 401);
  const signedOnly = await sendWebhook(h, event);
  assertEquals(signedOnly.status, 401, "a signature is not a bearer secret");
  const ok = await h.call("POST", "/wave/webhook", { body: event, headers: { authorization: `Bearer ${WEBHOOK_SECRET}` } });
  assertEquals([ok.status, ok.body.paid], [200, true]);
  assertEquals(await statusOf(h, id), "paid");
});

Deno.test("webhook: a duplicate event id is acknowledged without reprocessing", async () => {
  const h = makeHarness();
  const { sessionId } = await createCheckout(h);
  const event = checkoutCompletedEvent(h.wave!.completeSession(sessionId), "AE_dup");
  assertEquals((await sendWebhook(h, event)).body, { ok: true, paid: true });
  const fetchesBefore = h.wave!.callsOf("getCheckoutSession").length;
  const again = await sendWebhook(h, event);
  assertEquals([again.status, again.body], [200, { ok: true, duplicate: true }]);
  assertEquals(h.wave!.callsOf("getCheckoutSession").length, fetchesBefore);
});

Deno.test("webhook: an amount below the order price does not pay it", async () => {
  const h = makeHarness();
  const { id, sessionId } = await createCheckout(h);
  const event = checkoutCompletedEvent(h.wave!.completeSession(sessionId, { amount: "1499" }), "AE_low");
  const res = await sendWebhook(h, event);
  assertEquals([res.status, res.body], [200, { ok: true, paid: false }]);
  assertEquals(await statusOf(h, id), "checkout");
  assert(h.logs.warn.some((m) => m.includes("payment mismatch") && m.includes(id)));
});

Deno.test("webhook: a currency other than XOF does not pay the order", async () => {
  const h = makeHarness();
  const { id, sessionId } = await createCheckout(h);
  const event = checkoutCompletedEvent(h.wave!.completeSession(sessionId, { currency: "EUR" }), "AE_eur");
  assertEquals((await sendWebhook(h, event)).body.paid, false);
  assertEquals(await statusOf(h, id), "checkout");
});

Deno.test("webhook: an unknown client_reference is ignored with 200", async () => {
  const h = makeHarness();
  const { sessionId } = await createCheckout(h);
  const session = h.wave!.completeSession(sessionId);
  const res = await sendWebhook(h, checkoutCompletedEvent({ ...session, client_reference: "TCV-ZZZZZZZZ" }, "AE_unknown"));
  assertEquals([res.status, res.body], [200, { ok: true, ignored: true }]);
  const junk = await sendWebhook(h, checkoutCompletedEvent({ ...session, client_reference: null }, "AE_null"));
  assertEquals(junk.body, { ok: true, ignored: true });
});

Deno.test("webhook: the re-fetched session overrides the signed payload", async () => {
  const h = makeHarness();
  const { id, sessionId } = await createCheckout(h);
  const unpaid = (await h.wave!.getCheckoutSession(sessionId)) as WaveCheckoutSession;
  const claimsPaid = { ...unpaid, payment_status: "succeeded", checkout_status: "complete" };
  const res = await sendWebhook(h, checkoutCompletedEvent(claimsPaid, "AE_override_1"));
  assertEquals(res.body.paid, false, "Wave still says processing");
  assertEquals(await statusOf(h, id), "checkout");

  h.wave!.completeSession(sessionId);
  const res2 = await sendWebhook(h, checkoutCompletedEvent(unpaid, "AE_override_2"));
  assertEquals(res2.body.paid, true, "payload says processing but Wave says succeeded");
  assertEquals(await statusOf(h, id), "paid");
});

Deno.test("webhook: falls back to the signed payload when the re-fetch fails", async () => {
  const h = makeHarness();
  const { id, sessionId } = await createCheckout(h);
  const event = checkoutCompletedEvent(h.wave!.completeSession(sessionId), "AE_fallback");
  h.wave!.failNext("getCheckoutSession", new WaveError("offline", 0, "network_error", true));
  assertEquals((await sendWebhook(h, event)).body.paid, true);
  assertEquals(await statusOf(h, id), "paid");
});

Deno.test("webhook: falls back to the payload when the re-fetch exceeds 3 s", async () => {
  const h = makeHarness();
  const { id, sessionId } = await createCheckout(h);
  const event = checkoutCompletedEvent(h.wave!.completeSession(sessionId), "AE_slow");
  h.wave!.delay("getCheckoutSession", 3_500);
  const started = Date.now();
  const res = await sendWebhook(h, event);
  const elapsed = Date.now() - started;
  assertEquals(res.body.paid, true);
  assert(elapsed >= 2_900 && elapsed < 3_400, `answered after ${elapsed} ms`);
  assertEquals(await statusOf(h, id), "paid");
  await new Promise((r) => setTimeout(r, 600)); // let the slow fake call finish
});

Deno.test("webhook: no Wave client → the signed payload alone confirms the payment", async () => {
  const h = makeHarness({ wave: null });
  const { id } = await createOrder(h);
  const order = (await h.store.getOrder(id))!;
  const session: WaveCheckoutSession = {
    id: "cos-direct",
    amount: "1500",
    currency: "XOF",
    checkout_status: "complete",
    payment_status: "succeeded",
    client_reference: order.id,
    transaction_id: "TCN-1",
    wave_launch_url: "https://pay.wave.com/c/cos-direct",
  };
  assertEquals((await sendWebhook(h, checkoutCompletedEvent(session, "AE_nowave"))).body.paid, true);
  assertEquals((await h.store.getOrder(id))?.checkout_session_id, "cos-direct");
});

Deno.test("webhook: other event types, bad JSON and a missing secret", async () => {
  const h = makeHarness();
  const other = await sendWebhook(h, { id: "AE_other", type: "merchant.payment_received", data: { id: "x" } });
  assertEquals([other.status, other.body], [200, { ok: true, ignored: true }]);
  const badJson = await sendWebhook(h, null, { rawBody: "{not json" });
  assertEquals([badJson.status, badJson.body.error], [400, "bad_request"]);
  const noId = await sendWebhook(h, { type: "checkout.session.completed", data: {} });
  assertEquals(noId.status, 400);

  const off = makeHarness({ env: { WAVE_WEBHOOK_SECRET: undefined } });
  const res = await sendWebhook(off, { id: "AE_x", type: "x" });
  assertEquals(res.status, 503);
});
