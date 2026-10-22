// PUT /admin/course-assets/:name and GET /admin/course-assets (lib/course_upload.ts): the window and its token, the
// per-IP limit on wrong tokens, the size limit, the names, the round trip on the three stores (chunks of at most
// 1 MB of base64 per RPC call), and the proof that `_backup/…` assets are never served to a buyer.
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_WINDOW_MS, MIN_UPLOAD_TOKEN_LENGTH, UPLOAD_FAILURES_PER_HOUR } from "../lib/course_upload.ts";
import { sha256Bytes, sha256Hex } from "../lib/ids.ts";
import { MemoryStore } from "../lib/store_memory.ts";
import { COURSE_UPLOAD_CHUNK_BYTES, SqlStore, sqlRpc } from "../lib/store_sql.ts";
import { SupabaseStore } from "../lib/store_supabase.ts";
import type { RpcClient } from "../lib/store_supabase.ts";
import type { CourseAssetInfo, Store } from "../lib/types.ts";
import { Clock, DAY, HOUR, makeHarness, T0 } from "./fixtures/backend_harness.ts";
import { createReloadingApp } from "../lib/app.ts";
import { envFrom } from "../lib/config.ts";
import type { Harness } from "./fixtures/backend_harness.ts";
import { openTestDb, postgrestClient } from "./fixtures/backend_pglite.ts";
import type { TestDb } from "./fixtures/backend_pglite.ts";
import { courseHarness, download, encodeJson, fixtureAsset, fixtureAssets, paidCourseOrder, rawGet, seedCourseMemory } from "./fixtures/course_harness.ts";

const TOKEN = "tok_Zq8_upload-secret-7f3a91c2d4e6b8a0"; // 38 characters (production: openssl rand -hex 32)
const TOKEN_SHA = await sha256Hex(TOKEN);
const UNTIL = "2026-10-19T00:00:00Z"; // T0 = 2026-10-18T10:00Z: the window is open in the harness
const UPLOAD_ENV = { COURSE_UPLOAD_TOKEN_SHA256: TOKEN_SHA, COURSE_UPLOAD_UNTIL: UNTIL };
const API = "http://localhost/functions/v1/api";

let ipSeq = 0;
const freshIp = () => `192.0.2.${(++ipSeq % 250) + 1}`;

function uploadHarness(env: Record<string, string | undefined> = UPLOAD_ENV, store?: Store): Harness {
  return makeHarness({ wave: null, env, store });
}

interface PutOptions {
  token?: string | null;
  mime?: string | null;
  ip?: string;
  rawPath?: string; // path after /admin/course-assets/, sent as is
  headers?: Record<string, string>;
}

/** PUT with a raw body; `name` is percent-encoded segment by segment (slashes kept). */
async function put(h: Harness, name: string, body: Uint8Array | string, o: PutOptions = {}) {
  const path = o.rawPath ?? name.split("/").map(encodeURIComponent).join("/");
  const mime = o.mime === undefined ? "application/octet-stream" : o.mime;
  const q = mime === null ? "" : `?mime=${encodeURIComponent(mime)}`;
  const headers: Record<string, string> = { "cf-connecting-ip": o.ip ?? "203.0.113.50", ...o.headers };
  const token = o.token === undefined ? TOKEN : o.token;
  if (token !== null) headers["x-upload-token"] = token;
  const res = await h.app(new Request(`${API}/admin/course-assets/${path}${q}`, { method: "PUT", headers, body: body as BodyInit }));
  return { status: res.status, headers: res.headers, text: await res.text() };
}

async function list(h: Harness, o: { token?: string | null; ip?: string; prefix?: string } = {}) {
  const headers: Record<string, string> = { "cf-connecting-ip": o.ip ?? "203.0.113.50" };
  const token = o.token === undefined ? TOKEN : o.token;
  if (token !== null) headers["x-upload-token"] = token;
  const q = o.prefix === undefined ? "" : `?prefix=${encodeURIComponent(o.prefix)}`;
  const res = await h.app(new Request(`${API}/admin/course-assets${q}`, { headers }));
  return { status: res.status, headers: res.headers, text: await res.text() };
}

/** The answer of a route that does not exist, for comparison. */
async function unknown(h: Harness, method = "GET") {
  const res = await h.app(new Request(`${API}/admin/no-such-route`, { method, headers: { "cf-connecting-ip": "203.0.113.99" } }));
  return { status: res.status, ct: res.headers.get("content-type"), text: await res.text() };
}

async function assertLooksUnknown(h: Harness, r: { status: number; headers: Headers; text: string }, label: string) {
  const u = await unknown(h);
  assertEquals([r.status, r.headers.get("content-type"), r.text], [u.status, u.ct, u.text], label);
  assertEquals(r.text, JSON.stringify({ error: "not_found", message: "Ressource introuvable." }), label);
}

function pseudoRandom(n: number, seed = 12345): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0, x = seed; i < n; i++) out[i] = (x = (x * 1103515245 + 12345) >>> 0) >>> 24;
  return out;
}

// --- The window ----------------------------------------------------------------------------------

Deno.test("upload: without the two settings both routes answer exactly like an unknown route", async () => {
  for (const env of [{}, { COURSE_UPLOAD_TOKEN_SHA256: TOKEN_SHA }, { COURSE_UPLOAD_UNTIL: UNTIL }]) {
    const h = uploadHarness(env);
    await assertLooksUnknown(h, await put(h, "pq_essentiel/x.json", "{}"), `PUT ${JSON.stringify(env)}`);
    await assertLooksUnknown(h, await list(h), `GET ${JSON.stringify(env)}`);
    assertEquals((h.store as MemoryStore).courseAssets.size, 0);
    assertEquals((h.store as MemoryStore).rateLimits.size, 0, "a closed window touches nothing");
  }
});

Deno.test("upload: an expired window, or settings that are not valid, are closed", async () => {
  const cases: Array<Record<string, string>> = [
    { COURSE_UPLOAD_TOKEN_SHA256: TOKEN_SHA, COURSE_UPLOAD_UNTIL: "2026-10-18T09:59:59Z" }, // passed
    { COURSE_UPLOAD_TOKEN_SHA256: TOKEN_SHA, COURSE_UPLOAD_UNTIL: "2026-10-18" }, // midnight UTC, passed
    { COURSE_UPLOAD_TOKEN_SHA256: TOKEN_SHA, COURSE_UPLOAD_UNTIL: "demain" },
    { COURSE_UPLOAD_TOKEN_SHA256: TOKEN_SHA, COURSE_UPLOAD_UNTIL: "1760000000000" },
    { COURSE_UPLOAD_TOKEN_SHA256: TOKEN_SHA.slice(1), COURSE_UPLOAD_UNTIL: UNTIL },
    { COURSE_UPLOAD_TOKEN_SHA256: TOKEN, COURSE_UPLOAD_UNTIL: UNTIL }, // the token itself instead of its digest
  ];
  for (const env of cases) {
    const h = uploadHarness(env);
    await assertLooksUnknown(h, await put(h, "pq_essentiel/x.json", "{}"), JSON.stringify(env));
  }
  // The same harness closes when the clock passes COURSE_UPLOAD_UNTIL.
  const h = uploadHarness();
  assertEquals((await put(h, "pq_essentiel/x.json", "{}")).status, 200);
  h.clock.set("2026-10-19T00:00:00.000Z");
  await assertLooksUnknown(h, await put(h, "pq_essentiel/x.json", "{}"), "at COURSE_UPLOAD_UNTIL");
  // Upper-case digest and a date-time with an offset are accepted.
  const upper = uploadHarness({ COURSE_UPLOAD_TOKEN_SHA256: TOKEN_SHA.toUpperCase(), COURSE_UPLOAD_UNTIL: "2026-10-18T12:00:00+01:00" });
  assertEquals((await put(upper, "pq_essentiel/x.json", "{}")).status, 200);
});

Deno.test("upload: COURSE_UPLOAD_UNTIL more than 72 h ahead keeps the window closed (a forgotten window cannot stay open)", async () => {
  assertEquals(MAX_UPLOAD_WINDOW_MS, 72 * HOUR);
  const at = (ms: number) => new Date(Date.parse(T0) + ms).toISOString();
  for (const until of ["9999-12-31", "2027-01-01", at(72 * HOUR + 1000)]) {
    const h = uploadHarness({ COURSE_UPLOAD_TOKEN_SHA256: TOKEN_SHA, COURSE_UPLOAD_UNTIL: until });
    await assertLooksUnknown(h, await put(h, "pq_essentiel/x.json", "{}"), until);
    await assertLooksUnknown(h, await list(h), until);
    assertEquals((h.store as MemoryStore).rateLimits.size, 0, "a closed window touches nothing");
  }
  const h = uploadHarness({ COURSE_UPLOAD_TOKEN_SHA256: TOKEN_SHA, COURSE_UPLOAD_UNTIL: at(72 * HOUR) });
  assertEquals((await put(h, "pq_essentiel/x.json", "{}")).status, 200, "exactly 72 h ahead");
  // The admin page shows the open window, so the owner sees it and closes it.
  const stats = await h.call("GET", "/admin/stats", { headers: { authorization: "Bearer test-admin-key" } });
  assertEquals(stats.body.course.uploadUntil, at(72 * HOUR));
  h.clock.set(at(72 * HOUR));
  assertEquals((await h.call("GET", "/admin/stats", { headers: { authorization: "Bearer test-admin-key" } })).body.course.uploadUntil, null);
});

Deno.test("upload: a token shorter than 32 characters is refused, even when its digest is configured, and never counted", async () => {
  assertEquals(MIN_UPLOAD_TOKEN_LENGTH, 32);
  const short = "a".repeat(31);
  const h = uploadHarness({ COURSE_UPLOAD_TOKEN_SHA256: await sha256Hex(short), COURSE_UPLOAD_UNTIL: UNTIL });
  await assertLooksUnknown(h, await put(h, "pq_essentiel/x.json", "{}", { token: short }), "31 characters");
  await assertLooksUnknown(h, await list(h, { token: short }), "31 characters");
  const exact = "b".repeat(32);
  const ok = uploadHarness({ COURSE_UPLOAD_TOKEN_SHA256: await sha256Hex(exact), COURSE_UPLOAD_UNTIL: UNTIL });
  assertEquals((await put(ok, "pq_essentiel/x.json", "{}", { token: exact })).status, 200, "32 characters");
  // Missing or short tokens cannot be right: no failure row is written for them.
  for (const token of [null, "", "wrong", short]) await put(h, "pq_essentiel/x.json", "{}", { token, ip: freshIp() });
  assertEquals((h.store as MemoryStore).rateLimits.size, 0);
});

Deno.test("upload: a wrong token answers without waiting for the store (same path as an unknown route)", async () => {
  let peeks = 0;
  let hits = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  class SlowStore extends MemoryStore {
    override async peekRateLimit(key: string, windowSeconds: number, nowIso: string) {
      peeks += 1;
      return await super.peekRateLimit(key, windowSeconds, nowIso);
    }
    override async hitRateLimit(key: string, windowSeconds: number, max: number, nowIso: string) {
      hits += 1;
      await gate; // a store that takes forever: the 404 must not wait for it
      return await super.hitRateLimit(key, windowSeconds, max, nowIso);
    }
  }
  const h = uploadHarness(UPLOAD_ENV, new SlowStore());
  const deadline = async <T>(p: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("waited for the store")), 1000);
    });
    try {
      return await Promise.race([p, late]);
    } finally {
      clearTimeout(timer);
    }
  };
  const wrong = "w".repeat(40);
  await assertLooksUnknown(h, await deadline(put(h, "pq_essentiel/x.json", "{}", { token: wrong })), "PUT");
  await assertLooksUnknown(h, await deadline(list(h, { token: wrong })), "GET");
  assertEquals([peeks, hits], [0, 2], "the failures are counted in the background, nothing is read");
  for (const token of [null, "short"]) await put(h, "pq_essentiel/x.json", "{}", { token });
  assertEquals([peeks, hits], [0, 2], "missing and short tokens touch nothing");
  release();
  await gate;
  assertEquals((await put(h, "pq_essentiel/x.json", "{}")).status, 200);
  assertEquals(peeks, 1, "only the right token reads the failure counter");
});

Deno.test("upload: a missing, wrong or near-miss token is an unknown route; the right one works (PUT and GET)", async () => {
  const h = uploadHarness();
  // (Leading or trailing spaces are trimmed by the Fetch Headers class itself: not a different token.)
  for (const token of [null, "", "wrong", TOKEN + "x", TOKEN.slice(0, -1), TOKEN.toUpperCase(), TOKEN_SHA, "x".repeat(600)]) {
    const ip = freshIp();
    await assertLooksUnknown(h, await put(h, "pq_essentiel/x.json", "{}", { token, ip }), `PUT token ${String(token).slice(0, 20)}`);
    await assertLooksUnknown(h, await list(h, { token, ip }), `GET token ${String(token).slice(0, 20)}`);
  }
  assertEquals((h.store as MemoryStore).courseAssets.size, 0);
  const ok = await put(h, "pq_essentiel/x.json", "{}", { mime: "application/json" });
  assertEquals(ok.status, 200, ok.text);
  const body = JSON.parse(ok.text);
  assertEquals([body.ok, body.asset.name, body.asset.mime, body.asset.size, body.asset.sha256], [
    true,
    "pq_essentiel/x.json",
    "application/json",
    2,
    await sha256Bytes(new TextEncoder().encode("{}")),
  ]);
  const listed = await list(h);
  assertEquals(listed.status, 200);
  assertEquals(JSON.parse(listed.text).assets.map((a: CourseAssetInfo) => a.name), ["pq_essentiel/x.json"]);
  // The route is PUT only, and the list does not take a name.
  assertEquals((await h.call("POST", "/admin/course-assets/pq_essentiel/x.json", { headers: { "x-upload-token": TOKEN } })).status, 404);
  assertEquals((await h.call("GET", "/admin/course-assets/pq_essentiel/x.json", { headers: { "x-upload-token": TOKEN } })).status, 404);
});

Deno.test("upload: too many wrong tokens from one IP close the window for that IP for an hour, even with the right token", async () => {
  const h = uploadHarness();
  const attacker = "198.51.100.66";
  for (let i = 0; i < UPLOAD_FAILURES_PER_HOUR; i++) {
    const guess = `guess-${i}-${"g".repeat(MIN_UPLOAD_TOKEN_LENGTH)}`;
    await assertLooksUnknown(h, await put(h, "pq_essentiel/x.json", "{}", { token: guess, ip: attacker }), `guess ${i}`);
  }
  await assertLooksUnknown(h, await put(h, "pq_essentiel/x.json", "{}", { ip: attacker }), "right token, blocked IP");
  await assertLooksUnknown(h, await list(h, { ip: attacker }), "list, blocked IP");
  assertEquals((await put(h, "pq_essentiel/x.json", "{}", { ip: "198.51.100.67" })).status, 200, "another IP is not affected");
  // Good requests do not count: many uploads from one IP stay possible.
  for (let i = 0; i < 3 * UPLOAD_FAILURES_PER_HOUR; i++) assertEquals((await put(h, `pq_essentiel/f${i}.txt`, "a", { ip: "198.51.100.67" })).status, 200);
  h.clock.advance(HOUR + 1000);
  assertEquals((await put(h, "pq_essentiel/x.json", "{}", { ip: attacker })).status, 200, "an hour later the IP may try again");
  // The bucket holds a peppered hash, never the IP.
  assert([...(h.store as MemoryStore).rateLimits.keys()].every((k) => !k.includes(attacker)));
});

// --- Size, names, MIME ---------------------------------------------------------------------------

Deno.test("upload: the body is at most 6 MB (declared or actual); empty is refused", async () => {
  const h = uploadHarness();
  const exact = pseudoRandom(MAX_UPLOAD_BYTES);
  const at = await put(h, "pq_essentiel/files/big.zip", exact, { mime: "application/zip" });
  assertEquals(at.status, 200, "exactly 6 MB");
  assertEquals((await h.store.getCourseAsset("pq_essentiel/files/big.zip"))?.bytes.length, MAX_UPLOAD_BYTES);
  const over = await put(h, "pq_essentiel/files/big2.zip", new Uint8Array(MAX_UPLOAD_BYTES + 1));
  assertEquals([over.status, JSON.parse(over.text).error], [413, "payload_too_large"]);
  // A chunked body without content-length is cut off as soon as it passes the limit.
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < 7; i++) c.enqueue(new Uint8Array(1024 * 1024));
      c.close();
    },
  });
  const res = await h.app(new Request(`${API}/admin/course-assets/pq_essentiel/files/big3.zip?mime=application/zip`, {
    method: "PUT",
    headers: { "x-upload-token": TOKEN, "cf-connecting-ip": "203.0.113.50" },
    body: stream,
  }));
  assertEquals(res.status, 413);
  await res.body?.cancel();
  const lied = await put(h, "pq_essentiel/files/big4.zip", "x", { headers: { "content-length": String(MAX_UPLOAD_BYTES + 1) } });
  assertEquals(lied.status, 413, "a declared length above the limit is refused before reading");
  const empty = await put(h, "pq_essentiel/empty.txt", new Uint8Array(0));
  assertEquals([empty.status, Object.keys(JSON.parse(empty.text).fields)], [400, ["body"]]);
  assertEquals([...(h.store as MemoryStore).courseAssets.keys()], ["pq_essentiel/files/big.zip"]);
});

Deno.test("upload: names — pq_essentiel/… or _backup/…, no « .. », no empty segment, no trailing slash", async () => {
  const h = uploadHarness();
  const good = [
    "pq_essentiel/manifest.json",
    "pq_essentiel/files/Module-1.XLSX",
    "pq_essentiel/modules/module-01.html",
    "_backup/2026-10-22/content/module-01.html",
    "_backup/a",
    `pq_essentiel/${"a".repeat(150)}`,
  ];
  for (const name of good) assertEquals((await put(h, name, "1")).status, 200, name);
  // Percent-encoded slashes are the same name.
  assertEquals((await put(h, "", "1", { rawPath: "pq_essentiel%2Ffiles%2Fencoded.zip" })).status, 200);
  assert((h.store as MemoryStore).courseAssets.has("pq_essentiel/files/encoded.zip"));
  const bad: Array<[string, string]> = [
    ["pq_essentiel/", "nothing after the folder"],
    ["pq_essentiel", "no folder"],
    ["pq_essentiel//x", "empty segment"],
    ["pq_essentiel/x/", "trailing slash"],
    ["/pq_essentiel/x", "leading slash"],
    ["pq_essentiel/../x", "dot-dot"],
    ["pq_essentiel/a..b", "dot-dot inside a name"],
    ["pq_essentiel/%2e%2e/manifest.json", "encoded dot-dot"],
    ["pq_essentiel/%252e%252e/x", "double-encoded dot-dot"],
    ["other/x.json", "another folder"],
    ["PQ_ESSENTIEL/x.json", "upper-case folder"],
    ["_backups/x", "near-miss folder"],
    ["pq_essentiel/x%20y", "space"],
    ["pq_essentiel/x%00", "NUL"],
    ["pq_essentiel/%C3%A9.txt", "non-ASCII"],
    ["pq_essentiel/x%3Fy", "question mark"],
    ["pq_essentiel/x%5Cy", "backslash"],
    [`pq_essentiel/${"a".repeat(151)}`, "151 characters"],
    ["pq_essentiel/%E0%A4%A", "broken percent-encoding"],
  ];
  for (const [rawPath, why] of bad) {
    const r = await put(h, "", "1", { rawPath });
    assertEquals(r.status, 400, `${why}: ${rawPath}`);
    assertEquals(Object.keys(JSON.parse(r.text).fields), ["name"], why);
  }
  for (const name of (h.store as MemoryStore).courseAssets.keys()) assert(good.includes(name) || name.endsWith("encoded.zip"), name);
});

Deno.test("upload: mime=… is required and checked", async () => {
  const h = uploadHarness();
  for (const mime of ["application/json", "text/html; charset=utf-8", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv;charset=utf-8"]) {
    const r = await put(h, "pq_essentiel/m.txt", "1", { mime });
    assertEquals(r.status, 200, mime);
    assertEquals(JSON.parse(r.text).asset.mime, mime);
  }
  for (const mime of [null, "", "json", "text/html<script>", "text/html; charset=\"utf-8\"", `a/${"b".repeat(130)}`, "text/ html"]) {
    const r = await put(h, "pq_essentiel/m.txt", "1", { mime });
    assertEquals([r.status, Object.keys(JSON.parse(r.text).fields ?? {})], [400, ["mime"]], String(mime));
  }
});

// --- Round trip on the three stores ---------------------------------------------------------------

interface RecordedCall {
  fn: string;
  bytes: number;
  b64: number;
}

/** A PostgREST stand-in that records the size of every RPC request body (what supabase-js would POST). */
function recordingClient(t: TestDb, calls: RecordedCall[]): RpcClient {
  const inner = postgrestClient(t);
  return {
    rpc(fn, args) {
      const body = JSON.stringify(args);
      calls.push({ fn, bytes: new TextEncoder().encode(body).length, b64: typeof args.p_b64 === "string" ? args.p_b64.length : 0 });
      return inner.rpc(fn, args);
    },
  };
}

const sqlDb: TestDb = await openTestDb();
const IMPLS: Array<{ name: string; make(calls: RecordedCall[]): Promise<Store> }> = [
  { name: "MemoryStore", make: () => Promise.resolve(new MemoryStore()) },
  { name: "SqlStore(PGlite)", make: async () => (await sqlDb.reset(), new SqlStore(sqlDb.query)) },
  { name: "SupabaseStore(PostgREST stand-in)", make: async (calls) => (await sqlDb.reset(), new SupabaseStore(recordingClient(sqlDb, calls))) },
];

for (const impl of IMPLS) {
  Deno.test({
    name: `upload [${impl.name}] round trip: PUT 2.5 MB then 1 byte, GET lists name/mime/size/sha256, the store returns the bytes`,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      const calls: RecordedCall[] = [];
      const store = await impl.make(calls);
      const h = uploadHarness(UPLOAD_ENV, store);
      const big = pseudoRandom(2_500_000, 7);
      const r = await put(h, "pq_essentiel/files/donnees-module-9.zip", big, { mime: "application/zip" });
      assertEquals(r.status, 200, r.text);
      const one = await put(h, "_backup/2026-10-22/notes.txt", "x", { mime: "text/plain; charset=utf-8" });
      assertEquals(one.status, 200, one.text);
      const listed = JSON.parse((await list(h)).text).assets as CourseAssetInfo[];
      assertEquals(listed.map(({ name, mime, size, sha256 }) => ({ name, mime, size, sha256 })), [
        { name: "_backup/2026-10-22/notes.txt", mime: "text/plain; charset=utf-8", size: 1, sha256: await sha256Bytes(new TextEncoder().encode("x")) },
        { name: "pq_essentiel/files/donnees-module-9.zip", mime: "application/zip", size: big.length, sha256: await sha256Bytes(big) },
      ]);
      assert(listed.every((a) => !Number.isNaN(Date.parse(a.updated_at))));
      assertEquals(JSON.parse((await list(h, { prefix: "_backup/" })).text).assets.length, 1);
      assertEquals((await store.getCourseAsset("pq_essentiel/files/donnees-module-9.zip"))?.bytes, big, "byte for byte");
      // Replacing an asset keeps one row with the new content.
      const v2 = pseudoRandom(1000, 99);
      assertEquals((await put(h, "pq_essentiel/files/donnees-module-9.zip", v2, { mime: "application/zip" })).status, 200);
      assertEquals((await store.getCourseAsset("pq_essentiel/files/donnees-module-9.zip"))?.bytes, v2);
      assertEquals((await store.listCourseAssets("")).length, 2);
      if (impl.name.startsWith("Supabase")) {
        const chunkCalls = calls.filter((c) => c.fn === "tcv_course_upload_chunk");
        assertEquals(chunkCalls.length, Math.ceil(big.length / COURSE_UPLOAD_CHUNK_BYTES) + 2, "4 chunks + 1 + 1");
        for (const c of calls) assert(c.bytes <= 1_000_100 && c.b64 <= 1_000_000, `${c.fn}: ${c.bytes} bytes per RPC call`);
        assert(calls.some((c) => c.fn === "tcv_course_upload_commit") && calls.some((c) => c.fn === "tcv_course_asset_list"));
      }
    },
  });
}

Deno.test({
  name: "upload SQL: tcv_course_upload_chunk takes 1 000 000 base64 characters, not one more",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await sqlDb.reset();
    const rpc = sqlRpc(sqlDb.query);
    const max = "A".repeat(1_000_000);
    assertEquals(await rpc("tcv_course_upload_chunk", { p_upload_id: "up-limit-test", p_seq: 0, p_b64: max }), 1);
    let refused = false;
    try {
      await rpc("tcv_course_upload_chunk", { p_upload_id: "up-limit-test", p_seq: 1, p_b64: max + "AAAA" });
    } catch (err) {
      refused = /longer than 1000000/.test(String(err));
    }
    assert(refused, "1 000 004 characters are refused");
  },
});

Deno.test("upload: a stored copy that does not match is reported, never answered as OK", async () => {
  class Lying extends MemoryStore {
    override async listCourseAssets(prefix: string) {
      return (await super.listCourseAssets(prefix)).map((a) => ({ ...a, sha256: "0".repeat(64) }));
    }
  }
  const h = uploadHarness(UPLOAD_ENV, new Lying());
  const r = await put(h, "pq_essentiel/x.json", "{}");
  assertEquals([r.status, JSON.parse(r.text).error], [502, "upload_mismatch"]);
  class Failing extends MemoryStore {
    override uploadCourseAsset(): Promise<CourseAssetInfo> {
      return Promise.reject(new Error("tcv_course_upload_commit failed: sha256 mismatch"));
    }
  }
  const f = uploadHarness(UPLOAD_ENV, new Failing());
  const r2 = await put(f, "pq_essentiel/x.json", "{}");
  assertEquals([r2.status, JSON.parse(r2.text).error], [502, "upload_failed"]);
});

Deno.test("upload: the token and the bodies never reach a response or a log line", async () => {
  const h = uploadHarness();
  const secretBody = "CONTENU-PAYANT-module-07 solution M secrète";
  const seen: string[] = [];
  const keep = (r: { headers: Headers; text: string }) => {
    seen.push(r.text);
    r.headers.forEach((v, k) => seen.push(`${k}: ${v}`));
  };
  keep(await put(h, "pq_essentiel/s.txt", secretBody, { mime: "text/plain" }));
  keep(await put(h, "pq_essentiel/s.txt", secretBody, { token: TOKEN + "x", ip: freshIp() }));
  keep(await put(h, "pq_essentiel/../s.txt", secretBody, { rawPath: "pq_essentiel/../s.txt" }));
  keep(await put(h, "pq_essentiel/big.bin", new Uint8Array(MAX_UPLOAD_BYTES + 1)));
  keep(await list(h));
  class Failing extends MemoryStore {
    override uploadCourseAsset(): Promise<CourseAssetInfo> {
      return Promise.reject(new Error("boom"));
    }
  }
  const f = uploadHarness(UPLOAD_ENV, new Failing());
  keep(await put(f, "pq_essentiel/s.txt", secretBody));
  const all = [...seen, ...h.logs.warn, ...h.logs.error, ...f.logs.warn, ...f.logs.error].join("\n");
  for (const secret of [TOKEN, TOKEN_SHA, "CONTENU-PAYANT", "secrète"]) assert(!all.includes(secret), secret);
  assert(f.logs.error.some((l) => l.includes("course upload pq_essentiel/s.txt failed")), "the failure is logged by name");
});

Deno.test("upload: peekRateLimit reads a bucket without counting (Memory and SQL agree)", async () => {
  await sqlDb.reset();
  for (const store of [new MemoryStore(), new SqlStore(sqlDb.query)] as Store[]) {
    assertEquals(await store.peekRateLimit("k", 3600, T0), 0);
    await store.hitRateLimit("k", 3600, 5, T0);
    await store.hitRateLimit("k", 3600, 5, T0);
    assertEquals(await store.peekRateLimit("k", 3600, T0), 2);
    assertEquals(await store.peekRateLimit("k", 3600, T0), 2, "peeking does not count");
    assertEquals(await store.peekRateLimit("k", 3600, new Date(Date.parse(T0) + 3600_000).toISOString()), 0, "window over");
  }
});

// --- _backup/ is never served to a buyer -----------------------------------------------------------

Deno.test("upload: assets under _backup/ are never served; the course routes only serve manifest-listed files", async () => {
  const h = await courseHarness({ env: UPLOAD_ENV });
  const o = await paidCourseOrder(h);
  const xlsx = (await fixtureAsset("pq_essentiel/files/module-1.xlsx")).bytes;
  const key = (await fixtureAsset("pq_essentiel/quiz-key.json")).bytes;
  for (const [name, bytes] of [
    ["_backup/pq_essentiel/files/module-1.xlsx", xlsx],
    ["_backup/files/secret.xlsx", xlsx],
    ["_backup/quiz-key.json", key],
    ["_backup/manifest.json", (await fixtureAsset("pq_essentiel/manifest.json")).bytes],
  ] as Array<[string, Uint8Array]>) {
    assertEquals((await put(h, name, bytes)).status, 200, name);
  }
  // The reader payload lists the manifest files only, and carries nothing from _backup/.
  const course = await h.call("GET", `/orders/${o.id}/course?t=${encodeURIComponent(o.token)}`);
  assertEquals(course.status, 200);
  const payload = JSON.stringify(course.body);
  assert(!payload.includes("_backup") && !payload.includes("secret.xlsx"));
  assertEquals(course.body.files.map((f: { name: string }) => f.name).sort(), ["donnees-module-1.zip", "module-1.xlsx"]);
  // Download names that are not manifest entries are 404, whatever is stored.
  for (const name of ["secret.xlsx", "_backup/files/secret.xlsx", "../_backup/files/secret.xlsx", "quiz-key.json", "manifest.json"]) {
    const res = await download(h, o.id, o.token, name);
    assertEquals(res.status, 404, name);
    await res.body?.cancel();
  }
  const raw = await rawGet(h, `/orders/${o.id}/files/..%2F_backup%2Ffiles%2Fsecret.xlsx?t=${encodeURIComponent(o.token)}`);
  assertEquals(raw.status, 404);
  await raw.body?.cancel();
  // A manifest that points a download (or a module, the quiz, its key) at _backup/ is refused as a whole.
  const manifest = JSON.parse(new TextDecoder().decode((await fixtureAsset("pq_essentiel/manifest.json")).bytes));
  const variants = [
    { ...manifest, files: manifest.files.map((f: { asset: string }, i: number) => (i === 0 ? { ...f, asset: "_backup/files/secret.xlsx" } : f)) },
    { ...manifest, modules: manifest.modules.map((m: { html: string }, i: number) => (i === 0 ? { ...m, html: "_backup/quiz-key.json" } : m)) },
    { ...manifest, quiz: { ...manifest.quiz, questions: "_backup/quiz-key.json" } },
  ];
  for (const v of variants) {
    assertEquals((await put(h, "pq_essentiel/manifest.json", encodeJson(v), { mime: "application/json" })).status, 200);
    const fresh = makeCourseDeps(h);
    const view = await fresh.call("GET", `/orders/${o.id}/course?t=${encodeURIComponent(o.token)}`);
    assertEquals(view.status, 503, "invalid manifest: nothing is served");
    assert(!JSON.stringify(view.body).includes("CONTENU"));
    const dl = await download(fresh, o.id, o.token, "module-1.xlsx");
    assertEquals(dl.status, 503);
    await dl.body?.cancel();
  }
});

Deno.test("upload: after a successful upload the same app reads the new content (the memo is dropped)", async () => {
  const h = await courseHarness({ env: UPLOAD_ENV });
  const o = await paidCourseOrder(h);
  const path = `/orders/${o.id}/course?t=${encodeURIComponent(o.token)}`;
  assertEquals((await h.call("GET", path)).body.course.version, "0.0-test");
  const manifest = JSON.parse(new TextDecoder().decode((await fixtureAsset("pq_essentiel/manifest.json")).bytes));
  assertEquals((await put(h, "pq_essentiel/manifest.json", encodeJson({ ...manifest, version: "1.1" }), { mime: "application/json" })).status, 200);
  assertEquals((await h.call("GET", path)).body.course.version, "1.1", "no 60 s of stale content on this instance");
  // A 1-byte manifest is stored (the route checks bytes, not meaning) and the course is unavailable at once.
  assertEquals((await put(h, "pq_essentiel/manifest.json", "x", { mime: "application/json" })).status, 200);
  assertEquals((await h.call("GET", path)).status, 503);
});

Deno.test("course content: a missing asset is not memoised (an upload in progress is seen as soon as it lands)", async () => {
  const store = new MemoryStore();
  const h = await courseHarness({ store, env: UPLOAD_ENV });
  const o = await paidCourseOrder(h);
  const path = `/orders/${o.id}/course?t=${encodeURIComponent(o.token)}`;
  assertEquals((await h.call("GET", path)).status, 503, "no content yet");
  const admin = { authorization: "Bearer test-admin-key" };
  assertEquals((await h.call("GET", "/admin/stats", { headers: admin })).body.course.content, false);
  await seedCourseMemory(store); // straight into the store, as another Edge instance would
  assertEquals((await h.call("GET", path)).status, 200, "same app, content read again");
  assertEquals((await h.call("GET", "/admin/stats", { headers: admin })).body.course.content, true);
});

Deno.test("upload: GET /admin/course-assets?validate=1 loads the course afresh and names what is wrong", async () => {
  const store = new MemoryStore();
  const h = uploadHarness(UPLOAD_ENV, store);
  const validate = async (o: { token?: string | null; ip?: string } = {}) => {
    const headers: Record<string, string> = { "cf-connecting-ip": o.ip ?? "203.0.113.50" };
    const token = o.token === undefined ? TOKEN : o.token;
    if (token !== null) headers["x-upload-token"] = token;
    const res = await h.app(new Request(`${API}/admin/course-assets?validate=1`, { headers }));
    return { status: res.status, headers: res.headers, text: await res.text() };
  };
  const empty = await validate();
  assertEquals(JSON.parse(empty.text).course, {
    valid: false,
    problem: "pq_essentiel/manifest.json is missing",
    version: null,
    modules: 0,
    files: 0,
    questions: 0,
  });
  await assertLooksUnknown(h, await validate({ token: "w".repeat(40), ip: freshIp() }), "wrong token");
  await assertLooksUnknown(h, await validate({ token: null, ip: freshIp() }), "no token");
  const assets = await fixtureAssets();
  for (const a of assets) assertEquals((await put(h, a.name, a.bytes, { mime: a.mime })).status, 200, a.name);
  // The app answered course reads meanwhile; the validation never uses the memo.
  assertEquals(JSON.parse((await validate()).text).course, {
    valid: true,
    problem: null,
    version: "0.0-test",
    modules: 2,
    files: 2,
    questions: 4,
  });
  const broken: Array<[string, Uint8Array | string, string]> = [
    ["pq_essentiel/manifest.json", "x", "pq_essentiel/manifest.json is invalid"],
    ["pq_essentiel/quiz-key.json", encodeJson({ answers: { q01: 0 } }), "pq_essentiel/quiz-key.json is invalid"],
    ["pq_essentiel/files/module-1.xlsx", "short", "pq_essentiel/files/module-1.xlsx has another size than in the manifest (5 ≠ 2808)"],
  ];
  for (const [name, bytes, problem] of broken) {
    const original = assets.find((a) => a.name === name)!;
    assertEquals((await put(h, name, bytes, { mime: original.mime })).status, 200);
    const got = JSON.parse((await validate()).text).course;
    assertEquals([got.valid, got.problem], [false, problem], name);
    assertEquals((await put(h, name, original.bytes, { mime: original.mime })).status, 200);
    assertEquals(JSON.parse((await validate()).text).course.valid, true, `${name} restored`);
  }
  // A download the manifest lists but nobody uploaded.
  const manifest = JSON.parse(new TextDecoder().decode(assets.find((a) => a.name === "pq_essentiel/manifest.json")!.bytes));
  manifest.files[0].asset = "pq_essentiel/files/not-uploaded.xlsx";
  assertEquals((await put(h, "pq_essentiel/manifest.json", encodeJson(manifest), { mime: "application/json" })).status, 200);
  assertEquals(JSON.parse((await validate()).text).course.problem, "pq_essentiel/files/not-uploaded.xlsx is missing");
  assert(!JSON.stringify(h.logs).includes("Lorem"), "names only, never content");
});

/** A new app on the same store and clock: the course text assets are memoised per Deps (one settings period), so a
 * new app sees a new manifest at once, like production after its 60-second settings reload. */
function makeCourseDeps(h: Harness): Harness {
  return makeHarness({ wave: null, store: h.store, clock: h.clock, env: { ...UPLOAD_ENV, PQ_SALES_OPEN: "true", MANUAL_WAVE_NUMBER: "770001122" } });
}

Deno.test("upload: the window comes from tcv.settings like every setting (env wins); ADMIN_KEY does not open it", async () => {
  const clock = new Clock(T0);
  const app = (settings: Record<string, string>, env: Record<string, string> = {}) =>
    createReloadingApp({ store: new MemoryStore({ settings }), envGet: envFrom(env), services: () => ({ wave: null }), now: clock.now });
  const req = (token: string) =>
    new Request(`${API}/admin/course-assets/pq_essentiel/s.json?mime=application/json`, {
      method: "PUT",
      headers: { "x-upload-token": token, "cf-connecting-ip": "203.0.113.70" },
      body: "{}",
    });
  assertEquals((await (app(UPLOAD_ENV))(req(TOKEN))).status, 200, "settings only");
  assertEquals((await (app(UPLOAD_ENV, { COURSE_UPLOAD_UNTIL: "2026-10-01" }))(req(TOKEN))).status, 404, "the env wins");
  const adminOnly = app({ ADMIN_KEY: "k" });
  const res = await adminOnly(new Request(`${API}/admin/course-assets`, { headers: { authorization: "Bearer k", "x-upload-token": "k" } }));
  assertEquals(res.status, 404);
  await res.body?.cancel();
  assertEquals(DAY, 86_400_000);
});

globalThis.addEventListener("unload", () => {
  sqlDb.close();
});
