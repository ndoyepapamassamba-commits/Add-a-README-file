#!/usr/bin/env node
// Teranga Pro: uploads a private course asset tree to the API (PUT /admin/course-assets/<name>), then checks what the
// database holds (GET /admin/course-assets): same name, same size, same SHA-256 for every file. PUBLIC code: it holds
// no secret and prints none (neither the token nor any file content).
//
//   COURSE_UPLOAD_TOKEN=… node scripts/course-upload.mjs <dir> [--prefix pq_essentiel] [--dry-run]
//   (deno run -A scripts/course-upload.mjs … works too)
//
// <dir> holds the files of ONE folder, e.g. /tmp/…/course/assets/pq_essentiel (manifest.json, modules/, files/, quiz…):
// each file is uploaded as `<prefix>/<path inside dir>`. --prefix is pq_essentiel (default, the folder the course
// reads) or _backup[/…] (copies that are never served to buyers). Files go up files/* first, then modules/*, the
// rest, quiz.json, quiz-key.json and manifest.json LAST (it lists the others). Dotfiles are skipped.
// Environment: COURSE_UPLOAD_TOKEN (required), COURSE_API_BASE (else PUBLIC_API_BASE, else the production `api`
// function). The server accepts the token only while its settings COURSE_UPLOAD_TOKEN_SHA256 (hex SHA-256 of the
// token) and COURSE_UPLOAD_UNTIL (ISO date) allow it; otherwise it answers 404 like an unknown route.
// Behind an HTTPS proxy (this container): NODE_USE_ENV_PROXY=1 node … (Node ≥ 22.21), or deno run -A ….
// Exit code: 0 everything uploaded and verified, 1 an upload or a check failed, 2 wrong usage.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
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

export function isUploadName(name) {
  return NAME_RE.test(name) && !name.includes("..") && !name.includes("//") && !name.endsWith("/");
}

class UsageError extends Error {}

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

function walk(dir, rel, out) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const path = join(dir, name);
    const st = statSync(path);
    const relPath = rel ? `${rel}/${name}` : name;
    if (st.isDirectory()) walk(path, relPath, out);
    else if (st.isFile()) out.push({ rel: relPath, path });
  }
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

/** Every file of `dir` as { name, mime, bytes, size, sha256 }, in upload order. Throws on a name or size the API refuses. */
export function planUpload(dir, prefix = "pq_essentiel") {
  if (!PREFIX_RE.test(prefix) || prefix.includes("..")) throw new UsageError(`--prefix invalide : ${prefix} (pq_essentiel ou _backup[/…])`);
  const root = resolve(dir);
  let st;
  try {
    st = statSync(root);
  } catch {
    throw new UsageError(`dossier introuvable : ${root}`);
  }
  if (!st.isDirectory()) throw new UsageError(`ce n'est pas un dossier : ${root}`);
  const found = [];
  walk(root, "", found);
  if (!found.length) throw new UsageError(`aucun fichier dans ${root}`);
  return found
    .sort((a, b) => rank(a.rel) - rank(b.rel) || (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
    .map(({ rel, path }) => {
      const name = `${prefix}/${rel}`;
      if (!isUploadName(name)) throw new UsageError(`nom refusé par l'API : ${name}`);
      const bytes = readFileSync(path);
      if (bytes.length === 0) throw new UsageError(`fichier vide : ${name}`);
      if (bytes.length > MAX_FILE_BYTES) throw new UsageError(`fichier de plus de 6 Mo : ${name} (${bytes.length} octets)`);
      return { name, mime: mimeFor(name), bytes, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    });
}

const encodeName = (name) => name.split("/").map(encodeURIComponent).join("/");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, init) {
  let last = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status < 500 && res.status !== 429) return res;
      last = `HTTP ${res.status}`;
      await res.body?.cancel();
    } catch (err) {
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

/** Uploads then verifies. Returns { uploaded, verified, problems }. `out` receives the progress lines. */
export async function upload({ dir, prefix = "pq_essentiel", base, token, out = () => {} }) {
  const plan = planUpload(dir, prefix);
  const api = checkBase(base);
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
  return { uploaded, verified: plan.length - problems.length, total: plan.length, problems };
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
  const token = env.COURSE_UPLOAD_TOKEN ?? "";
  if (!token) throw new UsageError("COURSE_UPLOAD_TOKEN manquant (variable d'environnement)");
  console.log(`course-upload : ${plan.length} fichier(s) vers ${base} (manifest.json en dernier)`);
  const r = await upload({ dir: args.dir, prefix: args.prefix, base, token, out: (line) => console.log(line) });
  if (r.problems.length) {
    for (const p of r.problems) console.error(`ÉCART ${p}`);
    console.error(`course-upload : ${r.problems.length} écart(s) sur ${r.total} fichier(s)`);
    return 1;
  }
  console.log(`course-upload : OK, ${r.verified}/${r.total} fichier(s) vérifiés (nom, taille, SHA-256)`);
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
