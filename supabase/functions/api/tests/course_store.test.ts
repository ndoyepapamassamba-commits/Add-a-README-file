// Course Store contract (20261021000006_course.sql): identical scenarios on MemoryStore, SqlStore (PGlite + every
// migration) and SupabaseStore (PostgREST stand-in), plus the SQL-only upload functions.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.13";
import { MemoryStore } from "../lib/store_memory.ts";
import { sha256Bytes } from "../lib/ids.ts";
import type { CourseBuyer, OrderRow, QuizAttemptRow, Store } from "../lib/types.ts";
import { DAY, orderRow, T0 } from "./fixtures/backend_harness.ts";
import { openTestDb, sqlStore, supabaseStore } from "./fixtures/backend_pglite.ts";
import type { TestDb } from "./fixtures/backend_pglite.ts";
import { bytesToBase64, fixtureAssets, seedCourseMemory, seedCourseSql, uploadSql } from "./fixtures/course_harness.ts";

const db: TestDb = await openTestDb();

interface Impl {
  name: string;
  sql: boolean;
  make(): Promise<Store>;
}

const IMPLS: Impl[] = [
  { name: "MemoryStore", sql: false, make: () => Promise.resolve(new MemoryStore()) },
  { name: "SqlStore(PGlite)", sql: true, make: async () => (await db.reset(), sqlStore(db)) },
  { name: "SupabaseStore(PostgREST stand-in)", sql: true, make: async () => (await db.reset(), supabaseStore(db)) },
];

function contract(name: string, fn: (store: Store, impl: Impl) => Promise<void>) {
  for (const impl of IMPLS) {
    Deno.test({
      name: `course store [${impl.name}] ${name}`,
      sanitizeOps: false,
      sanitizeResources: false,
      fn: async () => fn(await impl.make(), impl),
    });
  }
}

function sqlTest(name: string, fn: () => Promise<void>) {
  Deno.test({ name: `course SQL: ${name}`, sanitizeOps: false, sanitizeResources: false, fn: async () => (await db.reset(), fn()) });
}

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const at = (days: number, base = T0) => new Date(Date.parse(base) + days * DAY).toISOString();

const BUYER: CourseBuyer = {
  fullName: "Aïssatou N'Diaye-Bâ",
  email: "aissatou@example.com",
  phone: "+2250707070707",
  acceptCgv: true,
  acceptedAt: T0,
  cgvVersion: "2026-10-21",
};

function courseRow(over: Partial<OrderRow> = {}): OrderRow {
  return orderRow({ product: "pq_essentiel", amount: 25000, input: null, document: null, buyer: BUYER, ...over });
}

async function paidCourse(store: Store, paidAt = T0, over: Partial<OrderRow> = {}): Promise<OrderRow> {
  const row = courseRow({ created_at: paidAt, ...over });
  await store.insertOrder(row);
  await store.markPaid(row.id, { method: "manual", paidAmount: 24999, transactionId: null, sessionId: null, paidAt });
  return (await store.getOrder(row.id))!;
}

let attemptSeq = 0;
function attempt(orderId: string, over: Partial<QuizAttemptRow> = {}): QuizAttemptRow {
  attemptSeq += 1;
  return {
    id: `QA-${String(attemptSeq).padStart(10, "0")}`,
    order_id: orderId,
    score: 75,
    correct: 3,
    total: 4,
    passed: true,
    public_listing: false,
    attestation_code: "0123456789ab",
    created_at: T0,
    ...over,
  };
}

async function seed(store: Store, impl: Impl, chunkSize = 1000): Promise<void> {
  if (impl.sql) await seedCourseSql(db, chunkSize);
  else await seedCourseMemory(store as MemoryStore);
}

// --- Orders -----------------------------------------------------------------------------------

contract("insertOrder / getOrder carry the buyer; buyer is not patchable", async (store) => {
  const row = courseRow({ status: "checkout", manual_amount: 24999 });
  await store.insertOrder(row);
  assertEquals(await store.getOrder(row.id), plain(row));
  const doc = orderRow();
  await store.insertOrder(doc);
  assertEquals((await store.getOrder(doc.id))?.buyer, null);
  await assertRejects(() => store.updateOrder(row.id, { buyer: null } as Partial<OrderRow>));
  assertEquals((await store.getOrder(row.id))?.buyer, plain(BUYER));
});

// --- Assets -----------------------------------------------------------------------------------

contract("course assets: byte-exact round trip of every fixture file (SQL side: 1 000-byte chunks)", async (store, impl) => {
  await seed(store, impl);
  for (const a of await fixtureAssets()) {
    const got = await store.getCourseAsset(a.name);
    assert(got, a.name);
    assertEquals([got.name, got.mime, got.sha256], [a.name, a.mime, await sha256Bytes(a.bytes)], a.name);
    assertEquals(got.bytes, a.bytes, `${a.name} byte for byte`);
    assert(!Number.isNaN(Date.parse(got.updatedAt)));
  }
  assertEquals(await store.getCourseAsset("pq_essentiel/nope.json"), null);
  assertEquals(await store.getCourseAsset("../pq_essentiel/manifest.json"), null);
});

contract("course assets: a returned asset is a copy", async (store, impl) => {
  await seed(store, impl);
  const a = (await store.getCourseAsset("pq_essentiel/quiz-key.json"))!;
  a.bytes[0] = 0;
  assertEquals((await store.getCourseAsset("pq_essentiel/quiz-key.json"))!.bytes[0], "{".charCodeAt(0));
});

Deno.test("course store [MemoryStore] putCourseAsset applies the database checks", async () => {
  const store = new MemoryStore();
  for (const bad of ["../x", "pq_essentiel/../x", "PQ/x", "pq_essentiel", "pq_essentiel/.hidden", "pq essentiel/x"]) {
    await assertRejects(() => store.putCourseAsset(bad, "application/json", new Uint8Array([1])), Error, undefined, bad);
  }
  await assertRejects(() => store.putCourseAsset("pq_essentiel/x.json", "a", new Uint8Array([1])));
  const put = await store.putCourseAsset("pq_essentiel/x.json", "application/json", new TextEncoder().encode("{}"));
  assertEquals(put.sha256, "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
});

sqlTest("chunks may arrive out of order; a bigger file is assembled byte for byte", async () => {
  const bytes = crypto.getRandomValues(new Uint8Array(65_000));
  const r = await uploadSql(db, { name: "pq_essentiel/files/big.zip", mime: "application/zip", bytes }, 7_000, "desc");
  assertEquals([r.name, r.size, r.sha256], ["pq_essentiel/files/big.zip", 65_000, await sha256Bytes(bytes)]);
  assertEquals((await sqlStore(db).getCourseAsset("pq_essentiel/files/big.zip"))?.bytes, bytes);
  const chunks = (await db.query("select count(*)::int as n, bool_and(b64 = '') as empty, bool_and(committed_at is not null) as done from tcv.course_upload_chunks", [])).rows[0];
  assertEquals([chunks.n, chunks.empty, chunks.done], [10, true, true], "committed chunks keep their row, lose their content");
});

sqlTest("upload errors: sha256 mismatch, wrong chunk count, invalid base64, names outside the rules", async () => {
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  await q("select public.tcv_course_upload_chunk('upload-test-1', 0, $1)", [btoa("hello")]);
  await assertRejects(() => q("select public.tcv_course_upload_commit('upload-test-1', 'pq_essentiel/a.txt', 'text/plain', $1, 1)", ["0".repeat(64)]), Error, "sha256 mismatch");
  const sha = await sha256Bytes(new TextEncoder().encode("hello"));
  await assertRejects(() => q("select public.tcv_course_upload_commit('upload-test-1', 'pq_essentiel/a.txt', 'text/plain', $1, 2)", [sha]), Error, "expected");
  await assertRejects(() => q("select public.tcv_course_upload_chunk('upload-test-2', 0, 'not base64 !!')"));
  await assertRejects(() => q("select public.tcv_course_upload_chunk('bad id', 0, 'AA==')"), Error);
  for (const name of ["../x", "pq_essentiel/../x", "Pq/x"]) {
    await assertRejects(() => q("select public.tcv_course_upload_commit('upload-test-1', $1, 'text/plain', $2, 1)", [name, sha]), Error, undefined, name);
  }
  // The same upload then commits fine with the right digest and count.
  const ok = (await q("select public.tcv_course_upload_commit('upload-test-1', 'pq_essentiel/a.txt', 'text/plain', $1, 1) as r", [sha])).rows[0].r as Record<string, unknown>;
  assertEquals([ok.size, ok.sha256], [5, sha]);
  assertEquals(new TextDecoder().decode((await sqlStore(db).getCourseAsset("pq_essentiel/a.txt"))!.bytes), "hello");
});

sqlTest("tcv_course_put_asset: one statement, idempotent; tcv_course_asset_list: metadata only", async () => {
  const bytes = new TextEncoder().encode('{"schema":1}');
  const sha = await sha256Bytes(bytes);
  const put = (mime: string) => db.query("select public.tcv_course_put_asset('pq_essentiel/x.json', $1, $2, $3) as r", [mime, bytesToBase64(bytes), sha]);
  const first = (await put("application/json")).rows[0].r as Record<string, unknown>;
  const second = (await put("application/json; charset=utf-8")).rows[0].r as Record<string, unknown>;
  assertEquals([first.size, second.size, second.mime], [bytes.length, bytes.length, "application/json; charset=utf-8"]);
  assertEquals((await db.query("select count(*)::int as n from tcv.course_assets", [])).rows[0].n, 1);
  const list = (await db.query("select public.tcv_course_asset_list('pq_essentiel/') as r", [])).rows[0].r as Array<Record<string, unknown>>;
  assertEquals(list.map((x) => Object.keys(x).sort()), [["mime", "name", "sha256", "size", "updated_at"]]);
  assertEquals((await db.query("select public.tcv_course_asset_list('other/') as r", [])).rows[0].r, []);
  const asset = (await db.query("select public.tcv_course_asset('pq_essentiel/x.json') as r", [])).rows[0].r as Record<string, string>;
  assert(!asset.base64.includes("\n"));
  assertEquals((await db.query("select public.tcv_course_asset('pq_essentiel/none') as r", [])).rows[0].r, null);
});

sqlTest("purge empties upload chunks left uncommitted for more than 2 days (UPDATE)", async () => {
  await db.query("select public.tcv_course_upload_chunk('upload-stale-1', 0, 'AAAA')", []);
  await db.query("update tcv.course_upload_chunks set created_at = now() - interval '3 days' where upload_id = 'upload-stale-1'", []);
  await db.query("select public.tcv_course_upload_chunk('upload-fresh-1', 0, 'AAAA')", []);
  const now = new Date().toISOString();
  await sqlStore(db).purge(at(-3, now), at(-30, now), now);
  const rows = (await db.query("select upload_id, b64 from tcv.course_upload_chunks order by upload_id", [])).rows;
  assertEquals(rows.map((r) => [r.upload_id, r.b64]), [["upload-fresh-1", "AAAA"], ["upload-stale-1", ""]]);
});

// --- Quiz progress and attestations -----------------------------------------------------------

contract("quiz progress: null before a pass; latest = max created_at then max id; best and first", async (store) => {
  const o = await paidCourse(store);
  assertEquals(await store.getQuizProgress(o.id), null);
  await store.recordQuizAttempt(attempt(o.id, { id: "QA-0000000001", score: 75, created_at: at(1), public_listing: true }));
  await store.recordQuizAttempt(attempt(o.id, { id: "QA-0000000003", score: 100, created_at: at(2), public_listing: false }));
  await store.recordQuizAttempt(attempt(o.id, { id: "QA-0000000002", score: 75, created_at: at(2), public_listing: true }));
  assertEquals(await store.getQuizProgress(o.id), {
    firstPassedAt: at(1),
    lastPassedAt: at(2),
    bestScore: 100,
    lastScore: 100, // same created_at: the larger id is the latest
    code: "0123456789ab",
    publicListing: false,
    passes: 3,
  });
  const other = await paidCourse(store);
  assertEquals(await store.getQuizProgress(other.id), null, "per order");
  await assertRejects(() => store.recordQuizAttempt(attempt("TCV-ZZZZZZZZ")), Error, undefined, "unknown order refused");
  await assertRejects(() => store.recordQuizAttempt(attempt(o.id, { id: "QA-0000000001" })), Error, undefined, "duplicate id");
  await assertRejects(() => store.recordQuizAttempt(attempt(o.id, { attestation_code: "XYZ" })), Error, undefined, "bad code");
});

contract("findAttestation: by code, first pass date, latest listing; null when unknown or purged", async (store) => {
  const o = await paidCourse(store);
  await store.recordQuizAttempt(attempt(o.id, { attestation_code: "aaaaaaaaaaaa", created_at: at(1), public_listing: false }));
  await store.recordQuizAttempt(attempt(o.id, { attestation_code: "aaaaaaaaaaaa", created_at: at(3), public_listing: true }));
  assertEquals(await store.findAttestation("aaaaaaaaaaaa"), {
    code: "aaaaaaaaaaaa",
    orderId: o.id,
    product: "pq_essentiel",
    fullName: BUYER.fullName,
    passedAt: at(1),
    publicListing: true,
  });
  assertEquals(await store.findAttestation("bbbbbbbbbbbb"), null);
  await store.purge(at(728), at(728), at(732));
  assertEquals((await store.getOrder(o.id))?.buyer, null);
  assertEquals(await store.findAttestation("aaaaaaaaaaaa"), null, "purged order: no attestation");
});

// --- Purge ------------------------------------------------------------------------------------

contract("purge: paid course orders kept 730 days (whatever paidBefore), CV 30 days, unpaid 3 days", async (store) => {
  const course = await paidCourse(store, T0);
  const reserved = await paidCourse(store, T0, { product: "pq_complet" as OrderRow["product"] });
  const cv = orderRow({ product: "cv" });
  await store.insertOrder(cv);
  await store.markPaid(cv.id, { method: "wave", paidAmount: 1000, transactionId: null, sessionId: null, paidAt: T0 });
  const unpaid = courseRow({ created_at: T0 });
  await store.insertOrder(unpaid);
  const purgeAt = (days: number) => store.purge(at(days - 3), at(days - 30), at(days));

  assertEquals(await purgeAt(2), 0);
  assertEquals(await purgeAt(4), 1, "the unpaid course order");
  assertEquals((await store.getOrder(unpaid.id))?.buyer, null);
  assertEquals(await purgeAt(31), 1, "the CV only");
  assertEquals((await store.getOrder(cv.id))?.purged_at, at(31));
  assertEquals([(await store.getOrder(course.id))?.purged_at, (await store.getOrder(course.id))?.buyer], [null, plain(BUYER)]);
  assertEquals(await purgeAt(729), 0);
  assertEquals(await purgeAt(731), 2, "the course and the reserved course id");
  const purged = (await store.getOrder(course.id))!;
  assertEquals([purged.buyer, purged.ip_hash, purged.purged_at, purged.status, purged.paid_amount], [null, null, at(731), "paid", 24999]);
  assertEquals((await store.getOrder(reserved.id))?.purged_at, at(731));
});

// --- Stats ------------------------------------------------------------------------------------

contract("stats: funnel per product (cohorts, sorted), leads and quiz passes (distinct orders)", async (store) => {
  const now = at(40);
  // Old cohort (created 40 days ago): counted all time only.
  await paidCourse(store, T0);
  // Recent cohort.
  const recentPaid = await paidCourse(store, at(35));
  await store.insertOrder(courseRow({ created_at: at(36), status: "checkout" }));
  await store.insertOrder(courseRow({ created_at: at(37), status: "awaiting_manual" }));
  await store.insertOrder(courseRow({ created_at: at(38) }));
  const pack = orderRow({ product: "pack", created_at: at(39) });
  await store.insertOrder(pack);
  await store.markPaid(pack.id, { method: "wave", paidAmount: 1500, transactionId: null, sessionId: null, paidAt: at(39) });
  await store.insertOrder(orderRow({ product: "cv", created_at: at(39) }));
  // Quiz: two passes of one order + one old pass of another.
  const oldOrder = (await store.getOrder((await paidCourse(store, T0)).id))!;
  await store.recordQuizAttempt(attempt(oldOrder.id, { created_at: at(1) }));
  await store.recordQuizAttempt(attempt(recentPaid.id, { created_at: at(36) }));
  await store.recordQuizAttempt(attempt(recentPaid.id, { created_at: at(37), score: 100 }));
  await store.insertLead({ id: "LD-00000001", email: "a@example.com", whatsapp: null, consent_text: "x", source: "formation-index", product: "pq_essentiel", ip_hash: null, created_at: at(2), purged_at: null });
  await store.insertLead({ id: "LD-00000002", email: null, whatsapp: "771234567", consent_text: "x", source: "autre", product: "pq_essentiel", ip_hash: null, created_at: at(39), purged_at: null });

  const s = await store.stats(now);
  assertEquals(s.funnel.last30, [
    { product: "cv", orders: 1, checkouts: 0, paid: 0, revenue: 0 },
    { product: "pack", orders: 1, checkouts: 1, paid: 1, revenue: 1500 },
    { product: "pq_essentiel", orders: 4, checkouts: 3, paid: 1, revenue: 24999 },
  ]);
  assertEquals(s.funnel.allTime, [
    { product: "cv", orders: 1, checkouts: 0, paid: 0, revenue: 0 },
    { product: "pack", orders: 1, checkouts: 1, paid: 1, revenue: 1500 },
    { product: "pq_essentiel", orders: 6, checkouts: 5, paid: 3, revenue: 3 * 24999 },
  ]);
  assertEquals(s.leads, { total: 2, last30: 1, active: 2 });
  assertEquals(s.quizPasses, { total: 2, last30: 1 });
  // The blocks of 000005 are still there.
  assertEquals(s.allTime, { paid: 4, revenue: 3 * 24999 + 1500 });
  assert(Array.isArray(s.recentOrders) && Array.isArray(s.payouts));
});

contract("stats: empty store", async (store) => {
  const s = await store.stats(T0);
  assertEquals([s.funnel, s.leads, s.quizPasses], [{ last30: [], allTime: [] }, { total: 0, last30: 0, active: 0 }, { total: 0, last30: 0 }]);
});
