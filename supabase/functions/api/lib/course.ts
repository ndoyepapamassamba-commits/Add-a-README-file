// Teranga Pro courses (product pq_essentiel, SPEC_COURSE.md): order creation without preview, the paid reader's
// payload, personalised downloads, the final quiz and its attestation, the « Prévenez-moi » leads and the admin
// status line. Private content lives in tcv.course_assets and is only ever served to a paid order's token.
import type {
  CourseAsset,
  CourseManifest,
  CourseOrderView,
  CourseProduct,
  CourseQuiz,
  CourseQuizKey,
  CourseView,
  Deps,
  OrderRow,
  PublicAttestation,
  QuizResult,
} from "./types.ts";
import { clientIp, fileResponse, HttpError, json, log, readJsonObject } from "./http.ts";
import { hashIp, hmacSha256Hex, newAccessToken, newOrderId, newRandomId, sha256Hex } from "./ids.ts";
import { isCourseProduct } from "./pricing.ts";
import { hitOrderRateLimits, ipPepper, loadCustomerOrder, notFound, publicOrder, rateLimited } from "./order_access.ts";
import { validateCourseOrder, validateLead } from "./validate_course.ts";
import { addZipLicence, injectXlsxLicence, licenceTxt } from "./course_files.ts";
import {
  ATTESTATION_KIND,
  ATTESTATION_LOOKUPS_PER_HOUR_PER_IP,
  COURSE_CATALOG,
  COURSE_CGV_VERSION,
  DOWNLOADS_PER_DAY,
  LEAD_CONSENT_TEXT,
  LEADS_PER_DAY_GLOBAL,
  LEADS_PER_HOUR_PER_IP,
  licenceLine,
  QUIZ_ATTEMPTS_PER_DAY,
  QUIZ_PASS_PERCENT,
  RECEIPT_SELLER_TEXT,
} from "./course_catalog.ts";

export * from "./course_catalog.ts";

type Params = string[];

const DAY_SECONDS = 86_400;
const VALIDATION_MESSAGE = "Certains champs sont à corriger.";

export const COURSE_MESSAGES = {
  salesClosed:
    "Les inscriptions à cette formation ne sont pas encore ouvertes. Laissez votre contact pour être prévenu(e) de l'ouverture.",
  unavailable: "Le contenu de la formation est en cours de mise en ligne. Réessayez dans quelques minutes.",
  quizUnavailable: "Le quiz est momentanément indisponible. Réessayez plus tard.",
  fileNotFound: "Fichier introuvable.",
  attestationNotFound: "Attestation introuvable.",
  downloadsLimited: "Vous avez atteint la limite de 30 téléchargements sur 24 heures. Réessayez demain.",
  quizLimited: "Vous avez atteint la limite de 10 tentatives sur 24 heures. Réessayez demain.",
  answers: "Répondez aux questions avant d'envoyer.",
  invalid: "Valeur invalide.",
  honeypot: "Votre demande n'a pas pu être traitée.",
} as const;

const unavailable = () => new HttpError(503, "course_unavailable", COURSE_MESSAGES.unavailable);
const fileNotFound = () => new HttpError(404, "not_found", COURSE_MESSAGES.fileNotFound);
const attestationNotFound = () => new HttpError(404, "not_found", COURSE_MESSAGES.attestationNotFound);

export const MANIFEST_NAME = "manifest.json";
export const DOWNLOAD_NAME_RE = /^[a-z0-9][a-z0-9-]{0,60}\.(xlsx|zip)$/;
export const ATTESTATION_CODE_RE = /^[0-9a-f]{12}$/;
const MODULE_ID_RE = /^module-\d{2}$/;
const QUESTION_ID_RE = /^q\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ANSWER_KEYS = 100;
const MAX_CHOICE_INDEX = 9;

/** Attestation code of an order: first 12 lower-case hex of HMAC-SHA256(ADMIN_KEY, "attest:" + orderId). */
export async function attestCode(adminKey: string, orderId: string): Promise<string> {
  return (await hmacSha256Hex(adminKey, `attest:${orderId}`)).slice(0, 12);
}

// ------------------------------------------------------------------------------------------------
// Content: parsing and validation of the private assets
// ------------------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** Strict UTF-8 (invalid bytes → null). A leading BOM is dropped. */
export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** A module fragment: non-blank UTF-8, served verbatim (the content kit validates it, the reader sanitizes it). */
export function parseFragment(bytes: Uint8Array): string | null {
  const html = decodeUtf8(bytes);
  return html !== null && html.trim() ? html : null;
}

function parseJson(bytes: Uint8Array): unknown {
  const text = decodeUtf8(bytes);
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** pq_essentiel/manifest.json (schema 1) → a clean CourseManifest (known keys only), or null when invalid. */
export function parseManifest(bytes: Uint8Array, product: CourseProduct): CourseManifest | null {
  const m = parseJson(bytes);
  if (!isObj(m) || m.schema !== 1 || m.id !== product) return null;
  if (!isText(m.title, 200) || !isText(m.subtitle, 200) || !isText(m.edition, 200) || !isText(m.version, 20)) return null;
  if (typeof m.updatedAt !== "string" || !DAY_RE.test(m.updatedAt) || Number.isNaN(Date.parse(m.updatedAt))) return null;

  if (!Array.isArray(m.files) || m.files.length > 60) return null;
  const files: CourseManifest["files"] = [];
  const names = new Set<string>();
  for (const f of m.files) {
    if (!isObj(f) || typeof f.name !== "string" || !DOWNLOAD_NAME_RE.test(f.name) || names.has(f.name)) return null;
    if (!isText(f.label, 120) || typeof f.asset !== "string" || !f.asset.startsWith(`${product}/files/`)) return null;
    if (!(f.module === null || isInt(f.module)) || !isInt(f.size) || f.size < 0) return null;
    names.add(f.name);
    files.push({ name: f.name, label: f.label, module: f.module, asset: f.asset, size: f.size });
  }

  if (!Array.isArray(m.modules) || m.modules.length < 1 || m.modules.length > 20) return null;
  const modules: CourseManifest["modules"] = [];
  let previous = 0;
  for (const mod of m.modules) {
    if (!isObj(mod) || !isInt(mod.n) || mod.n <= previous || (previous === 0 && mod.n !== 1)) return null;
    if (typeof mod.id !== "string" || !MODULE_ID_RE.test(mod.id) || !isText(mod.title, 200)) return null;
    if (!isInt(mod.minutes) || mod.minutes < 1 || mod.minutes > 600) return null;
    if (!Array.isArray(mod.objectives) || mod.objectives.length > 12 || !mod.objectives.every((o) => isText(o, 300))) return null;
    if (typeof mod.html !== "string" || !mod.html.startsWith(`${product}/modules/`)) return null;
    if (!Array.isArray(mod.files) || !mod.files.every((n) => typeof n === "string" && names.has(n))) return null;
    previous = mod.n;
    modules.push({
      n: mod.n,
      id: mod.id,
      title: mod.title,
      minutes: mod.minutes,
      objectives: [...mod.objectives] as string[],
      html: mod.html,
      files: [...mod.files] as string[],
    });
  }
  const numbers = new Set(modules.map((x) => x.n));
  if (!files.every((f) => f.module === null || numbers.has(f.module))) return null;

  const q = m.quiz;
  if (!isObj(q) || typeof q.questions !== "string" || typeof q.key !== "string" || q.passPercent !== QUIZ_PASS_PERCENT) return null;
  if (!q.questions.startsWith(`${product}/`) || !q.key.startsWith(`${product}/`) || q.questions === q.key) return null;
  // A download can never be the quiz key (or any other text asset), even with a misplaced file in the kit.
  const textNames = new Set([q.questions, q.key, ...modules.map((x) => x.html)]);
  if (files.some((f) => textNames.has(f.asset))) return null;

  return {
    schema: 1,
    id: product,
    title: m.title,
    subtitle: m.subtitle,
    edition: m.edition,
    version: m.version,
    updatedAt: m.updatedAt,
    modules,
    files,
    quiz: { questions: q.questions, key: q.key, passPercent: q.passPercent },
  };
}

/** quiz.json → { schema: 1, questions: [{ id, text, choices }] } (other keys dropped), or null when invalid. */
export function parseQuiz(bytes: Uint8Array): CourseQuiz | null {
  const v = parseJson(bytes);
  if (!isObj(v) || (v.schema !== undefined && v.schema !== 1)) return null;
  if (!Array.isArray(v.questions) || v.questions.length < 1 || v.questions.length > 50) return null;
  const ids = new Set<string>();
  const questions: CourseQuiz["questions"] = [];
  for (const q of v.questions) {
    if (!isObj(q) || typeof q.id !== "string" || !QUESTION_ID_RE.test(q.id) || ids.has(q.id) || !isText(q.text, 500)) return null;
    if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 6 || !q.choices.every((c) => isText(c, 300))) {
      return null;
    }
    ids.add(q.id);
    questions.push({ id: q.id, text: q.text, choices: [...q.choices] as string[] });
  }
  return { schema: 1, questions };
}

/** quiz-key.json → the answer of every question of `quiz` (an integer index within its choices), or null. */
export function parseQuizKey(bytes: Uint8Array, quiz: CourseQuiz): CourseQuizKey | null {
  const v = parseJson(bytes);
  if (!isObj(v) || (v.schema !== undefined && v.schema !== 1) || !isObj(v.answers)) return null;
  const answers: Record<string, number> = {};
  for (const q of quiz.questions) {
    const a = Object.hasOwn(v.answers, q.id) ? v.answers[q.id] : undefined;
    if (!isInt(a) || a < 0 || a >= q.choices.length) return null;
    answers[q.id] = a;
  }
  return { schema: 1, answers };
}

// ------------------------------------------------------------------------------------------------
// Content: loading (text assets memoised per Deps, i.e. for at most one settings period of 60 s)
// ------------------------------------------------------------------------------------------------

const textAssets = new WeakMap<Deps, Map<string, Promise<CourseAsset | null>>>();

/** Manifest, modules, quiz and key: one store read per Deps object. Downloads (files/*) never come from here. */
function cachedAsset(deps: Deps, name: string): Promise<CourseAsset | null> {
  let cache = textAssets.get(deps);
  if (!cache) {
    cache = new Map();
    textAssets.set(deps, cache);
  }
  const map = cache;
  let pending = map.get(name);
  if (!pending) {
    pending = deps.store.getCourseAsset(name);
    map.set(name, pending);
    // A failed read (database unreachable) is not remembered: the next request tries again.
    pending.catch(() => {
      if (map.get(name) === pending) map.delete(name);
    });
  }
  return pending;
}

interface LoadOptions {
  quiet?: boolean;
}

/** Logs the asset name (never its content) and returns the 503 to throw. */
function missing(name: string, what: string, opts: LoadOptions): HttpError {
  if (!opts.quiet) log.error(`course asset ${name} ${what}`);
  return unavailable();
}

async function readAsset<T>(deps: Deps, name: string, parse: (bytes: Uint8Array) => T | null, opts: LoadOptions): Promise<T> {
  const asset = await cachedAsset(deps, name);
  if (!asset) throw missing(name, "is missing", opts);
  const parsed = parse(asset.bytes);
  if (parsed === null) throw missing(name, "is invalid", opts);
  return parsed;
}

export function loadManifest(deps: Deps, product: CourseProduct, opts: LoadOptions = {}): Promise<CourseManifest> {
  const name = COURSE_CATALOG[product].assetPrefix + MANIFEST_NAME;
  return readAsset(deps, name, (bytes) => parseManifest(bytes, product), opts);
}

export async function loadQuiz(
  deps: Deps,
  manifest: CourseManifest,
  opts: LoadOptions = {},
): Promise<{ quiz: CourseQuiz; key: CourseQuizKey }> {
  const quiz = await readAsset(deps, manifest.quiz.questions, parseQuiz, opts);
  const key = await readAsset(deps, manifest.quiz.key, (bytes) => parseQuizKey(bytes, quiz), opts);
  return { quiz, key };
}

export interface LoadedCourse {
  manifest: CourseManifest;
  html: string[]; // one fragment per manifest module, same order
  quiz: CourseQuiz;
  key: CourseQuizKey;
}

/** Everything the reader needs; any asset missing or invalid → 503 course_unavailable (logged by name). */
export async function loadCourse(deps: Deps, product: CourseProduct, opts: LoadOptions = {}): Promise<LoadedCourse> {
  const manifest = await loadManifest(deps, product, opts);
  const html = await Promise.all(manifest.modules.map((m) => readAsset(deps, m.html, parseFragment, opts)));
  const { quiz, key } = await loadQuiz(deps, manifest, opts);
  return { manifest, html, quiz, key };
}

// ------------------------------------------------------------------------------------------------
// Orders
// ------------------------------------------------------------------------------------------------

/** The course product of a paid course order; anything else is the same 404 as an unknown order. */
function paidCourse(order: OrderRow): CourseProduct {
  if (!isCourseProduct(order.product) || order.status !== "paid") throw notFound();
  return order.product;
}

/**
 * POST /orders for a course (called by app.ts once the honeypot passed): sales switch, the two order rate
 * limits, validation, then a plain order row without input, document or preview.
 */
export async function createCourseOrder(deps: Deps, req: Request, body: Record<string, unknown>): Promise<Response> {
  if (!deps.config.pqSalesOpen) throw new HttpError(403, "sales_closed", COURSE_MESSAGES.salesClosed);
  const nowIso = deps.now().toISOString();
  const ipHash = await hashIp(clientIp(req), ipPepper(deps));
  await hitOrderRateLimits(deps, ipHash, nowIso);

  const v = validateCourseOrder(body);
  if (!v.ok) throw new HttpError(400, "validation", VALIDATION_MESSAGE, v.fields);

  const id = newOrderId();
  const token = newAccessToken();
  const row: OrderRow = {
    id,
    access_token_hash: await sha256Hex(token),
    product: v.product,
    template: "classique",
    amount: deps.config.coursePrices[v.product],
    currency: "XOF",
    status: "preview",
    input: null,
    document: null,
    buyer: { ...v.buyer, acceptedAt: nowIso, cgvVersion: COURSE_CGV_VERSION },
    checkout_session_id: null,
    wave_launch_url: null,
    checkout_expires_at: null,
    wave_transaction_id: null,
    payment_method: null,
    manual_payer_phone: null,
    manual_amount: null,
    manual_amount_at: null,
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
  return json(201, { order: { ...publicOrder(row), token } });
}

/** GET /orders/:id body of a course order (reads nothing from tcv.course_assets: it is polled every 4 s). */
export function courseOrderView(order: OrderRow): CourseOrderView {
  const product = order.product as CourseProduct;
  const catalog = COURSE_CATALOG[product];
  const buyerName = order.buyer?.fullName ?? "";
  const view: CourseOrderView = {
    order: publicOrder(order),
    buyer: { fullName: buyerName },
    course: { id: product, title: catalog.title, edition: catalog.edition },
  };
  if (order.status === "paid") {
    view.receipt = {
      number: order.id,
      paidAt: order.paid_at ?? order.created_at,
      amount: order.paid_amount ?? order.amount,
      currency: "XOF",
      paymentMethod: order.payment_method ?? "manual",
      label: catalog.label,
      buyerName,
      seller: RECEIPT_SELLER_TEXT,
    };
  }
  return view;
}

// ------------------------------------------------------------------------------------------------
// GET /orders/:id/course
// ------------------------------------------------------------------------------------------------

export async function getCourse(deps: Deps, req: Request, [id]: Params): Promise<Response> {
  const order = await loadCustomerOrder(deps, id, new URL(req.url).searchParams.get("t"));
  const product = paidCourse(order);
  const { manifest, html, quiz } = await loadCourse(deps, product);
  const progress = await deps.store.getQuizProgress(order.id);
  const view: CourseView = {
    course: {
      id: product,
      title: manifest.title,
      subtitle: manifest.subtitle,
      edition: manifest.edition,
      version: manifest.version,
      updatedAt: manifest.updatedAt,
    },
    buyer: { fullName: order.buyer?.fullName ?? "" },
    order: { id: order.id, paidAt: order.paid_at },
    modules: manifest.modules.map((m, i) => ({
      id: m.id,
      n: m.n,
      title: m.title,
      minutes: m.minutes,
      objectives: m.objectives,
      files: m.files,
      html: html[i],
    })),
    files: manifest.files.map((f) => ({ name: f.name, label: f.label, size: f.size, module: f.module })),
    quiz: {
      passPercent: manifest.quiz.passPercent,
      questions: quiz.questions.map((q) => ({ id: q.id, text: q.text, choices: q.choices })),
    },
  };
  if (progress) {
    view.attestation = {
      code: progress.code,
      passedAt: progress.firstPassedAt,
      score: progress.bestScore,
      publicListing: progress.publicListing,
    };
  }
  return json(200, view);
}

// ------------------------------------------------------------------------------------------------
// GET /orders/:id/files/:name
// ------------------------------------------------------------------------------------------------

export async function downloadCourseFile(deps: Deps, req: Request, [id, name]: Params): Promise<Response> {
  const order = await loadCustomerOrder(deps, id, new URL(req.url).searchParams.get("t"));
  const product = paidCourse(order);
  const manifest = await loadManifest(deps, product);
  const entry = manifest.files.find((f) => f.name === name);
  if (!entry) throw fileNotFound();
  const nowIso = deps.now().toISOString();
  if (!(await deps.store.hitRateLimit(`course-dl:${order.id}`, DAY_SECONDS, DOWNLOADS_PER_DAY, nowIso))) {
    throw new HttpError(429, "rate_limited", COURSE_MESSAGES.downloadsLimited);
  }
  const asset = await deps.store.getCourseAsset(entry.asset);
  if (!asset) {
    log.error(`course file ${entry.asset} is missing`);
    throw fileNotFound();
  }
  const fullName = order.buyer?.fullName ?? "";
  let bytes = asset.bytes;
  try {
    if (name.endsWith(".xlsx")) {
      const result = injectXlsxLicence(bytes, licenceLine(fullName, order.id));
      if (result.replaced === 0) log.warn(`licence placeholder missing in ${name}`);
      bytes = result.bytes;
    } else if (name.endsWith(".zip")) {
      bytes = addZipLicence(bytes, licenceTxt(fullName, order.id, product));
    }
  } catch (err) {
    log.error(`course file ${entry.asset} could not be personalised`, err instanceof Error ? err.message : "error");
    throw unavailable();
  }
  return fileResponse(bytes, asset.mime, name);
}

// ------------------------------------------------------------------------------------------------
// POST /orders/:id/quiz
// ------------------------------------------------------------------------------------------------

/** answers = { questionId: 0-based index (integer 0..9) | null }, at most 100 keys; anything else → null. */
export function parseAnswers(v: unknown): Record<string, number | null> | null {
  if (!isObj(v)) return null;
  const entries = Object.entries(v);
  if (entries.length > MAX_ANSWER_KEYS) return null;
  for (const [, a] of entries) {
    if (a !== null && !(isInt(a) && a >= 0 && a <= MAX_CHOICE_INDEX)) return null;
  }
  return v as Record<string, number | null>;
}

export async function submitQuiz(deps: Deps, req: Request, [id]: Params): Promise<Response> {
  const body = await readJsonObject(req);
  const order = await loadCustomerOrder(deps, id, body.t);
  const product = paidCourse(order);
  const answers = parseAnswers(body.answers);
  const fields: Record<string, string> = {};
  if (answers === null) fields.answers = COURSE_MESSAGES.answers;
  if (body.publicListing !== undefined && typeof body.publicListing !== "boolean") fields.publicListing = COURSE_MESSAGES.invalid;
  if (Object.keys(fields).length) throw new HttpError(400, "validation", VALIDATION_MESSAGE, fields);
  const publicListing = body.publicListing === true;

  const now = deps.now();
  const nowIso = now.toISOString();
  if (!(await deps.store.hitRateLimit(`course-quiz:${order.id}`, DAY_SECONDS, QUIZ_ATTEMPTS_PER_DAY, nowIso))) {
    throw new HttpError(429, "rate_limited", COURSE_MESSAGES.quizLimited);
  }
  const manifest = await loadManifest(deps, product);
  const { quiz, key } = await loadQuiz(deps, manifest);

  const given = answers as Record<string, number | null>;
  const total = quiz.questions.length;
  const correct = quiz.questions.filter((q) => Object.hasOwn(given, q.id) && given[q.id] === key.answers[q.id]).length;
  const score = Math.round((100 * correct) / total);
  const passed = score >= QUIZ_PASS_PERCENT;
  const result: QuizResult = { score, correct, total, passPercent: QUIZ_PASS_PERCENT, passed, code: null };
  if (!passed) return json(200, result);

  // The code is made once per order and reused, so it stays valid even if ADMIN_KEY rotates.
  const progress = await deps.store.getQuizProgress(order.id);
  let code = progress?.code ?? null;
  if (!code) {
    const adminKey = deps.config.adminKey;
    if (!adminKey) throw new HttpError(503, "quiz_unavailable", COURSE_MESSAGES.quizUnavailable);
    code = await attestCode(adminKey, order.id);
  }
  await deps.store.recordQuizAttempt({
    id: newRandomId("QA-", 10),
    order_id: order.id,
    score,
    correct,
    total,
    passed: true,
    public_listing: publicListing,
    attestation_code: code,
    created_at: nowIso,
  });
  return json(200, { ...result, code });
}

// ------------------------------------------------------------------------------------------------
// GET /attestations/:code (public)
// ------------------------------------------------------------------------------------------------

export async function getAttestation(deps: Deps, req: Request, [raw]: Params): Promise<Response> {
  const code = raw.toLowerCase();
  if (!ATTESTATION_CODE_RE.test(code)) throw attestationNotFound();
  const nowIso = deps.now().toISOString();
  const ipHash = await hashIp(clientIp(req), ipPepper(deps));
  if (!(await deps.store.hitRateLimit(`attest:${ipHash}`, 3600, ATTESTATION_LOOKUPS_PER_HOUR_PER_IP, nowIso))) {
    throw rateLimited();
  }
  const record = await deps.store.findAttestation(code);
  if (!record || !record.publicListing || !isCourseProduct(record.product) || !record.fullName) throw attestationNotFound();
  const body: PublicAttestation = {
    code,
    fullName: record.fullName,
    course: COURSE_CATALOG[record.product].label,
    date: record.passedAt.slice(0, 10),
    kind: ATTESTATION_KIND,
  };
  return json(200, body);
}

// ------------------------------------------------------------------------------------------------
// POST /leads (public)
// ------------------------------------------------------------------------------------------------

export async function createLead(deps: Deps, req: Request): Promise<Response> {
  const body = await readJsonObject(req);
  const website = body.website;
  if (website !== undefined && website !== null && !(typeof website === "string" && website.trim() === "")) {
    throw new HttpError(400, "validation", COURSE_MESSAGES.honeypot);
  }
  const nowIso = deps.now().toISOString();
  const ipHash = await hashIp(clientIp(req), ipPepper(deps));
  if (!(await deps.store.hitRateLimit(`lead:${ipHash}`, 3600, LEADS_PER_HOUR_PER_IP, nowIso))) throw rateLimited();
  if (!(await deps.store.hitRateLimit(`lead:global:${nowIso.slice(0, 10)}`, DAY_SECONDS, LEADS_PER_DAY_GLOBAL, nowIso))) {
    throw rateLimited();
  }
  const v = validateLead(body);
  if (!v.ok) throw new HttpError(400, "validation", VALIDATION_MESSAGE, v.fields);
  // Contact data is stored only: never logged, never returned (the admin page sees counts).
  await deps.store.insertLead({
    id: newRandomId("LD-", 8),
    email: v.email,
    whatsapp: v.whatsapp,
    consent_text: LEAD_CONSENT_TEXT,
    source: v.source,
    product: "pq_essentiel",
    ip_hash: ipHash,
    created_at: nowIso,
    purged_at: null,
  });
  return json(201, { ok: true });
}

// ------------------------------------------------------------------------------------------------
// GET /config and GET /admin/stats additions
// ------------------------------------------------------------------------------------------------

export function publicCourses(deps: Deps): Record<CourseProduct, { price: number; open: boolean }> {
  return { pq_essentiel: { price: deps.config.coursePrices.pq_essentiel, open: deps.config.pqSalesOpen } };
}

export interface CourseAdminStatus {
  salesOpen: boolean;
  price: number;
  content: boolean; // the reader would work: manifest, every module, quiz and key load and validate
  version: string | null;
  modules: number;
}

export async function courseAdminStatus(deps: Deps): Promise<CourseAdminStatus> {
  const base = { salesOpen: deps.config.pqSalesOpen, price: deps.config.coursePrices.pq_essentiel };
  try {
    const { manifest } = await loadCourse(deps, "pq_essentiel", { quiet: true });
    return { ...base, content: true, version: manifest.version, modules: manifest.modules.length };
  } catch (err) {
    if (!(err instanceof HttpError)) log.warn("course status unavailable", err instanceof Error ? err.message : "error");
    return { ...base, content: false, version: null, modules: 0 };
  }
}
