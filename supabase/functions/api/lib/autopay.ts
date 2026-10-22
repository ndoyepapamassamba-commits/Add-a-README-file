// "Autopay": automatic detection of manual Wave transfers (bridge mode, no Wave Business API yet).
// Each manual order asks the customer for a UNIQUE amount (catalogue price − 1..49). The owner's Android
// phone (MacroDroid) forwards every Wave notification ("Vous avez reçu 1 487F de …") to
// POST /payments/notify; the amount alone identifies the order, which is then unlocked. POST /payments/confirm
// is the owner's one-tap confirmation (link carrying an HMAC of the order id).
// Privacy: the notification text contains the payer's name and number. It is never logged; it is kept only
// on the matched (or flagged) order (erased 30 days after the detection) and in the dedupe event (payload erased
// after 30 days). A notification already seen that is flagged on an open order is stored behind
// REPEATED_NOTIFICATION_PREFIX, so admin.html tells it apart (« Notification répétée »).
import type { Deps, OrderRow } from "./types.ts";
import { HttpError, json, log, readBodyText, readJsonObject } from "./http.ts";
import { constantTimeEqual, hmacSha256Hex, ORDER_ID_RE, sha256Hex } from "./ids.ts";

const HOUR_MS = 3_600_000;

/** Unique amount = catalogue price − k, smallest free k in 1..MANUAL_MAX_OFFSET. */
export const MANUAL_MAX_OFFSET = 49;
/**
 * An unpaid order holds its unique amount as long as it is not purged (its customer can open it and pay late: the
 * daily purge takes unpaid orders after 3 days, so up to about 96 h), and in any case for this long after the amount
 * was last SHOWN (checkout). Nobody else gets the amount meanwhile, so a late transfer can only unlock the order that
 * asked for it.
 */
export const MANUAL_HOLD_MS = 72 * HOUR_MS;
/** A paid order keeps its amount this long after payment: a replayed notification then matches no other order. */
export const PAID_HOLD_MS = 48 * HOUR_MS;
/** A rounded-up transfer (e.g. 1 500 F instead of 1 487 F) matches only an order created this recently… */
export const NEAR_MATCH_WINDOW_MS = 2 * HOUR_MS;
/** …and at most this much above its catalogue price. */
export const NEAR_MATCH_OVERPAY = 100;
/** Catalogue prices from this amount on unlock on their exact unique amount only (no rounded-up near match). */
export const HIGH_TICKET_MIN_AMOUNT = 10_000;
export const NOTIFY_MAX_BYTES = 4 * 1024;
export const MAX_NOTIFIED_AMOUNT = 10_000_000;
export const PHONE_EVENT_TYPE = "phone.notification";

/** "1487" → "1 487 FCFA" (plain spaces, for messages; the site formats amounts itself). */
export function formatFcfa(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

// ------------------------------------------------------------------------------------------------
// Notification parsing
// ------------------------------------------------------------------------------------------------

/** Lower case, accents removed, every kind of space (NBSP, narrow NBSP, tabs, newlines) as one plain space. */
export function normalizeNotification(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // deno-lint-ignore no-control-regex -- control and zero-width characters become spaces on purpose
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2060\ufeff]/g, " ")
    .replace(/[\s\u00a0\u202f\u2007\u2009]+/g, " ")
    .toLowerCase()
    .trim();
}

/** Money received ("Vous avez reçu", "… vous a envoyé", "You received", "… sent you"). */
const INCOMING: readonly RegExp[] = [/\brecu(e|s|es)?\b/, /\breceived\b/, /\ba envoyee?s?\b/, /\bsent you\b/];
/** The owner's own operations: transfers sent, merchant payments, cash withdrawals and deposits. */
const OUTGOING: readonly RegExp[] = [
  /\bvous avez envoye/,
  /\benvoyee?s? a\b/,
  /\bvous avez paye/,
  /\bpayee?s? a\b/,
  /\bretrait/,
  /\bdepot/,
  /\byou (have )?sent\b/,
  /\bsent to\b/,
  /\byou (have )?paid\b/,
  /\bpaid to\b/,
  /\bwithdr[ae]w/,
  /\bdeposit/,
];

export function isIncomingNotification(normalized: string): boolean {
  return INCOMING.some((re) => re.test(normalized)) && !OUTGOING.some((re) => re.test(normalized));
}

/** 1487 · 1 487 · 1.487 · 1,487 (spaces are already plain in normalized text). */
const NUMBER = String.raw`\d{1,3}(?:[ .,]\d{3})+|\d+`;
/** Number then currency: "1 487F", "1.487 F", "1487 FCFA", "1 487,00 F CFA", "1,487 XOF". */
const AMOUNT_THEN_UNIT = new RegExp(
  String.raw`(?<![\d.,])(${NUMBER})(?:[.,]00?)?\s?(?:f\s?cfa|fcfa|cfa|xof|francs?(?:\s?cfa)?|frs?|f)(?![a-z])`,
  "g",
);
/** Currency then number: "F 1 487", "FCFA 1487". */
const UNIT_THEN_AMOUNT = new RegExp(String.raw`(?<![a-z])(?:f\s?cfa|fcfa|cfa|xof|f)\s?(${NUMBER})(?![\d])`, "g");
/** A figure right after these words is the balance or a fee, never the amount received. */
const NOT_THE_AMOUNT = /\b(?:solde|balance|frais|fees?)\b(?:\s*(?::|=|de|est|of|is))?\s*$/;

function amounts(normalized: string, re: RegExp): Array<{ index: number; value: number }> {
  const found: Array<{ index: number; value: number }> = [];
  for (const m of normalized.matchAll(re)) {
    const index = m.index ?? 0;
    if (NOT_THE_AMOUNT.test(normalized.slice(Math.max(0, index - 24), index))) continue;
    const value = Number(m[1].replace(/[ .,]/g, ""));
    if (Number.isSafeInteger(value) && value > 0 && value <= MAX_NOTIFIED_AMOUNT) found.push({ index, value });
  }
  return found;
}

/**
 * Amount received in a (normalized) Wave notification, or null. Prefers "number + F/FCFA/CFA/XOF" over
 * "F + number", skips balances and fees, and takes the first figure after the "reçu/received" keyword.
 */
export function parseNotificationAmount(normalized: string): number | null {
  let found = amounts(normalized, AMOUNT_THEN_UNIT);
  if (!found.length) found = amounts(normalized, UNIT_THEN_AMOUNT);
  if (!found.length) return null;
  const keyword = INCOMING.map((re) => normalized.search(re)).filter((i) => i >= 0);
  const after = keyword.length ? Math.min(...keyword) : -1;
  return (found.find((a) => a.index > after) ?? found[0]).value;
}

export interface ParsedNotification {
  normalized: string;
  incoming: boolean;
  amount: number | null;
}

export function parseNotification(text: string): ParsedNotification {
  const normalized = normalizeNotification(text);
  const incoming = isIncomingNotification(normalized);
  return { normalized, incoming, amount: incoming ? parseNotificationAmount(normalized) : null };
}

// ------------------------------------------------------------------------------------------------
// Matching and unique amounts
// ------------------------------------------------------------------------------------------------

export type MatchHow = "exact" | "near" | "ambiguous" | "none";

/**
 * The open manual order a received amount belongs to, among Store.listHeldManualOrders(). Only orders that were
 * given a unique amount can match (a round catalogue price is too common among personal transfers). Exact
 * `manual_amount` first; else a single recent order the customer may have rounded up (manual_amount < amount ≤
 * price + 100, created in the last 2 h). Several candidates → none: the owner decides.
 * The near match is also off ("ambiguous", nothing unlocks) while an open order that was asked for the catalogue
 * price (no free unique amount: manual_amount null) could be the payer — one at the candidate's catalogue price, or
 * one whose price is at most 100 F below the amount received — so its transfer never unlocks another order.
 * High-ticket orders (catalogue price `amount` ≥ HIGH_TICKET_MIN_AMOUNT, e.g. a 25 000 F course) never take
 * part in the near match: only their exact unique amount unlocks them, so a round 25 000 F family transfer, or
 * any other figure close to the price, unlocks nothing (the owner can still unlock from admin.html).
 */
export function matchManualOrder(orders: OrderRow[], amount: number, now: Date): { order: OrderRow | null; how: MatchHow } {
  const open = orders.filter((o) => o.status !== "paid");
  const withAmount = open.filter((o) => o.manual_amount !== null);
  const exact = withAmount.filter((o) => o.manual_amount === amount);
  if (exact.length === 1) return { order: exact[0], how: "exact" };
  if (exact.length > 1) return { order: null, how: "ambiguous" };
  const near = withAmount.filter((o) =>
    o.amount < HIGH_TICKET_MIN_AMOUNT &&
    now.getTime() - Date.parse(o.created_at) <= NEAR_MATCH_WINDOW_MS &&
    (o.manual_amount as number) < amount && amount <= o.amount + NEAR_MATCH_OVERPAY
  );
  if (!near.length) return { order: null, how: "none" };
  const cataloguePrices = open.filter((o) => o.manual_amount === null && o.checkout_session_id === null).map((o) => o.amount);
  const mayBeCataloguePayment = cataloguePrices.some((price) =>
    near.some((o) => o.amount === price) || (price <= amount && amount <= price + NEAR_MATCH_OVERPAY)
  );
  if (near.length === 1 && !mayBeCataloguePayment) return { order: near[0], how: "near" };
  return { order: null, how: "ambiguous" };
}

/** Cut-offs of the two holds at `now` (Store.holdManualAmount). */
export function holdCutoffs(now: Date): { unpaidSinceIso: string; paidSinceIso: string } {
  return {
    unpaidSinceIso: new Date(now.getTime() - MANUAL_HOLD_MS).toISOString(),
    paidSinceIso: new Date(now.getTime() - PAID_HOLD_MS).toISOString(),
  };
}

export interface ManualCheckout {
  /** What the customer must send: the unique amount, or the catalogue price when none is free. */
  exactAmount: number;
  /** false when no unique amount could be given: the transfer cannot be recognised, the owner checks it. */
  unique: boolean;
}

/**
 * Manual checkout: the order enters "checkout" (it is now waiting for a transfer) and gets, or keeps, its unique
 * amount; showing it again restarts its hold. An amount whose hold ran out is never shown again as is: the order
 * gets the smallest free amount (often the same one). When every offset is held, the customer is asked for the
 * catalogue price and `unique` is false: no automatic unlock (the price matches no order, and while this order is
 * open the near match is off for its price, see matchManualOrder); the owner checks the transfer.
 */
export async function prepareManualCheckout(deps: Deps, order: OrderRow): Promise<ManualCheckout> {
  if (order.status === "preview") await deps.store.updateOrder(order.id, { status: "checkout" });
  const now = deps.now();
  const held = await deps.store.holdManualAmount(order.id, {
    base: order.amount,
    maxOffset: MANUAL_MAX_OFFSET,
    nowIso: now.toISOString(),
    ...holdCutoffs(now),
  });
  if (held === null) {
    log.warn(`manual amount: all ${MANUAL_MAX_OFFSET} amounts below ${order.amount} F are held, ${order.id} pays the catalogue price (no automatic unlock, near match off for ${order.amount} F)`);
    return { exactAmount: order.amount, unique: false };
  }
  return { exactAmount: held, unique: true };
}

// ------------------------------------------------------------------------------------------------
// POST /payments/notify — called by the owner's phone
// ------------------------------------------------------------------------------------------------

function requireHookKey(deps: Deps, req: Request): void {
  const key = deps.config.phoneHookKey;
  if (!key) throw new HttpError(503, "hook_disabled", "Le téléphone du vendeur n'est pas encore relié.");
  const candidates = [new URL(req.url).searchParams.get("k"), req.headers.get("x-hook-key")];
  if (!candidates.some((v) => v !== null && constantTimeEqual(v.trim(), key))) {
    throw new HttpError(401, "unauthorized", "Accès refusé.");
  }
}

const asText = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** JSON `{ title?, text }`, form-encoded `text=…&title=…`, or the raw text/plain body. */
async function readNotification(req: Request): Promise<string> {
  const raw = await readBodyText(req, NOTIFY_MAX_BYTES);
  const type = (req.headers.get("content-type") ?? "").toLowerCase();
  let title = "";
  let text = raw;
  if (type.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(raw);
    title = form.get("title") ?? "";
    text = form.get("text") ?? "";
  } else if (type.includes("json") || /^\s*\{/.test(raw)) {
    let body: unknown = null;
    try {
      body = JSON.parse(raw);
    } catch {
      // A text/plain body that merely starts with "{" stays plain text.
    }
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const b = body as Record<string, unknown>;
      title = asText(b.title);
      text = asText(b.text);
    } else if (type.includes("json")) {
      throw new HttpError(400, "bad_request", "Notification illisible.");
    }
  }
  return [title, text].map((s) => s.trim()).filter(Boolean).join(" ");
}

/** Window of the duplicate check for incoming notifications that carry no balance (6 to 12 hours). */
export const DEDUPE_BUCKET_MS = 6 * HOUR_MS;
/** Window of the duplicate check for incoming notifications that carry a balance (15 to 30 days, never longer). */
export const DEDUPE_BALANCE_BUCKET_MS = 15 * 24 * HOUR_MS;
/** Marker rows of dedupeKeys (not counted as the phone's heartbeat). */
export const PHONE_DEDUPE_EVENT_TYPE = "phone.dedupe";
const BALANCE_RE = /\b(?:solde|balance)\b/;

async function bucketKeys(kind: string, normalized: string, nowMs: number, bucketMs: number) {
  const bucket = Math.floor(nowMs / bucketMs);
  return {
    id: "phone:" + (await sha256Hex(`${kind}|${normalized}|${bucket}`)),
    next: "phone:" + (await sha256Hex(`${kind}|${normalized}|${bucket + 1}`)),
  };
}

/**
 * Event ids that make a re-delivered notification a duplicate. Incoming money: the text and its time bucket, plus a
 * marker for the next bucket (`next`, recorded only for a fresh notification) so a replay just after a bucket
 * boundary is still caught —
 * - with a balance (« Nouveau solde : 80 000F »): 15-day buckets, so a replay is caught for 15 to 30 days and never
 *   longer (the same payer, amount and balance can come back for real once the owner emptied his account);
 * - without a balance: 6-hour buckets (window 6 to 12 hours).
 * Anything else (heartbeat, own operations): the text and its minute.
 * A duplicate never unlocks an order; handlePaymentNotify still flags the open order it fits exactly, as a repeated
 * detection (flagDuplicate).
 */
export async function dedupeKeys(n: ParsedNotification, nowMs: number): Promise<{ id: string; next: string | null }> {
  if (!n.incoming || n.amount === null) {
    return { id: "phone:" + (await sha256Hex(`${n.normalized}|${Math.floor(nowMs / 60_000)}`)), next: null };
  }
  if (BALANCE_RE.test(n.normalized)) return bucketKeys("15d", n.normalized, nowMs, DEDUPE_BALANCE_BUCKET_MS);
  return bucketKeys("6h", n.normalized, nowMs, DEDUPE_BUCKET_MS);
}

/**
 * Start of payment_detected_text when the detection comes from a notification already seen (flagDuplicate): the
 * admin page then shows « Notification répétée — vérifiez votre historique Wave avant de débloquer » instead of
 * « Paiement détecté » (GET /admin/stats adds payment_detected_repeated). Erased with the text (Store.purge).
 */
export const REPEATED_NOTIFICATION_PREFIX = "[notification répétée] ";

/** True when a stored payment_detected_text comes from a repeated notification (REPEATED_NOTIFICATION_PREFIX). */
export function isRepeatedDetection(text: string | null | undefined): boolean {
  return typeof text === "string" && text.startsWith(REPEATED_NOTIFICATION_PREFIX);
}

/**
 * A notification already seen is usually a re-delivery, but it may be a genuine second payment (same payer, same
 * amount, same balance). It never unlocks anything and is never dropped silently: when its amount is exactly the
 * unique amount of ONE open order, that order is flagged as a REPEATED detection (text stored behind
 * REPEATED_NOTIFICATION_PREFIX; admin.html: « Notification répétée — vérifiez votre historique Wave avant de
 * débloquer ») and a warning is logged, so the owner checks his Wave history and confirms by hand. An order already
 * flagged by a fresh notification keeps that detection (the stronger one).
 */
async function flagDuplicate(deps: Deps, amount: number, text: string, nowIso: string): Promise<{ detected?: string }> {
  const fits = (await deps.store.listHeldManualOrders()).filter((o) => o.status !== "paid" && o.manual_amount === amount);
  if (fits.length > 1) {
    log.warn(`phone notification: a repeated ${amount} F notification fits several open orders, left to the owner`);
    return {};
  }
  const order = fits[0];
  if (!order) return {}; // nothing open at that amount
  const stored = REPEATED_NOTIFICATION_PREFIX + text;
  if (order.payment_detected_text === stored) return {}; // already flagged with this notification
  if (order.payment_detected_text !== null && !isRepeatedDetection(order.payment_detected_text)) {
    log.warn(`phone notification: a repeated ${amount} F notification fits open order ${order.id}, already flagged by a fresh notification (kept)`);
    return {};
  }
  await deps.store.recordPaymentDetection(order.id, stored, nowIso);
  log.warn(`phone notification: a repeated ${amount} F notification fits open order ${order.id}: flagged « Notification répétée », not unlocked (the owner checks it)`);
  return { detected: order.id };
}

export async function handlePaymentNotify(deps: Deps, req: Request): Promise<Response> {
  requireHookKey(deps, req);
  const text = await readNotification(req);
  const n = parseNotification(text);
  const now = deps.now();
  const nowIso = now.toISOString();

  // Every authenticated call is recorded: it is the "Téléphone relié" heartbeat of the admin page, and a
  // notification delivered again (MacroDroid retry, re-posted or updated notification) is a duplicate (dedupeKeys).
  // Only incoming money keeps its text.
  const keys = await dedupeKeys(n, now.getTime());
  const fresh = await deps.store.recordEvent(keys.id, PHONE_EVENT_TYPE, null, n.incoming ? { text } : { ignored: "not_incoming" });
  if (fresh && keys.next) await deps.store.recordEvent(keys.next, PHONE_DEDUPE_EVENT_TYPE, null, null);
  if (!n.incoming) return json(200, { ok: true, ignored: "not_incoming" });
  if (n.amount === null) return json(200, { ok: true, ignored: "no_amount" });
  if (!fresh) return json(200, { ok: true, duplicate: true, ...(await flagDuplicate(deps, n.amount, text, nowIso)) });

  const open = await deps.store.listHeldManualOrders();
  const { order, how } = matchManualOrder(open, n.amount, now);
  if (!order) {
    const why = how === "ambiguous"
      ? "is ambiguous (it fits several open orders, or may pay an order asked the catalogue price), left to the owner"
      : "matches no open order";
    log.warn(`phone notification: ${n.amount} F ${why}`);
    return json(200, { ok: true, matched: null, amount: n.amount, paid: false });
  }
  await deps.store.recordPaymentDetection(order.id, text, nowIso);
  const paid = deps.config.manualAutoConfirm &&
    await deps.store.markPaid(order.id, { method: "manual", paidAmount: n.amount, transactionId: null, sessionId: null, paidAt: nowIso });
  return json(200, { ok: true, matched: order.id, amount: n.amount, paid });
}

// ------------------------------------------------------------------------------------------------
// POST /payments/confirm — the owner's confirmation link (cv/confirmer.html)
// ------------------------------------------------------------------------------------------------

/** First 32 hex chars of HMAC-SHA256(key = ADMIN_KEY, "confirm:" + orderId): the `c` of a confirmation link. */
export async function confirmToken(adminKey: string, orderId: string): Promise<string> {
  return (await hmacSha256Hex(adminKey, `confirm:${orderId}`)).slice(0, 32);
}

export async function handlePaymentConfirm(deps: Deps, req: Request): Promise<Response> {
  const body = await readJsonObject(req);
  const id = typeof body.o === "string" ? body.o.trim() : "";
  const code = typeof body.c === "string" ? body.c.trim().toLowerCase() : "";
  const key = deps.config.adminKey;
  const expected = key && ORDER_ID_RE.test(id) ? await confirmToken(key, id) : null;
  if (!expected || !constantTimeEqual(code, expected)) {
    throw new HttpError(401, "unauthorized", "Ce lien de confirmation n'est pas valide.");
  }
  const order = await deps.store.getOrder(id);
  if (!order) throw new HttpError(404, "not_found", "Commande introuvable.");
  const changed = await deps.store.markPaid(id, {
    method: "manual",
    paidAmount: order.manual_amount ?? order.amount,
    transactionId: null,
    sessionId: null,
    paidAt: deps.now().toISOString(),
  });
  return json(200, { ok: true, changed });
}
