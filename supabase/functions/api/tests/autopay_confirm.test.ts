// POST /payments/confirm: the owner's one-tap confirmation link (cv/confirmer.html), never on GET.
import { assertEquals } from "jsr:@std/assert@1.0.13";
import { confirmToken } from "../lib/autopay.ts";
import { ADMIN_KEY, createOrder, makeHarness, RETURN_BASE } from "./fixtures/backend_harness.ts";
import type { Harness } from "./fixtures/backend_harness.ts";

function manualHarness(env: Record<string, string | undefined> = {}): Harness {
  return makeHarness({ wave: null, env: { MANUAL_WAVE_NUMBER: "770001122", ...env } });
}

const confirm = (h: Harness, body: unknown) => h.call("POST", "/payments/confirm", { body });

Deno.test("confirm: a valid link marks the order paid with its exact amount, once", async () => {
  const h = manualHarness();
  const { id, token } = await createOrder(h, "pack");
  await h.call("POST", `/orders/${id}/checkout`, { body: { t: token, returnBase: RETURN_BASE } });
  const c = await confirmToken(ADMIN_KEY, id);
  const first = await confirm(h, { o: id, c });
  assertEquals([first.status, first.body], [200, { ok: true, changed: true }]);
  const row = (await h.store.getOrder(id))!;
  assertEquals([row.status, row.payment_method, row.paid_amount, row.paid_at], ["paid", "manual", 1499, h.clock.iso()]);
  assertEquals((await confirm(h, { o: id, c: c.toUpperCase() })).body, { ok: true, changed: false }, "idempotent, hex case-insensitive");
});

Deno.test("confirm: without a unique amount the catalogue price is recorded", async () => {
  const h = manualHarness();
  const { id } = await createOrder(h, "cv");
  assertEquals((await confirm(h, { o: id, c: await confirmToken(ADMIN_KEY, id) })).body.changed, true);
  assertEquals((await h.store.getOrder(id))?.paid_amount, 1000);
});

Deno.test("confirm: wrong, truncated, other-order or missing codes → 401; unknown order → 404; GET never confirms", async () => {
  const h = manualHarness();
  const a = await createOrder(h, "cv");
  const b = await createOrder(h, "cv");
  const good = await confirmToken(ADMIN_KEY, a.id);
  for (const body of [
    { o: a.id, c: "0".repeat(32) },
    { o: a.id, c: good.slice(0, 31) },
    { o: a.id, c: good + "0" },
    { o: b.id, c: good },
    { o: a.id },
    { c: good },
    { o: "garbage", c: good },
    { o: a.id, c: await confirmToken("another-key", a.id) },
  ]) {
    const res = await confirm(h, body);
    assertEquals([res.status, res.body.error], [401, "unauthorized"], JSON.stringify(body));
  }
  assertEquals((await h.store.getOrder(a.id))?.status, "preview");
  const ghost = await confirm(h, { o: "TCV-ZZZZZZZZ", c: await confirmToken(ADMIN_KEY, "TCV-ZZZZZZZZ") });
  assertEquals(ghost.status, 404);
  const viaGet = await h.call("GET", `/payments/confirm?o=${a.id}&c=${good}`);
  assertEquals(viaGet.status, 404, "link previews (GET) never confirm");
  assertEquals((await h.store.getOrder(a.id))?.status, "preview");
  const bad = await h.call("POST", "/payments/confirm", { rawBody: "o=1", headers: { "content-type": "application/x-www-form-urlencoded" } });
  assertEquals(bad.status, 400);
});

Deno.test("confirm: refused for everyone while ADMIN_KEY is unset", async () => {
  const h = manualHarness({ ADMIN_KEY: undefined });
  const { id } = await createOrder(h, "cv");
  for (const c of ["", "0".repeat(32), await confirmToken(ADMIN_KEY, id)]) {
    assertEquals((await confirm(h, { o: id, c })).status, 401, c);
  }
  assertEquals((await h.store.getOrder(id))?.status, "preview");
});
