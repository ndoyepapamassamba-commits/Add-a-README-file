#!/usr/bin/env node
// Teranga Pro: uploads a private course asset tree to the API (PUT /admin/course-assets/<name>), checks what the
// database holds (GET /admin/course-assets): same name, same size, same SHA-256 for every file, then asks the server
// to load the course exactly as a buyer would (GET /admin/course-assets?validate=1). PUBLIC code: it holds no secret
// and prints none (neither the token nor any file content).
//
//   COURSE_UPLOAD_TOKEN=… node scripts/course-upload.mjs <dir> [--prefix pq_essentiel] [--dry-run]
//   (deno run -A scripts/course-upload.mjs … works too)
//
// <dir> holds the files of ONE folder, e.g. /tmp/…/course/assets/pq_essentiel (manifest.json, modules/, files/, quiz…):
// each file is uploaded as `<prefix>/<path inside dir>`. --prefix is pq_essentiel (default, the folder the course
// reads) or _backup[/…] (copies that are never served to buyers). With pq_essentiel, <dir> must hold manifest.json,
// every file the manifest names, and no nested pq_essentiel/ folder (the parent folder given by mistake). Symbolic
// links are refused. Files go up files/* first, then modules/*, the rest, quiz.json, quiz-key.json and manifest.json
// LAST (it lists the others). Dotfiles are skipped.
// Environment: COURSE_UPLOAD_TOKEN (required, 32 characters at least: `openssl rand -hex 32`), COURSE_API_BASE (else
// PUBLIC_API_BASE, else the production `api` function). The server accepts the token only while its settings
// COURSE_UPLOAD_TOKEN_SHA256 (hex SHA-256 of the token) and COURSE_UPLOAD_UNTIL (ISO date, at most 72 h ahead) allow
// it; otherwise it answers 404 like an unknown route. Redirects are never followed (the token and the files would
// go to another address): a 3xx answer stops the run.
// Behind an HTTPS proxy (this container): NODE_USE_ENV_PROXY=1 node … (Node ≥ 22.21), or deno run -A ….
// Exit code: 0 everything uploaded, verified and (pq_essentiel) the course loads; 1 an upload, a check or the course
// validation failed; 2 wrong usage.
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mimeFor } from "./course-sql.mjs";

export const DEFAULT_API_BASE = "https://seegnylaubuularegmku.supabase.co/functions/v1/api";
/** The route's limit (MAX_UPLOAD_BYTES in supabase/functions/api/lib/course_upload.ts). */
export const MAX_FILE_BYTES = 6 * 1024 * 1024;
/** Same rule as isUploadName (course_upload.ts). */
export const NAME_RE = /^(pq_essentiel|_backup)\/[A-Za-z0-9._/-]{1,150}$/;
const PREFIX_RE = /^(pq_essentiel|_backup)(\/[A-Za-z0-9._-]+)*$/;
const ATTEMPTS = 3;
const TIMEOUT_MS = 120_000;
/** Same minimum as the server (MIN_UPLOAD_TOKEN_LENGTH in course_upload.ts): `openssl rand -hex 32` gives 64. */
export const MIN_TOKEN_LENGTH = 32;
/** The folder the course reads: an upload there must be a whole, consistent course tree. */
const COURSE_PREFIX = "pq_essentiel";

export function isUploadName(name) {
  return NAME_RE.test(name) && !name.includes("..") && !name.includes("//") && !name.endsWith("/");
}

class UsageError extends Error {}
class RedirectError extends Error {
  constructor() {
    super("l'adresse de l'API répond par une redirection : rien n'est envoyé ailleurs, vérifiez COURSE_API_BASE");
  }
}

/** https://…, or http:// on this machine only (the token never travels in clear over a network). */
export function checkBase(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new UsageError(`API base invalide : ${raw}`);
  }
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) throw new UsageError("l'adresse de l'API doit commencer par https:// (http:// seulement sur cette machine)");
  if (url.search || url.hash || url.username || url.password) throw new UsageError("l'adresse de l'API ne doit contenir ni ?…, ni #…, ni identifiants");
  return url.origin + url.pathname.replace(/\/+$/, "");
}

/** Regular files under `dir` (dotfiles skipped). A symbolic link anywhere is refused: it could point outside. */
function walk(dir, rel, out, dirs) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const path = join(dir, name);
    const st = lstatSync(path);
    const relPath = rel ? `${rel}/${name}` : name;
    if (st.isSymbolicLink()) throw new UsageError(`lien symbolique refusé : ${relPath}`);
    if (st.isDirectory()) {
      dirs.push(relPath);
      walk(path, relPath, out, dirs);
    } else if (st.isFile()) out.push({ rel: relPath, path });
  }
}

/** Every asset name a course manifest refers to (modules, quiz, its key, downloads); null when it is not readable. */
function manifestRefs(bytes) {
  let m;
  try {
    m = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const refs = [];
  for (const mod of Array.isArray(m.modules) ? m.modules : []) refs.push(mod?.html);
  refs.push(m.quiz?.questions, m.quiz?.key);
  for (const f of Array.isArray(m.files) ? m.files : []) refs.push(f?.asset);
  return refs.filter((r) => typeof r === "string");
}

/** files/ first, then modules/, the rest, quiz.json, quiz-key.json, and manifest.json last. */
function rank(rel) {
  if (rel.startsWith("files/")) return 0;
  if (rel.startsWith("modules/")) return 1;
  if (rel === "quiz.json") return 3;
  if (rel === "quiz-key.json") return 4;
  if (rel === "manifest.json") return 5;
  return 2;
}

/**
 * Every file of `dir` as { name, mime, bytes, size, sha256 }, in upload order. Throws on a name or size the API
 * refuses, on a symbolic link, and, for the course folder, on a tree that is not a whole course (no manifest.json,
 * a nested pq_essentiel/ folder, or a file the manifest names that is not there).
 */
export function planUpload(dir, prefix = COURSE_PREFIX) {
  if (!PREFIX_RE.test(prefix) || prefix.includes("..")) throw new UsageError(`--prefix invalide : ${prefix} (pq_essentiel ou _backup[/…])`);
  let root;
  try {
    root = realpathSync(resolve(dir));
  } catch {
    throw new UsageError(`dossier introuvable : ${resolve(dir)}`);
  }
  if (!lstatSync(root).isDirectory()) throw new UsageError(`ce n'est pas un dossier : ${root}`);
  const found = [];
  const dirs = [];
  walk(root, "", found, dirs);
  if (!found.length) throw new UsageError(`aucun fichier dans ${root}`);
  const plan = found
    .sort((a, b) => rank(a.rel) - rank(b.rel) || (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
    .map(({ rel, path }) => {
      const name = `${prefix}/${rel}`;
      if (!isUploadName(name)) throw new UsageError(`nom refusé par l'API : ${name}`);
      const bytes = readFileSync(path);
      if (bytes.length === 0) throw new UsageError(`fichier vide : ${name}`);
      if (bytes.length > MAX_FILE_BYTES) throw new UsageError(`fichier de plus de 6 Mo : ${name} (${bytes.length} octets)`);
      return { name, mime: mimeFor(name), bytes, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    });
  if (prefix === COURSE_PREFIX) checkCourseTree(root, plan, dirs);
  return plan;
}

/** The course folder itself (not its parent), with a manifest whose every file is part of the upload. */
function checkCourseTree(root, plan, dirs) {
  const nested = dirs.find((d) => d.split("/").includes(COURSE_PREFIX));
  if (nested) {
    throw new UsageError(`dossier ${nested}/ dans ${root} : donnez le dossier pq_essentiel lui-même (celui qui contient manifest.json)`);
  }
  const manifest = plan.find((a) => a.name === `${COURSE_PREFIX}/manifest.json`);
  if (!manifest) throw new UsageError(`manifest.json absent de ${root} : donnez le dossier pq_essentiel lui-même`);
  const refs = manifestRefs(manifest.bytes);
  if (refs === null) throw new UsageError("manifest.json n'est pas un JSON lisible");
  const names = new Set(plan.map((a) => a.name));
  const absent = refs.filter((r) => !names.has(r));
  if (absent.length) throw new UsageError(`manifest.json cite ${absent.length} fichier(s) absent(s) du dossier, par exemple ${absent[0]}`);
}

const encodeName = (name) => name.split("/").map(encodeURIComponent).join("/");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch with redirect "error" fails on any 3xx (Node: cause « unexpected redirect », Deno: « …redirect… »). */
function isRedirectError(err) {
  const texts = [err?.message, err?.cause?.message, typeof err?.cause === "string" ? err.cause : ""];
  return texts.some((t) => typeof t === "string" && /redirect/i.test(t));
}

/**
 * One request, retried on network errors, 5xx and 429. Never follows a redirect (redirect: "error"): the token and
 * the file would travel to the Location's origin, even from https to plain http. A redirect stops the run at once.
 */
async function request(url, init) {
  let last = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel();
        throw new RedirectError();
      }
      if (res.status < 500 && res.status !== 429) return res;
      last = `HTTP ${res.status}`;
      await res.body?.cancel();
    } catch (err) {
      if (err instanceof RedirectError || isRedirectError(err)) throw new RedirectError();
      last = err instanceof Error ? err.name : "erreur réseau";
    }
    if (attempt < ATTEMPTS) await sleep(1000 * attempt);
  }
  throw new Error(`échec après ${ATTEMPTS} essais (${last})`);
}

async function errorText(res) {
  try {
    const body = await res.json();
    return `${res.status} ${body.error ?? ""} ${body.message ?? ""}`.trim();
  } catch {
    return `HTTP ${res.status}`;
  }
}

const CLOSED =
  "le serveur répond « introuvable » : fenêtre d'envoi fermée (COURSE_UPLOAD_TOKEN_SHA256 / COURSE_UPLOAD_UNTIL), " +
  "jeton différent, ou trop d'essais ratés depuis cette adresse (attendre une heure).";

export function checkToken(token) {
  if (typeof token !== "string" || !token) throw new UsageError("COURSE_UPLOAD_TOKEN manquant (variable d'environnement)");
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new UsageError(`COURSE_UPLOAD_TOKEN trop court (${MIN_TOKEN_LENGTH} caractères au moins ; à créer avec : openssl rand -hex 32)`);
  }
  return token;
}

/**
 * Uploads, verifies the listing, then (course folder only) asks the server to load the course without its memo.
 * Returns { uploaded, verified, total, problems, course } (course: the server's validation, null for _backup/…).
 * `out` receives the progress lines.
 */
export async function upload({ dir, prefix = COURSE_PREFIX, base, token, out = () => {} }) {
  const plan = planUpload(dir, prefix);
  const api = checkBase(base);
  checkToken(token);
  const headers = { "x-upload-token": token, "content-type": "application/octet-stream" };
  let uploaded = 0;
  for (const a of plan) {
    const res = await request(`${api}/admin/course-assets/${encodeName(a.name)}?mime=${encodeURIComponent(a.mime)}`, {
      method: "PUT",
      headers,
      body: a.bytes,
    });
    if (res.status === 404) {
      await res.body?.cancel();
      throw new Error(`${a.name} : ${CLOSED}`);
    }
    if (res.status !== 200) throw new Error(`${a.name} : refusé (${await errorText(res)})`);
    const body = await res.json();
    if (body?.asset?.sha256 !== a.sha256 || body?.asset?.size !== a.size) throw new Error(`${a.name} : le serveur annonce une autre empreinte`);
    uploaded += 1;
    out(`  envoyé ${a.name} (${a.size} octets)`);
  }
  const res = await request(`${api}/admin/course-assets?prefix=${encodeURIComponent(prefix + "/")}`, { headers: { "x-upload-token": token } });
  if (res.status === 404) {
    await res.body?.cancel();
    throw new Error(`vérification impossible : ${CLOSED}`);
  }
  if (res.status !== 200) throw new Error(`vérification impossible (${await errorText(res)})`);
  const listed = new Map(((await res.json()).assets ?? []).map((x) => [x.name, x]));
  const problems = [];
  for (const a of plan) {
    const got = listed.get(a.name);
    if (!got) problems.push(`${a.name} : absent de la base`);
    else if (got.sha256 !== a.sha256 || got.size !== a.size) problems.push(`${a.name} : empreinte ou taille différente dans la base`);
    else if (got.mime !== a.mime) problems.push(`${a.name} : type ${got.mime} au lieu de ${a.mime}`);
  }
  const course = prefix === COURSE_PREFIX && !problems.length ? await validateCourse(api, token) : null;
  return { uploaded, verified: plan.length - problems.length, total: plan.length, problems, course };
}

/** GET /admin/course-assets?validate=1: { valid, problem, version, modules, files, questions } as the server sees it. */
async function validateCourse(api, token) {
  const res = await request(`${api}/admin/course-assets?validate=1`, { headers: { "x-upload-token": token } });
  if (res.status === 404) {
    await res.body?.cancel();
    throw new Error(`validation impossible : ${CLOSED}`);
  }
  if (res.status !== 200) throw new Error(`validation impossible (${await errorText(res)})`);
  const course = (await res.json())?.course;
  if (!course || typeof course.valid !== "boolean") throw new Error("validation impossible (réponse inattendue du serveur)");
  return course;
}

function parseArgs(argv) {
  const args = { dir: null, prefix: "pq_essentiel", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--prefix") args.prefix = argv[++i] ?? "";
    else if (a.startsWith("--prefix=")) args.prefix = a.slice("--prefix=".length);
    else if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--")) throw new UsageError(`option inconnue : ${a}`);
    else if (args.dir === null) args.dir = a;
    else throw new UsageError(`argument en trop : ${a}`);
  }
  if (!args.dir) throw new UsageError("usage : COURSE_UPLOAD_TOKEN=… node scripts/course-upload.mjs <dossier> [--prefix pq_essentiel|_backup/…] [--dry-run]");
  return args;
}

export async function main(argv, env) {
  const args = parseArgs(argv);
  const plan = planUpload(args.dir, args.prefix);
  const base = checkBase(env.COURSE_API_BASE || env.PUBLIC_API_BASE || DEFAULT_API_BASE);
  if (args.dryRun) {
    console.log(`course-upload (essai à blanc) : ${plan.length} fichier(s) vers ${base}`);
    for (const a of plan) console.log(`  ${a.name}  ${a.mime}  ${a.size} octets  ${a.sha256}`);
    return 0;
  }
  const token = checkToken(env.COURSE_UPLOAD_TOKEN ?? "");
  console.log(`course-upload : ${plan.length} fichier(s) vers ${base} (manifest.json en dernier)`);
  const r = await upload({ dir: args.dir, prefix: args.prefix, base, token, out: (line) => console.log(line) });
  if (r.problems.length) {
    for (const p of r.problems) console.error(`ÉCART ${p}`);
    console.error(`course-upload : ${r.problems.length} écart(s) sur ${r.total} fichier(s)`);
    return 1;
  }
  if (r.course && !r.course.valid) {
    console.error(`ÉCHEC le cours ne se charge pas : ${r.course.problem ?? "contenu invalide"}`);
    console.error(`course-upload : ${r.verified}/${r.total} fichier(s) reçus, mais le cours est invalide ; corrigez le dossier et relancez l'envoi (PQ_SALES_OPEN reste à false d'ici là)`);
    return 1;
  }
  const course = r.course
    ? `, cours valide (version ${r.course.version}, ${r.course.modules} modules, ${r.course.files} fichiers, ${r.course.questions} questions)`
    : "";
  console.log(`course-upload : OK, ${r.verified}/${r.total} fichier(s) vérifiés (nom, taille, SHA-256)${course}`);
  return 0;
}

/** Run as a script (node or deno), not when imported (the tests import the helpers above). */
function isMain() {
  if (typeof import.meta.main === "boolean") return import.meta.main; // Deno
  const entry = globalThis.process?.argv?.[1];
  try {
    return !!entry && realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const proc = globalThis.process;
  main(proc.argv.slice(2), proc.env).then(
    (code) => {
      proc.exitCode = code;
    },
    (err) => {
      console.error(`course-upload : ${err instanceof Error ? err.message : "erreur"}`);
      proc.exitCode = err instanceof UsageError ? 2 : 1;
    },
  );
}
