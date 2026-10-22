// Local course content for dev.ts and the tests: reads an asset tree `<root>/<product>/**` (the layout of
// tcv.course_assets names) into memory. NOT imported by app.ts, so it is never bundled into the Edge Function.
// Default content is the PUBLIC lorem fixture; the private course is only ever read from COURSE_ASSETS_DIR.

/** The lorem fixture (no course content): supabase/functions/api/tests/fixtures/course/. */
export const COURSE_FIXTURE_DIR = decodeURIComponent(new URL("./tests/fixtures/course/", import.meta.url).pathname)
  .replace(/\/$/, "");

/** MIME by extension (SPEC_COURSE §7.1). scripts/course-sql.mjs carries the same table. */
export const COURSE_MIME_TYPES: Readonly<Record<string, string>> = {
  json: "application/json",
  html: "text/html; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  pdf: "application/pdf",
};

export function courseMimeFor(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return COURSE_MIME_TYPES[ext] ?? "application/octet-stream";
}

const PRODUCT_DIR_RE = /^[a-z0-9_]+$/;

export interface LocalCourseAsset {
  name: string; // "pq_essentiel/modules/module-01.html" (posix path relative to the root)
  mime: string;
  bytes: Uint8Array;
}

async function walk(dir: string, rel: string, out: LocalCourseAsset[]): Promise<void> {
  const entries: Deno.DirEntry[] = [];
  for await (const e of Deno.readDir(dir)) entries.push(e);
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const path = `${dir}/${e.name}`;
    const name = `${rel}/${e.name}`;
    if (e.isDirectory) await walk(path, name, out);
    else if (e.isFile) out.push({ name, mime: courseMimeFor(e.name), bytes: await Deno.readFile(path) });
  }
}

/**
 * Every file under `root/<product>/` (product folders /^[a-z0-9_]+$/), sorted by name. Dotfiles and anything at
 * the root itself (README.md, the fixture generator…) are skipped.
 */
export async function loadCourseAssetDir(root: string): Promise<LocalCourseAsset[]> {
  const base = root.replace(/\/+$/, "");
  const out: LocalCourseAsset[] = [];
  const products: string[] = [];
  for await (const e of Deno.readDir(base)) if (e.isDirectory && PRODUCT_DIR_RE.test(e.name)) products.push(e.name);
  for (const product of products.sort()) await walk(`${base}/${product}`, product, out);
  return out;
}
