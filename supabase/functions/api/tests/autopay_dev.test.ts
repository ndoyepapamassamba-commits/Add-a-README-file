// Autopay end to end through dev.ts (manual mode): checkout shows the exact amount → the fake phone posts the
// Wave notification → the order the result page polls is paid.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { createDevServer, DEV_ADMIN_KEY, DEV_PHONE_HOOK_KEY } from "../dev.ts";
import { captureLogs, orderBody } from "./fixtures/backend_harness.ts";

const ORIGIN = "http://localhost:8787";

async function siteDir(): Promise<string> {
  const parent = await Deno.makeTempDir({ prefix: "tcv-autopay-" });
  await Deno.mkdir(`${parent}/cv`);
  await Deno.writeTextFile(`${parent}/cv/index.html`, "<!doctype html><title>Teranga CV</title>");
  return `${parent}/cv`;
}

function server(payment: "manual" | "wave", cvRoot: string) {
  captureLogs();
  const dev = createDevServer({ port: 8787, payment, cvRoot });
  const fetchJson = async (path: string, init?: RequestInit) => {
    const res = await dev.handler(new Request(ORIGIN + path, init));
    return { status: res.status, body: await res.json() };
  };
  return { ...dev, fetchJson };
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

Deno.test("autopay dev: manual checkout → exact amount → fake phone notification → order paid", async () => {
  const dir = await siteDir();
  const { fetchJson, handler } = server("manual", dir);
  const created = await fetchJson("/api/orders", post(orderBody("cv")));
  const { id, token } = created.body.order;
  const checkout = await fetchJson(`/api/orders/${id}/checkout`, post({ t: token, returnBase: ORIGIN }));
  assertEquals([checkout.body.mode, checkout.body.amount, checkout.body.exactAmount, checkout.body.autoUnlock], ["manual", 1000, 999, true]);

  const page = await handler(new Request(`${ORIGIN}/fake-phone`));
  assertEquals(page.headers.get("content-type"), "text/html; charset=utf-8");
  const html = await page.text();
  assert(html.includes(id) && html.includes("999 F"), "the fake phone lists the waiting order and its amount");
  assertMatch(html, new RegExp(`/api/payments/notify\\?k=${DEV_PHONE_HOOK_KEY}`));

  const pending = await fetchJson(`/api/orders/${id}?t=${encodeURIComponent(token)}`);
  assertEquals([pending.body.order.status, "document" in pending.body], ["checkout", false]);

  const notified = await fetchJson(
    `/api/payments/notify?k=${DEV_PHONE_HOOK_KEY}`,
    post({ title: "Wave", text: "Vous avez reçu 999F de Awa Ndiaye (77 123 45 67)" }),
  );
  assertEquals(notified.body, { ok: true, matched: id, amount: 999, paid: true });

  const paid = await fetchJson(`/api/orders/${id}?t=${encodeURIComponent(token)}`);
  assertEquals([paid.body.order.status, paid.body.order.paymentMethod, "document" in paid.body], ["paid", "manual", true]);
  const stats = await fetchJson("/api/admin/stats", { headers: { authorization: `Bearer ${DEV_ADMIN_KEY}` } });
  assertEquals(stats.body.health.phoneHook, true);
  // In dev the admin page's MacroDroid link points at the local server, never at production.
  assertEquals(stats.body.health.phoneHookUrl, `${ORIGIN}/api/payments/notify?k=${DEV_PHONE_HOOK_KEY}`);
  assert(stats.body.health.lastPhoneNotificationAt);
  assertEquals(stats.body.stats.today.revenue, 999);
  await Deno.remove(dir.replace(/\/cv$/, ""), { recursive: true });
});

Deno.test("autopay dev: /fake-phone is a GET page; other methods are refused", async () => {
  const dir = await siteDir();
  const { handler } = server("manual", dir);
  const page = await handler(new Request(`${ORIGIN}/fake-phone`));
  assert((await page.text()).includes("Aucune commande manuelle en attente."));
  const posted = await handler(new Request(`${ORIGIN}/fake-phone`, { method: "POST" }));
  assertEquals(posted.status, 405);
  await posted.body?.cancel();
  await Deno.remove(dir.replace(/\/cv$/, ""), { recursive: true });
});
