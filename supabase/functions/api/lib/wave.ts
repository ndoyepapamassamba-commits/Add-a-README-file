// Wave Business API: HTTP client, webhook signature verification, and FakeWave for tests and dev.
import { WaveError } from "./types.ts";
import type { WaveCheckoutSession, WaveClient, WavePayout } from "./types.ts";
import { constantTimeEqual, hmacSha256Hex } from "./ids.ts";

export const WAVE_API_BASE = "https://api.wave.com";
export const DEFAULT_WAVE_TIMEOUT_MS = 10_000;
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

/** Rejects with a retryable WaveError when `promise` does not settle within `ms`. */
export function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new WaveError("Wave request timed out", 0, "timeout", true)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/** Maps both Wave error shapes, `{code, message}` and `{error: {code, message, httpcode}}`. */
export function waveErrorFromResponse(status: number, bodyText: string): WaveError {
  let code = `http_${status}`;
  let message = `Wave API error ${status}`;
  try {
    const parsed = JSON.parse(bodyText);
    const src = parsed && typeof parsed.error === "object" && parsed.error ? parsed.error : parsed;
    if (src && typeof src.code === "string") code = src.code;
    if (src && typeof src.message === "string") message = src.message;
  } catch {
    // Non-JSON body (proxy error page…): keep the generic code.
  }
  return new WaveError(message, status, code, isRetryableStatus(status));
}

export interface HttpWaveClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class HttpWaveClient implements WaveClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly opts: HttpWaveClientOptions) {
    this.baseUrl = (opts.baseUrl ?? WAVE_API_BASE).replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_WAVE_TIMEOUT_MS;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  private async request<T>(method: string, path: string, body?: string, headers: Record<string, string> = {}): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(this.baseUrl + path, {
        method,
        headers: {
          authorization: `Bearer ${this.opts.apiKey}`,
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...headers,
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new WaveError(
        timedOut ? "Wave request timed out" : `Wave network error: ${(err as Error)?.message ?? err}`,
        0,
        timedOut ? "timeout" : "network_error",
        true,
      );
    }
    let text: string;
    try {
      text = await res.text();
    } catch (err) {
      throw new WaveError(`Wave response read failed: ${(err as Error)?.message ?? err}`, 0, "network_error", true);
    }
    if (!res.ok) throw waveErrorFromResponse(res.status, text);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new WaveError("Wave returned invalid JSON", res.status, "invalid_response", false);
    }
  }

  createCheckoutSession(p: Parameters<WaveClient["createCheckoutSession"]>[0]): Promise<WaveCheckoutSession> {
    return this.request("POST", "/v1/checkout/sessions", JSON.stringify({
      amount: String(p.amount),
      currency: p.currency,
      client_reference: p.clientReference,
      success_url: p.successUrl,
      error_url: p.errorUrl,
    }));
  }

  getCheckoutSession(id: string): Promise<WaveCheckoutSession> {
    return this.request("GET", `/v1/checkout/sessions/${encodeURIComponent(id)}`);
  }

  async getBalance(): Promise<{ amount: number; currency: string }> {
    const res = await this.request<{ amount: string | number; currency: string }>("GET", "/v1/balance");
    const amount = Number(res.amount);
    if (!Number.isFinite(amount)) throw new WaveError("Wave balance is not a number", 200, "invalid_response", false);
    return { amount, currency: res.currency };
  }

  createPayout(body: string, idempotencyKey: string): Promise<WavePayout> {
    return this.request("POST", "/v1/payout", body, { "idempotency-key": idempotencyKey });
  }

  async searchPayouts(clientReference: string): Promise<WavePayout[]> {
    const res = await this.request<{ result?: WavePayout[]; items?: WavePayout[] } | WavePayout[]>(
      "GET",
      `/v1/payouts/search?client_reference=${encodeURIComponent(clientReference)}`,
    );
    if (Array.isArray(res)) return res;
    return res.result ?? res.items ?? [];
  }
}

// ---------------------------------------------------------------------------------------------
// Webhook authentication
// ---------------------------------------------------------------------------------------------

export function parseSignatureHeader(header: string): { t: string | null; v1: string[] } {
  let t: string | null = null;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") t = value;
    else if (key === "v1" && value) v1.push(value.toLowerCase());
  }
  return { t, v1 };
}

export function signWaveBody(secret: string, timestamp: string, rawBody: string): Promise<string> {
  return hmacSha256Hex(secret, timestamp + rawBody);
}

/**
 * Verifies a `Wave-Signature: t=<unix>,v1=<hex>[,v1=<hex>…]` header against the raw body.
 * `nowSeconds` null disables the replay window (used only for the official test vector).
 */
export async function verifyWaveSignature(
  secret: string,
  header: string | null,
  rawBody: string,
  nowSeconds: number | null,
  toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS,
): Promise<boolean> {
  if (!header) return false;
  const { t, v1 } = parseSignatureHeader(header);
  if (!t || !/^\d{1,12}$/.test(t) || v1.length === 0) return false;
  if (nowSeconds !== null && Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;
  const expected = await signWaveBody(secret, t, rawBody);
  let match = false;
  for (const candidate of v1) match = constantTimeEqual(candidate, expected) || match;
  return match;
}

/** `shared` webhook mode: `Authorization: Bearer <secret>`. */
export function verifySharedSecret(secret: string, authorization: string | null): boolean {
  const m = /^Bearer\s+(.+)$/i.exec((authorization ?? "").trim());
  return constantTimeEqual(m ? m[1].trim() : "", secret);
}

// ---------------------------------------------------------------------------------------------
// FakeWave: in-memory Wave used by tests and dev.ts
// ---------------------------------------------------------------------------------------------

type FakeMethod = "createCheckoutSession" | "getCheckoutSession" | "getBalance" | "createPayout" | "searchPayouts";

export interface FakePayoutRecord {
  idempotencyKey: string;
  body: string;
  payout: WavePayout;
}

export interface FakeWaveOptions {
  /** Launch URL = launchBase + session id. */
  launchBase?: string;
  balance?: number;
  /** Status of payouts created by createPayout. */
  payoutOutcome?: "succeeded" | "processing" | "failed";
  now?: () => Date;
}

export class FakeWave implements WaveClient {
  readonly sessions = new Map<string, WaveCheckoutSession>();
  readonly payouts: FakePayoutRecord[] = [];
  /** Every call, in order, with its arguments (for assertions). */
  readonly calls: Array<{ method: FakeMethod; args: unknown[] }> = [];
  balance: number;
  payoutOutcome: "succeeded" | "processing" | "failed";
  launchBase: string;
  private readonly failures = new Map<FakeMethod, WaveError[]>();
  private readonly delays = new Map<FakeMethod, number>();
  private readonly now: () => Date;
  private seq = 0;

  constructor(opts: FakeWaveOptions = {}) {
    this.launchBase = opts.launchBase ?? "https://pay.wave.com/c/";
    this.balance = opts.balance ?? 1_000_000;
    this.payoutOutcome = opts.payoutOutcome ?? "succeeded";
    this.now = opts.now ?? (() => new Date());
  }

  /** Queue an error for the next call of `method` (FIFO). */
  failNext(method: FakeMethod, error: WaveError): this {
    const queue = this.failures.get(method) ?? [];
    queue.push(error);
    this.failures.set(method, queue);
    return this;
  }

  /** Make every call of `method` take `ms` before answering (0 clears it). */
  delay(method: FakeMethod, ms: number): this {
    this.delays.set(method, ms);
    return this;
  }

  callsOf(method: FakeMethod): unknown[][] {
    return this.calls.filter((c) => c.method === method).map((c) => c.args);
  }

  private async enter(method: FakeMethod, args: unknown[]): Promise<void> {
    this.calls.push({ method, args });
    const ms = this.delays.get(method);
    if (ms) await new Promise((r) => setTimeout(r, ms));
    const err = this.failures.get(method)?.shift();
    if (err) throw err;
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${String(this.seq).padStart(6, "0")}`;
  }

  async createCheckoutSession(p: Parameters<WaveClient["createCheckoutSession"]>[0]): Promise<WaveCheckoutSession> {
    await this.enter("createCheckoutSession", [p]);
    const id = this.nextId("cos");
    const session: WaveCheckoutSession & { success_url: string; error_url: string } = {
      id,
      amount: String(p.amount),
      currency: p.currency,
      checkout_status: "open",
      payment_status: "processing",
      client_reference: p.clientReference,
      transaction_id: null,
      wave_launch_url: this.launchBase + id,
      when_expires: new Date(this.now().getTime() + 30 * 60_000).toISOString(),
      when_completed: null,
      success_url: p.successUrl,
      error_url: p.errorUrl,
    };
    this.sessions.set(id, session);
    return structuredClone(session);
  }

  async getCheckoutSession(id: string): Promise<WaveCheckoutSession> {
    await this.enter("getCheckoutSession", [id]);
    const s = this.sessions.get(id);
    if (!s) throw new WaveError("Checkout session not found", 404, "checkout-session-not-found", false);
    return structuredClone(s);
  }

  async getBalance(): Promise<{ amount: number; currency: string }> {
    await this.enter("getBalance", []);
    return { amount: this.balance, currency: "XOF" };
  }

  /** Same key + same body → the original payout (Wave's guarantee); same key + other body → 409. */
  async createPayout(body: string, idempotencyKey: string): Promise<WavePayout> {
    await this.enter("createPayout", [body, idempotencyKey]);
    const existing = this.payouts.find((p) => p.idempotencyKey === idempotencyKey);
    if (existing) {
      if (existing.body !== body) {
        throw new WaveError("Idempotency key reused with a different body", 409, "idempotency-mismatch", false);
      }
      return structuredClone(existing.payout);
    }
    const req = JSON.parse(body) as { receive_amount: string; client_reference?: string };
    const amount = Number(req.receive_amount);
    const fee = Math.ceil(amount * 0.01);
    const payout: WavePayout = {
      id: this.nextId("pt"),
      status: this.payoutOutcome,
      receive_amount: req.receive_amount,
      fee: String(fee),
      client_reference: req.client_reference,
      ...(this.payoutOutcome === "failed"
        ? { payout_error: { error_code: "recipient-limit-exceeded", error_message: "Limit exceeded" } }
        : {}),
    };
    if (this.payoutOutcome !== "failed") this.balance -= amount + fee;
    this.payouts.push({ idempotencyKey, body, payout });
    return structuredClone(payout);
  }

  async searchPayouts(clientReference: string): Promise<WavePayout[]> {
    await this.enter("searchPayouts", [clientReference]);
    return this.payouts.filter((p) => p.payout.client_reference === clientReference).map((p) => structuredClone(p.payout));
  }

  /** Simulates the customer paying in the Wave app. */
  completeSession(id: string, overrides: Partial<WaveCheckoutSession> = {}): WaveCheckoutSession {
    const s = this.mustGet(id);
    Object.assign(s, {
      checkout_status: "complete",
      payment_status: "succeeded",
      transaction_id: s.transaction_id ?? this.nextId("TCN"),
      when_completed: this.now().toISOString(),
    }, overrides);
    return structuredClone(s);
  }

  cancelSession(id: string): WaveCheckoutSession {
    const s = this.mustGet(id);
    Object.assign(s, { checkout_status: "expired", payment_status: "cancelled" });
    return structuredClone(s);
  }

  /** Moves a payout to a final state, as Wave would after `processing`. */
  settlePayout(clientReference: string, status: "succeeded" | "failed" | "reversed"): void {
    for (const p of this.payouts) {
      if (p.payout.client_reference !== clientReference) continue;
      p.payout.status = status;
      if (status !== "succeeded") p.payout.payout_error = { error_code: `payout-${status}`, error_message: status };
    }
  }

  successUrlOf(id: string): string {
    return (this.mustGet(id) as WaveCheckoutSession & { success_url: string }).success_url;
  }

  errorUrlOf(id: string): string {
    return (this.mustGet(id) as WaveCheckoutSession & { error_url: string }).error_url;
  }

  private mustGet(id: string): WaveCheckoutSession {
    const s = this.sessions.get(id);
    if (!s) throw new Error(`FakeWave: unknown session ${id}`);
    return s;
  }
}

/** Public fields of a session as Wave puts them in webhook payloads. */
function publicSession(s: WaveCheckoutSession): WaveCheckoutSession {
  const { id, amount, currency, checkout_status, payment_status, client_reference, transaction_id, wave_launch_url, when_expires, when_completed } = s;
  return { id, amount, currency, checkout_status, payment_status, client_reference, transaction_id, wave_launch_url, when_expires, when_completed };
}

export function checkoutCompletedEvent(session: WaveCheckoutSession, eventId?: string): { id: string; type: string; data: WaveCheckoutSession } {
  return {
    id: eventId ?? `AE_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
    type: "checkout.session.completed",
    data: publicSession(session),
  };
}

/** Builds a webhook request exactly as Wave sends it (signing mode). */
export async function signedWebhookRequest(
  url: string,
  secret: string,
  event: unknown,
  opts: { timestamp?: number; rawBody?: string } = {},
): Promise<Request> {
  const body = opts.rawBody ?? JSON.stringify(event);
  const t = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const v1 = await signWaveBody(secret, t, body);
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "wave-signature": `t=${t},v1=${v1}` },
    body,
  });
}
