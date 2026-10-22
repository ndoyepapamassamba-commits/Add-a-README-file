// scripts/course-sql.mjs: the upload statements for the Supabase MCP `execute_sql` tool, run here on PGlite.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { COURSE_FIXTURE_DIR, COURSE_MIME_TYPES, courseMimeFor } from "../dev_course.ts";
import { sha256Bytes } from "../lib/ids.ts";
import { openTestDb, sqlStore } from "./fixtures/backend_pglite.ts";
import type { TestDb } from "./fixtures/backend_pglite.ts";
import { fixtureAssets } from "./fixtures/course_harness.ts";
import { CHUNK_BYTES, isInside, MAX_STATEMENT_BYTES, MIME_TYPES, mimeFor, uploadIdFor } from "../../../../scripts/course-sql.mjs";

const SCRIPT = decodeURIComponent(new URL("../../../../scripts/course-sql.mjs", import.meta.url).pathname);
const REPO = decodeURIComponent(new URL("../../../../", import.meta.url).pathname);
const db: TestDb = await openTestDb();

async function run(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const out = await new Deno.Command(cmd, { args, stdout: "piped", stderr: "piped" }).output();
  const dec = new TextDecoder();
  return { code: out.code, stdout: dec.decode(out.stdout), stderr: dec.decode(out.stderr) };
}

const runScript = (assetsRoot: string, outDir: string) => run(Deno.execPath(), ["run", "-A", SCRIPT, assetsRoot, outDir]);

async function statements(dir: string): Promise<string[]> {
  const names: string[] = [];
  for await (const e of Deno.readDir(dir)) if (/^\d{4}-.*\.sql$/.test(e.name)) names.push(e.name);
  return names.sort();
}

async function execAll(dir: string): Promise<void> {
  for (const name of await statements(dir)) await db.db.exec(await Deno.readTextFile(`${dir}/${name}`));
}

async function listed(dir: string): Promise<Array<{ name: string; size: number; sha256: string; mime: string }>> {
  const verify = await Deno.readTextFile(`${dir}/verify.sql`);
  const res = await db.db.query<{ r: Array<{ name: string; size: number; sha256: string; mime: string }> }>(
    verify.trim().replace(/;$/, "").replace(/^select /, "select ") + " as r",
  );
  return res.rows[0].r;
}

Deno.test("course-sql.mjs: the MIME table is the one of dev_course.ts", () => {
  assertEquals(MIME_TYPES, COURSE_MIME_TYPES);
  for (const n of ["a.json", "a.html", "a.xlsx", "a.zip", "a.csv", "a.txt", "a.pdf", "a.bin", "noext"]) assertEquals(mimeFor(n), courseMimeFor(n), n);
  assertEquals([CHUNK_BYTES, MAX_STATEMENT_BYTES], [140_000, 200_000]);
  const long = uploadIdFor(`pq_essentiel/files/${"x".repeat(140)}.zip`, "a".repeat(64));
  assert(long.length <= 100 && /^[A-Za-z0-9_.-]{8,100}$/.test(long), long);
});

Deno.test({
  name: "course-sql.mjs: fixture → statements (≤ 200 000 bytes, manifest last) → PGlite → same list as expected.json",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await db.reset();
    const out = await Deno.makeTempDir({ prefix: "tcv-course-sql-" });
    const r = await runScript(COURSE_FIXTURE_DIR, `${out}/upload`);
    assertEquals(r.code, 0, r.stderr);
    assertMatch(r.stdout, /7 asset\(s\) → 7 statement\(s\)/);
    const files = await statements(`${out}/upload`);
    assertEquals(files.length, 7);
    assertMatch(files.at(-1)!, /^0007-pq-essentiel-manifest-json\.sql$/, "manifest last");
    assertMatch(files[0], /-files-/, "files first");
    const order = files.map((f) => f.replace(/^\d{4}-pq-essentiel-/, "").replace(/\.sql$/, ""));
    assertEquals(order, ["files-donnees-module-1-zip", "files-module-1-xlsx", "modules-module-01-html", "modules-module-02-html", "quiz-json", "quiz-key-json", "manifest-json"]);
    for (const f of files) {
      const sql = await Deno.readTextFile(`${out}/upload/${f}`);
      assert(new TextEncoder().encode(sql).length <= 200_000, f);
      assertEquals(sql.trim().split("\n").length, 1, `${f}: one statement`);
      assertMatch(sql, /^select public\.tcv_course_put_asset\('pq_essentiel\/[a-z0-9_./-]+', '[^']+', '[A-Za-z0-9+/=]+', '[0-9a-f]{64}'\);\n$/);
    }
    await execAll(`${out}/upload`);
    const expected = JSON.parse(await Deno.readTextFile(`${out}/upload/expected.json`));
    const got = await listed(`${out}/upload`);
    const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : 1);
    assertEquals(got.map(({ name, size, sha256 }) => ({ name, size, sha256 })).sort(byName), [...expected].sort(byName));
    for (const a of await fixtureAssets()) {
      const row = got.find((x) => x.name === a.name)!;
      assertEquals([row.mime, row.sha256], [a.mime, await sha256Bytes(a.bytes)], a.name);
      assertEquals((await sqlStore(db).getCourseAsset(a.name))?.bytes, a.bytes, a.name);
    }
    // A second run into the same folder replaces its own previous output.
    assertEquals((await runScript(COURSE_FIXTURE_DIR, `${out}/upload`)).code, 0);
    assertEquals((await statements(`${out}/upload`)).length, 7);
    await Deno.remove(out, { recursive: true });
  },
});

Deno.test({
  name: "course-sql.mjs: an asset above 140 000 bytes goes in chunks then a commit, all executed on PGlite",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await db.reset();
    const root = await Deno.makeTempDir({ prefix: "tcv-course-assets-" });
    await Deno.mkdir(`${root}/pq_essentiel/files`, { recursive: true });
    // Incompressible-looking bytes from a fixed LCG (getRandomValues gives at most 65 536 bytes per call).
    const big = new Uint8Array(300_001);
    for (let i = 0, x = 12345; i < big.length; i++) big[i] = (x = (x * 1103515245 + 12345) >>> 0) >>> 24;
    await Deno.writeFile(`${root}/pq_essentiel/files/gros-fichier.zip`, big);
    await Deno.writeTextFile(`${root}/pq_essentiel/manifest.json`, '{"schema":1}');
    await Deno.writeTextFile(`${root}/README.md`, "root files are skipped");
    await Deno.writeTextFile(`${root}/pq_essentiel/.DS_Store`, "dotfiles are skipped");
    const out = `${root}-out`;
    const r = await runScript(root, out);
    assertEquals(r.code, 0, r.stderr);
    const files = await statements(out);
    assertEquals(files.map((f) => f.replace(/^\d{4}-/, "")), [
      "pq-essentiel-files-gros-fichier-zip-part-000.sql",
      "pq-essentiel-files-gros-fichier-zip-part-001.sql",
      "pq-essentiel-files-gros-fichier-zip-part-002.sql",
      "pq-essentiel-files-gros-fichier-zip-commit.sql",
      "pq-essentiel-manifest-json.sql",
    ]);
    for (const f of files) assert((await Deno.stat(`${out}/${f}`)).size <= 200_000, f);
    const commit = await Deno.readTextFile(`${out}/${files[3]}`);
    assertMatch(commit, /^select public\.tcv_course_upload_commit\('pq-essentiel-files-gros-fichier-zip-[0-9a-f]{12}', 'pq_essentiel\/files\/gros-fichier\.zip', 'application\/zip', '[0-9a-f]{64}', 3\);\n$/);
    await execAll(out);
    assertEquals((await sqlStore(db).getCourseAsset("pq_essentiel/files/gros-fichier.zip"))?.bytes, big);
    const expected = JSON.parse(await Deno.readTextFile(`${out}/expected.json`));
    assertEquals(expected.map((e: { name: string }) => e.name), ["pq_essentiel/files/gros-fichier.zip", "pq_essentiel/manifest.json"]);
    await Deno.remove(root, { recursive: true });
    await Deno.remove(out, { recursive: true });
  },
});

Deno.test("course-sql.mjs: isInside — a folder whose name starts with « .. » is still inside", () => {
  const repo = "/home/user/Add-a-README-file";
  const table: Array<[string, boolean]> = [
    [repo, true],
    [`${repo}/out`, true],
    [`${repo}/..out`, true],
    [`${repo}/..sql/x`, true],
    [`${repo}/a/../..b`, true],
    [`${repo}/..`, false],
    [`${repo}/../other`, false],
    ["/home/user/Add-a-README-file-2/out", false],
    ["/tmp/out", false],
  ];
  for (const [p, inside] of table) assertEquals(isInside(p, repo), inside, p);
});

Deno.test("course-sql.mjs: refuses an output folder inside the repository, or a folder holding other files", async () => {
  const inside = `${REPO}supabase/functions/api/tests/fixtures/course-sql-out-must-not-exist`;
  const r = await runScript(COURSE_FIXTURE_DIR, inside);
  assertEquals(r.code, 1);
  assertMatch(r.stderr, /refusing to write into the repository/);
  assertEquals(await Deno.stat(inside).then(() => true).catch(() => false), false, "nothing written");
  const viaDots = await runScript(COURSE_FIXTURE_DIR, `${REPO}supabase/../tmp-course-out`);
  assertEquals(viaDots.code, 1);
  const dotted = `${REPO}..course-sql-out-must-not-exist`;
  const dottedRun = await runScript(COURSE_FIXTURE_DIR, dotted);
  assertEquals(dottedRun.code, 1, "a repo folder named « ..xxx » is inside the repository");
  assertMatch(dottedRun.stderr, /refusing to write into the repository/);
  assertEquals(await Deno.stat(dotted).then(() => true).catch(() => false), false, "nothing written");
  const busy = await Deno.makeTempDir({ prefix: "tcv-busy-" });
  await Deno.writeTextFile(`${busy}/notes.txt`, "keep me");
  const refused = await runScript(COURSE_FIXTURE_DIR, busy);
  assertEquals(refused.code, 1);
  assertMatch(refused.stderr, /holds other files/);
  assertEquals(await Deno.readTextFile(`${busy}/notes.txt`), "keep me");
  await Deno.remove(busy, { recursive: true });
  const usage = await run(Deno.execPath(), ["run", "-A", SCRIPT]);
  assertEquals(usage.code, 1);
  assertMatch(usage.stderr, /usage/);
});

const hasNode = await run("node", ["--version"]).then((r) => r.code === 0).catch(() => false);

Deno.test({
  name: hasNode ? "course-sql.mjs: runs with node too, same output" : "course-sql.mjs: runs with node too (skipped: node not installed)",
  ignore: !hasNode,
  fn: async () => {
    const a = await Deno.makeTempDir({ prefix: "tcv-sql-deno-" });
    const b = await Deno.makeTempDir({ prefix: "tcv-sql-node-" });
    assertEquals((await runScript(COURSE_FIXTURE_DIR, a)).code, 0);
    const r = await run("node", [SCRIPT, COURSE_FIXTURE_DIR, b]);
    assertEquals(r.code, 0, r.stderr);
    const names = await statements(a);
    assertEquals(await statements(b), names);
    for (const n of [...names, "verify.sql", "expected.json"]) {
      assertEquals(await Deno.readTextFile(`${b}/${n}`), await Deno.readTextFile(`${a}/${n}`), n);
    }
    await Deno.remove(a, { recursive: true });
    await Deno.remove(b, { recursive: true });
  },
});
