// In-memory Store (tests and dev.ts). Mirrors the semantics of the tcv_* SQL functions exactly.
// Methods are async without awaiting anything: each one runs to completion in a single tick (hence atomic)
// and a thrown error surfaces as a rejected promise, like the SQL stores.
// deno-lint-ignore-file require-await
import type {
  AttestationRecord,
  CourseAsset,
  FunnelRow,
  LeadRow,
  OrderRow,
  OrderStatus,
  PayoutRow,
  PayoutStatus,
  QuizAttemptRow,
  QuizProgress,
  Stats,
  Store,
} from "./types.ts";
import { computePayoutAmount } from "./payout.ts";
import { PHONE_EVENT_TYPE } from "./autopay.ts";
import { ALL_COURSE_IDS, COURSE_RETENTION_DAYS, LEAD_RETENTION_DAYS } from "./course_catalog.ts";
import { sha256Bytes } from "./ids.ts";

export const ORDER_PATCH_KEYS: ReadonlySet<string> = new Set([
  "template",
  "status",
  "checkout_session_id",
  "wave_launch_url",
  "checkout_expires_at",
  "manual_payer_phone",
]);
export const PATCHABLE_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set(["preview", "checkout", "awaiting_manual"]);
export const PAYOUT_PATCH_KEYS: ReadonlySet<string> = new Set(["status", "request_body", "wave_payout_id", "fee", "error", "updated_at"]);
export const PAYOUT_STATUSES: ReadonlySet<PayoutStatus> = new Set(["pending", "processing", "succeeded", "failed", "unknown"]);
const UNSETTLED: ReadonlySet<PayoutStatus> = new Set(["pending", "processing", "unknown"]);
/** Final payout states: never modified again (a stale cron run must not reopen or fail them). */
export const FINAL_PAYOUT: ReadonlySet<PayoutStatus> = new Set(["succeeded", "failed"]);
/** Columns a paid order still accepts; its checkout fields keep the session that paid it. */
export const PAID_ORDER_PATCH_KEYS: ReadonlySet<string> = new Set(["template"]);

export const RECENT_ORDERS_LIMIT = 50;
export const RECENT_PAYOUTS_LIMIT = 30;
export const EVENT_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

const ms = (iso: string) => Date.parse(iso);
const iso = (t: number | string) => new Date(t).toISOString();

/** Same checks as the tcv.course_assets columns. */
export const COURSE_ASSET_NAME_RE = /^[a-z0-9_]+\/[a-z0-9][a-z0-9._\/-]{0,150}$/;
const ATTESTATION_CODE_RE = /^[0-9a-f]{12}$/;

interface Bucket {
  windowStart: number;
  count: number;
}

export class MemoryStore implements Store {
  readonly orders = new Map<string, OrderRow>();
  readonly payouts = new Map<string, PayoutRow>();
  readonly events = new Map<string, { type: string; ref: string | null; payload: unknown; createdAt: string }>();
  readonly rateLimits = new Map<string, Bucket>();
  readonly courseAssets = new Map<string, CourseAsset>();
  readonly leads = new Map<string, LeadRow>();
  readonly quizAttempts: QuizAttemptRow[] = [];
  settings: Record<string, string>;

  constructor(seed: { settings?: Record<string, string> } = {}) {
    this.settings = { ...(seed.settings ?? {}) };
  }

  async insertOrder(row: OrderRow): Promise<void> {
    if (this.orders.has(row.id)) throw new Error(`duplicate order id ${row.id}`);
    this.assertUniqueSession(row.id, row.checkout_session_id);
    this.orders.set(row.id, structuredClone(row));
  }

  async getOrder(id: string): Promise<OrderRow | null> {
    const o = this.orders.get(id);
    return o ? structuredClone(o) : null;
  }

  async updateOrder(id: string, patch: Partial<OrderRow>): Promise<void> {
    for (const key of Object.keys(patch)) {
      if (!ORDER_PATCH_KEYS.has(key)) throw new Error(`updateOrder: column ${key} cannot be patched`);
    }
    if ("status" in patch && !PATCHABLE_ORDER_STATUSES.has(patch.status as OrderStatus)) {
      throw new Error(`updateOrder: status ${patch.status} not allowed`);
    }
    const o = this.orders.get(id);
    if (!o) return;
    if ("checkout_session_id" in patch && o.status !== "paid") this.assertUniqueSession(id, patch.checkout_session_id ?? null);
    const { status, ...rest } = patch;
    const allowed = o.status === "paid"
      ? Object.fromEntries(Object.entries(rest).filter(([k]) => PAID_ORDER_PATCH_KEYS.has(k)))
      : rest;
    Object.assign(o, structuredClone(allowed));
    if (status !== undefined && o.status !== "paid") o.status = status;
  }

  async markPaid(id: string, p: Parameters<Store["markPaid"]>[1]): Promise<boolean> {
    const o = this.orders.get(id);
    if (!o || o.status === "paid") return false;
    if (p.sessionId) this.assertUniqueSession(id, p.sessionId);
    o.status = "paid";
    o.payment_method = p.method;
    o.paid_amount = p.paidAmount;
    o.wave_transaction_id = p.transactionId ?? o.wave_transaction_id;
    o.checkout_session_id = p.sessionId ?? o.checkout_session_id;
    o.paid_at = new Date(p.paidAt).toISOString();
    return true;
  }

  async listOpenCheckouts(sinceIso: string, limit: number): Promise<OrderRow[]> {
    const since = ms(sinceIso);
    const rows = [...this.orders.values()]
      .filter((o) => o.status === "checkout" && o.checkout_session_id !== null && ms(o.created_at) > since)
      .sort(byCreatedDesc)
      .slice(0, limit);
    return structuredClone(rows);
  }

  async recordEvent(eventId: string, type: string, ref: string | null, payload: unknown): Promise<boolean> {
    if (this.events.has(eventId)) return false;
    this.events.set(eventId, { type, ref, payload: structuredClone(payload), createdAt: new Date().toISOString() });
    return true;
  }

  async hitRateLimit(key: string, windowSeconds: number, max: number, nowIso: string): Promise<boolean> {
    const now = ms(nowIso);
    const b = this.rateLimits.get(key);
    if (!b || b.windowStart <= now - windowSeconds * 1000) {
      this.rateLimits.set(key, { windowStart: now, count: 1 });
      return 1 <= max;
    }
    b.count += 1;
    return b.count <= max;
  }

  async createPayout(p: Parameters<Store["createPayout"]>[0]): Promise<PayoutRow | null> {
    if ([...this.payouts.values()].some((x) => x.day === p.day || x.id === p.id || x.idempotency_key === p.idempotencyKey)) {
      return null;
    }
    const candidates = [...this.orders.values()].filter(
      (o) => o.status === "paid" && o.payment_method === "wave" && o.payout_id === null,
    );
    const gross = candidates.reduce((sum, o) => sum + (o.paid_amount ?? 0), 0);
    const amount = computePayoutAmount(gross, p.feeRate, p.payoutFeeRate, p.maxAmount);
    if (amount < p.minAmount) return null;
    const now = new Date(p.nowIso).toISOString();
    const row: PayoutRow = {
      id: p.id,
      day: p.day,
      amount,
      mobile: p.mobile,
      status: "pending",
      idempotency_key: p.idempotencyKey,
      request_body: "",
      wave_payout_id: null,
      fee: null,
      error: null,
      created_at: now,
      updated_at: now,
    };
    this.payouts.set(row.id, row);
    for (const o of candidates) o.payout_id = row.id;
    return structuredClone(row);
  }

  async updatePayout(id: string, patch: Partial<PayoutRow>): Promise<void> {
    for (const key of Object.keys(patch)) {
      if (!PAYOUT_PATCH_KEYS.has(key)) throw new Error(`updatePayout: column ${key} cannot be patched`);
    }
    if ("status" in patch && !PAYOUT_STATUSES.has(patch.status as PayoutStatus)) {
      throw new Error(`updatePayout: status ${patch.status} not allowed`);
    }
    const row = this.payouts.get(id);
    if (!row || FINAL_PAYOUT.has(row.status)) return;
    Object.assign(row, structuredClone(patch));
    row.updated_at = new Date(patch.updated_at ?? Date.now()).toISOString();
  }

  async failPayout(id: string, error: string, nowIso: string): Promise<void> {
    const row = this.payouts.get(id);
    if (!row || row.status === "succeeded") return;
    Object.assign(row, { status: "failed", error, updated_at: new Date(nowIso).toISOString() });
    for (const o of this.orders.values()) if (o.payout_id === id) o.payout_id = null;
  }

  async listUnsettledPayouts(): Promise<PayoutRow[]> {
    const rows = [...this.payouts.values()].filter((p) => UNSETTLED.has(p.status))
      .sort((a, b) => a.day.localeCompare(b.day));
    return structuredClone(rows);
  }

  async purge(unpaidBeforeIso: string, paidBeforeIso: string, nowIso: string): Promise<number> {
    const unpaidBefore = ms(unpaidBeforeIso);
    const paidBefore = ms(paidBeforeIso);
    const now = ms(nowIso);
    const courseBefore = now - COURSE_RETENTION_DAYS * DAY_MS;
    let count = 0;
    for (const o of this.orders.values()) {
      if (o.purged_at !== null) continue;
      // Paid course orders stay readable for their whole access period, whatever paidBeforeIso says.
      const paidLimit = ALL_COURSE_IDS.includes(o.product) ? courseBefore : paidBefore;
      const expired = o.status === "paid"
        ? ms(o.paid_at ?? o.created_at) < paidLimit
        : ms(o.created_at) < unpaidBefore;
      if (!expired) continue;
      Object.assign(o, {
        input: null,
        document: null,
        buyer: null,
        manual_payer_phone: null,
        payment_detected_text: null,
        ip_hash: null,
        purged_at: new Date(now).toISOString(),
      });
      count++;
    }
    // Like tcv_purge: old events keep their id (duplicate detection) but lose their payload; rate-limit
    // buckets (hashed key + counter) are left alone.
    for (const e of this.events.values()) if (ms(e.createdAt) < now - EVENT_RETENTION_DAYS * DAY_MS) e.payload = null;
    for (const l of this.leads.values()) {
      if (l.purged_at === null && ms(l.created_at) < now - LEAD_RETENTION_DAYS * DAY_MS) {
        Object.assign(l, { email: null, whatsapp: null, ip_hash: null, purged_at: iso(now) });
      }
    }
    return count;
  }

  async stats(nowIso: string): Promise<Stats> {
    const now = new Date(nowIso);
    const d0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const orders = [...this.orders.values()];
    const period = (from: number, to: number) => {
      const inRange = (iso: string | null) => iso !== null && ms(iso) >= from && ms(iso) < to;
      const paid = orders.filter((o) => o.status === "paid" && inRange(o.paid_at));
      return {
        orders: orders.filter((o) => inRange(o.created_at)).length,
        paid: paid.length,
        revenue: paid.reduce((s, o) => s + (o.paid_amount ?? 0), 0),
      };
    };
    const allPaid = orders.filter((o) => o.status === "paid");
    const stats: Stats = {
      today: period(d0, d0 + DAY_MS),
      yesterday: period(d0 - DAY_MS, d0),
      last7: period(d0 - 6 * DAY_MS, d0 + DAY_MS),
      last30: period(d0 - 29 * DAY_MS, d0 + DAY_MS),
      allTime: { paid: allPaid.length, revenue: allPaid.reduce((s, o) => s + (o.paid_amount ?? 0), 0) },
      pendingPayout: allPaid.filter((o) => o.payment_method === "wave" && o.payout_id === null)
        .reduce((s, o) => s + (o.paid_amount ?? 0), 0),
      recentOrders: [...orders].sort(byCreatedDesc).slice(0, RECENT_ORDERS_LIMIT).map((o) => ({
        id: o.id,
        product: o.product,
        amount: o.amount,
        status: o.status,
        payment_method: o.payment_method,
        manual_payer_phone: o.manual_payer_phone,
        manual_amount: o.manual_amount,
        payment_detected_at: o.payment_detected_at,
        created_at: o.created_at,
        paid_at: o.paid_at,
      })),
      payouts: [...this.payouts.values()].sort((a, b) => b.day.localeCompare(a.day)).slice(0, RECENT_PAYOUTS_LIMIT),
      funnel: { last30: funnelRows(orders, d0 - 29 * DAY_MS), allTime: funnelRows(orders, null) },
      leads: (() => {
        const leads = [...this.leads.values()];
        return {
          total: leads.length,
          last30: leads.filter((l) => ms(l.created_at) >= d0 - 29 * DAY_MS).length,
          active: leads.filter((l) => l.purged_at === null).length,
        };
      })(),
      quizPasses: (() => {
        const passed = this.quizAttempts.filter((q) => q.passed);
        const distinct = (rows: QuizAttemptRow[]) => new Set(rows.map((q) => q.order_id)).size;
        return { total: distinct(passed), last30: distinct(passed.filter((q) => ms(q.created_at) >= d0 - 29 * DAY_MS)) };
      })(),
    };
    const phoneTimes = [...this.events.values()].filter((e) => e.type === PHONE_EVENT_TYPE).map((e) => e.createdAt).sort();
    return structuredClone({ ...stats, lastPhoneNotificationAt: phoneTimes.at(-1) ?? null });
  }

  async assignManualAmount(id: string, base: number, maxOffset: number, sinceIso: string): Promise<number | null> {
    const o = this.orders.get(id);
    if (!o) return null;
    if (o.manual_amount !== null) return o.manual_amount;
    const since = ms(sinceIso);
    const used = new Set(
      [...this.orders.values()]
        .filter((x) => x.id !== id && isOpenManual(x) && x.manual_amount !== null && ms(x.created_at) > since)
        .map((x) => x.manual_amount),
    );
    for (let k = 1; k <= maxOffset && base - k > 0; k++) {
      if (!used.has(base - k)) {
        o.manual_amount = base - k;
        return o.manual_amount;
      }
    }
    return null;
  }

  async listOpenManualOrders(sinceIso: string): Promise<OrderRow[]> {
    const since = ms(sinceIso);
    const rows = [...this.orders.values()].filter((o) => isOpenManual(o) && ms(o.created_at) > since).sort(byCreatedDesc);
    return structuredClone(rows);
  }

  async recordPaymentDetection(id: string, text: string, nowIso: string): Promise<void> {
    const o = this.orders.get(id);
    if (!o) return;
    o.payment_detected_at = new Date(nowIso).toISOString();
    o.payment_detected_text = text;
  }

  async getSettings(): Promise<Record<string, string>> {
    return { ...this.settings };
  }

  // --- Teranga Pro courses -----------------------------------------------------------------------

  /** MemoryStore-only seeding (tests, dev.ts): the SQL side uploads through tcv_course_upload_* instead. */
  async putCourseAsset(name: string, mime: string, bytes: Uint8Array): Promise<CourseAsset> {
    if (!COURSE_ASSET_NAME_RE.test(name) || name.includes("..")) throw new Error(`invalid course asset name ${name}`);
    if (mime.length < 3 || mime.length > 120) throw new Error(`invalid mime for ${name}`);
    const asset: CourseAsset = { name, mime, bytes: bytes.slice(), sha256: await sha256Bytes(bytes), updatedAt: iso(Date.now()) };
    this.courseAssets.set(name, asset);
    return { ...asset, bytes: asset.bytes.slice() };
  }

  async getCourseAsset(name: string): Promise<CourseAsset | null> {
    const a = this.courseAssets.get(name);
    return a ? { ...a, bytes: a.bytes.slice() } : null;
  }

  async insertLead(row: LeadRow): Promise<void> {
    if (this.leads.has(row.id)) throw new Error(`duplicate lead id ${row.id}`);
    if (row.purged_at === null && row.email === null && row.whatsapp === null) throw new Error("lead without contact");
    this.leads.set(row.id, structuredClone({ ...row, product: row.product ?? "pq_essentiel", created_at: iso(row.created_at) }));
  }

  async recordQuizAttempt(row: QuizAttemptRow): Promise<void> {
    if (this.quizAttempts.some((q) => q.id === row.id)) throw new Error(`duplicate quiz attempt id ${row.id}`);
    if (!this.orders.has(row.order_id)) throw new Error(`quiz attempt for unknown order ${row.order_id}`);
    if (!Number.isInteger(row.score) || row.score < 0 || row.score > 100 || row.total <= 0 || row.correct < 0) {
      throw new Error("invalid quiz attempt score");
    }
    if (row.attestation_code !== null && !ATTESTATION_CODE_RE.test(row.attestation_code)) {
      throw new Error("invalid attestation code");
    }
    this.quizAttempts.push(structuredClone({ ...row, created_at: iso(row.created_at) }));
  }

  async getQuizProgress(orderId: string): Promise<QuizProgress | null> {
    const passes = this.quizAttempts.filter((q) => q.order_id === orderId && q.passed);
    if (!passes.length) return null;
    const latest = [...passes].sort(byAttemptDesc)[0];
    const times = passes.map((q) => ms(q.created_at));
    return {
      firstPassedAt: iso(Math.min(...times)),
      lastPassedAt: iso(Math.max(...times)),
      bestScore: Math.max(...passes.map((q) => q.score)),
      lastScore: latest.score,
      code: latest.attestation_code,
      publicListing: latest.public_listing,
      passes: passes.length,
    };
  }

  async findAttestation(code: string): Promise<AttestationRecord | null> {
    const hit = this.quizAttempts.find((q) => q.passed && q.attestation_code === code);
    if (!hit) return null;
    const order = this.orders.get(hit.order_id);
    if (!order || order.purged_at !== null || !order.buyer) return null;
    const passes = this.quizAttempts.filter((q) => q.order_id === hit.order_id && q.passed);
    const latest = [...passes].sort(byAttemptDesc)[0];
    return {
      code,
      orderId: order.id,
      product: order.product,
      fullName: order.buyer.fullName,
      passedAt: iso(Math.min(...passes.map((q) => ms(q.created_at)))),
      publicListing: latest.public_listing,
    };
  }

  private assertUniqueSession(orderId: string, sessionId: string | null): void {
    if (sessionId === null) return;
    for (const o of this.orders.values()) {
      if (o.id !== orderId && o.checkout_session_id === sessionId) {
        throw new Error(`checkout_session_id ${sessionId} already used by ${o.id}`);
      }
    }
  }
}

/** A manual order still waiting for its transfer (same filter as tcv_list_open_manual_orders). */
function isOpenManual(o: OrderRow): boolean {
  return (o.status === "checkout" || o.status === "awaiting_manual") && o.payment_method === null;
}

/** Most recent attempt first: max created_at, then max id (same rule as tcv_quiz_progress). */
function byAttemptDesc(a: QuizAttemptRow, b: QuizAttemptRow): number {
  return ms(b.created_at) - ms(a.created_at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

/** Funnel per product over the orders created since `from` (null = all time), sorted by product (tcv.funnel_rows). */
function funnelRows(orders: OrderRow[], from: number | null): FunnelRow[] {
  const rows = new Map<string, FunnelRow>();
  for (const o of orders) {
    if (from !== null && ms(o.created_at) < from) continue;
    const r = rows.get(o.product) ?? { product: o.product, orders: 0, checkouts: 0, paid: 0, revenue: 0 };
    r.orders += 1;
    if (o.status === "checkout" || o.status === "awaiting_manual" || o.status === "paid") r.checkouts += 1;
    if (o.status === "paid") {
      r.paid += 1;
      r.revenue += o.paid_amount ?? 0;
    }
    rows.set(o.product, r);
  }
  return [...rows.values()].sort((a, b) => (a.product < b.product ? -1 : a.product > b.product ? 1 : 0));
}

function byCreatedDesc(a: OrderRow, b: OrderRow): number {
  return ms(b.created_at) - ms(a.created_at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}
