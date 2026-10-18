// Adversarial review of document access: nobody obtains the full document without a Wave payment that
// matches the order, and the payment endpoints cannot be turned against the customer or Wave's quota.
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { WaveError } from "../lib/types.ts";
import type { Document, WaveCheckoutSession } from "../lib/types.ts";
import { checkoutCompletedEvent, signedWebhookRequest } from "../lib/wave.ts";
import {
  createCheckout,
  createOrder,
  makeHarness,
  MIN,
  orderData,
  RETURN_BASE,
  WEBHOOK_SECRET,
} from "./fixtures/backend_harness.ts";
import type { Harness, Json } from "./fixtures/backend_harness.ts";

/** Every string of the full document that the preview is supposed to hide. */
function hiddenStrings(doc: Document): string[] {
  const out: string[] = [];
  if (doc.cv) {
    out.push(doc.cv.profile, ...doc.cv.experiences.flatMap((e) => e.bullets), ...doc.cv.skills.slice(3));
  }
  if (doc.lettre) out.push(...doc.lettre.paragraphs.slice(1));
  return out.filter((s) => s.trim().length > 0);
}

function leaks(body: Json, doc: Document): string[] {
  const text = JSON.stringify(body);
  return hiddenStrings(doc).filter((s) => text.includes(JSON.stringify(s).slice(1, -1)));
}

async function webhook(h: Harness, session: WaveCheckoutSession) {
  const req = await signedWebhookRequest(
    "http://localhost/functions/v1/api/wave/webhook",
    WEBHOOK_SECRET,
    checkoutCompletedEvent(session),
    {
      timestamp: Math.floor(h.clock.t / 1000),
    },
  );
  return h.app(req);
}

Deno.test("review access: no unpaid response anywhere carries the hidden text", async () => {
  const h = makeHarness();
  const a = await createOrder(h, "pack");
  const b = await createOrder(h, "pack");
  const full = (await h.store.getOrder(a.id))!.document!;
  assert(hiddenStrings(full).length > 5);

  const responses: Array<[string, { status: number; body: Json }]> = [
    ["GET with token", await h.call("GET", `/orders/${a.id}?t=${a.token}`)],
    ["GET with another order's token", await h.call("GET", `/orders/${a.id}?t=${b.token}`)],
    ["GET with the token hash", await h.call("GET", `/orders/${a.id}?t=${(await h.store.getOrder(a.id))!.access_token_hash}`)],
    ["GET with token in the path", await h.call("GET", `/orders/${a.id}%3Ft%3D${a.token}`)],
    ["template", await h.call("POST", `/orders/${a.id}/template`, { body: { t: a.token, template: "moderne" } })],
    ["checkout", await h.call("POST", `/orders/${a.id}/checkout`, { body: { t: a.token, returnBase: RETURN_BASE } })],
    ["checkout again", await h.call("POST", `/orders/${a.id}/checkout`, { body: { t: a.token, returnBase: RETURN_BASE } })],
    [
      "unlock without key",
      await h.call("POST", `/admin/orders/${a.id}/unlock`, { headers: { authorization: `Bearer ${a.token}` } }),
    ],
    ["stats with the order token", await h.call("GET", "/admin/stats", { headers: { authorization: `Bearer ${a.token}` } })],
  ];
  // The customer comes back on success_url without having paid (cancelled in the Wave app).
  h.wave!.cancelSession((await h.store.getOrder(a.id))!.checkout_session_id!);
  responses.push(["success_url hit after a cancelled payment", await h.call("GET", `/orders/${a.id}?t=${a.token}`)]);

  for (const [label, res] of responses) {
    assertEquals(leaks(res.body, full), [], label);
    assert(!(res.body && typeof res.body === "object" && "document" in res.body), label);
  }
  assertEquals((await h.store.getOrder(a.id))!.status, "checkout");
});

Deno.test("review access: a Wave payment only unlocks the order it was made for, at its full price", async () => {
  const h = makeHarness();
  const cheap = await createCheckout(h, "cv"); // 1 000 FCFA
  const dear = await createOrder(h, "pack"); // 1 500 FCFA
  const paidCheap = h.wave!.completeSession(cheap.sessionId);

  // The real, signed completion of the cheap order, replayed with the expensive order's reference.
  const forged = { ...paidCheap, client_reference: dear.id };
  const res = await webhook(h, forged);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).paid, false, "the re-fetched session names the cheap order");
  assertEquals((await h.store.getOrder(dear.id))!.status, "preview");

  // Same thing without a Wave client to re-fetch: the amount check alone protects the dearer order.
  const offline = makeHarness({ wave: null, env: { MANUAL_WAVE_NUMBER: "770000000" } });
  const target = await createOrder(offline, "pack");
  const underpaid = await webhook(offline, { ...paidCheap, client_reference: target.id, amount: "1000" });
  assertEquals((await underpaid.json()).paid, false);
  assertEquals((await offline.store.getOrder(target.id))!.status, "preview");
});

Deno.test("review access: client-sent amounts are ignored everywhere", async () => {
  const h = makeHarness();
  const created = await h.call("POST", "/orders", {
    body: { product: "pack", template: "classique", data: orderData("pack"), amount: 1, price: 1, currency: "EUR" },
  });
  assertEquals([created.status, created.body.order.amount, created.body.order.currency], [201, 1500, "XOF"]);
  const { id, token } = created.body.order;
  await h.call("POST", `/orders/${id}/checkout`, { body: { t: token, returnBase: RETURN_BASE, amount: 1, currency: "EUR" } });
  const [args] = h.wave!.callsOf("createCheckoutSession")[0] as [{ amount: number; currency: string }];
  assertEquals([args.amount, args.currency], [1500, "XOF"]);
});

Deno.test("review checkout race: a payment landing while a new session is created is never charged twice", async () => {
  const h = makeHarness();
  const { id, token, sessionId: first } = await createCheckout(h, "pack");
  h.clock.advance(29 * MIN); // the first session expires in 1 min: checkout will open a new one
  const fake = h.wave!;
  const createSession = fake.createCheckoutSession.bind(fake);
  fake.createCheckoutSession = async (p) => {
    const second = await createSession(p);
    // Meanwhile the customer completes the first session in another tab and its webhook arrives.
    assertEquals((await webhook(h, fake.completeSession(first))).status, 200);
    return second;
  };
  const res = await h.call("POST", `/orders/${id}/checkout`, { body: { t: token, returnBase: RETURN_BASE } });
  assertEquals([res.status, res.body.error], [409, "already_paid"], "the customer must not be sent to a second payment page");
  const order = (await h.store.getOrder(id))!;
  assertEquals([order.status, order.checkout_session_id], ["paid", first], "the paying session stays on record");
});

Deno.test("review quota: hammering GET /orders/:id cannot turn into unbounded Wave API calls", async () => {
  const h = makeHarness();
  const { id, token, sessionId } = await createCheckout(h, "cv");
  const before = h.wave!.callsOf("getCheckoutSession").length;
  for (let i = 0; i < 100; i++) assertEquals((await h.call("GET", `/orders/${id}?t=${token}`)).status, 200);
  const lookups = h.wave!.callsOf("getCheckoutSession").length - before;
  assert(lookups <= 30, `${lookups} Wave lookups for 100 page loads in one minute`);
  assert(lookups >= 15, "normal polling (every 4 s) still reaches Wave");

  // Once the window has passed, a paid session is detected again.
  h.wave!.completeSession(sessionId);
  h.clock.advance(61_000);
  const res = await h.call("GET", `/orders/${id}?t=${token}`);
  assertEquals([res.body.order.status, "document" in res.body], ["paid", true]);
});

Deno.test("review webhook: a leaked webhook secret alone cannot unlock an order while Wave can be asked", async () => {
  const h = makeHarness({ env: { WAVE_WEBHOOK_MODE: "shared" } });
  const { id } = await createCheckout(h, "pack");
  const forge = (sessionId: string, eventId: string) => {
    const event = checkoutCompletedEvent({
      id: sessionId,
      amount: "1500",
      currency: "XOF",
      checkout_status: "complete",
      payment_status: "succeeded",
      client_reference: id,
      transaction_id: "TCN-forged",
      wave_launch_url: `https://pay.wave.com/c/${sessionId}`,
    }, eventId);
    return h.call("POST", "/wave/webhook", {
      rawBody: JSON.stringify(event),
      headers: { "content-type": "application/json", authorization: `Bearer ${WEBHOOK_SECRET}` },
    });
  };
  // Wave answers 404 for a session it never created: the payload is a forgery, not a fallback.
  const invented = await forge("cos-invented", "AE_forged_1");
  assertEquals([invented.status, invented.body.paid], [200, false]);
  // Any definitive refusal from Wave (here our key) is not a reason to believe the payload either.
  h.wave!.failNext("getCheckoutSession", new WaveError("Invalid API key", 401, "missing-auth-header", false));
  const refused = await forge("cos-invented-2", "AE_forged_2");
  assertEquals(refused.body.paid, false);
  assertEquals((await h.store.getOrder(id))!.status, "checkout");
});
