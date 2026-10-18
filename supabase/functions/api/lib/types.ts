// Shared contract for the Teranga CV backend. Every module imports from here.
// Changing a type here changes the API contract with the frontend (cv/*.js) — keep in sync with SPEC.md.

export type Product = "cv" | "lettre" | "pack" | "stage";
export type InternshipType = "academique" | "fin_etudes" | "vacances" | "perfectionnement";
export type SendChannel = "email" | "whatsapp" | "depot";
export type Template = "classique" | "moderne" | "elegant";
export type Civility = "M" | "Mme";
export type JobKind = "emploi" | "stage" | "alternance";
export type Level = "debutant" | "junior" | "confirme" | "senior";
export type Sector =
  | "commerce"
  | "comptabilite"
  | "informatique"
  | "sante"
  | "enseignement"
  | "administration"
  | "btp"
  | "hotellerie"
  | "logistique"
  | "communication"
  | "agriculture"
  | "securite"
  | "autre";
export type LanguageLevel =
  | "Langue maternelle"
  | "Courant"
  | "Bon niveau"
  | "Intermédiaire"
  | "Notions";

/** What the customer typed in the form (validated + trimmed by validate.ts). */
export interface OrderInput {
  identity: {
    civility: Civility;
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    city: string;
    address?: string;
  };
  target: {
    jobTitle: string;
    kind: JobKind;
    sector: Sector;
    level: Level;
  };
  education: Array<{ degree: string; school?: string; year?: string; detail?: string }>;
  experiences: Array<{
    title: string;
    company?: string;
    place?: string;
    start?: string;
    end?: string;
    missions?: string; // free text, one mission per line (or separated by ";")
  }>;
  skills: string[];
  it: string[];
  languages: Array<{ name: string; level: LanguageLevel }>;
  interests: string[];
  /** Required (company at least) when product is "lettre" or "pack". */
  letter?: {
    company: string;
    recipient?: string;
    companyCity?: string;
    source?: string;
    qualities: string[];
    motivation?: string;
  };
  /** Required when product is "stage" (Pack Stage). `letter` is ignored for "stage". */
  internship?: {
    school: string;
    program: string; // filière, e.g. "Comptabilité et gestion"
    studyLevel: string; // e.g. "BTS", "Licence 3", "Master 1"
    internshipType: InternshipType;
    start?: string; // free text, e.g. "janvier 2027"
    end?: string;
    durationText?: string; // e.g. "3 mois"
    conventionProvided: boolean;
    department?: string; // service visé, e.g. "Comptabilité"
    projects: string[]; // academic projects / associative activities typed by the student (facts only)
    qualities: string[];
    channel: SendChannel;
    /** 1 to 5 target companies. `reason` = the student's own words on why this company (20–300 chars). */
    companies: Array<{ name: string; city?: string; recipient?: string; department?: string; reason: string }>;
  };
}

export interface CvDoc {
  fullName: string;
  title: string;
  contacts: string[];
  profile: string;
  experiences: Array<{ title: string; company: string; place: string; period: string; bullets: string[] }>;
  education: Array<{ degree: string; school: string; year: string; detail: string }>;
  skills: string[];
  it: string[];
  languages: Array<{ name: string; level: string }>;
  interests: string[];
}

export interface LettreDoc {
  sender: string[];
  recipient: string[];
  placeDate: string;
  subject: string;
  salutation: string;
  paragraphs: string[];
  closing: string;
  signature: string;
}

/** Sending message for the Pack Stage (deterministic). */
export interface EnvoiDoc {
  emailSubject: string;
  emailBody: string; // 4–8 lines, ends with the list of attachments
  whatsapp: string; // ≤ 600 chars
}

/**
 * Generated document. `cv` is null when product is "lettre"; `lettre` is null when product is "cv".
 * Product "stage": `cv` = student CV, `lettre` = null, `lettres` = one letter per company (same order
 * as internship.companies), `envoi` = sending message. For other products `lettres`/`envoi` are absent.
 */
export interface Document {
  cv: CvDoc | null;
  lettre: LettreDoc | null;
  lettres?: LettreDoc[];
  envoi?: EnvoiDoc | null;
}

/**
 * Masked text convention (preview): a hidden string is replaced by a string made ONLY of the
 * characters "█" (U+2588) and spaces, roughly the same length as the original. The renderer
 * detects /^[█\s]+$/ and draws it blurred. A redacted Document must never contain hidden words.
 */
export const MASK_CHAR = "█";

export type OrderStatus = "preview" | "checkout" | "awaiting_manual" | "paid";
export type PaymentMethod = "wave" | "manual";

export interface OrderRow {
  id: string; // "TCV-XXXXXXXX" (Crockford base32, 8 chars)
  access_token_hash: string; // sha256 hex of the customer token
  product: Product;
  template: Template;
  amount: number; // XOF, integer
  currency: "XOF";
  status: OrderStatus;
  input: OrderInput | null; // nulled when purged
  document: Document | null; // nulled when purged
  checkout_session_id: string | null;
  wave_launch_url: string | null;
  checkout_expires_at: string | null; // ISO
  wave_transaction_id: string | null;
  payment_method: PaymentMethod | null;
  manual_payer_phone: string | null;
  manual_amount: number | null; // unique amount (base price − 1..49) the customer must send in manual mode
  payment_detected_at: string | null; // ISO; when the owner's phone reported a matching Wave notification
  payment_detected_text: string | null; // the notification text that matched (kept 30 days, purged with the order)
  paid_amount: number | null;
  paid_at: string | null; // ISO
  payout_id: string | null;
  ip_hash: string | null;
  created_at: string; // ISO
  purged_at: string | null;
}

export type PayoutStatus = "pending" | "processing" | "succeeded" | "failed" | "unknown";

export interface PayoutRow {
  id: string; // "PO-YYYYMMDD"
  day: string; // YYYY-MM-DD (UTC = Dakar time)
  amount: number; // receive_amount sent to the owner (XOF)
  mobile: string; // E.164
  status: PayoutStatus;
  idempotency_key: string;
  request_body: string; // exact JSON body sent to Wave (re-used verbatim on retries)
  wave_payout_id: string | null;
  fee: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Stats {
  today: { orders: number; paid: number; revenue: number };
  yesterday: { orders: number; paid: number; revenue: number };
  last7: { orders: number; paid: number; revenue: number };
  last30: { orders: number; paid: number; revenue: number };
  allTime: { paid: number; revenue: number };
  pendingPayout: number; // XOF of paid wave orders not yet included in a payout
  recentOrders: Array<Pick<OrderRow, "id" | "product" | "amount" | "status" | "payment_method" | "manual_payer_phone" | "created_at" | "paid_at">>;
  payouts: PayoutRow[];
}

/** Persistence port. SupabaseStore (prod) and MemoryStore (tests) implement it. All methods are atomic. */
export interface Store {
  insertOrder(row: OrderRow): Promise<void>;
  getOrder(id: string): Promise<OrderRow | null>;
  /** Patch arbitrary non-payment fields (template, checkout fields, status checkout/awaiting_manual). Never used to mark paid. */
  updateOrder(id: string, patch: Partial<OrderRow>): Promise<void>;
  /**
   * Atomically transition an order to "paid" if (and only if) it is not already paid.
   * Returns true when this call performed the transition, false if it was already paid / not found.
   */
  markPaid(id: string, p: {
    method: PaymentMethod;
    paidAmount: number;
    transactionId: string | null;
    sessionId: string | null;
    paidAt: string;
  }): Promise<boolean>;
  /** Orders in status "checkout" with a session id, created after `sinceIso`. */
  listOpenCheckouts(sinceIso: string, limit: number): Promise<OrderRow[]>;
  /** Record a webhook event id. Returns false if it was already recorded (duplicate delivery). */
  recordEvent(eventId: string, type: string, ref: string | null, payload: unknown): Promise<boolean>;
  /**
   * Fixed-window rate limiter. Increments the counter for `key` in the current window and
   * returns true if the request is allowed (count <= max).
   */
  hitRateLimit(key: string, windowSeconds: number, max: number, nowIso: string): Promise<boolean>;
  /**
   * Atomically create the payout row for `day` and attach every paid, wave-method, not-yet-paid-out order to it.
   * Amount (computed inside the transaction, see computePayoutAmount in payout.ts — same formula in SQL):
   *   gross = sum(paid_amount) of those orders
   *   net   = floor(gross * (1 - feeRate))
   *   base  = maxAmount == null ? net : min(net, maxAmount)
   *   amount = floor((base - 1) / (1 + payoutFeeRate))     // leaves room for Wave's fee rounding
   * Returns null if a payout for `day` already exists or if amount < minAmount (then nothing is attached).
   */
  createPayout(p: {
    id: string;
    day: string;
    mobile: string;
    idempotencyKey: string;
    feeRate: number; // e.g. 0.01 — Wave checkout fee withheld on receipts
    payoutFeeRate: number; // e.g. 0.01 — Wave payout fee charged on top of receive_amount
    maxAmount: number | null; // live balance minus reserve (before payout fee), null = balance unknown
    minAmount: number;
    nowIso: string;
  }): Promise<PayoutRow | null>;
  updatePayout(id: string, patch: Partial<PayoutRow>): Promise<void>;
  /** Mark payout failed and detach its orders so they roll into the next payout. */
  failPayout(id: string, error: string, nowIso: string): Promise<void>;
  /** Payouts whose outcome is unknown/processing/pending and must be re-checked or retried. */
  listUnsettledPayouts(): Promise<PayoutRow[]>;
  /**
   * Erase personal data in place: unpaid orders older than unpaidBeforeIso, paid orders older than paidBeforeIso
   * (input, document, payer phone, notification text, ip hash → null; purged_at = now). Events older than 30 days
   * lose their payload. Rows are never removed. Returns the number of orders purged.
   */
  purge(unpaidBeforeIso: string, paidBeforeIso: string, nowIso: string): Promise<number>;
  stats(nowIso: string): Promise<Stats>;
  /**
   * Atomically give order `id` a unique manual amount: base − k with the smallest k in 1..maxOffset not used by
   * another manual order still awaiting payment (status checkout/awaiting_manual, created after sinceIso).
   * Idempotent: returns the existing manual_amount when already set. Returns null when every offset is taken.
   */
  assignManualAmount(id: string, base: number, maxOffset: number, sinceIso: string): Promise<number | null>;
  /** Unpaid manual orders (status checkout/awaiting_manual, payment_method null) created after sinceIso. */
  listOpenManualOrders(sinceIso: string): Promise<OrderRow[]>;
  /** Store the matched notification on the order (does NOT mark it paid). */
  recordPaymentDetection(id: string, text: string, nowIso: string): Promise<void>;
  /** Key/value settings from tcv.settings (same keys as the env vars). MemoryStore returns what it was seeded with. */
  getSettings(): Promise<Record<string, string>>;
}

export interface WaveCheckoutSession {
  id: string;
  amount: string;
  currency: string;
  checkout_status: string; // open | complete | expired (failed webhook examples use "failed")
  payment_status: string; // processing | cancelled | succeeded (failed webhook examples use "failed")
  client_reference: string | null;
  transaction_id?: string | null;
  wave_launch_url: string;
  when_expires?: string;
  when_completed?: string | null;
}

export interface WavePayout {
  id: string;
  status: string; // processing | succeeded | failed | reversed
  receive_amount: string;
  fee?: string;
  client_reference?: string;
  payout_error?: { error_code: string; error_message: string };
}

/** Error thrown by WaveClient. `retryable` is true for network errors, 408, 429 and 5xx. */
export class WaveError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public retryable: boolean,
  ) {
    super(message);
  }
}

export interface WaveClient {
  createCheckoutSession(p: {
    amount: number;
    currency: "XOF";
    clientReference: string;
    successUrl: string;
    errorUrl: string;
  }): Promise<WaveCheckoutSession>;
  getCheckoutSession(id: string): Promise<WaveCheckoutSession>;
  getBalance(): Promise<{ amount: number; currency: string }>;
  /** `body` is sent verbatim (exact string) so retries with the same idempotency key match. */
  createPayout(body: string, idempotencyKey: string): Promise<WavePayout>;
  searchPayouts(clientReference: string): Promise<WavePayout[]>;
}

export interface Config {
  waveApiKey: string | null; // null => Wave automatic payments disabled
  waveWebhookSecret: string | null; // null => webhook endpoint returns 503 (reconcile cron still confirms payments)
  waveWebhookMode: "signing" | "shared"; // which Wave webhook security strategy was chosen in the portal
  ownerWaveMobile: string | null; // E.164 "+2217XXXXXXXX"; destination of daily payouts
  payoutEnabled: boolean;
  payoutMin: number; // XOF, default 1000
  payoutReserve: number; // XOF kept in the business wallet, default 0
  waveFeeRate: number; // default 0.01
  payoutFeeRate: number; // default 0.01
  manualWaveNumber: string | null; // display number for manual Wave transfers (bridge mode), null => disabled
  phoneHookKey: string | null; // PHONE_HOOK_KEY: secret the owner's phone (MacroDroid) sends to POST /payments/notify
  manualAutoConfirm: boolean; // MANUAL_AUTO_CONFIRM (default true): a matching Wave notification unlocks the order at once
  ownerWhatsapp: string | null; // digits only, international, no "+"
  adminKey: string | null;
  cronSecret: string | null;
  allowedReturnPrefixes: string[]; // success/error URLs must start with one of these (https only)
  prices: Record<Product, number>; // prices.stage = Pack Stage for 1 company (PRICE_STAGE, default 1500)
  stageMultiPrice: number; // Pack Stage for 2–5 companies (PRICE_STAGE_MULTI, default 2500)
  openrouterApiKey: string | null;
  llmModel: string;
  previewRateLimitPerHour: number; // default 12
  brandName: string; // "Teranga CV"
}

export interface Deps {
  store: Store;
  wave: WaveClient | null; // null when waveApiKey is null
  config: Config;
  now: () => Date;
  /** Optional LLM rewriter; returns null on any failure (never throws). */
  enhance?: (doc: Document, input: OrderInput, product: Product) => Promise<Document | null>;
}
