#!/usr/bin/env node
// Teranga Pro: turns a course asset tree into plain SQL statements for the Supabase MCP `execute_sql` tool
// (tcv_course_put_asset / tcv_course_upload_chunk + tcv_course_upload_commit, see 20261021000006_course.sql).
//
//   node scripts/course-sql.mjs <assetsRoot> <outDir>        (deno run -A scripts/course-sql.mjs … works too)
//
// <assetsRoot> holds `<product>/…` (e.g. pq_essentiel/manifest.json). <outDir> must be OUTSIDE this repository:
// the statements carry the (private) course content in base64. Output: NNNN-<slug>.sql (one statement per file,
// ≤ 200 000 bytes, files/* then modules/* then the quiz, its key and the manifest LAST), verify.sql and
// expected.json ([{ name, size, sha256 }]). PUBLIC code: it never embeds nor prints any content.
// Dependencies: node:fs, node:path, node:crypto, node:url only.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Raw bytes per statement: base64 of 140 000 bytes is 186 668 characters, the SQL around it a few hundred. */
export const CHUNK_BYTES = 140_000;
export const MAX_STATEMENT_BYTES = 200_000;

/** MIME by extension — the same table as supabase/functions/api/dev_course.ts (SPEC_COURSE §7.1). */
export const MIME_TYPES = {
  json: "application/json",
  html: "text/html; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  pdf: "application/pdf",
};

export function mimeFor(name) {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

/** Same check as tcv.course_assets.name. */
const ASSET_NAME_RE = /^[a-z0-9_]+\/[a-z0-9][a-z0-9._/-]{0,150}$/;
const PRODUCT_DIR_RE = /^[a-z0-9_]+$/;
const OWN_OUTPUT_RE = /^(\d{4}-[a-z0-9-]+\.sql|verify\.sql|expected\.json)$/;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Realpath of `p`, even when its last segments do not exist yet (resolved from the deepest existing parent). */
function realpathLoose(p) {
  let current = resolve(p);
  const rest = [];
  while (!existsSync(current)) {
    rest.unshift(basename(current));
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return join(realpathSync(current), ...rest);
}

/** True when `child` is `parent` or below it. A folder named « ..out » inside `parent` is inside (only a first
 * segment equal to « .. » leaves it). */
export function isInside(child, parent) {
  const rel = relative(parent, child);
  return rel === "" || !(rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel));
}

function walk(dir, rel, out) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const path = join(dir, name);
    const st = statSync(path);
    const assetName = `${rel}/${name}`;
    if (st.isDirectory()) walk(path, assetName, out);
    else if (st.isFile()) out.push({ name: assetName, path });
  }
}

/** Every file under assetsRoot/<product>/ (dotfiles and root-level files skipped), with its bytes and digest. */
export function listAssets(assetsRoot) {
  const root = resolve(assetsRoot);
  const found = [];
  for (const product of readdirSync(root).sort()) {
    if (!PRODUCT_DIR_RE.test(product) || !statSync(join(root, product)).isDirectory()) continue;
    walk(join(root, product), product, found);
  }
  return found.map(({ name, path }) => {
    if (!ASSET_NAME_RE.test(name) || name.includes("..")) throw new Error(`invalid asset name: ${name}`);
    const bytes = readFileSync(path);
    return { name, mime: mimeFor(name), bytes, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
}

/** files/* first, then modules/*, anything else, the quiz, its key, and the manifest last (it lists the others). */
function rank(name) {
  const path = name.slice(name.indexOf("/") + 1);
  if (path.startsWith("files/")) return 0;
  if (path.startsWith("modules/")) return 1;
  if (path === "quiz.json") return 3;
  if (path === "quiz-key.json") return 4;
  if (path === "manifest.json") return 5;
  return 2;
}

export function orderAssets(assets) {
  return [...assets].sort((a, b) => rank(a.name) - rank(b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function uploadIdFor(name, sha256) {
  return `${name.replace(/[^a-z0-9]+/g, "-").slice(0, 87)}-${sha256.slice(0, 12)}`;
}

/** The statements for one asset: one put (≤ CHUNK_BYTES) or chunks + commit. */
export function statementsFor(asset) {
  const base = slug(asset.name);
  if (asset.size <= CHUNK_BYTES) {
    const b64 = asset.bytes.toString("base64");
    return [{
      slug: base,
      sql: `select public.tcv_course_put_asset(${lit(asset.name)}, ${lit(asset.mime)}, ${lit(b64)}, ${lit(asset.sha256)});\n`,
    }];
  }
  const uploadId = uploadIdFor(asset.name, asset.sha256);
  const out = [];
  let seq = 0;
  for (let offset = 0; offset < asset.size; offset += CHUNK_BYTES, seq++) {
    const b64 = asset.bytes.subarray(offset, offset + CHUNK_BYTES).toString("base64");
    out.push({
      slug: `${base}-part-${String(seq).padStart(3, "0")}`,
      sql: `select public.tcv_course_upload_chunk(${lit(uploadId)}, ${seq}, ${lit(b64)});\n`,
    });
  }
  out.push({
    slug: `${base}-commit`,
    sql: `select public.tcv_course_upload_commit(${lit(uploadId)}, ${lit(asset.name)}, ${lit(asset.mime)}, ` +
      `${lit(asset.sha256)}, ${seq});\n`,
  });
  return out;
}

export function main(argv) {
  const [assetsRoot, outDir] = argv;
  if (!assetsRoot || !outDir) throw new Error("usage: node scripts/course-sql.mjs <assetsRoot> <outDir>");
  const out = realpathLoose(outDir);
  if (isInside(out, realpathSync(REPO_ROOT))) {
    throw new Error(`refusing to write into the repository (${out}): the statements carry private course content`);
  }
  if (existsSync(out)) {
    const others = readdirSync(out).filter((f) => !OWN_OUTPUT_RE.test(f));
    if (others.length) throw new Error(`${out} is not empty and holds other files: ${others.slice(0, 3).join(", ")}`);
    for (const f of readdirSync(out)) unlinkSync(join(out, f)); // a previous run of this script
  } else mkdirSync(out, { recursive: true });

  const assets = orderAssets(listAssets(assetsRoot));
  if (!assets.length) throw new Error(`no asset found under ${resolve(assetsRoot)}/<product>/`);
  let n = 0;
  let total = 0;
  for (const asset of assets) {
    for (const st of statementsFor(asset)) {
      const bytes = new TextEncoder().encode(st.sql).length;
      if (bytes > MAX_STATEMENT_BYTES) throw new Error(`statement for ${asset.name} is ${bytes} bytes`);
      n += 1;
      total += bytes;
      writeFileSync(join(out, `${String(n).padStart(4, "0")}-${st.slug.slice(0, 120)}.sql`), st.sql);
    }
  }
  const products = [...new Set(assets.map((a) => a.name.slice(0, a.name.indexOf("/"))))];
  writeFileSync(join(out, "verify.sql"), products.map((p) => `select public.tcv_course_asset_list(${lit(p + "/")});\n`).join(""));
  const expected = [...assets].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((a) => ({ name: a.name, size: a.size, sha256: a.sha256 }));
  writeFileSync(join(out, "expected.json"), JSON.stringify(expected, null, 2) + "\n");
  return { assets: assets.length, statements: n, bytes: total, outDir: out };
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
  try {
    const r = main(proc.argv.slice(2));
    console.log(`course-sql: ${r.assets} asset(s) → ${r.statements} statement(s), ${r.bytes} bytes in ${r.outDir}`);
    console.log("Run every NNNN-*.sql in order, then verify.sql, and compare with expected.json.");
  } catch (err) {
    console.error(`course-sql: ${err instanceof Error ? err.message : err}`);
    proc.exitCode = 1;
  }
}
