// Payment confirmation shared by GET /orders/:id, the Wave webhook and the reconcile cron.
import { WaveError } from "./types.ts";
import type { Deps, OrderRow, WaveCheckoutSession } from "./types.ts";
import { log } from "./http.ts";

export const RECONCILE_LOOKBACK_MS = 24 * 3_600_000;
export const RECONCILE_BATCH = 50;

/** Why a session does not pay for an order, or null when it does. */
export function paymentMismatch(order: Pick<OrderRow, "id" | "amount">, session: WaveCheckoutSession): string | null {
  if (session.payment_status !== "succeeded") return `payment_status ${session.payment_status}`;
  if (session.currency !== "XOF") return `currency ${session.currency}`;
  if (session.client_reference !== order.id) return `client_reference ${session.client_reference}`;
  const amount = parseInt(String(session.amount), 10);
  if (!Number.isFinite(amount) || amount < order.amount) return `amount ${session.amount} < ${order.amount}`;
  return null;
}

/**
 * Marks the order paid when the session confirms it. `confirmed` says whether the session pays for the order;
 * `changed` whether this call performed the transition (false when it was already paid).
 */
export async function confirmPayment(
  deps: Deps,
  order: OrderRow,
  session: WaveCheckoutSession,
): Promise<{ confirmed: boolean; changed: boolean }> {
  const mismatch = paymentMismatch(order, session);
  if (mismatch) {
    if (session.payment_status === "succeeded") {
      log.warn(`payment mismatch for ${order.id} (session ${session.id}): ${mismatch}`);
    }
    return { confirmed: false, changed: false };
  }
  const changed = await deps.store.markPaid(order.id, {
    method: "wave",
    paidAmount: parseInt(String(session.amount), 10),
    transactionId: session.transaction_id ?? null,
    sessionId: session.id,
    paidAt: deps.now().toISOString(),
  });
  return { confirmed: true, changed };
}

export type ReconcileResult = { ok: true; checked: number; paid: number } | { ok: true; skipped: "no_wave" };

export async function runReconcile(deps: Deps): Promise<ReconcileResult> {
  const wave = deps.wave;
  if (!wave) return { ok: true, skipped: "no_wave" };
  const since = new Date(deps.now().getTime() - RECONCILE_LOOKBACK_MS).toISOString();
  let checked = 0;
  let paid = 0;
  for (const order of await deps.store.listOpenCheckouts(since, RECONCILE_BATCH)) {
    if (!order.checkout_session_id) continue;
    try {
      const session = await wave.getCheckoutSession(order.checkout_session_id);
      checked++;
      if ((await confirmPayment(deps, order, session)).changed) paid++;
    } catch (err) {
      if (err instanceof WaveError && err.status === 429) {
        log.warn("reconcile: rate limited by Wave, stopping this run");
        break;
      }
      log.warn(`reconcile: ${order.id} failed`, err instanceof WaveError ? `${err.code} (${err.status})` : err);
    }
  }
  return { ok: true, checked, paid };
}
