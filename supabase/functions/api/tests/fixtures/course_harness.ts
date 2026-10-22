// Shared helpers for the course_*.test.ts suites: the lorem fixture loaded into a store (memory or SQL), a manual
// harness with sales open, course orders and their exact-amount payment.
import { assertEquals } from "jsr:@std/assert@1.0.13";
import { COURSE_FIXTURE_DIR, loadCourseAssetDir } from "../../dev_course.ts";
import type { LocalCourseAsset } from "../../dev_course.ts";
import { prepareManualCheckout } from "../../lib/autopay.ts";
import { MemoryStore } from "../../lib/store_memory.ts";
import { base64ToBytes } from "../../lib/store_sql.ts";
import { sha256Bytes } from "../../lib/ids.ts";
import type { Store } from "../../lib/types.ts";
import { makeHarness, RETURN_BASE } from "./backend_harness.ts";
import type { Harness, HarnessOptions } from "./backend_harness.ts";
import type { TestDb } from "./backend_pglite.ts";

export { COURSE_FIXTURE_DIR };

export const HOOK_KEY = "test-hook-key";
export const MANUAL_NUMBER = "770001122";
export const BUYER_NAME = "Aïssatou N'Diaye-Bâ";
export const FORMATION_RETURN_BASE = "https://ndoyepapamassamba-commits.github.io/Add-a-README-file/formation";
export { RETURN_BASE };

/** The fixture's passing answers (= its key: 4/4). */
export const FIXTURE_QUIZ_ANSWERS: Readonly<Record<string, number>> = { q01: 0, q02: 1, q03: 2, q04: 3 };
export const FIXTURE_MODULE_TITLES = ["Module test 1 — Lorem ipsum", "Module test 2 — Dolor sit amet"];
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

let cached: LocalCourseAsset[] | null = null;

/** The lorem fixture files (read once per test process). */
export async function fixtureAssets(): Promise<LocalCourseAsset[]> {
  cached ??= await loadCourseAssetDir(COURSE_FIXTURE_DIR);
  return cached.map((a) => ({ ...a, bytes: a.bytes.slice() }));
}

export async function fixtureAsset(name: string): Promise<LocalCourseAsset> {
  const a = (await fixtureAssets()).find((x) => x.name === name);
  if (!a) throw new Error(`fixture asset ${name} not found`);
  return a;
}

export async function seedCourseMemory(store: MemoryStore, assets?: LocalCourseAsset[]): Promise<void> {
  for (const a of assets ?? await fixtureAssets()) await store.putCourseAsset(a.name, a.mime, a.bytes);
}

/** Base64 of a byte slice (chunks are encoded one by one, like scripts/course-sql.mjs does). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Uploads one asset through tcv_course_upload_chunk / tcv_course_upload_commit, chunks sent in `order`. */
export async function uploadSql(
  db: TestDb,
  asset: { name: string; mime: string; bytes: Uint8Array },
  chunkSize: number,
  order: "asc" | "desc" = "asc",
): Promise<Record<string, unknown>> {
  const sha = await sha256Bytes(asset.bytes);
  const uploadId = `${asset.name.replace(/[^a-z0-9]+/g, "-")}-${sha.slice(0, 12)}`;
  const chunks: string[] = [];
  for (let i = 0; i < Math.max(asset.bytes.length, 1); i += chunkSize) chunks.push(bytesToBase64(asset.bytes.subarray(i, i + chunkSize)));
  const seqs = chunks.map((_, i) => i);
  if (order === "desc") seqs.reverse();
  for (const seq of seqs) {
    await db.query("select public.tcv_course_upload_chunk($1, $2, $3) as n", [uploadId, seq, chunks[seq]]);
  }
  const r = await db.query("select public.tcv_course_upload_commit($1, $2, $3, $4, $5) as r", [
    uploadId,
    asset.name,
    asset.mime,
    sha,
    chunks.length,
  ]);
  return r.rows[0].r as Record<string, unknown>;
}

/** The fixture into tcv.course_assets through the SQL upload functions, `chunkSize` raw bytes per chunk. */
export async function seedCourseSql(db: TestDb, chunkSize = 1000, assets?: LocalCourseAsset[]): Promise<void> {
  for (const a of assets ?? await fixtureAssets()) await uploadSql(db, a, chunkSize);
}

/** Same bytes as the SQL side returns them (used to compare stores). */
export function decodeAssetBase64(b64: string): Uint8Array {
  return base64ToBytes(b64);
}

export interface CourseHarnessOptions extends HarnessOptions {
  /** false = no course content in the store. */
  seed?: boolean;
}

/** Manual Wave mode with the phone hook, sales open, the lorem fixture seeded in a fresh MemoryStore. */
export async function courseHarness(opts: CourseHarnessOptions = {}): Promise<Harness> {
  const store = opts.store ?? new MemoryStore();
  if (opts.seed !== false && store instanceof MemoryStore && !opts.store) await seedCourseMemory(store);
  return makeHarness({
    wave: null,
    ...opts,
    store,
    env: { MANUAL_WAVE_NUMBER: MANUAL_NUMBER, PHONE_HOOK_KEY: HOOK_KEY, PQ_SALES_OPEN: "true", ...opts.env },
  });
}

export function courseOrderBody(over: Record<string, unknown> = {}, buyer: Record<string, unknown> = {}) {
  return {
    product: "pq_essentiel",
    buyer: { fullName: BUYER_NAME, email: "aissatou@example.com", phone: "+225 07 07 07 07 07", ...buyer },
    acceptCgv: true,
    website: "",
    ...over,
  };
}

let ipSeq = 0;
/** A fresh documentation IP per call, so the per-IP order limit never interferes. */
export const nextIp = () => `198.51.100.${(++ipSeq % 250) + 1}`;

export async function createCourseOrder(
  h: Harness,
  over: Record<string, unknown> = {},
  buyer: Record<string, unknown> = {},
): Promise<{ id: string; token: string }> {
  const res = await h.call("POST", "/orders", { body: courseOrderBody(over, buyer), ip: nextIp() });
  if (res.status !== 201) throw new Error(`createCourseOrder failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.order.id, token: res.body.order.token };
}

/** "Vous avez reçu 24 999F de Moussa Sarr. Nouveau solde : 80 000F" (plain spaces, NBSP-free). */
export function waveReceived(amount: number, from = "Moussa Sarr"): string {
  const grouped = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `Vous avez reçu ${grouped}F de ${from}. Nouveau solde : 80 000F`;
}

export function notify(h: Harness, text: string) {
  return h.call("POST", `/payments/notify?k=${HOOK_KEY}`, { body: { title: "Wave", text } });
}

const SENDERS = ["Moussa Sarr", "Awa Ndiaye", "Fatou Diop", "Mamadou Fall", "Khady Sow", "Ibrahima Ba", "Aminata Kane"];
let paySeq = 0;

/**
 * Pays a course order the way production does in manual mode: it gets its unique amount (same code as the
 * checkout route) and the owner's phone reports exactly that amount. Returns the amount paid.
 */
export async function payCourseOrder(h: Harness, id: string): Promise<number> {
  const order = await h.store.getOrder(id);
  if (!order) throw new Error(`payCourseOrder: unknown order ${id}`);
  const { exactAmount: exact } = await prepareManualCheckout(h.deps, order);
  // A different sender each time: the same text twice in one minute is a duplicate notification.
  const res = await notify(h, waveReceived(exact, SENDERS[paySeq++ % SENDERS.length]));
  assertEquals([res.status, res.body.matched, res.body.paid], [200, id, true], `payCourseOrder ${id}`);
  return exact;
}

/** POST /orders/:id/checkout from the formation pages. */
export function courseCheckout(h: Harness, id: string, token: string, returnBase = FORMATION_RETURN_BASE) {
  return h.call("POST", `/orders/${id}/checkout`, { body: { t: token, returnBase } });
}

/** A paid course order, ready for the reader. */
export async function paidCourseOrder(h: Harness, buyer: Record<string, unknown> = {}): Promise<{ id: string; token: string }> {
  const o = await createCourseOrder(h, {}, buyer);
  await payCourseOrder(h, o.id);
  return o;
}

/** Raw request (binary downloads): the harness `call` reads bodies as text. */
export function rawGet(h: Harness, path: string, ip = "203.0.113.7"): Promise<Response> {
  return h.app(new Request(`http://localhost/functions/v1/api${path}`, { headers: { "cf-connecting-ip": ip } }));
}

export function download(h: Harness, id: string, token: string, name: string): Promise<Response> {
  return rawGet(h, `/orders/${id}/files/${encodeURIComponent(name)}?t=${encodeURIComponent(token)}`);
}

/** The store's own view of a course asset (for tests that swap content). */
export async function putAsset(store: Store, name: string, mime: string, bytes: Uint8Array): Promise<void> {
  if (!(store instanceof MemoryStore)) throw new Error("putAsset: MemoryStore only");
  await store.putCourseAsset(name, mime, bytes);
}

export const encodeJson = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
