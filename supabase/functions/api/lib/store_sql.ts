// Store over the public.tcv_* SQL functions. RpcStore maps Store methods to function calls; SqlStore runs
// them through a plain query function (PGlite in tests), SupabaseStore through supabase.rpc().
import type { OrderRow, PayoutRow, Stats, Store } from "./types.ts";

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
};

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
