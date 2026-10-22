// Teranga Pro: upload of the private course assets by the lead (scripts/course-upload.mjs), without the content ever
// going through a chat tool. Two routes, both answering EXACTLY like an unknown route (404 « Ressource introuvable. »)
// unless the upload window is open and the request carries the right token:
//   PUT /admin/course-assets/<name>?mime=<type>   raw body (≤ 6 MB) → creates or replaces tcv.course_assets[name]
//   GET /admin/course-assets[?prefix=…]           → { assets: [{ name, mime, size, sha256, updated_at }] }
//   GET /admin/course-assets?validate=1           → { course: CourseValidation } (the course loaded without memo)
// The window: settings COURSE_UPLOAD_TOKEN_SHA256 (hex sha256 of the token) AND COURSE_UPLOAD_UNTIL (ISO date in the
// future, at most 72 h ahead: a date further away keeps the window CLOSED, so a forgotten window cannot stay open).
// The token travels in the x-upload-token header; it has 32 to 512 characters (`openssl rand -hex 32`) and its
// sha256 is compared in constant time BEFORE any store access, so a wrong token answers as fast as an unknown route:
// its failure is counted without waiting (fire and forget). Too many wrong tokens from one IP close the window for
// that IP for an hour (checked only once the token is right). The token and the bodies are never logged nor echoed.
// Names start with pq_essentiel/ (served to buyers only when the manifest lists them) or _backup/ (never served: the
// course routes read only manifest-listed pq_essentiel/ assets).
import type { CourseAssetInfo, Deps } from "./types.ts";
import { clientIp, errorResponse, HttpError, json, log, readBodyBytes } from "./http.ts";
import { constantTimeEqual, hashIp, sha256Bytes, sha256Hex } from "./ids.ts";
import { ipPepper } from "./order_access.ts";
import { forgetCourseAssets, validateCourseContent } from "./course.ts";

export const UPLOAD_ROUTE_PREFIX = "/admin/course-assets";
export const UPLOAD_TOKEN_HEADER = "x-upload-token";
/** Raw body of one PUT. */
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
/** Wrong tokens (of a valid length) per IP per hour before the IP is refused for the rest of the hour. */
export const UPLOAD_FAILURES_PER_HOUR = 10;
const HOUR_SECONDS = 3600;
/** Shorter tokens are refused outright (and not counted: they can never be right). `openssl rand -hex 32` → 64. */
export const MIN_UPLOAD_TOKEN_LENGTH = 32;
const MAX_TOKEN_LENGTH = 512;
/** COURSE_UPLOAD_UNTIL further ahead than this keeps the window closed. */
export const MAX_UPLOAD_WINDOW_MS = 72 * 3600 * 1000;

export const UPLOAD_NAME_RE = /^(pq_essentiel|_backup)\/[A-Za-z0-9._/-]{1,150}$/;
/** type/subtype with optional parameters: "text/html; charset=utf-8". */
const MIME_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}(?:\s*;\s*[a-z0-9_-]{1,32}=[a-z0-9_.-]{1,40})*$/i;
const PREFIX_RE = /^[A-Za-z0-9._/-]{0,160}$/;

/** pq_essentiel/… or _backup/…, no "..", no empty segment, no trailing slash (the table check, narrowed). */
export function isUploadName(name: string): boolean {
  return UPLOAD_NAME_RE.test(name) && !name.includes("..") && !name.includes("//") && !name.endsWith("/");
}

/** The answer of an unknown route, byte for byte (app.ts fallback). */
export function unknownRoute(): Response {
  return errorResponse(404, "not_found", "Ressource introuvable.");
}

/** Both settings valid and COURSE_UPLOAD_UNTIL in the future, but no more than MAX_UPLOAD_WINDOW_MS ahead. */
export function uploadWindowOpen(deps: Deps): boolean {
  const { courseUploadTokenSha256: sha, courseUploadUntil: until } = deps.config;
  if (sha === null || until === null) return false;
  const left = until - deps.now().getTime();
  return left > 0 && left <= MAX_UPLOAD_WINDOW_MS;
}

/** End of the open upload window (ISO), or null when it is closed: shown on the admin page. */
export function uploadWindowUntil(deps: Deps): string | null {
  return uploadWindowOpen(deps) ? new Date(deps.config.courseUploadUntil as number).toISOString() : null;
}

/**
 * Lets `task` finish after the response without delaying it (EdgeRuntime.waitUntil keeps the Edge isolate alive
 * for it). Its failure is logged without detail.
 */
function inBackground(task: Promise<unknown>): void {
  const settled = task.catch((err) => log.warn("course upload: failure counter not updated", err instanceof Error ? err.name : "error"));
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  try {
    runtime?.waitUntil?.(settled);
  } catch {
    // Outside Supabase (tests, dev.ts) the promise simply runs on.
  }
}

/**
 * true when the request may upload; every refusal looks like an unknown route to the caller. A wrong token costs
 * one sha256 and one HMAC (no store round trip is awaited), a missing or short one nothing at all: a scanner cannot
 * tell an open window from a closed one, nor from an unknown route.
 */
async function authorized(deps: Deps, req: Request): Promise<boolean> {
  if (!uploadWindowOpen(deps)) return false;
  const token = req.headers.get(UPLOAD_TOKEN_HEADER) ?? "";
  if (token.length < MIN_UPLOAD_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) return false;
  const ok = constantTimeEqual(await sha256Hex(token), deps.config.courseUploadTokenSha256 as string);
  const nowIso = deps.now().toISOString();
  const failKey = `upload-fail:${await hashIp(clientIp(req), ipPepper(deps))}`;
  if (!ok) {
    inBackground(deps.store.hitRateLimit(failKey, HOUR_SECONDS, UPLOAD_FAILURES_PER_HOUR, nowIso));
    return false;
  }
  // The right token from an IP that sent too many wrong ones this hour is refused too.
  return (await deps.store.peekRateLimit(failKey, HOUR_SECONDS, nowIso)) < UPLOAD_FAILURES_PER_HOUR;
}

/** The asset name as sent, from the raw path (routePath() would drop a trailing slash). */
function rawName(req: Request): string | null {
  const path = new URL(req.url).pathname;
  const at = path.indexOf(UPLOAD_ROUTE_PREFIX + "/");
  if (at < 0) return null;
  try {
    return decodeURIComponent(path.slice(at + UPLOAD_ROUTE_PREFIX.length + 1));
  } catch {
    return null;
  }
}

const invalid = (field: string, message: string) =>
  new HttpError(400, "validation", "Certains champs sont à corriger.", { [field]: message });

/** PUT /admin/course-assets/<name>?mime=… */
export async function putCourseAssetRoute(deps: Deps, req: Request): Promise<Response> {
  if (!(await authorized(deps, req))) return unknownRoute();
  const name = rawName(req);
  if (name === null || !isUploadName(name)) {
    throw invalid("name", "Nom invalide : pq_essentiel/… ou _backup/…, sans « .. », ni « // », ni « / » final.");
  }
  const mime = (new URL(req.url).searchParams.get("mime") ?? "").trim();
  if (mime.length < 3 || mime.length > 120 || !MIME_RE.test(mime)) throw invalid("mime", "Type MIME invalide (paramètre mime=…).");
  const bytes = await readBodyBytes(req, MAX_UPLOAD_BYTES);
  if (bytes.length === 0) throw invalid("body", "Fichier vide.");
  const sha256 = await sha256Bytes(bytes);
  let stored: CourseAssetInfo;
  try {
    stored = await deps.store.uploadCourseAsset(name, mime, bytes);
  } catch (err) {
    log.error(`course upload ${name} failed`, err instanceof Error ? err.message.slice(0, 160) : "error");
    throw new HttpError(502, "upload_failed", "Le fichier n'a pas pu être enregistré. Réessayez.");
  }
  // Read back what the database now holds: same digest and size, or the upload is reported as failed.
  const listed = (await deps.store.listCourseAssets(name)).find((a) => a.name === name);
  if (!listed || listed.sha256 !== sha256 || listed.size !== bytes.length || stored.sha256 !== sha256) {
    log.error(`course upload ${name}: verification failed after commit`);
    throw new HttpError(502, "upload_mismatch", "La vérification du fichier enregistré a échoué. Réessayez.");
  }
  // This instance reads the new content at once (dev.ts keeps one Deps for its whole life); the other Edge
  // instances within their settings period (≤ 60 s).
  forgetCourseAssets(deps);
  return json(200, { ok: true, asset: listed });
}

/** GET /admin/course-assets[?prefix=…], or ?validate=1: the course as a buyer would load it, read afresh. */
export async function listCourseAssetsRoute(deps: Deps, req: Request): Promise<Response> {
  if (!(await authorized(deps, req))) return unknownRoute();
  const params = new URL(req.url).searchParams;
  if (params.get("validate") === "1") return json(200, { course: await validateCourseContent(deps, "pq_essentiel") });
  const prefix = params.get("prefix") ?? "";
  if (!PREFIX_RE.test(prefix)) throw invalid("prefix", "Préfixe invalide.");
  return json(200, { assets: await deps.store.listCourseAssets(prefix) });
}
