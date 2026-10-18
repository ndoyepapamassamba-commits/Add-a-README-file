// POST /orders/:id/checkout (Wave and manual modes), return URL validation and manual-paid.
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { WaveError } from "../lib/types.ts";
import { normalizeReturnBase } from "../lib/validate.ts";
import { DEFAULT_RETURN_PREFIXES } from "../lib/config.ts";
import { devConfig } from "../dev.ts";
import { ADMIN_KEY, createOrder, makeHarness, MIN, RETURN_BASE } from "./fixtures/backend_harness.ts";
import type { Harness } from "./fixtures/backend_harness.ts";

function checkout(h: Harness, id: string, t: string, returnBase: unknown = RETURN_BASE) {
  return h.call("POST", `/orders/${id}/checkout`, { body: { t, returnBase } });
}

Deno.test("checkout (wave): creates a Wave session with the order's amount, reference and return URLs", async () => {
  const h = makeHarness();
  const { id, token } = await createOrder(h, "pack");
  const res = await checkout(h, id, token, RETURN_BASE + "/");
  assertEquals(res.status, 200);
  const [args] = h.wave!.callsOf("createCheckoutSession")[0] as [Record<string, unknown>];
  assertEquals(args, {
    amount: 1500,
    currency: "XOF",
    clientReference: id,
    successUrl: `${RETURN_BASE}/resultat.html?o=${id}&t=${token}`,
    errorUrl: `${RETURN_BASE}/index.html?o=${id}&t=${token}&paiement=echec`,
  });
  const order = (await h.store.getOrder(id))!;
  const session = h.wave!.sessions.get(order.checkout_session_id!)!;
  assertEquals(res.body, { mode: "wave", launchUrl: session.wave_launch_url });
  assertEquals([order.status, order.wave_launch_url, order.checkout_expires_at], ["checkout", session.wave_launch_url, session.when_expires]);
});

Deno.test("checkout (wave): reuses the open session until 2 minutes before it expires", async () => {
  const h = makeHarness();
  const { id, token } = await createOrder(h);
  const first = await checkout(h, id, token);
  h.clock.advance(27 * MIN);
  const second = await checkout(h, id, token);
  assertEquals(second.body.launchUrl, first.body.launchUrl);
  assertEquals(h.wave!.callsOf("createCheckoutSession").length, 1);

  h.clock.advance(1.5 * MIN); // 28.5 min: expires in 90 s, inside the 2 min margin
  const third = await checkout(h, id, token);
  assertEquals(h.wave!.callsOf("createCheckoutSession").length, 2);
  assert(third.body.launchUrl !== first.body.launchUrl);
  const order = (await h.store.getOrder(id))!;
  assertEquals(order.wave_launch_url, third.body.launchUrl);
});

Deno.test("checkout (wave): a new session after expiry, unless the old one was paid meanwhile", async () => {
  const h = makeHarness();
  const { id, token } = await createOrder(h);
  await checkout(h, id, token);
  h.clock.advance(31 * MIN);
  const renewed = await checkout(h, id, token);
  assertEquals([renewed.status, h.wave!.callsOf("createCheckoutSession").length], [200, 2]);

  const { sessionId } = { sessionId: (await h.store.getOrder(id))!.checkout_session_id! };
  h.wave!.completeSession(sessionId);
  h.clock.advance(31 * MIN);
  const res = await checkout(h, id, token);
  assertEquals([res.status, res.body.error], [409, "already_paid"]);
  assertEquals((await h.store.getOrder(id))?.status, "paid");
  assertEquals(h.wave!.callsOf("createCheckoutSession").length, 2, "no third session");
});

Deno.test("checkout: a paid order is 409 already_paid", async () => {
  const h = makeHarness();
  const { id, token } = await createOrder(h);
  await h.call("POST", `/admin/orders/${id}/unlock`, { headers: { authorization: `Bearer ${ADMIN_KEY}` } });
  const res = await checkout(h, id, token);
  assertEquals([res.status, res.body.error], [409, "already_paid"]);
});

Deno.test("checkout: Wave failures → 502 wave_error", async () => {
  const h = makeHarness();
  const { id, token } = await createOrder(h);
  h.wave!.failNext("createCheckoutSession", new WaveError("down", 503, "service-unavailable", true));
  const res = await checkout(h, id, token);
  assertEquals([res.status, res.body.error], [502, "wave_error"]);
  assertEquals((await h.store.getOrder(id))?.status, "preview");
});

Deno.test("checkout: the return URL must be an allowed https prefix without query or fragment", async () => {
  const h = makeHarness();
  const { id, token } = await createOrder(h);
  const refused = [
    "http://ndoyepapamassamba-commits.github.io/Add-a-README-file/cv",
    "http://localhost:8787/cv",
    "https://evil.example.com/Add-a-README-file/cv",
    "https://ndoyepapamassamba-commits.github.io.evil.com/",
    "https://ndoyepapamassamba-commits.github.io.evil.com/Add-a-README-file/cv",
    "https://ndoyepapamassamba-commits.github.io/Other-repo/cv",
    "https://ndoyepapamassamba-commits.github.io/Add-a-README-file/cv?x=1",
    "https://ndoyepapamassamba-commits.github.io/Add-a-README-file/cv#top",
    "https://ndoyepapamassamba-commits.github.io/Add-a-README-file/cv/../../evil",
    "https://user@ndoyepapamassamba-commits.github.io/Add-a-README-file/cv",
    "https://ndoyepapamassamba-commits.github.io:443/Add-a-README-file/cv",
    "//ndoyepapamassamba-commits.github.io/Add-a-README-file/cv",
    "javascript:alert(1)",
    "",
    42,
    null,
  ];
  for (const returnBase of refused) {
    const res = await checkout(h, id, token, returnBase);
    assertEquals([res.status, res.body.error], [400, "bad_return_url"], String(returnBase));
  }
  assertEquals(h.wave!.callsOf("createCheckoutSession").length, 0);
  const githack = "https://rawcdn.githack.com/ndoyepapamassamba-commits/Add-a-README-file/0123abcd/cv";
  assertEquals((await checkout(h, id, token, githack)).status, 200);
});

Deno.test("normalizeReturnBase: dev prefixes allow http://localhost only when configured", () => {
  const prod = [...DEFAULT_RETURN_PREFIXES];
  const dev = devConfig(8787, "wave").allowedReturnPrefixes;
  assertEquals(normalizeReturnBase("http://localhost:8787", prod), null);
  assertEquals(normalizeReturnBase("http://localhost:8787", dev), "http://localhost:8787");
  assertEquals(normalizeReturnBase("http://localhost:8787/", dev), "http://localhost:8787");
  assertEquals(normalizeReturnBase("http://localhost:9999/", dev), null);
  assertEquals(normalizeReturnBase("http://localhost:8787.evil.com/", dev), null);
  assertEquals(normalizeReturnBase(`${RETURN_BASE}//`, prod), RETURN_BASE);
  assertEquals(normalizeReturnBase("https://ndoyepapamassamba-commits.github.io/Add-a-README-file", prod), "https://ndoyepapamassamba-commits.github.io/Add-a-README-file");
  assertEquals(prod.every((p) => p.startsWith("https://")), true);
});

Deno.test("checkout (manual): returns the transfer instructions", async () => {
  const h = makeHarness({ wave: null, env: { MANUAL_WAVE_NUMBER: "+221 77 000 11 22" } });
  const { id, token } = await createOrder(h, "cv");
  const res = await checkout(h, id, token);
  assertEquals([res.status, res.body], [200, {
    mode: "manual",
    waveNumber: "+221 77 000 11 22",
    amount: 1000,
    reference: id,
    whatsapp: "221770001122",
  }]);
});

Deno.test("checkout: 503 payment_unavailable when neither Wave nor manual is configured", async () => {
  const h = makeHarness({ wave: null });
  const { id, token } = await createOrder(h);
  const res = await checkout(h, id, token);
  assertEquals([res.status, res.body.error, res.body.message], [503, "payment_unavailable", "Le paiement en ligne arrive très bientôt."]);
});

Deno.test("manual-paid: records the payer phone and waits for the owner", async () => {
  const h = makeHarness({ wave: null, env: { MANUAL_WAVE_NUMBER: "770001122" } });
  const { id, token } = await createOrder(h);
  const bad = await h.call("POST", `/orders/${id}/manual-paid`, { body: { t: token, payerPhone: "12345" } });
  assertEquals([bad.status, bad.body.error, Object.keys(bad.body.fields)], [400, "validation", ["payerPhone"]]);

  const res = await h.call("POST", `/orders/${id}/manual-paid`, { body: { t: token, payerPhone: "78 111 22 33" } });
  assertEquals([res.status, res.body.order.status], [200, "awaiting_manual"]);
  const order = (await h.store.getOrder(id))!;
  assertEquals([order.status, order.manual_payer_phone], ["awaiting_manual", "+221781112233"]);

  const wrong = await h.call("POST", `/orders/${id}/manual-paid`, { body: { t: "nope", payerPhone: "781112233" } });
  assertEquals(wrong.status, 404);

  const unlock = await h.call("POST", `/admin/orders/${id}/unlock`, { headers: { authorization: `Bearer ${ADMIN_KEY}` } });
  assertEquals(unlock.body.changed, true);
  const again = await h.call("POST", `/orders/${id}/manual-paid`, { body: { t: token, payerPhone: "781112233" } });
  assertEquals([again.status, again.body.order.status], [200, "paid"], "a paid order is never moved back");
});

Deno.test("manual-paid outside manual mode → 409 not_manual", async () => {
  const h = makeHarness({ env: { MANUAL_WAVE_NUMBER: "770001122" } });
  const { id, token } = await createOrder(h);
  const res = await h.call("POST", `/orders/${id}/manual-paid`, { body: { t: token, payerPhone: "781112233" } });
  assertEquals([res.status, res.body.error], [409, "not_manual"]);
});

Deno.test("GET /orders/:id in checkout asks Wave and unlocks a paid session without waiting for the webhook", async () => {
  const h = makeHarness();
  const { id, token } = await createOrder(h);
  await checkout(h, id, token);
  const sessionId = (await h.store.getOrder(id))!.checkout_session_id!;
  const pending = await h.call("GET", `/orders/${id}?t=${token}`);
  assertEquals([pending.body.order.status, "preview" in pending.body], ["checkout", true]);

  h.wave!.completeSession(sessionId);
  const paid = await h.call("GET", `/orders/${id}?t=${token}`);
  assertEquals([paid.body.order.status, paid.body.order.paymentMethod, "document" in paid.body], ["paid", "wave", true]);

  const h2 = makeHarness();
  const o2 = await createOrder(h2);
  await checkout(h2, o2.id, o2.token);
  h2.wave!.failNext("getCheckoutSession", new WaveError("down", 500, "boom", true));
  const degraded = await h2.call("GET", `/orders/${o2.id}?t=${o2.token}`);
  assertEquals([degraded.status, degraded.body.order.status], [200, "checkout"], "Wave errors never break the page");
});
