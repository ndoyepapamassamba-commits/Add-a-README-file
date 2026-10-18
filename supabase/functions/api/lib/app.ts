// HTTP API of the `api` Edge Function: createApp(deps) => (req) => Response. Routes follow SPEC.md.
import { WaveError } from "./types.ts";
import type { Config, Deps, Document, OrderRow, Stats, Store, WaveCheckoutSession } from "./types.ts";
import {
  bearerToken,
  clientIp,
  errorResponse,
  HttpError,
  json,
  log,
  preflight,
  readBodyText,
  readJsonObject,
  routePath,
} from "./http.ts";
import { constantTimeEqual, hashIp, newAccessToken, newOrderId, ORDER_ID_RE, sha256Hex } from "./ids.ts";
import { formatSnMobile, normalizeSnMobile } from "./phone.ts";
import { isTemplate, priceOf } from "./pricing.ts";
import { normalizeReturnBase, validateOrderRequest } from "./validate.ts";
import { verifySharedSecret, verifyWaveSignature, withDeadline } from "./wave.ts";
import { loadConfig, SETTINGS_TTL_MS } from "./config.ts";
import type { EnvGet } from "./config.ts";
import { confirmPayment, runReconcile } from "./reconcile.ts";
import { runDaily } from "./payout.ts";
import { generateDocument } from "./generator/index.ts";
import { redactDocument } from "./redact.ts";
import { formatFcfa, handlePaymentConfirm, handlePaymentNotify, prepareManualCheckout } from "./autopay.ts";

export const GLOBAL_DAILY_PREVIEW_LIMIT = 5000;
export const CHECKOUT_REUSE_MARGIN_MS = 2 * 60_000;
export const CHECKOUT_DEFAULT_TTL_MS = 30 * 60_000;
export const WEBHOOK_REFETCH_TIMEOUT_MS = 3_000;
export const ORDER_REFRESH_TIMEOUT_MS = 5_000;
/** Wave session lookups per order per minute (the result page polls every 4 s, i.e. 15 per minute). */
export const WAVE_SYNC_PER_MINUTE = 30;

type Handler = (deps: Deps, req: Request, params: string[]) => Promise<Response>;

const notFound = () => new HttpError(404, "not_found", "Commande introuvable.");
const unauthorized = () => new HttpError(401, "unauthorized", "Accès refusé.");

export function publicOrder(o: OrderRow) {
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

function orderView(o: OrderRow): { order: ReturnType<typeof publicOrder>; document?: Document; preview?: Document } {
  if (!o.document) return { order: publicOrder(o) };
  return o.status === "paid"
    ? { order: publicOrder(o), document: o.document }
    : { order: publicOrder(o), preview: redactDocument(o.document) };
}

/** Rate-limit buckets and stored ip_hash use a peppered hash; prefer a private value as pepper. */
function ipPepper(deps: Deps): string {
  return deps.config.cronSecret ?? deps.config.adminKey ?? "teranga-cv";
}

/** Customer access: unknown id and wrong token are both 404 (no enumeration); purged orders are 410. */
async function loadCustomerOrder(deps: Deps, id: string, token: unknown): Promise<OrderRow> {
  const hash = await sha256Hex(typeof token === "string" ? token : "");
  if (typeof token !== "string" || !token || !ORDER_ID_RE.test(id)) throw notFound();
  const order = await deps.store.getOrder(id);
  if (!order || !constantTimeEqual(hash, order.access_token_hash)) throw notFound();
  if (order.purged_at) {
    throw new HttpError(
      410,
      "purged",
      "Ce document a été supprimé : nous effaçons les données 3 jours après l'aperçu sans paiement, 30 jours après un paiement.",
    );
  }
  return order;
}

/**
 * Looks up the order's Wave session and marks the order paid when Wave confirms it.
 * `session` is null when there is none, the lookup failed (logged, never thrown) or the order already used
 * its share of Wave lookups: page loads cannot be turned into unbounded calls on the merchant's API key.
 */
async function syncWithWave(
  deps: Deps,
  order: OrderRow,
  timeoutMs: number,
): Promise<{ session: WaveCheckoutSession | null; paid: boolean }> {
  if (!deps.wave || !order.checkout_session_id) return { session: null, paid: false };
  const key = `wave-sync:${order.id}`;
  if (!(await deps.store.hitRateLimit(key, 60, WAVE_SYNC_PER_MINUTE, deps.now().toISOString()))) {
    return { session: null, paid: false };
  }
  try {
    const session = await withDeadline(deps.wave.getCheckoutSession(order.checkout_session_id), timeoutMs);
    return { session, paid: (await confirmPayment(deps, order, session)).confirmed };
  } catch (err) {
    log.warn(`wave lookup for ${order.id} failed`, err instanceof WaveError ? `${err.code} (${err.status})` : err);
    return { session: null, paid: false };
  }
}

async function refreshFromWave(deps: Deps, order: OrderRow, timeoutMs: number): Promise<boolean> {
  return (await syncWithWave(deps, order, timeoutMs)).paid;
}

const health: Handler = (deps) => Promise.resolve(json(200, { ok: true, time: deps.now().toISOString() }));

const publicConfig: Handler = (deps) => {
  const c = deps.config;
  return Promise.resolve(json(200, {
    brandName: c.brandName,
    currency: "XOF",
    prices: { ...c.prices },
    payment: {
      wave: deps.wave !== null,
      manual: deps.wave === null && c.manualWaveNumber !== null,
      manualWaveNumber: c.manualWaveNumber ? formatSnMobile(c.manualWaveNumber) : null,
      ownerWhatsapp: c.ownerWhatsapp,
    },
  }));
};

const createOrder: Handler = async (deps, req) => {
  const body = await readJsonObject(req);
  const website = body.website;
  if (website !== undefined && website !== null && !(typeof website === "string" && website.trim() === "")) {
    throw new HttpError(400, "validation", "Votre demande n'a pas pu être traitée.");
  }
  const now = deps.now();
  const nowIso = now.toISOString();
  const ipHash = await hashIp(clientIp(req), ipPepper(deps));
  const limited = () => new HttpError(429, "rate_limited", "Trop de demandes. Réessayez dans un moment.");
  if (!(await deps.store.hitRateLimit(`preview:${ipHash}`, 3600, deps.config.previewRateLimitPerHour, nowIso))) {
    throw limited();
  }
  const globalKey = `preview:global:${nowIso.slice(0, 10)}`;
  if (!(await deps.store.hitRateLimit(globalKey, 86400, GLOBAL_DAILY_PREVIEW_LIMIT, nowIso))) throw limited();

  const v = validateOrderRequest(body);
  if (!v.ok) throw new HttpError(400, "validation", "Certains champs sont à corriger.", v.fields);

  const id = newOrderId();
  const token = newAccessToken();
  let document = generateDocument(v.data, v.product, { seed: id, now });
  if (deps.enhance) {
    const enhanced = await deps.enhance(document, v.data, v.product).catch((err) => {
      log.warn("enhancer failed", err);
      return null;
    });
    if (enhanced) document = enhanced;
  }
  const row: OrderRow = {
    id,
    access_token_hash: await sha256Hex(token),
    product: v.product,
    template: v.template,
    amount: priceOf(v.product, deps.config),
    currency: "XOF",
    status: "preview",
    input: v.data,
    document,
    checkout_session_id: null,
    wave_launch_url: null,
    checkout_expires_at: null,
    wave_transaction_id: null,
    payment_method: null,
    manual_payer_phone: null,
    manual_amount: null,
    payment_detected_at: null,
    payment_detected_text: null,
    paid_amount: null,
    paid_at: null,
    payout_id: null,
    ip_hash: ipHash,
    created_at: nowIso,
    purged_at: null,
  };
  await deps.store.insertOrder(row);
  return json(201, { order: { ...publicOrder(row), token }, preview: redactDocument(document) });
};

const getOrder: Handler = async (deps, req, [id]) => {
  let order = await loadCustomerOrder(deps, id, new URL(req.url).searchParams.get("t"));
  if (order.status === "checkout" && await refreshFromWave(deps, order, ORDER_REFRESH_TIMEOUT_MS)) {
    order = (await deps.store.getOrder(id)) ?? order;
  }
  return json(200, orderView(order));
};

const changeTemplate: Handler = async (deps, req, [id]) => {
  const body = await readJsonObject(req);
  const order = await loadCustomerOrder(deps, id, body.t);
  if (!isTemplate(body.template)) {
    throw new HttpError(400, "validation", "Modèle inconnu.", { template: "Valeur invalide." });
  }
  await deps.store.updateOrder(id, { template: body.template });
  return json(200, { order: publicOrder({ ...order, template: body.template }) });
};

function sessionExpiry(session: WaveCheckoutSession, now: Date): string {
  const t = session.when_expires ? Date.parse(session.when_expires) : NaN;
  return new Date(Number.isFinite(t) ? t : now.getTime() + CHECKOUT_DEFAULT_TTL_MS).toISOString();
}

const checkout: Handler = async (deps, req, [id]) => {
  const body = await readJsonObject(req);
  const order = await loadCustomerOrder(deps, id, body.t);
  const alreadyPaid = () => new HttpError(409, "already_paid", "Cette commande est déjà payée.");
  if (order.status === "paid") throw alreadyPaid();
  const returnBase = normalizeReturnBase(body.returnBase, deps.config.allowedReturnPrefixes);
  if (!returnBase) throw new HttpError(400, "bad_return_url", "Adresse de retour invalide.");
  const token = body.t as string;

  if (deps.wave) {
    const now = deps.now();
    if (order.checkout_session_id) {
      // The stored session may be paid (webhook still on its way) or closed by Wave (cancelled payment):
      // never let the customer pay twice, never hand back a dead payment page. A failed lookup falls back
      // to the stored expiry.
      const { session, paid } = await syncWithWave(deps, order, ORDER_REFRESH_TIMEOUT_MS);
      if (paid) throw alreadyPaid();
      const reusable = order.status === "checkout" && order.wave_launch_url && order.checkout_expires_at &&
        Date.parse(order.checkout_expires_at) > now.getTime() + CHECKOUT_REUSE_MARGIN_MS &&
        (session === null || session.checkout_status === "open");
      if (reusable) return json(200, { mode: "wave", launchUrl: order.wave_launch_url });
    }

    let session: WaveCheckoutSession;
    try {
      session = await deps.wave.createCheckoutSession({
        amount: order.amount,
        currency: "XOF",
        clientReference: order.id,
        successUrl: `${returnBase}/resultat.html?o=${order.id}&t=${encodeURIComponent(token)}`,
        errorUrl: `${returnBase}/index.html?o=${order.id}&t=${encodeURIComponent(token)}&paiement=echec`,
      });
    } catch (err) {
      if (!(err instanceof WaveError)) throw err;
      log.error(`wave checkout for ${order.id} failed`, `${err.code} (${err.status}) ${err.message}`);
      throw new HttpError(502, "wave_error", "Wave ne répond pas pour le moment. Réessayez dans un instant.");
    }
    await deps.store.updateOrder(id, {
      status: "checkout",
      checkout_session_id: session.id,
      wave_launch_url: session.wave_launch_url,
      checkout_expires_at: sessionExpiry(session, now),
    });
    // The previous session may have been paid while this one was being created (other tab, webhook):
    // the store keeps the paying session, and the customer must not be sent to a second payment page.
    if ((await deps.store.getOrder(id))?.status === "paid") throw alreadyPaid();
    return json(200, { mode: "wave", launchUrl: session.wave_launch_url });
  }

  const c = deps.config;
  if (c.manualWaveNumber) {
    // A unique amount per order lets the owner's phone recognise the transfer (see autopay.ts).
    const exactAmount = await prepareManualCheckout(deps, order);
    return json(200, {
      mode: "manual",
      waveNumber: formatSnMobile(c.manualWaveNumber),
      amount: order.amount,
      exactAmount,
      exactAmountFormatted: formatFcfa(exactAmount),
      autoUnlock: c.phoneHookKey !== null && c.manualAutoConfirm,
      reference: order.id,
      whatsapp: c.ownerWhatsapp,
    });
  }
  throw new HttpError(503, "payment_unavailable", "Le paiement en ligne arrive très bientôt.");
};

const manualPaid: Handler = async (deps, req, [id]) => {
  const body = await readJsonObject(req);
  const order = await loadCustomerOrder(deps, id, body.t);
  if (deps.wave || !deps.config.manualWaveNumber) {
    throw new HttpError(409, "not_manual", "Le paiement manuel n'est pas disponible.");
  }
  if (order.status === "paid") return json(200, { order: publicOrder(order) });
  // The payer's number is optional: the transfer is recognised by its unique amount (autopay.ts).
  const typed = typeof body.payerPhone === "string" ? body.payerPhone.trim() : "";
  const phone = typed ? normalizeSnMobile(typed) : null;
  if (typed && !phone) {
    throw new HttpError(400, "validation", "Numéro Wave invalide.", {
      payerPhone: "Entrez le numéro Wave qui a envoyé l'argent (ex. 77 123 45 67).",
    });
  }
  await deps.store.updateOrder(id, phone ? { status: "awaiting_manual", manual_payer_phone: phone } : { status: "awaiting_manual" });
  return json(200, { order: publicOrder({ ...order, status: "awaiting_manual" }) });
};

const waveWebhook: Handler = async (deps, req) => {
  const secret = deps.config.waveWebhookSecret;
  if (!secret) throw new HttpError(503, "webhook_disabled", "Webhook non configuré.");
  const raw = await readBodyText(req);
  const authentic = deps.config.waveWebhookMode === "shared"
    ? verifySharedSecret(secret, req.headers.get("authorization"))
    : await verifyWaveSignature(secret, req.headers.get("wave-signature"), raw, Math.floor(deps.now().getTime() / 1000));
  if (!authentic) throw new HttpError(401, "bad_signature", "Signature invalide.");

  let event: { id?: unknown; type?: unknown; data?: Record<string, unknown> | null };
  try {
    event = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "bad_request", "Événement illisible.");
  }
  if (!event || typeof event !== "object" || typeof event.id !== "string" || typeof event.type !== "string") {
    throw new HttpError(400, "bad_request", "Événement illisible.");
  }
  const data = event.data && typeof event.data === "object" ? event.data : null;
  const ref = typeof data?.id === "string" ? data.id : null;
  if (!(await deps.store.recordEvent(event.id, event.type, ref, event))) {
    return json(200, { ok: true, duplicate: true });
  }
  if (event.type !== "checkout.session.completed" || !data) return json(200, { ok: true, ignored: true });

  const orderId = data.client_reference;
  const order = typeof orderId === "string" && ORDER_ID_RE.test(orderId) ? await deps.store.getOrder(orderId) : null;
  if (!order) {
    log.warn(`webhook ${event.id}: unknown client_reference`, orderId);
    return json(200, { ok: true, ignored: true });
  }
  let session = data as unknown as WaveCheckoutSession;
  if (deps.wave && ref) {
    try {
      session = await withDeadline(deps.wave.getCheckoutSession(ref), WEBHOOK_REFETCH_TIMEOUT_MS);
    } catch (err) {
      // Only an unreachable Wave (timeout, network, 429, 5xx) justifies trusting the payload alone. A definitive
      // answer such as 404 for a session Wave never created means the event cannot be confirmed: reconcile
      // and the result page will still pick up a genuine payment.
      if (!(err instanceof WaveError && err.retryable)) {
        const reason = err instanceof WaveError ? err.code : err;
        log.warn(`webhook ${event.id}: Wave refused the re-fetch, payload not trusted`, reason);
        return json(200, { ok: true, paid: false });
      }
      log.warn(`webhook ${event.id}: re-fetch failed, using the signed payload`, err.code);
    }
  }
  const { confirmed } = await confirmPayment(deps, order, session);
  return json(200, { ok: true, paid: confirmed });
};

function requireCron(deps: Deps, req: Request): void {
  const secret = deps.config.cronSecret;
  if (!secret || !constantTimeEqual(req.headers.get("x-cron-secret") ?? "", secret)) throw unauthorized();
}

function requireAdmin(deps: Deps, req: Request): void {
  const key = deps.config.adminKey;
  if (!key || !constantTimeEqual(bearerToken(req) ?? "", key)) throw unauthorized();
}

const cronReconcile: Handler = async (deps, req) => {
  requireCron(deps, req);
  return json(200, await runReconcile(deps));
};

const cronDaily: Handler = async (deps, req) => {
  requireCron(deps, req);
  return json(200, await runDaily(deps));
};

const adminStats: Handler = async (deps, req) => {
  requireAdmin(deps, req);
  const c = deps.config;
  // The stores add the time of the last phone notification to the stats snapshot; it belongs to health.
  const { lastPhoneNotificationAt = null, ...stats } = (await deps.store.stats(deps.now().toISOString())) as Stats & {
    lastPhoneNotificationAt?: string | null;
  };
  return json(200, {
    stats,
    health: {
      wave: deps.wave !== null,
      webhook: c.waveWebhookSecret !== null,
      payout: c.payoutEnabled && c.ownerWaveMobile !== null && deps.wave !== null,
      manual: deps.wave === null && c.manualWaveNumber !== null,
      llm: deps.enhance !== undefined,
      ownerWaveMobile: c.ownerWaveMobile ? formatSnMobile(c.ownerWaveMobile) : null,
      phoneHook: c.phoneHookKey !== null,
      lastPhoneNotificationAt,
    },
  });
};

const adminUnlock: Handler = async (deps, req, [id]) => {
  requireAdmin(deps, req);
  const order = ORDER_ID_RE.test(id) ? await deps.store.getOrder(id) : null;
  if (!order) throw notFound();
  const changed = await deps.store.markPaid(id, {
    method: "manual",
    paidAmount: order.manual_amount ?? order.amount, // what the customer was asked to send
    transactionId: null,
    sessionId: null,
    paidAt: deps.now().toISOString(),
  });
  return json(200, { ok: true, changed });
};

const ROUTES: Array<[method: string, pattern: RegExp, handler: Handler]> = [
  ["GET", /^\/health$/, health],
  ["GET", /^\/config$/, publicConfig],
  ["POST", /^\/orders$/, createOrder],
  ["GET", /^\/orders\/([^/]+)$/, getOrder],
  ["POST", /^\/orders\/([^/]+)\/template$/, changeTemplate],
  ["POST", /^\/orders\/([^/]+)\/checkout$/, checkout],
  ["POST", /^\/orders\/([^/]+)\/manual-paid$/, manualPaid],
  ["POST", /^\/wave\/webhook$/, waveWebhook],
  ["POST", /^\/cron\/reconcile$/, cronReconcile],
  ["POST", /^\/cron\/daily$/, cronDaily],
  ["GET", /^\/admin\/stats$/, adminStats],
  ["POST", /^\/admin\/orders\/([^/]+)\/unlock$/, adminUnlock],
  ["POST", /^\/payments\/notify$/, handlePaymentNotify],
  ["POST", /^\/payments\/confirm$/, handlePaymentConfirm],
];

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function createApp(deps: Deps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return preflight();
    try {
      const path = routePath(new URL(req.url).pathname);
      for (const [method, pattern, handler] of ROUTES) {
        const m = pattern.exec(path);
        if (m && method === req.method) return await handler(deps, req, m.slice(1).map(decodeSegment));
      }
      throw new HttpError(404, "not_found", "Ressource introuvable.");
    } catch (err) {
      if (err instanceof HttpError) return errorResponse(err.status, err.code, err.message, err.fields);
      log.error("unhandled error", err);
      return errorResponse(500, "internal", "Une erreur interne est survenue. Réessayez dans un instant.");
    }
  };
}

export interface ReloadingAppOptions {
  store: Store;
  envGet: EnvGet;
  /** Builds the config-dependent services (Wave client, LLM enhancer). */
  services: (config: Config) => Pick<Deps, "wave" | "enhance">;
  ttlMs?: number;
  now?: () => Date;
}

/**
 * The production entry point: Config = env (wins) over tcv.settings, with the settings snapshot reloaded at
 * most once per `ttlMs`. Concurrent requests share one reload; a failed reload keeps the previous snapshot.
 */
export function createReloadingApp(opts: ReloadingAppOptions): (req: Request) => Promise<Response> {
  const ttlMs = opts.ttlMs ?? SETTINGS_TTL_MS;
  const now = opts.now ?? (() => new Date());
  let current: { app: (req: Request) => Promise<Response>; settings: Record<string, string>; loadedAt: number } | null = null;
  let loading: Promise<(req: Request) => Promise<Response>> | null = null;

  async function rebuild() {
    let settings = current?.settings ?? {};
    try {
      settings = await opts.store.getSettings();
    } catch (err) {
      log.error("settings reload failed, keeping the previous values", err);
    }
    const config = loadConfig(opts.envGet, settings);
    const app = createApp({ store: opts.store, config, now, ...opts.services(config) });
    current = { app, settings, loadedAt: now().getTime() };
    return app;
  }

  return async (req) => {
    if (!current || now().getTime() - current.loadedAt >= ttlMs) {
      loading ??= rebuild().finally(() => {
        loading = null;
      });
      return (await loading)(req);
    }
    return current.app(req);
  };
}
