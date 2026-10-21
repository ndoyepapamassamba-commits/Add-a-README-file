// Customer access to an order (id + token), shared by the document routes (app.ts) and the course routes
// (course.ts). Kept apart from app.ts so course.ts never imports app.ts (no import cycle).
import type { Deps, OrderRow, PublicOrder } from "./types.ts";
import { HttpError } from "./http.ts";
import { constantTimeEqual, ORDER_ID_RE, sha256Hex } from "./ids.ts";
import { isCourseProduct } from "./pricing.ts";

/** Orders created per day, all customers together (document previews and course orders share the bucket). */
export const GLOBAL_DAILY_PREVIEW_LIMIT = 5000;

export const ORDER_NOT_FOUND_MESSAGE = "Commande introuvable.";
export const RATE_LIMITED_MESSAGE = "Trop de demandes. Réessayez dans un moment.";
export const rateLimited = () => new HttpError(429, "rate_limited", RATE_LIMITED_MESSAGE);
export const notFound = () => new HttpError(404, "not_found", ORDER_NOT_FOUND_MESSAGE);

export const DOCUMENT_PURGED_MESSAGE =
  "Ce document a été supprimé : nous effaçons les données 3 jours après l'aperçu sans paiement, 30 jours après un paiement.";
export const COURSE_PURGED_MESSAGE =
  "Cet accès a expiré\u00a0: les données d'une commande de formation sont effacées 3 jours après une commande non payée et 24 mois après le paiement.";

export function publicOrder(o: OrderRow): PublicOrder {
  return {
    id: o.id,
    product: o.product,
    template: o.template,
    amount: o.amount,
    currency: o.currency,
    status: o.status,
    paymentMethod: o.payment_method,
    paidAt: o.paid_at,
    createdAt: o.created_at,
  };
}

/** Rate-limit buckets and stored ip_hash use a peppered hash; prefer a private value as pepper. */
export function ipPepper(deps: Deps): string {
  return deps.config.cronSecret ?? deps.config.adminKey ?? "teranga-cv";
}

/**
 * The two limits every order creation goes through (POST /orders, documents and courses alike): per client IP
 * per hour (previewRateLimitPerHour) and all customers per UTC day. Throws 429.
 */
export async function hitOrderRateLimits(deps: Deps, ipHash: string, nowIso: string): Promise<void> {
  if (!(await deps.store.hitRateLimit(`preview:${ipHash}`, 3600, deps.config.previewRateLimitPerHour, nowIso))) {
    throw rateLimited();
  }
  const globalKey = `preview:global:${nowIso.slice(0, 10)}`;
  if (!(await deps.store.hitRateLimit(globalKey, 86400, GLOBAL_DAILY_PREVIEW_LIMIT, nowIso))) throw rateLimited();
}

/** Customer access: unknown id and wrong token are both 404 (no enumeration); purged orders are 410. */
export async function loadCustomerOrder(deps: Deps, id: string, token: unknown): Promise<OrderRow> {
  const hash = await sha256Hex(typeof token === "string" ? token : "");
  if (typeof token !== "string" || !token || !ORDER_ID_RE.test(id)) throw notFound();
  const order = await deps.store.getOrder(id);
  if (!order || !constantTimeEqual(hash, order.access_token_hash)) throw notFound();
  if (order.purged_at) {
    throw new HttpError(410, "purged", isCourseProduct(order.product) ? COURSE_PURGED_MESSAGE : DOCUMENT_PURGED_MESSAGE);
  }
  return order;
}
