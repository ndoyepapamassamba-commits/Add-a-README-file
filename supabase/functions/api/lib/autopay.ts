// "Autopay": automatic detection of manual Wave transfers (bridge mode, no Wave Business API yet).
// Each manual order asks the customer for a UNIQUE amount (catalogue price − 1..49). The owner's Android
// phone (MacroDroid) forwards every Wave notification ("Vous avez reçu 1 487F de …") to
// POST /payments/notify; the amount alone identifies the order, which is then unlocked. POST /payments/confirm
// is the owner's one-tap confirmation (link carrying an HMAC of the order id).
// Privacy: the notification text contains the payer's name and number. It is never logged; it is kept only
// on the matched order (purged with it) and in the dedupe event (its payload is erased after 30 days).
import type { Deps, OrderRow } from "./types.ts";
import { HttpError, json, log, readBodyText, readJsonObject } from "./http.ts";
import { constantTimeEqual, hmacSha256Hex, ORDER_ID_RE, sha256Hex } from "./ids.ts";

const HOUR_MS = 3_600_000;

/** Unique amount = catalogue price − k, smallest free k in 1..MANUAL_MAX_OFFSET. */
export const MANUAL_MAX_OFFSET = 49;
/** A manual order waits this long for its transfer (amounts are reused afterwards). */
export const MANUAL_WINDOW_MS = 48 * HOUR_MS;
/** A rounded-up transfer (e.g. 1 500 F instead of 1 487 F) matches only an order created this recently… */
export const NEAR_MATCH_WINDOW_MS = 2 * HOUR_MS;
/** …and at most this much above its catalogue price. */
export const NEAR_MATCH_OVERPAY = 100;
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
 * The open manual order a received amount belongs to. Only orders that were given a unique amount qualify
 * (a round catalogue price is too common among personal transfers). Exact `manual_amount` first; else a
 * single recent order the customer may have rounded up (manual_amount < amount ≤ price + 100, created in the
 * last 2 h). Several candidates → none: the owner decides.
 */
export function matchManualOrder(orders: OrderRow[], amount: number, now: Date): { order: OrderRow | null; how: MatchHow } {
  const withAmount = orders.filter((o) => o.manual_amount !== null && o.status !== "paid");
  const exact = withAmount.filter((o) => o.manual_amount === amount);
  if (exact.length === 1) return { order: exact[0], how: "exact" };
  if (exact.length > 1) return { order: null, how: "ambiguous" };
  const near = withAmount.filter((o) =>
    now.getTime() - Date.parse(o.created_at) <= NEAR_MATCH_WINDOW_MS &&
    (o.manual_amount as number) < amount && amount <= o.amount + NEAR_MATCH_OVERPAY
  );
  if (near.length === 1) return { order: near[0], how: "near" };
  return { order: null, how: near.length > 1 ? "ambiguous" : "none" };
}

/**
 * Manual checkout: the order enters "checkout" (it is now waiting for a transfer) and gets its unique amount.
 * Falls back to the catalogue price when every offset is taken or the order is older than the waiting window.
 */
export async function prepareManualCheckout(deps: Deps, order: OrderRow): Promise<number> {
  if (order.status === "preview") await deps.store.updateOrder(order.id, { status: "checkout" });
  if (order.manual_amount !== null) return order.manual_amount;
  const since = new Date(deps.now().getTime() - MANUAL_WINDOW_MS).toISOString();
  if (Date.parse(order.created_at) <= Date.parse(since)) return order.amount;
  const assigned = await deps.store.assignManualAmount(order.id, order.amount, MANUAL_MAX_OFFSET, since);
  if (assigned === null) log.warn(`manual amount: all ${MANUAL_MAX_OFFSET} amounts below ${order.amount} F are taken, ${order.id} pays the catalogue price`);
  return assigned ?? order.amount;
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

export async function handlePaymentNotify(deps: Deps, req: Request): Promise<Response> {
  requireHookKey(deps, req);
  const text = await readNotification(req);
  const n = parseNotification(text);
  const now = deps.now();
  const nowIso = now.toISOString();

  // Every authenticated call is recorded: it is the "Téléphone relié" heartbeat of the admin page, and the
  // same notification delivered twice in the same minute is a duplicate. Only incoming money keeps its text.
  const minute = Math.floor(now.getTime() / 60_000);
  const eventId = "phone:" + (await sha256Hex(`${n.normalized}|${minute}`));
  const fresh = await deps.store.recordEvent(eventId, PHONE_EVENT_TYPE, null, n.incoming ? { text } : { ignored: "not_incoming" });
  if (!n.incoming) return json(200, { ok: true, ignored: "not_incoming" });
  if (n.amount === null) return json(200, { ok: true, ignored: "no_amount" });
  if (!fresh) return json(200, { ok: true, duplicate: true });

  const open = await deps.store.listOpenManualOrders(new Date(now.getTime() - MANUAL_WINDOW_MS).toISOString());
  const { order, how } = matchManualOrder(open, n.amount, now);
  if (!order) {
    log.warn(`phone notification: ${n.amount} F ${how === "ambiguous" ? "fits several open orders, left to the owner" : "matches no open order"}`);
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
