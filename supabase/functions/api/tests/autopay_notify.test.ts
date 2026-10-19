// Autopay over HTTP: unique amounts at manual checkout, POST /payments/notify (auth, body formats, matching,
// duplicates, auto-confirm), optional payer phone and the admin additions.
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { ADMIN_KEY, createOrder, HOUR, makeHarness, MIN, RETURN_BASE } from "./fixtures/backend_harness.ts";
import type { Harness, HarnessOptions } from "./fixtures/backend_harness.ts";
import { MemoryStore } from "../lib/store_memory.ts";

const HOOK = "test-hook-key";
const AWA = "Awa Ndiaye";

function manualHarness(env: Record<string, string | undefined> = {}, opts: HarnessOptions = {}): Harness {
  return makeHarness({ wave: null, env: { MANUAL_WAVE_NUMBER: "770001122", PHONE_HOOK_KEY: HOOK, ...env }, ...opts });
}

let ipSeq = 0;
/** A manual order that went through checkout; returns its exact amount. */
async function manualOrder(h: Harness, product: "cv" | "lettre" | "pack" = "pack") {
  const { id, token } = await createOrder(h, product, `198.51.100.${++ipSeq % 250}`);
  const res = await h.call("POST", `/orders/${id}/checkout`, { body: { t: token, returnBase: RETURN_BASE } });
  assertEquals(res.status, 200);
  return { id, token, exact: res.body.exactAmount as number, body: res.body };
}

const received = (amount: string) => `Vous avez reçu ${amount}F de ${AWA} (77 123 45 67). Nouveau solde : 25 300F`;

function notify(h: Harness, body: unknown, opts: { key?: string | null; header?: boolean; contentType?: string } = {}) {
  const key = opts.key === undefined ? HOOK : opts.key;
  const q = key !== null && !opts.header ? `?k=${encodeURIComponent(key)}` : "";
  const headers: Record<string, string> = {};
  if (key !== null && opts.header) headers["x-hook-key"] = key;
  if (typeof body === "string") {
    headers["content-type"] = opts.contentType ?? "text/plain; charset=utf-8";
    return h.call("POST", `/payments/notify${q}`, { rawBody: body, headers });
  }
  return h.call("POST", `/payments/notify${q}`, { body, headers });
}

const admin = (h: Harness) => h.call("GET", "/admin/stats", { headers: { authorization: `Bearer ${ADMIN_KEY}` } });

// --- Manual checkout ---------------------------------------------------------------------------

Deno.test("manual checkout: each open order gets its own exact amount, stable across calls", async () => {
  const h = manualHarness();
  const a = await manualOrder(h);
  const b = await manualOrder(h);
  const c = await manualOrder(h, "cv");
  assertEquals([a.exact, b.exact, c.exact], [1499, 1498, 999]);
  assertEquals([a.body.amount, a.body.exactAmountFormatted, a.body.autoUnlock], [1500, "1 499 FCFA", true]);
  const again = await h.call("POST", `/orders/${a.id}/checkout`, { body: { t: a.token, returnBase: RETURN_BASE } });
  assertEquals(again.body.exactAmount, 1499, "same amount when the customer comes back");
  const order = (await h.store.getOrder(a.id))!;
  assertEquals([order.status, order.manual_amount], ["checkout", 1499], "the order now waits for its transfer");
});

Deno.test("manual checkout: a paid order frees its amount; autoUnlock reflects the configuration", async () => {
  const h = manualHarness();
  const a = await manualOrder(h);
  assertEquals((await notify(h, { text: received("1 499") })).body.paid, true);
  const b = await manualOrder(h);
  assertEquals(b.exact, 1499);
  const off = manualHarness({ MANUAL_AUTO_CONFIRM: "false" });
  assertEquals((await manualOrder(off)).body.autoUnlock, false);
  const noHook = manualHarness({ PHONE_HOOK_KEY: undefined });
  const n = await manualOrder(noHook);
  assertEquals([n.body.autoUnlock, n.exact], [false, 1499], "the unique amount still helps the owner check by hand");
  assertEquals(a.exact, 1499);
});

Deno.test("manual checkout: all 49 amounts taken → catalogue price, logged", async () => {
  const store = new MemoryStore();
  const h = manualHarness({}, { store });
  for (let i = 0; i < 49; i++) {
    const { id } = await createOrder(h, "cv", `203.0.113.${i + 1}`);
    await store.updateOrder(id, { status: "checkout" });
    assert((await store.assignManualAmount(id, 1000, 49, new Date(h.clock.t - 48 * HOUR).toISOString())) !== null);
  }
  const last = await manualOrder(h, "cv");
  assertEquals([last.exact, last.body.exactAmountFormatted], [1000, "1 000 FCFA"]);
  assert(h.logs.warn.some((l) => l.includes("pays the catalogue price")));
});

Deno.test("manual-paid: the payer phone is optional, a wrong one is still refused", async () => {
  const h = manualHarness();
  const o = await manualOrder(h);
  const res = await h.call("POST", `/orders/${o.id}/manual-paid`, { body: { t: o.token } });
  assertEquals([res.status, res.body.order.status], [200, "awaiting_manual"]);
  assertEquals((await h.store.getOrder(o.id))?.manual_payer_phone, null);
  const blank = await h.call("POST", `/orders/${o.id}/manual-paid`, { body: { t: o.token, payerPhone: "  " } });
  assertEquals(blank.status, 200);
  const bad = await h.call("POST", `/orders/${o.id}/manual-paid`, { body: { t: o.token, payerPhone: "12345" } });
  assertEquals([bad.status, Object.keys(bad.body.fields)], [400, ["payerPhone"]]);
  // Clicking "J'ai envoyé l'argent" never blocks the automatic unlock.
  assertEquals((await notify(h, { text: received("1 499") })).body, { ok: true, matched: o.id, amount: 1499, paid: true });
});

// --- POST /payments/notify: auth and body formats ------------------------------------------------

Deno.test("notify: 503 without PHONE_HOOK_KEY; 401 for a missing or wrong key; ?k= or x-hook-key", async () => {
  const unset = manualHarness({ PHONE_HOOK_KEY: undefined });
  const off = await notify(unset, { text: received("1 499") });
  assertEquals([off.status, off.body.error], [503, "hook_disabled"]);
  const h = manualHarness();
  assertEquals((await notify(h, { text: received("1 499") }, { key: null })).status, 401);
  assertEquals((await notify(h, { text: received("1 499") }, { key: "wrong" })).status, 401);
  assertEquals((await notify(h, { text: received("1 499") }, { key: HOOK + "x" })).status, 401);
  assertEquals((await notify(h, { text: received("1 499") }, { key: "wrong", header: true })).body.error, "unauthorized");
  assertEquals((await notify(h, { text: received("1 499") })).status, 200);
  assertEquals((await notify(h, { text: received("1 498") }, { header: true })).status, 200);
  assertEquals((await h.call("GET", `/payments/notify?k=${HOOK}`)).status, 404, "POST only");
});

Deno.test("notify: JSON {title, text}, text/plain and form-encoded bodies are all understood", async () => {
  const h = manualHarness();
  const a = await manualOrder(h);
  const b = await manualOrder(h);
  const c = await manualOrder(h);
  const json = await notify(h, { title: "Transfert reçu", text: `Vous avez reçu 1\u00a0499\u00a0F de ${AWA}`, app: "Wave", posted_at: "x" });
  assertEquals(json.body, { ok: true, matched: a.id, amount: 1499, paid: true });
  const plain = await notify(h, "Vous avez reçu 1.498 F de Moussa");
  assertEquals(plain.body.matched, b.id);
  const form = await notify(h, `title=Wave&text=${encodeURIComponent("You have received 1,497F from Fatou")}`, {
    contentType: "application/x-www-form-urlencoded",
  });
  assertEquals(form.body.matched, c.id);
  const broken = await notify(h, "{not json", { contentType: "application/json" });
  assertEquals([broken.status, broken.body.error], [400, "bad_request"]);
  const braces = await notify(h, "{ Vous avez reçu 3 000F }");
  assertEquals([braces.status, braces.body.matched], [200, null], "text/plain starting with { stays text");
});

Deno.test("notify: bodies above 4 KB are refused", async () => {
  const h = manualHarness();
  const big = await notify(h, received("1 499") + " ".repeat(4100));
  assertEquals([big.status, big.body.error], [413, "payload_too_large"]);
  const ok = await notify(h, received("1 499") + " ".repeat(3000));
  assertEquals(ok.status, 200);
});

// --- Matching ------------------------------------------------------------------------------------

Deno.test("notify: an exact unique amount unlocks the order at once (auto-confirm)", async () => {
  const h = manualHarness();
  const other = await manualOrder(h);
  const o = await manualOrder(h);
  h.clock.advance(3 * MIN);
  const text = received("1 498");
  const res = await notify(h, { text });
  assertEquals([res.status, res.body], [200, { ok: true, matched: o.id, amount: 1498, paid: true }]);
  const row = (await h.store.getOrder(o.id))!;
  assertEquals([row.status, row.payment_method, row.paid_amount, row.paid_at, row.payment_detected_at, row.payment_detected_text], [
    "paid",
    "manual",
    1498,
    h.clock.iso(),
    h.clock.iso(),
    text,
  ]);
  assertEquals((await h.store.getOrder(other.id))?.status, "checkout", "the other order is untouched");
  const view = await h.call("GET", `/orders/${o.id}?t=${o.token}`);
  assertEquals([view.body.order.status, view.body.order.paymentMethod, "document" in view.body], ["paid", "manual", true]);
});

Deno.test("notify: MANUAL_AUTO_CONFIRM=false only flags the order « Paiement détecté »", async () => {
  const h = manualHarness({ MANUAL_AUTO_CONFIRM: "false" });
  const o = await manualOrder(h);
  const res = await notify(h, { text: received("1 499") });
  assertEquals(res.body, { ok: true, matched: o.id, amount: 1499, paid: false });
  const row = (await h.store.getOrder(o.id))!;
  assertEquals([row.status, row.payment_detected_at], ["checkout", h.clock.iso()]);
  const listed = (await admin(h)).body.stats.recentOrders.find((r: { id: string }) => r.id === o.id);
  assertEquals([listed.manual_amount, listed.payment_detected_at], [1499, h.clock.iso()]);
});

Deno.test("notify: a rounded-up transfer matches the single recent order; not after 2 h; ties pick none", async () => {
  const h = manualHarness();
  const o = await manualOrder(h);
  h.clock.advance(30 * MIN);
  assertEquals((await notify(h, { text: received("1 500") })).body, { ok: true, matched: o.id, amount: 1500, paid: true });
  assertEquals((await h.store.getOrder(o.id))?.paid_amount, 1500);

  const late = manualHarness();
  await manualOrder(late);
  late.clock.advance(2 * HOUR + MIN);
  assertEquals((await notify(late, { text: received("1 500") })).body, { ok: true, matched: null, amount: 1500, paid: false });

  const tie = manualHarness();
  const t1 = await manualOrder(tie);
  const t2 = await manualOrder(tie);
  const res = await notify(tie, { text: received("1 500") });
  assertEquals([res.body.matched, res.body.paid], [null, false]);
  assertEquals([(await tie.store.getOrder(t1.id))?.status, (await tie.store.getOrder(t2.id))?.status], ["checkout", "checkout"]);
  assert(tie.logs.warn.some((l) => l.includes("several open orders")));
  assertEquals((await notify(tie, { text: received("1 600") })).body.matched, null, "still ambiguous");
  assertEquals((await notify(tie, { text: received("1 601") })).body.matched, null, "above price + 100");
});

Deno.test("notify: the same notification twice is a duplicate; a second one later finds the order paid", async () => {
  const h = manualHarness();
  const o = await manualOrder(h);
  const first = await notify(h, { text: received("1 499") });
  const again = await notify(h, { text: received("1 499") });
  assertEquals([first.body.matched, again.body], [o.id, { ok: true, duplicate: true }]);
  h.clock.advance(MIN);
  const later = await notify(h, { text: received("1 499") });
  assertEquals(later.body, { ok: true, matched: null, amount: 1499, paid: false });
});

Deno.test("notify: outgoing operations and texts without an amount are ignored and never matched", async () => {
  const h = manualHarness();
  const o = await manualOrder(h);
  for (const text of ["Vous avez envoyé 1 499F à Awa Ndiaye", "Retrait de 1 499F effectué", "Dépôt de 1 499F reçu", "Code : 1499"]) {
    assertEquals((await notify(h, { text })).body, { ok: true, ignored: "not_incoming" }, text);
  }
  assertEquals((await notify(h, { text: "Vous avez reçu de l'argent de Awa" })).body, { ok: true, ignored: "no_amount" });
  assertEquals((await notify(h, "")).body, { ok: true, ignored: "not_incoming" });
  assertEquals((await h.store.getOrder(o.id))?.status, "checkout");
});

Deno.test("notify: the notification text (payer name and number) never reaches the logs", async () => {
  const h = manualHarness();
  await manualOrder(h);
  await notify(h, { text: received("4 321") }); // no match → a warning with the amount only
  await notify(h, { text: received("1 500") + " extra" });
  await notify(h, { text: received("1 499") });
  const all = [...h.logs.warn, ...h.logs.error].join("\n");
  assert(h.logs.warn.length > 0);
  for (const secret of [AWA, "77 123 45 67", "Nouveau solde"]) assert(!all.includes(secret), secret);
});

// --- Admin ---------------------------------------------------------------------------------------

Deno.test("admin unlock records the exact amount the customer was asked to send", async () => {
  const h = manualHarness({ PHONE_HOOK_KEY: undefined });
  const o = await manualOrder(h);
  const res = await h.call("POST", `/admin/orders/${o.id}/unlock`, { headers: { authorization: `Bearer ${ADMIN_KEY}` } });
  assertEquals(res.body, { ok: true, changed: true });
  assertEquals((await h.store.getOrder(o.id))?.paid_amount, 1499);
  assertEquals((await admin(h)).body.stats.today.revenue, 1499);
});

Deno.test("admin stats: phoneHook and the last phone notification (also for ignored texts)", async () => {
  const h = manualHarness();
  const before = (await admin(h)).body.health;
  assertEquals([before.phoneHook, before.lastPhoneNotificationAt], [true, null]);
  await notify(h, { text: "Test MacroDroid" });
  const after = (await admin(h)).body;
  assert(typeof after.health.lastPhoneNotificationAt === "string" && !Number.isNaN(Date.parse(after.health.lastPhoneNotificationAt)));
  assertEquals("lastPhoneNotificationAt" in after.stats, false, "reported in health only");
  assertEquals((await admin(manualHarness({ PHONE_HOOK_KEY: undefined }))).body.health.phoneHook, false);
});

// --- MacroDroid link: GET /admin/stats → health.phoneHookUrl (the only place the phone key is shown) ----

/** Distinctive key with characters that must be URL-encoded ("Zq8" appears in it raw and encoded). */
const SECRET_HOOK = "Zq8-hook+/=&?#é secret";

Deno.test("admin stats: phoneHookUrl is the ready MacroDroid link (PUBLIC_API_BASE + encoded key)", async () => {
  const h = manualHarness();
  assertEquals(
    (await admin(h)).body.health.phoneHookUrl,
    "https://seegnylaubuularegmku.supabase.co/functions/v1/api/payments/notify?k=test-hook-key",
    "default base: the production api function",
  );

  const custom = manualHarness({ PHONE_HOOK_KEY: SECRET_HOOK, PUBLIC_API_BASE: "https://api.example.org/functions/v1/api/" });
  const link = (await admin(custom)).body.health.phoneHookUrl as string;
  assertEquals(link, `https://api.example.org/functions/v1/api/payments/notify?k=${encodeURIComponent(SECRET_HOOK)}`);
  const url = new URL(link);
  assertEquals([...url.searchParams.keys()], ["k"]);
  assertEquals(url.searchParams.get("k"), SECRET_HOOK, "the key survives the round trip (+, /, &, ?, #, é, space)");

  // The link works exactly as copied into MacroDroid, and « Tester l'action » shows up in health.
  const res = await custom.app(new Request(link, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Test MacroDroid" }),
  }));
  assertEquals([res.status, (await res.json()).ok], [200, true]);
  assert(typeof (await admin(custom)).body.health.lastPhoneNotificationAt === "string");

  assertEquals((await admin(manualHarness({ PHONE_HOOK_KEY: undefined }))).body.health.phoneHookUrl, null, "no key → no link");
});

Deno.test("admin stats: the MacroDroid link needs the right admin key", async () => {
  const h = manualHarness({ PHONE_HOOK_KEY: SECRET_HOOK });
  const tries: Record<string, string>[] = [{}, { authorization: "Bearer wrong" }, { authorization: ADMIN_KEY }, { authorization: `Bearer ${ADMIN_KEY}x` }];
  for (const headers of tries) {
    const res = await h.call("GET", "/admin/stats", { headers });
    assertEquals(res.status, 401, JSON.stringify(headers));
    assert(!JSON.stringify(res.body).includes("Zq8"));
  }
  assertEquals((await admin(h)).status, 200);
  const noAdminKey = manualHarness({ PHONE_HOOK_KEY: SECRET_HOOK, ADMIN_KEY: undefined });
  const refused = await noAdminKey.call("GET", "/admin/stats", { headers: { authorization: "Bearer " } });
  assertEquals(refused.status, 401, "ADMIN_KEY unset → nobody gets the link");
});

Deno.test("the phone key never leaves GET /admin/stats: /config, customer routes, errors and logs", async () => {
  const h = manualHarness({ PHONE_HOOK_KEY: SECRET_HOOK });
  const seen: string[] = [];
  const keep = <R extends { headers: Headers; body: unknown }>(r: R): R => {
    seen.push(typeof r.body === "string" ? r.body : JSON.stringify(r.body));
    r.headers.forEach((v) => seen.push(v));
    return r;
  };
  const config = keep(await h.call("GET", "/config"));
  assertEquals(config.status, 200);
  assert(!JSON.stringify(config.body).includes("notify"), "/config carries no MacroDroid link");
  keep(await h.call("GET", "/health"));
  const o = await manualOrder(h);
  seen.push(JSON.stringify(o.body));
  keep(await h.call("GET", `/orders/${o.id}?t=${encodeURIComponent(o.token)}`));
  keep(await h.call("POST", `/orders/${o.id}/manual-paid`, { body: { t: o.token } }));
  keep(await h.call("GET", "/nope"));
  keep(await h.call("GET", "/admin/stats", { headers: { authorization: "Bearer wrong" } }));
  keep(await notify(h, { text: received("1 499") }, { key: "wrong" }));
  keep(await notify(h, "{", { key: SECRET_HOOK, contentType: "application/json" }));
  keep(await notify(h, { text: received("7 777") }, { key: SECRET_HOOK }));
  keep(await notify(h, { text: received("1 499") }, { key: SECRET_HOOK, header: true }));
  assertEquals((await h.store.getOrder(o.id))?.status, "paid");
  const all = [...seen, ...h.logs.warn, ...h.logs.error].join("\n");
  assert(h.logs.warn.length > 0, "the unmatched notification was logged");
  assert(!all.includes("Zq8"), "the key appears in no response, header or log line");
  assert(!all.includes(encodeURIComponent(SECRET_HOOK)));
});
