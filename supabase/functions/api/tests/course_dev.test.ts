// dev.ts with the course: /formation/ and /cv/ served, the lorem fixture seeded before the API answers, a course
// sold by default in dev and paid through the fake phone's notification.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { createDevServer, DEV_PHONE_HOOK_KEY } from "../dev.ts";
import { COURSE_FIXTURE_DIR, courseMimeFor, loadCourseAssetDir } from "../dev_course.ts";
import { captureLogs } from "./fixtures/backend_harness.ts";
import { sha256Hex } from "../lib/ids.ts";
import { courseOrderBody, FIXTURE_MODULE_TITLES } from "./fixtures/course_harness.ts";

const ORIGIN = "http://localhost:8787";

/** `<tmp>/cv` and `<tmp>/formation` next to a file that must never be served. */
async function siteDirs(): Promise<{ parent: string; cv: string; formation: string }> {
  const parent = await Deno.makeTempDir({ prefix: "tcv-dev-course-" });
  await Deno.mkdir(`${parent}/cv`);
  await Deno.mkdir(`${parent}/formation/js`, { recursive: true });
  await Deno.writeTextFile(`${parent}/cv/index.html`, "<!doctype html><title>Teranga CV</title>");
  await Deno.writeTextFile(`${parent}/cv/checkout.js`, "// cv");
  await Deno.writeTextFile(`${parent}/formation/index.html`, "<!doctype html><title>Teranga Pro</title>");
  await Deno.writeTextFile(`${parent}/formation/js/core.js`, "window.TPRO = {};");
  await Deno.writeTextFile(`${parent}/secret.txt`, "secret");
  return { parent, cv: `${parent}/cv`, formation: `${parent}/formation` };
}

function server(dirs: { cv: string; formation?: string }, extra: { courseAssetsDir?: string; payment?: "manual" | "wave" } = {}) {
  captureLogs();
  // The fixture explicitly, so a COURSE_ASSETS_DIR set in the shell never changes what these tests see.
  const dev = createDevServer({
    port: 8787,
    payment: extra.payment ?? "manual",
    cvRoot: dirs.cv,
    formationRoot: dirs.formation,
    courseAssetsDir: extra.courseAssetsDir ?? COURSE_FIXTURE_DIR,
  });
  const fetchDev = (path: string, init?: RequestInit) => dev.handler(new Request(ORIGIN + path, init));
  const fetchJson = async (path: string, init?: RequestInit) => {
    const res = await fetchDev(path, init);
    return { status: res.status, body: await res.json() };
  };
  return { ...dev, fetchDev, fetchJson };
}

const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

Deno.test("dev: /formation/ and /cv/ are served (config.js override included); traversal refused", async () => {
  const dirs = await siteDirs();
  const { fetchDev, ready } = server(dirs);
  await ready;
  const redirect = await fetchDev("/formation");
  assertEquals([redirect.status, redirect.headers.get("location")], [301, "/formation/"]);
  const index = await fetchDev("/formation/");
  assertEquals([index.status, index.headers.get("content-type")], [200, "text/html; charset=utf-8"]);
  assertMatch(await index.text(), /Teranga Pro/);
  assertEquals(await (await fetchDev("/formation/js/core.js")).text(), "window.TPRO = {};");
  const cfg = await fetchDev("/cv/config.js");
  assertEquals(await cfg.text(), 'window.TCV_CONFIG = { apiBase: "http://localhost:8787/api" };\n');
  assertEquals(await (await fetchDev("/cv/checkout.js")).text(), "// cv");
  assertMatch(await (await fetchDev("/cv/index.html")).text(), /Teranga CV/);
  assertMatch(await (await fetchDev("/")).text(), /Teranga CV/, "the CV site is unchanged at /");
  for (const bad of ["/formation/../secret.txt", "/formation/%2e%2e/secret.txt", "/cv/%2e%2e/secret.txt", "/formation/nope.html"]) {
    const res = await fetchDev(bad);
    assertEquals(res.status, 404, bad);
    await res.body?.cancel();
  }
  // Default formationRoot = <cvRoot>/../formation.
  const byDefault = server({ cv: dirs.cv });
  assertMatch(await (await byDefault.fetchDev("/formation/index.html")).text(), /Teranga Pro/);
  await Deno.remove(dirs.parent, { recursive: true });
});

Deno.test("dev: the lorem fixture is seeded, sales are open, a course is paid by the fake phone and read", async () => {
  const dirs = await siteDirs();
  const { fetchJson, store } = server(dirs);
  const cfg = await fetchJson("/api/config");
  assertEquals(cfg.body.courses, { pq_essentiel: { price: 25000, open: true } });
  const fixture = await loadCourseAssetDir(COURSE_FIXTURE_DIR);
  assertEquals(store.courseAssets.size, fixture.length, "seeded before the first API answer");

  const created = await fetchJson("/api/orders", post(courseOrderBody()));
  assertEquals(created.status, 201);
  const { id, token } = created.body.order;
  const checkout = await fetchJson(`/api/orders/${id}/checkout`, post({ t: token, returnBase: `${ORIGIN}/formation` }));
  assertEquals([checkout.body.mode, checkout.body.exactAmount], ["manual", 24999]);
  const phone = await (await server(dirs).handler(new Request(`${ORIGIN}/fake-phone`))).text();
  assert(phone.includes("Aucune commande manuelle en attente."), "each dev server has its own store");
  const notified = await fetchJson(
    `/api/payments/notify?k=${DEV_PHONE_HOOK_KEY}`,
    post({ title: "Wave", text: "Vous avez reçu 24 999F de Awa Ndiaye (77 123 45 67)" }),
  );
  assertEquals(notified.body, { ok: true, matched: id, amount: 24999, paid: true });
  const course = await fetchJson(`/api/orders/${id}/course?t=${encodeURIComponent(token)}`);
  assertEquals(course.status, 200);
  assertEquals(course.body.modules.map((m: { title: string }) => m.title), FIXTURE_MODULE_TITLES);
  assertEquals(course.body.course.version, "0.0-test");
  await Deno.remove(dirs.parent, { recursive: true });
});

Deno.test("dev: COURSE_UPLOAD_TOKEN_SHA256 / COURSE_UPLOAD_UNTIL open the upload window; an upload is read at once", async () => {
  const dirs = await siteDirs();
  const token = "dev-upload-token-0123456789abcdef0123456789";
  const saved = ["COURSE_UPLOAD_TOKEN_SHA256", "COURSE_UPLOAD_UNTIL"].map((k) => [k, Deno.env.get(k)] as const);
  const closed = server(dirs);
  const upload = (dev: ReturnType<typeof server>, name: string, body: string) =>
    dev.fetchDev(`/api/admin/course-assets/${name}?mime=application/json`, { method: "PUT", headers: { "x-upload-token": token }, body });
  const shut = await upload(closed, "pq_essentiel/manifest.json", "x");
  assertEquals(shut.status, 404, "closed unless both are set");
  await shut.body?.cancel();
  try {
    Deno.env.set("COURSE_UPLOAD_TOKEN_SHA256", await sha256Hex(token));
    Deno.env.set("COURSE_UPLOAD_UNTIL", new Date(Date.now() + 3_600_000).toISOString());
    const dev = server(dirs);
    const { id, token: t } = (await dev.fetchJson("/api/orders", post(courseOrderBody()))).body.order;
    await dev.fetchJson(`/api/orders/${id}/checkout`, post({ t, returnBase: `${ORIGIN}/formation` }));
    await dev.fetchJson(`/api/payments/notify?k=${DEV_PHONE_HOOK_KEY}`, post({ text: "Vous avez reçu 24 999F de Awa Ndiaye" }));
    const path = `/api/orders/${id}/course?t=${encodeURIComponent(t)}`;
    assertEquals((await dev.fetchJson(path)).status, 200, "read (and memoised) once");
    const put = await upload(dev, "pq_essentiel/manifest.json", "x");
    assertEquals(put.status, 200);
    await put.body?.cancel();
    assertEquals((await dev.fetchJson(path)).status, 503, "the same dev server sees the upload at once");
    const validation = await dev.fetchJson("/api/admin/course-assets?validate=1", { headers: { "x-upload-token": token } });
    assertEquals([validation.body.course.valid, validation.body.course.problem], [false, "pq_essentiel/manifest.json is invalid"]);
  } finally {
    for (const [k, v] of saved) v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v);
    await Deno.remove(dirs.parent, { recursive: true });
  }
});

Deno.test("dev: Wave mode sends a course buyer back to /formation/lecture.html", async () => {
  const dirs = await siteDirs();
  const { fetchJson, fetchDev } = server(dirs, { payment: "wave" });
  const { id, token } = (await fetchJson("/api/orders", post(courseOrderBody()))).body.order;
  const checkout = await fetchJson(`/api/orders/${id}/checkout`, post({ t: token, returnBase: `${ORIGIN}/formation` }));
  const pay = await fetchDev(`${new URL(checkout.body.launchUrl).pathname}/payer`, { method: "POST" });
  assertEquals(pay.headers.get("location"), `${ORIGIN}/formation/lecture.html?o=${id}&t=${token}`);
  assertEquals((await fetchJson(`/api/orders/${id}/course?t=${encodeURIComponent(token)}`)).status, 200);
  await Deno.remove(dirs.parent, { recursive: true });
});

Deno.test("dev: courseAssetsDir loads another tree; a missing folder leaves the course unavailable", async () => {
  const dirs = await siteDirs();
  const root = await Deno.makeTempDir({ prefix: "tcv-dev-assets-" });
  await Deno.mkdir(`${root}/pq_essentiel/modules`, { recursive: true });
  await Deno.writeTextFile(`${root}/pq_essentiel/modules/module-01.html`, "<section class=\"module\" data-module=\"1\"></section>");
  await Deno.writeTextFile(`${root}/README.md`, "skipped");
  const custom = server(dirs, { courseAssetsDir: root });
  await custom.ready;
  assertEquals([...custom.store.courseAssets.keys()], ["pq_essentiel/modules/module-01.html"]);
  const missing = server(dirs, { courseAssetsDir: `${root}/nope` });
  await missing.ready;
  assertEquals(missing.store.courseAssets.size, 0);
  assertEquals((await missing.fetchJson("/api/health")).body.ok, true, "the API still runs");
  await Deno.remove(root, { recursive: true });
  await Deno.remove(dirs.parent, { recursive: true });
});

Deno.test({
  name: "dev: without COURSE_ASSETS_DIR the default content is the lorem fixture",
  ignore: Deno.env.get("COURSE_ASSETS_DIR") !== undefined,
  fn: async () => {
    const dirs = await siteDirs();
    captureLogs();
    const dev = createDevServer({ port: 8787, payment: "manual", cvRoot: dirs.cv });
    await dev.ready;
    assertEquals(dev.store.courseAssets.size, (await loadCourseAssetDir(COURSE_FIXTURE_DIR)).length);
    assert(dev.store.courseAssets.has("pq_essentiel/manifest.json"));
    await Deno.remove(dirs.parent, { recursive: true });
  },
});

Deno.test("dev_course: loadCourseAssetDir walks <root>/<product>/**, skips dotfiles and root files, MIME by extension", async () => {
  const assets = await loadCourseAssetDir(COURSE_FIXTURE_DIR);
  assertEquals(assets.map((a) => a.name), [
    "pq_essentiel/files/donnees-module-1.zip",
    "pq_essentiel/files/module-1.xlsx",
    "pq_essentiel/manifest.json",
    "pq_essentiel/modules/module-01.html",
    "pq_essentiel/modules/module-02.html",
    "pq_essentiel/quiz-key.json",
    "pq_essentiel/quiz.json",
  ]);
  assertEquals(assets.map((a) => a.mime), [
    "application/zip",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/json",
    "text/html; charset=utf-8",
    "text/html; charset=utf-8",
    "application/json",
    "application/json",
  ]);
  assertEquals([courseMimeFor("a.CSV"), courseMimeFor("a.txt"), courseMimeFor("a.pdf"), courseMimeFor("a.exe")], [
    "text/csv; charset=utf-8",
    "text/plain; charset=utf-8",
    "application/pdf",
    "application/octet-stream",
  ]);
  const root = await Deno.makeTempDir({ prefix: "tcv-walk-" });
  await Deno.mkdir(`${root}/pq_essentiel/.git`, { recursive: true });
  await Deno.mkdir(`${root}/Not-A-Product`);
  await Deno.writeTextFile(`${root}/pq_essentiel/.git/x`, "x");
  await Deno.writeTextFile(`${root}/pq_essentiel/.hidden.json`, "{}");
  await Deno.writeTextFile(`${root}/Not-A-Product/a.json`, "{}");
  await Deno.writeTextFile(`${root}/pq_essentiel/quiz.json`, "{}");
  assertEquals((await loadCourseAssetDir(root)).map((a) => a.name), ["pq_essentiel/quiz.json"]);
  await Deno.remove(root, { recursive: true });
});
