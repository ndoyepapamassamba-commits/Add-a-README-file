// Shared contract for the Teranga CV backend. Every module imports from here.
// Changing a type here changes the API contract with the frontend (cv/*.js, formation/js/*.js) — keep in sync with
// SPEC.md (course: /tmp/claude-0/tcv-scratch/SPEC_COURSE.md until merged into SPEC.md).

/** Products that generate a document (CV, letters). Unchanged by the course. */
export type DocumentProduct = "cv" | "lettre" | "pack" | "stage" | "premium";
/** Teranga Pro courses on sale. No document, no preview: paid access to private content (tcv.course_assets). */
export type CourseProduct = "pq_essentiel";
/** Accepted by the database check constraint for later courses, never sold by this version (not a Product). */
export type ReservedCourseProduct = "pq_complet" | "imf_kit";
export type Product = DocumentProduct | CourseProduct;
export type InternshipType = "academique" | "fin_etudes" | "vacances" | "perfectionnement";
export type SendChannel = "email" | "whatsapp" | "depot";
export type SkillLevel = "Expert" | "Avancé" | "Bon" | "Notions";
export type PremiumAccent = "marine" | "bordeaux" | "foret";
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
  /** Required when product is "premium" (CV Premium). Everything here is typed by the customer. */
  premium?: {
    headline: string; // accroche under the name, ≤ 160
    pitch?: string; // the customer's own summary, ≤ 500
    quote?: string; // personal approach / motto in the customer's words, ≤ 220
    keyFigures: Array<{ value: string; label: string }>; // 0–4; value ≤ 12 ("15+", "16 359"), label ≤ 70
    domains: Array<{ title: string; detail: string }>; // 0–3 areas of expertise; title ≤ 40, detail ≤ 120
    achievements: Array<{ title: string; detail: string; tags: string[] }>; // 0–6; title ≤ 70, detail ≤ 240, tags ≤ 4 × 30
    skillLevels: Array<{ name: string; level: SkillLevel }>; // 0–8; name ≤ 40
    qualities: string[]; // ≤ 6 × 40
    personal?: { age?: string; situation?: string }; // optional, ≤ 30 each
    accent: PremiumAccent;
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
  /** Present only for product "premium". */
  premium?: {
    headline: string;
    quote: string; // customer's quote cleaned, or a generic first-person approach sentence from the banks
    keyFigures: Array<{ value: string; label: string }>;
    domains: Array<{ title: string; detail: string }>;
    achievements: Array<{ title: string; detail: string; tags: string[] }>;
    skillLevels: Array<{ name: string; level: string }>;
    qualities: string[];
    personal: string[]; // e.g. ["Âge : 41 ans", "Situation : Marié, deux enfants"]
    accent: string;
  };
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
  input: OrderInput | null; // nulled when purged; always null for course products
  document: Document | null; // nulled when purged; always null for course products
  buyer: CourseBuyer | null; // course products only (null for document products); nulled when purged
  checkout_session_id: string | null;
  wave_launch_url: string | null;
  checkout_expires_at: string | null; // ISO
  wave_transaction_id: string | null;
  payment_method: PaymentMethod | null;
  manual_payer_phone: string | null;
  manual_amount: number | null; // unique amount (base price − 1..49) the customer must send in manual mode
  manual_amount_at: string | null; // ISO; when manual_amount was given or last shown at checkout (its hold starts here)
  payment_detected_at: string | null; // ISO; when the owner's phone reported a matching Wave notification
  payment_detected_text: string | null; // the notification text that matched (erased by purge 30 days after detection)
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

/** One product line of the admin funnel. Cohort = orders created in the window, whatever happened next. */
export interface FunnelRow {
  product: string; // Product, or a reserved course id should one ever appear
  orders: number; // orders created
  checkouts: number; // of which reached the payment step (status checkout, awaiting_manual or paid)
  paid: number; // of which paid
  revenue: number; // XOF, sum of paid_amount of the paid ones
}

export interface Stats {
  today: { orders: number; paid: number; revenue: number };
  yesterday: { orders: number; paid: number; revenue: number };
  last7: { orders: number; paid: number; revenue: number };
  last30: { orders: number; paid: number; revenue: number };
  allTime: { paid: number; revenue: number };
  pendingPayout: number; // XOF of paid wave orders not yet included in a payout
  recentOrders: Array<
    Pick<
      OrderRow,
      | "id"
      | "product"
      | "amount"
      | "status"
      | "payment_method"
      | "manual_payer_phone"
      | "manual_amount"
      | "payment_detected_at"
      | "created_at"
      | "paid_at"
    >
  >;
  payouts: PayoutRow[];
  /** Per product, sorted by product id; products without orders in the window are absent. last30 = created ≥ day − 29. */
  funnel: { last30: FunnelRow[]; allTime: FunnelRow[] };
  /** Counts only, never contact data. active = contact fields not yet erased (12-month retention). */
  leads: { total: number; last30: number; active: number };
  /** Distinct orders with at least one passed quiz attempt (all time / attempt in the last 30 days). */
  quizPasses: { total: number; last30: number };
}

// ------------------------------------------------------------------------------------------------
// Teranga Pro courses (product "pq_essentiel"). See SPEC_COURSE.md.
// ------------------------------------------------------------------------------------------------

/** Stored in tcv.orders.buyer for course orders (validated + cleaned by validate_course.ts). */
export interface CourseBuyer {
  fullName: string; // 2–80 chars, letters/spaces/'’.- only; printed on the files' licence, the reader and the attestation
  email?: string; // ≤ 80, lower-cased
  phone?: string; // as typed after cleanup (any country, 8–15 digits), never forced through normalizeSnMobile
  acceptCgv: true; // the buyer ticked « J'accepte les conditions générales de vente »
  acceptedAt: string; // ISO, server time of the order
  cgvVersion: string; // COURSE_CGV_VERSION, e.g. "2026-10-21"
}

/** A private content file, as read from tcv.course_assets through public.tcv_course_asset(name). */
export interface CourseAsset {
  name: string; // "pq_essentiel/manifest.json", "pq_essentiel/modules/module-01.html", "pq_essentiel/files/module-1.xlsx"…
  mime: string;
  bytes: Uint8Array;
  sha256: string; // hex of bytes
  updatedAt: string; // ISO
}

/** Metadata of a stored course asset (tcv_course_asset_list, tcv_course_upload_commit, GET /admin/course-assets). */
export interface CourseAssetInfo {
  name: string;
  mime: string;
  size: number; // bytes
  sha256: string; // hex
  updated_at: string; // ISO
}

/** Store.holdManualAmount arguments (autopay.ts computes the two cut-offs from MANUAL_HOLD_MS and PAID_HOLD_MS). */
export interface ManualHoldParams {
  base: number; // catalogue price
  maxOffset: number; // MANUAL_MAX_OFFSET
  nowIso: string;
  unpaidSinceIso: string; // now − MANUAL_HOLD_MS
  paidSinceIso: string; // now − PAID_HOLD_MS
}

/** pq_essentiel/manifest.json (schema 1), produced by the content kit. The API trusts only what it lists. */
export interface CourseManifest {
  schema: 1;
  id: CourseProduct;
  title: string; // "Power Query pour le reporting bancaire"
  subtitle: string; // "Automatisez vos états mensuels sous Excel — édition UEMOA"
  edition: string; // "Essentiel"
  version: string; // "1.0"
  updatedAt: string; // "2026-10-21" (YYYY-MM-DD)
  modules: Array<{
    n: number; // 1..8, unique, ascending
    id: string; // "module-01"
    title: string;
    minutes: number; // indicative reading + exercise time
    objectives: string[];
    html: string; // asset name of the fragment: "pq_essentiel/modules/module-01.html"
    files: string[]; // names of manifest.files entries used by this module
  }>;
  files: Array<{
    name: string; // download name, /^[a-z0-9][a-z0-9-]{0,60}\.(xlsx|zip)$/: "module-1.xlsx", "donnees-module-1.zip"
    label: string; // « Classeur d'exercices — module 1 »
    module: number | null; // module number, null for course-wide files
    asset: string; // "pq_essentiel/files/module-1.xlsx"
    size: number; // bytes of the stored asset (shown to the buyer)
  }>;
  quiz: {
    questions: string; // asset name: "pq_essentiel/quiz.json" (CourseQuiz)
    key: string; // asset name: "pq_essentiel/quiz-key.json" (CourseQuizKey) — NEVER sent to a client
    passPercent: number; // 70
  };
}

/** pq_essentiel/quiz.json — the part a paid buyer receives. */
export interface CourseQuiz {
  schema: 1;
  questions: Array<{ id: string; text: string; choices: string[]; module?: number }>; // id /^q\d{2}$/, 4 choices
}

/** pq_essentiel/quiz-key.json — 0-based index of the right choice per question id. Server-side only. */
export interface CourseQuizKey {
  schema: 1;
  answers: Record<string, number>;
}

/** tcv.leads row ("Prévenez-moi de l'ouverture"). Contact fields are nulled 12 months after created_at. */
export interface LeadRow {
  id: string; // "LD-" + 8 Crockford base32 chars
  email: string | null;
  whatsapp: string | null; // "+" and digits, or digits only, as typed after cleanup (8–15 digits)
  consent_text: string; // LEAD_CONSENT_TEXT shown next to the checkbox, stored verbatim
  source: string; // /^[a-z0-9-]{1,40}$/: "formation-index", "formation-gratuit"…
  product: CourseProduct; // course the person wants to hear about
  ip_hash: string | null;
  created_at: string; // ISO
  purged_at: string | null;
}

/** tcv.quiz_attempts row. Only passed attempts (score ≥ passPercent) are stored. */
export interface QuizAttemptRow {
  id: string; // "QA-" + 10 Crockford base32 chars
  order_id: string;
  score: number; // integer percent 0..100 = round(100 × correct / total)
  correct: number;
  total: number;
  passed: boolean; // true for every stored row
  public_listing: boolean; // the buyer agreed to appear on the public verification page
  attestation_code: string; // 12 lower-case hex; the same for every attempt of an order
  created_at: string; // ISO
}

/** Summary of an order's passed attempts (Store.getQuizProgress). The most recent pass sets code and listing. */
export interface QuizProgress {
  firstPassedAt: string; // date printed on the attestation
  lastPassedAt: string;
  bestScore: number;
  lastScore: number;
  code: string;
  publicListing: boolean;
  passes: number;
}

/** What Store.findAttestation returns for a code (null when unknown or when the order was purged). */
export interface AttestationRecord {
  code: string;
  orderId: string;
  product: string;
  fullName: string;
  passedAt: string; // first pass, ISO
  publicListing: boolean; // of the most recent pass; the API answers 404 when false
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
   * (input, document, buyer, payer phone, notification text, ip hash → null; purged_at = now). Paid COURSE orders
   * (pq_essentiel, pq_complet, imf_kit) ignore paidBeforeIso: they are purged COURSE_RETENTION_DAYS (730) after payment.
   * Whatever the order, the Wave notification text and the payer phone are erased NOTIFICATION_RETENTION_DAYS (30)
   * after coalesce(payment_detected_at, created_at) (the privacy policy promises 30 days; not counted as a purge).
   * Events older than 30 days lose their payload. Leads older than LEAD_RETENTION_DAYS (365) lose email, whatsapp and
   * ip_hash (purged_at = now). Uncommitted upload chunks older than 2 days lose their content. Rows are never
   * removed. Returns the number of orders purged.
   */
  purge(unpaidBeforeIso: string, paidBeforeIso: string, nowIso: string): Promise<number>;
  stats(nowIso: string): Promise<Stats>;
  /**
   * Atomically give order `id` its unique manual amount for this checkout (autopay.ts, prepareManualCheckout).
   * An amount is HELD by an order when it is unpaid (status checkout/awaiting_manual, payment_method null) and was
   * given or shown after `unpaidSinceIso` (coalesce(manual_amount_at, created_at)), or when it is paid with that
   * amount after `paidSinceIso` (a replayed notification then unlocks nobody else).
   * - order paid → its manual_amount, unchanged;
   * - the order still holds its amount → the same amount, manual_amount_at = nowIso (the hold restarts);
   * - otherwise → its previous amount if no other order holds it, else base − k with the smallest k in 1..maxOffset
   *   held by no other order (manual_amount_at = nowIso); none free → manual_amount and manual_amount_at become null
   *   and the result is null.
   * Unknown order → null.
   */
  holdManualAmount(id: string, p: ManualHoldParams): Promise<number | null>;
  /**
   * Unpaid manual orders that still hold a unique amount: status checkout/awaiting_manual, payment_method null,
   * not purged, manual_amount set and coalesce(manual_amount_at, created_at) after unpaidSinceIso. Newest first.
   */
  listHeldManualOrders(unpaidSinceIso: string): Promise<OrderRow[]>;
  /** Store the matched notification on the order (does NOT mark it paid). */
  recordPaymentDetection(id: string, text: string, nowIso: string): Promise<void>;
  /** Key/value settings from tcv.settings (same keys as the env vars). MemoryStore returns what it was seeded with. */
  getSettings(): Promise<Record<string, string>>;
  /** Read-only view of a hitRateLimit bucket: its count in the current window (0 when absent or expired). */
  peekRateLimit(key: string, windowSeconds: number, nowIso: string): Promise<number>;

  // --- Teranga Pro courses (20261021000006_course.sql) -------------------------------------------
  /** A private course file by its asset name, or null. */
  getCourseAsset(name: string): Promise<CourseAsset | null>;
  /**
   * Creates or replaces a course asset (PUT /admin/course-assets/:name). SQL side: base64 chunks of at most
   * COURSE_UPLOAD_CHUNK_BYTES raw bytes through tcv_course_upload_chunk, then tcv_course_upload_commit, which checks
   * the sha256 of the whole file. Returns the stored metadata.
   */
  uploadCourseAsset(name: string, mime: string, bytes: Uint8Array): Promise<CourseAssetInfo>;
  /** Metadata (no bytes) of every asset whose name starts with `prefix` ("" = all), sorted by name. */
  listCourseAssets(prefix: string): Promise<CourseAssetInfo[]>;
  /** Stores a lead (no dedupe: the HTTP layer rate-limits by IP). */
  insertLead(row: LeadRow): Promise<void>;
  /** Stores a passed quiz attempt. */
  recordQuizAttempt(row: QuizAttemptRow): Promise<void>;
  /** Summary of the order's passed attempts, or null when it never passed. */
  getQuizProgress(orderId: string): Promise<QuizProgress | null>;
  /** The attestation behind a code (whatever its listing choice), or null when unknown / purged order. */
  findAttestation(code: string): Promise<AttestationRecord | null>;
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
  publicApiBase: string; // PUBLIC_API_BASE (https, no trailing slash): base of the MacroDroid link in GET /admin/stats
  manualAutoConfirm: boolean; // MANUAL_AUTO_CONFIRM (default true): a matching Wave notification unlocks the order at once
  ownerWhatsapp: string | null; // digits only, international, no "+"
  adminKey: string | null;
  cronSecret: string | null;
  allowedReturnPrefixes: string[]; // success/error URLs must start with one of these (https only)
  prices: Record<DocumentProduct, number>; // prices.stage = Pack Stage for 1 company (PRICE_STAGE, default 1500); prices.premium = PRICE_PREMIUM, default 5000
  stageMultiPrice: number; // Pack Stage for 2–5 companies (PRICE_STAGE_MULTI, default 2500)
  /** Course prices, kept apart so GET /config `prices` stays byte-identical: pq_essentiel = PRICE_PQ_ESSENTIEL, default 25000. */
  coursePrices: Record<CourseProduct, number>;
  pqSalesOpen: boolean; // PQ_SALES_OPEN (default false; "true"/"1"/"yes"/"oui"/"on" open it): POST /orders for pq_essentiel → 403 sales_closed when false
  /** COURSE_UPLOAD_TOKEN_SHA256: lower-case hex sha256 of the upload token (64 hex), else null = uploads disabled. */
  courseUploadTokenSha256: string | null;
  /** COURSE_UPLOAD_UNTIL: end of the upload window (ms since epoch, from an ISO date), null = uploads disabled. */
  courseUploadUntil: number | null;
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

// ------------------------------------------------------------------------------------------------
// Course API payloads (JSON bodies; the front-end in formation/js/*.js relies on these exact field names)
// ------------------------------------------------------------------------------------------------

/** PublicOrder, as built by publicOrder() in app.ts (unchanged). */
export interface PublicOrder {
  id: string;
  product: Product;
  template: Template; // meaningless for course orders (always "classique")
  amount: number; // catalogue price (25000 for pq_essentiel)
  currency: "XOF";
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  paidAt: string | null;
  createdAt: string;
}

/** POST /orders body for a course. */
export interface CourseOrderRequest {
  product: CourseProduct;
  buyer: { fullName: string; email?: string; phone?: string };
  acceptCgv: true;
  website?: ""; // honeypot
}

/** GET /config → courses. */
export interface PublicCourseConfig {
  price: number; // XOF
  open: boolean; // PQ_SALES_OPEN
}

/** GET /orders/:id → receipt (course orders, only once paid). */
export interface CourseReceipt {
  number: string; // = order id
  paidAt: string; // ISO
  amount: number; // XOF actually recorded (paid_amount, e.g. 24987), falls back to the catalogue price
  currency: "XOF";
  paymentMethod: PaymentMethod;
  label: string; // COURSE_CATALOG[product].label
  buyerName: string;
  seller: string; // RECEIPT_SELLER_TEXT: "Vendeur : particulier — reçu de paiement, pas une facture" (NBSP before ":")
}

/** GET /orders/:id for a course order (document products keep { order, document?, preview? }). */
export interface CourseOrderView {
  order: PublicOrder;
  buyer: { fullName: string };
  course: { id: CourseProduct; title: string; edition: string };
  receipt?: CourseReceipt;
}

/** GET /orders/:id/course (paid course orders only). */
export interface CourseView {
  course: { id: CourseProduct; title: string; subtitle: string; edition: string; version: string; updatedAt: string };
  buyer: { fullName: string };
  order: { id: string; paidAt: string | null };
  modules: Array<{ id: string; n: number; title: string; minutes: number; objectives: string[]; files: string[]; html: string }>;
  files: Array<{ name: string; label: string; size: number; module: number | null }>;
  quiz: { passPercent: number; questions: Array<{ id: string; text: string; choices: string[] }> };
  attestation?: { code: string; passedAt: string; score: number; publicListing: boolean };
}

/** POST /orders/:id/quiz body and response. */
export interface QuizRequest {
  t: string;
  answers: Record<string, number | null>; // question id → 0-based choice index
  publicListing: boolean;
}
export interface QuizResult {
  score: number; // percent
  correct: number;
  total: number;
  passPercent: number;
  passed: boolean;
  code: string | null; // attestation code when passed
}

/** GET /attestations/:code (public, only when the buyer opted in). */
export interface PublicAttestation {
  code: string;
  fullName: string;
  course: string; // COURSE_CATALOG[product].label
  date: string; // YYYY-MM-DD of the first pass
  kind: string; // "Attestation de suivi — non diplômante"
}

/** POST /leads body. */
export interface LeadRequest {
  email?: string;
  whatsapp?: string;
  consent: true;
  source: string;
  website?: ""; // honeypot
}
