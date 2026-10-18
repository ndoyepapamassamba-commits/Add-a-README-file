// dev.ts: static files, config.js override, mounted API and the fake Wave payment page.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { contentTypeFor, createDevServer, DEV_ADMIN_KEY, DEV_CRON_SECRET } from "../dev.ts";
import { captureLogs, orderBody } from "./fixtures/backend_harness.ts";

const ORIGIN = "http://localhost:8787";

/** A throwaway site root `<tmp>/cv` next to a file that must never be served (`<tmp>/tcv-dev-secret.txt`). */
async function siteDir(): Promise<string> {
  const parent = await Deno.makeTempDir({ prefix: "tcv-dev-" });
  const dir = `${parent}/cv`;
  await Deno.mkdir(`${dir}/guides`, { recursive: true });
  await Deno.writeTextFile(`${dir}/index.html`, "<!doctype html><title>Teranga CV</title>");
  await Deno.writeTextFile(`${dir}/app.css`, "body{}");
  await Deno.writeTextFile(`${dir}/guides/index.html`, "<p>guides</p>");
  await Deno.writeTextFile(`${parent}/tcv-dev-secret.txt`, "secret");
  return dir;
}

const removeSite = (dir: string) => Deno.remove(dir.replace(/\/cv$/, ""), { recursive: true });

function server(payment: "wave" | "manual" | "none", cvRoot: string) {
  captureLogs();
  const dev = createDevServer({ port: 8787, payment, cvRoot });
  const fetchDev = (path: string, init?: RequestInit) => dev.handler(new Request(ORIGIN + path, init));
  return { ...dev, fetchDev };
}

Deno.test("dev: serves cv/ files with content types and the local config.js", async () => {
  const dir = await siteDir();
  const { fetchDev } = server("wave", dir);
  const index = await fetchDev("/index.html");
  assertEquals([index.status, index.headers.get("content-type")], [200, "text/html; charset=utf-8"]);
  assertMatch(await index.text(), /Teranga CV/);
  assertEquals((await fetchDev("/")).status, 200);
  assertEquals(await (await fetchDev("/guides/")).text(), "<p>guides</p>");
  assertEquals((await fetchDev("/app.css")).headers.get("content-type"), "text/css; charset=utf-8");
  const cfg = await fetchDev("/config.js");
  assertEquals(cfg.headers.get("content-type"), "text/javascript; charset=utf-8");
  assertEquals(await cfg.text(), 'window.TCV_CONFIG = { apiBase: "http://localhost:8787/api" };\n');
  for (const bad of ["/missing.html", "/../tcv-dev-secret.txt", "/%2e%2e/tcv-dev-secret.txt", "/guides/%2e%2e/%2e%2e/tcv-dev-secret.txt"]) {
    const res = await fetchDev(bad);
    assertEquals(res.status, 404, bad);
    await res.body?.cancel();
  }
  assertEquals(contentTypeFor("x.svg"), "image/svg+xml");
  assertEquals(contentTypeFor("x.unknown"), "application/octet-stream");
  await removeSite(dir);
});

Deno.test("dev: the API is mounted at /api with the dev secrets", async () => {
  const dir = await siteDir();
  const { fetchDev } = server("manual", dir);
  assertEquals((await (await fetchDev("/api/health")).json()).ok, true);
  const cfg = await (await fetchDev("/api/config")).json();
  assertEquals(cfg.payment, { wave: false, manual: true, manualWaveNumber: "+221 77 000 00 00", ownerWhatsapp: "221770000000" });
  const stats = await fetchDev("/api/admin/stats", { headers: { authorization: `Bearer ${DEV_ADMIN_KEY}` } });
  assertEquals(stats.status, 200);
  await stats.body?.cancel();
  const daily = await fetchDev("/api/cron/daily", { method: "POST", headers: { "x-cron-secret": DEV_CRON_SECRET } });
  assertEquals((await daily.json()).ok, true);
  const none = server("none", dir);
  assertEquals((await (await none.fetchDev("/api/config")).json()).payment.manual, false);
  await removeSite(dir);
});

Deno.test("dev: fake Wave page — Payer sends a signed webhook and returns to success_url", async () => {
  const dir = await siteDir();
  const { fetchDev, store } = server("wave", dir);
  const created = await (await fetchDev("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(orderBody("cv")),
  })).json();
  const { id, token } = created.order;
  const checkout = await (await fetchDev(`/api/orders/${id}/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ t: token, returnBase: `${ORIGIN}/` }),
  })).json();
  assertEquals(checkout.mode, "wave");
  assertMatch(checkout.launchUrl, /^http:\/\/localhost:8787\/fake-wave\/pay\/[^/]+$/);
  const path = new URL(checkout.launchUrl).pathname;

  const page = await fetchDev(path);
  assertEquals(page.headers.get("content-type"), "text/html; charset=utf-8");
  const html = await page.text();
  assert(html.includes(">Payer<") && html.includes(">Annuler<") && html.includes("1000 FCFA"));

  const pay = await fetchDev(`${path}/payer`, { method: "POST" });
  assertEquals(pay.status, 303);
  assertEquals(pay.headers.get("location"), `${ORIGIN}/resultat.html?o=${id}&t=${token}`);
  const order = await store.getOrder(id);
  assertEquals([order?.status, order?.payment_method], ["paid", "wave"]);
  assertEquals(store.events.size, 1, "the payment arrived through the signed webhook");
  await removeSite(dir);
});

Deno.test("dev: fake Wave page — Annuler cancels and returns to error_url", async () => {
  const dir = await siteDir();
  const { fetchDev, store, wave } = server("wave", dir);
  const created = await (await fetchDev("/api/orders", { method: "POST", body: JSON.stringify(orderBody("pack")) })).json();
  const { id, token } = created.order;
  const checkout = await (await fetchDev(`/api/orders/${id}/checkout`, {
    method: "POST",
    body: JSON.stringify({ t: token, returnBase: ORIGIN }),
  })).json();
  const path = new URL(checkout.launchUrl).pathname;
  const cancel = await fetchDev(`${path}/annuler`, { method: "POST" });
  assertEquals([cancel.status, cancel.headers.get("location")], [303, `${ORIGIN}/index.html?o=${id}&t=${token}&paiement=echec`]);
  assertEquals((await store.getOrder(id))?.status, "checkout");
  assertEquals(wave!.sessions.get(path.split("/").pop()!)?.payment_status, "cancelled");
  const unknown = await fetchDev("/fake-wave/pay/cos-nope");
  assertEquals(unknown.status, 404);
  await unknown.body?.cancel();
  await removeSite(dir);
});
