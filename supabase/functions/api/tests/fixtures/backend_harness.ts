// Shared helpers for the backend_*.test.ts suites: a controllable clock, configs, an app harness and order data.
import { createApp } from "../../lib/app.ts";
import { envFrom, loadConfig } from "../../lib/config.ts";
import { setLogSink } from "../../lib/http.ts";
import { MemoryStore } from "../../lib/store_memory.ts";
import { FakeWave } from "../../lib/wave.ts";
import type { Config, Deps, OrderRow, Product, Store } from "../../lib/types.ts";

export const T0 = "2026-10-18T10:00:00.000Z";
export const ADMIN_KEY = "test-admin-key";
export const CRON_SECRET = "test-cron-secret";
export const WEBHOOK_SECRET = "wave_sn_WHS_testsecret";
export const OWNER_MOBILE = "+221771234567";
export const RETURN_BASE = "https://ndoyepapamassamba-commits.github.io/Add-a-README-file/cv";

export class Clock {
  t: number;
  constructor(iso = T0) {
    this.t = Date.parse(iso);
  }
  now = (): Date => new Date(this.t);
  iso = (): string => new Date(this.t).toISOString();
  advance(ms: number): void {
    this.t += ms;
  }
  set(iso: string): void {
    this.t = Date.parse(iso);
  }
}

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

/** Production-like config (no dev prefixes) with test secrets. */
export function testConfig(env: Record<string, string | undefined> = {}, overrides: Partial<Config> = {}): Config {
  return {
    ...loadConfig(envFrom({
      WAVE_API_KEY: "wave_sn_prod_test",
      WAVE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      ADMIN_KEY: ADMIN_KEY,
      CRON_SECRET: CRON_SECRET,
      OWNER_WAVE_MOBILE: OWNER_MOBILE,
      PAYOUT_ENABLED: "true",
      ...env,
    })),
    ...overrides,
  };
}

/** Captures log lines instead of printing them. */
export function captureLogs(): { warn: string[]; error: string[] } {
  const captured = { warn: [] as string[], error: [] as string[] };
  setLogSink({
    warn: (m) => captured.warn.push(m),
    error: (m) => captured.error.push(m),
  });
  return captured;
}

export interface Harness {
  app: (req: Request) => Promise<Response>;
  deps: Deps;
  store: Store;
  wave: FakeWave | null;
  clock: Clock;
  logs: { warn: string[]; error: string[] };
  call(method: string, path: string, opts?: CallOptions): Promise<ApiResponse>;
}

export interface CallOptions {
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
  ip?: string;
}

/** Parsed JSON of unknown shape, for terse assertions. */
// deno-lint-ignore no-explicit-any
export type Json = any;

export interface ApiResponse {
  status: number;
  headers: Headers;
  body: Json;
}

export interface HarnessOptions {
  store?: Store;
  /** null = no Wave client (manual / unavailable modes). Default: a fresh FakeWave. */
  wave?: FakeWave | null;
  env?: Record<string, string | undefined>;
  config?: Partial<Config>;
  clock?: Clock;
  enhance?: Deps["enhance"];
}

export function makeHarness(opts: HarnessOptions = {}): Harness {
  const clock = opts.clock ?? new Clock();
  const wave = opts.wave === undefined ? new FakeWave({ now: clock.now }) : opts.wave;
  const env = wave === null ? { WAVE_API_KEY: undefined, ...opts.env } : opts.env;
  const deps: Deps = {
    store: opts.store ?? new MemoryStore(),
    wave,
    config: testConfig(env, opts.config),
    now: clock.now,
    enhance: opts.enhance,
  };
  const app = createApp(deps);
  const logs = captureLogs();
  async function call(method: string, path: string, o: CallOptions = {}): Promise<ApiResponse> {
    const headers: Record<string, string> = { "cf-connecting-ip": o.ip ?? "203.0.113.7", ...o.headers };
    let body: string | undefined = o.rawBody;
    if (body === undefined && o.body !== undefined) {
      body = JSON.stringify(o.body);
      headers["content-type"] ??= "application/json";
    }
    const res = await app(new Request(`http://localhost/functions/v1/api${path}`, { method, headers, body }));
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // keep raw text
    }
    return { status: res.status, headers: res.headers, body: parsed };
  }
  return { app, deps, store: deps.store, wave, clock, logs, call };
}

export function orderData(product: Product = "pack") {
  const data: Record<string, unknown> = {
    identity: {
      civility: "Mme",
      firstName: "Awa",
      lastName: "Ndiaye",
      phone: "77 123 45 67",
      email: "awa.ndiaye@example.com",
      city: "Dakar",
      address: "Sicap Liberté 6",
    },
    target: { jobTitle: "Assistante comptable", kind: "emploi", sector: "comptabilite", level: "junior" },
    education: [{ degree: "Licence en comptabilité", school: "UCAD", year: "2023" }],
    experiences: [{
      title: "Stagiaire comptable",
      company: "Cabinet Diop",
      place: "Dakar",
      start: "2023",
      end: "2024",
      missions: "Saisie des pièces comptables\nRapprochements bancaires",
    }],
    skills: ["Saisie comptable", "Sage", "Fiscalité"],
    it: ["Excel", "Word"],
    languages: [{ name: "Français", level: "Courant" }, { name: "Wolof", level: "Langue maternelle" }],
    interests: ["Lecture"],
  };
  if (product !== "cv") {
    data.letter = { company: "Banque Atlantique", companyCity: "Dakar", qualities: ["Rigueur", "Ponctualité"] };
  }
  return data;
}

export function orderBody(product: Product = "pack", extra: Record<string, unknown> = {}) {
  return { product, template: "classique", data: orderData(product), website: "", ...extra };
}

/** Creates an order through the API and returns its id and token. */
export async function createOrder(h: Harness, product: Product = "pack", ip?: string): Promise<{ id: string; token: string }> {
  const res = await h.call("POST", "/orders", { body: orderBody(product), ip });
  if (res.status !== 201) throw new Error(`createOrder failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.order.id, token: res.body.order.token };
}

/** Creates an order and opens a Wave checkout; returns the FakeWave session id too. */
export async function createCheckout(h: Harness, product: Product = "pack"): Promise<{ id: string; token: string; sessionId: string }> {
  const { id, token } = await createOrder(h, product);
  const res = await h.call("POST", `/orders/${id}/checkout`, { body: { t: token, returnBase: RETURN_BASE } });
  if (res.status !== 200) throw new Error(`checkout failed: ${res.status} ${JSON.stringify(res.body)}`);
  const order = await h.store.getOrder(id);
  return { id, token, sessionId: order!.checkout_session_id! };
}

let seq = 0;

/** A complete OrderRow for direct store tests. */
export function orderRow(overrides: Partial<OrderRow> = {}): OrderRow {
  seq += 1;
  return {
    id: `TCV-${String(seq).padStart(8, "0")}`,
    access_token_hash: "a".repeat(64),
    product: "pack",
    template: "classique",
    amount: 1500,
    currency: "XOF",
    status: "preview",
    input: orderData("pack") as unknown as OrderRow["input"],
    document: { cv: null, lettre: null },
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
    ip_hash: "iphash",
    created_at: T0,
    purged_at: null,
    ...overrides,
  };
}

/** Inserts a paid order directly (bypassing the API). */
export async function insertPaid(store: Store, opts: { amount?: number; method?: "wave" | "manual"; paidAt?: string; createdAt?: string } = {}): Promise<OrderRow> {
  const row = orderRow({ amount: opts.amount ?? 1500, created_at: opts.createdAt ?? opts.paidAt ?? T0 });
  await store.insertOrder(row);
  await store.markPaid(row.id, {
    method: opts.method ?? "wave",
    paidAmount: opts.amount ?? 1500,
    transactionId: null,
    sessionId: null,
    paidAt: opts.paidAt ?? T0,
  });
  return (await store.getOrder(row.id))!;
}
