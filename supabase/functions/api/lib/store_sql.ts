// Store over the public.tcv_* SQL functions. RpcStore maps Store methods to function calls; SqlStore runs
// them through a plain query function (PGlite in tests), SupabaseStore through supabase.rpc().
import type {
  AttestationRecord,
  CourseAsset,
  CourseAssetInfo,
  LeadRow,
  ManualHoldParams,
  OrderRow,
  PayoutRow,
  QuizAttemptRow,
  QuizProgress,
  Stats,
  Store,
} from "./types.ts";
import { newRandomId, sha256Bytes } from "./ids.ts";

export type ArgType = "text" | "integer" | "double precision" | "jsonb" | "timestamptz" | "date";

/** Parameter names and types of every Store function, in declaration order (see the schema migration). */
export const RPC_SIGNATURES: Record<string, ReadonlyArray<readonly [string, ArgType]>> = {
  tcv_insert_order: [["p_row", "jsonb"]],
  tcv_get_order: [["p_id", "text"]],
  tcv_update_order: [["p_id", "text"], ["p_patch", "jsonb"]],
  tcv_mark_paid: [
    ["p_id", "text"],
    ["p_method", "text"],
    ["p_paid_amount", "integer"],
    ["p_transaction_id", "text"],
    ["p_session_id", "text"],
    ["p_paid_at", "timestamptz"],
  ],
  tcv_list_open_checkouts: [["p_since", "timestamptz"], ["p_limit", "integer"]],
  tcv_record_event: [["p_id", "text"], ["p_type", "text"], ["p_ref", "text"], ["p_payload", "jsonb"]],
  tcv_hit_rate_limit: [["p_key", "text"], ["p_window_seconds", "integer"], ["p_max", "integer"], ["p_now", "timestamptz"]],
  tcv_create_payout: [
    ["p_id", "text"],
    ["p_day", "date"],
    ["p_mobile", "text"],
    ["p_idempotency_key", "text"],
    ["p_fee_rate", "double precision"],
    ["p_payout_fee_rate", "double precision"],
    ["p_max_amount", "double precision"],
    ["p_min_amount", "integer"],
    ["p_now", "timestamptz"],
  ],
  tcv_update_payout: [["p_id", "text"], ["p_patch", "jsonb"]],
  tcv_fail_payout: [["p_id", "text"], ["p_error", "text"], ["p_now", "timestamptz"]],
  tcv_list_unsettled_payouts: [],
  tcv_purge: [["p_unpaid_before", "timestamptz"], ["p_paid_before", "timestamptz"], ["p_now", "timestamptz"]],
  tcv_stats: [["p_now", "timestamptz"]],
  tcv_get_settings: [],
  // 20261018000005_autopay.sql
  tcv_record_payment_detection: [["p_id", "text"], ["p_text", "text"], ["p_now", "timestamptz"]],
  // 20261021000006_course.sql
  tcv_course_asset: [["p_name", "text"]],
  tcv_course_asset_list: [["p_prefix", "text"]],
  tcv_course_upload_chunk: [["p_upload_id", "text"], ["p_seq", "integer"], ["p_b64", "text"]],
  tcv_course_upload_commit: [
    ["p_upload_id", "text"],
    ["p_name", "text"],
    ["p_mime", "text"],
    ["p_sha256", "text"],
    ["p_chunks", "integer"],
  ],
  tcv_rate_limit_count: [["p_key", "text"], ["p_window_seconds", "integer"], ["p_now", "timestamptz"]],
  tcv_insert_lead: [["p_row", "jsonb"]],
  tcv_insert_quiz_attempt: [["p_row", "jsonb"]],
  tcv_quiz_progress: [["p_order_id", "text"]],
  tcv_find_attestation: [["p_code", "text"]],
  // 20261022000007_autopay_hold.sql
  tcv_hold_manual_amount: [
    ["p_id", "text"],
    ["p_base", "integer"],
    ["p_max_offset", "integer"],
    ["p_now", "timestamptz"],
    ["p_unpaid_since", "timestamptz"],
    ["p_paid_since", "timestamptz"],
  ],
  tcv_list_held_manual_orders: [],
};

/**
 * public.tcv_* functions the API never calls. tcv_course_put_asset: one-statement upload of a small asset, run as
 * plain SQL by the lead (`scripts/course-sql.mjs` output through the Supabase MCP `execute_sql`). Service role only.
 */
export const SQL_ONLY_FUNCTIONS: readonly string[] = ["tcv_course_put_asset"];

/**
 * 000005 functions replaced by 000007 (tcv_hold_manual_amount, tcv_list_held_manual_orders) and kept for the Edge
 * Function deployed before it; this version never calls them. Service role only.
 */
export const LEGACY_FUNCTIONS: readonly string[] = ["tcv_assign_manual_amount", "tcv_list_open_manual_orders"];

/** Raw bytes per tcv_course_upload_chunk call of the upload route: base64 of 720 000 bytes = 960 000 characters. */
export const COURSE_UPLOAD_CHUNK_BYTES = 720_000;

/** Calls `public.<fn>` with named arguments and returns its JSON result (null for SQL NULL / void). */
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

/** Patches go to SQL as JSON: undefined values would silently vanish, so they become explicit nulls. */
function jsonPatch<T extends object>(patch: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) out[k] = v === undefined ? null : v;
  return out;
}

function toPayout(v: unknown): PayoutRow {
  const row = v as PayoutRow;
  return { ...row, fee: row.fee === null || row.fee === undefined ? null : Number(row.fee) };
}

function toOrder(v: unknown): OrderRow {
  return v as OrderRow;
}

function toAssetInfo(v: unknown): CourseAssetInfo {
  const r = v as CourseAssetInfo;
  return { name: r.name, mime: r.mime, size: Number(r.size), sha256: r.sha256, updated_at: r.updated_at };
}

/** bytes → base64 (no line breaks). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** base64 (line breaks tolerated) → bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class RpcStore implements Store {
  constructor(private readonly rpc: Rpc) {}

  /** Every declared parameter is sent, absent ones as null (PostgREST resolves functions by argument names). */
  private call(fn: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const sig = RPC_SIGNATURES[fn];
    if (!sig) throw new Error(`unknown store function ${fn}`);
    const full: Record<string, unknown> = {};
    for (const [name] of sig) full[name] = args[name] === undefined ? null : args[name];
    return this.rpc(fn, full);
  }

  async insertOrder(row: OrderRow): Promise<void> {
    await this.call("tcv_insert_order", { p_row: jsonPatch(row) });
  }

  async getOrder(id: string): Promise<OrderRow | null> {
    const r = await this.call("tcv_get_order", { p_id: id });
    return r ? toOrder(r) : null;
  }

  async updateOrder(id: string, patch: Partial<OrderRow>): Promise<void> {
    await this.call("tcv_update_order", { p_id: id, p_patch: jsonPatch(patch) });
  }

  async markPaid(id: string, p: Parameters<Store["markPaid"]>[1]): Promise<boolean> {
    const r = await this.call("tcv_mark_paid", {
      p_id: id,
      p_method: p.method,
      p_paid_amount: p.paidAmount,
      p_transaction_id: p.transactionId,
      p_session_id: p.sessionId,
      p_paid_at: p.paidAt,
    });
    return r === true;
  }

  async listOpenCheckouts(sinceIso: string, limit: number): Promise<OrderRow[]> {
    const r = await this.call("tcv_list_open_checkouts", { p_since: sinceIso, p_limit: limit });
    return Array.isArray(r) ? r.map(toOrder) : [];
  }

  async recordEvent(eventId: string, type: string, ref: string | null, payload: unknown): Promise<boolean> {
    const r = await this.call("tcv_record_event", { p_id: eventId, p_type: type, p_ref: ref, p_payload: payload ?? null });
    return r === true;
  }

  async hitRateLimit(key: string, windowSeconds: number, max: number, nowIso: string): Promise<boolean> {
    const r = await this.call("tcv_hit_rate_limit", {
      p_key: key,
      p_window_seconds: windowSeconds,
      p_max: max,
      p_now: nowIso,
    });
    return r === true;
  }

  async createPayout(p: Parameters<Store["createPayout"]>[0]): Promise<PayoutRow | null> {
    const r = await this.call("tcv_create_payout", {
      p_id: p.id,
      p_day: p.day,
      p_mobile: p.mobile,
      p_idempotency_key: p.idempotencyKey,
      p_fee_rate: p.feeRate,
      p_payout_fee_rate: p.payoutFeeRate,
      p_max_amount: p.maxAmount,
      p_min_amount: p.minAmount,
      p_now: p.nowIso,
    });
    return r ? toPayout(r) : null;
  }

  async updatePayout(id: string, patch: Partial<PayoutRow>): Promise<void> {
    await this.call("tcv_update_payout", { p_id: id, p_patch: jsonPatch(patch) });
  }

  async failPayout(id: string, error: string, nowIso: string): Promise<void> {
    await this.call("tcv_fail_payout", { p_id: id, p_error: error, p_now: nowIso });
  }

  async listUnsettledPayouts(): Promise<PayoutRow[]> {
    const r = await this.call("tcv_list_unsettled_payouts");
    return Array.isArray(r) ? r.map(toPayout) : [];
  }

  async purge(unpaidBeforeIso: string, paidBeforeIso: string, nowIso: string): Promise<number> {
    const r = await this.call("tcv_purge", { p_unpaid_before: unpaidBeforeIso, p_paid_before: paidBeforeIso, p_now: nowIso });
    return Number(r ?? 0);
  }

  async stats(nowIso: string): Promise<Stats> {
    const s = (await this.call("tcv_stats", { p_now: nowIso })) as Stats;
    return { ...s, payouts: s.payouts.map(toPayout) };
  }

  async getSettings(): Promise<Record<string, string>> {
    const r = await this.call("tcv_get_settings");
    return r && typeof r === "object" ? (r as Record<string, string>) : {};
  }

  async holdManualAmount(id: string, p: ManualHoldParams): Promise<number | null> {
    const r = await this.call("tcv_hold_manual_amount", {
      p_id: id,
      p_base: p.base,
      p_max_offset: p.maxOffset,
      p_now: p.nowIso,
      p_unpaid_since: p.unpaidSinceIso,
      p_paid_since: p.paidSinceIso,
    });
    return r === null || r === undefined ? null : Number(r);
  }

  async listHeldManualOrders(): Promise<OrderRow[]> {
    const r = await this.call("tcv_list_held_manual_orders");
    return Array.isArray(r) ? r.map(toOrder) : [];
  }

  async peekRateLimit(key: string, windowSeconds: number, nowIso: string): Promise<number> {
    const r = await this.call("tcv_rate_limit_count", { p_key: key, p_window_seconds: windowSeconds, p_now: nowIso });
    return Number(r ?? 0);
  }

  async recordPaymentDetection(id: string, text: string, nowIso: string): Promise<void> {
    await this.call("tcv_record_payment_detection", { p_id: id, p_text: text, p_now: nowIso });
  }

  async getCourseAsset(name: string): Promise<CourseAsset | null> {
    const r = (await this.call("tcv_course_asset", { p_name: name })) as
      | { name: string; mime: string; sha256: string; updated_at: string; base64: string }
      | null;
    if (!r) return null;
    return { name: r.name, mime: r.mime, sha256: r.sha256, updatedAt: r.updated_at, bytes: base64ToBytes(r.base64) };
  }

  async uploadCourseAsset(name: string, mime: string, bytes: Uint8Array): Promise<CourseAssetInfo> {
    // A fresh id per upload: two uploads of the same name never mix their chunks. Each call carries at most
    // COURSE_UPLOAD_CHUNK_BYTES raw bytes (960 000 base64 characters), well within PostgREST's request limit.
    const uploadId = newRandomId("up-", 20);
    let chunks = 0;
    for (let offset = 0; offset < Math.max(bytes.length, 1); offset += COURSE_UPLOAD_CHUNK_BYTES, chunks++) {
      const b64 = bytesToBase64(bytes.subarray(offset, offset + COURSE_UPLOAD_CHUNK_BYTES));
      await this.call("tcv_course_upload_chunk", { p_upload_id: uploadId, p_seq: chunks, p_b64: b64 });
    }
    const r = await this.call("tcv_course_upload_commit", {
      p_upload_id: uploadId,
      p_name: name,
      p_mime: mime,
      p_sha256: await sha256Bytes(bytes),
      p_chunks: chunks,
    });
    return toAssetInfo(r);
  }

  async listCourseAssets(prefix: string): Promise<CourseAssetInfo[]> {
    const r = await this.call("tcv_course_asset_list", { p_prefix: prefix });
    return Array.isArray(r) ? r.map(toAssetInfo) : [];
  }

  async insertLead(row: LeadRow): Promise<void> {
    await this.call("tcv_insert_lead", { p_row: jsonPatch(row) });
  }

  async recordQuizAttempt(row: QuizAttemptRow): Promise<void> {
    await this.call("tcv_insert_quiz_attempt", { p_row: jsonPatch(row) });
  }

  async getQuizProgress(orderId: string): Promise<QuizProgress | null> {
    const r = await this.call("tcv_quiz_progress", { p_order_id: orderId });
    return r ? (r as QuizProgress) : null;
  }

  async findAttestation(code: string): Promise<AttestationRecord | null> {
    const r = await this.call("tcv_find_attestation", { p_code: code });
    return r ? (r as AttestationRecord) : null;
  }
}

/** Minimal query interface satisfied by PGlite (`db.query`) and node-postgres style clients. */
export type QueryFn = (sql: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;

/** Builds `select public.fn(p_a => $1::type, …) as result`; jsonb arguments travel as JSON text. */
export function sqlRpc(query: QueryFn): Rpc {
  return async (fn, args) => {
    const sig = RPC_SIGNATURES[fn];
    if (!sig) throw new Error(`unknown store function ${fn}`);
    const params = sig.map(([name, type]) => {
      const v = args[name];
      if (v === undefined || v === null) return null;
      return type === "jsonb" ? JSON.stringify(v) : v;
    });
    const list = sig.map(([name, type], i) => `${name} => $${i + 1}::${type}`).join(", ");
    const res = await query(`select public.${fn}(${list}) as result`, params);
    const value = res.rows[0]?.result;
    return value === undefined || value === "" ? null : value;
  };
}

export class SqlStore extends RpcStore {
  constructor(query: QueryFn) {
    super(sqlRpc(query));
  }
}
