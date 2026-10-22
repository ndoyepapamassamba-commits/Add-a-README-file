// scripts/course-upload.mjs against a real local HTTP server running the API (MemoryStore): every file uploaded with
// manifest.json last, then listed and checked by SHA-256; a mismatch, a closed window or a wrong token exit non-zero;
// the token is never printed. Uses the PUBLIC lorem fixture only. One server per test, stopped at the end.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { createApp } from "../lib/app.ts";
import { sha256Hex } from "../lib/ids.ts";
import { MemoryStore } from "../lib/store_memory.ts";
import type { CourseAssetInfo } from "../lib/types.ts";
import { testConfig } from "./fixtures/backend_harness.ts";
import { COURSE_FIXTURE_DIR, fixtureAssets } from "./fixtures/course_harness.ts";
import { checkBase, isUploadName, planUpload } from "../../../../scripts/course-upload.mjs";

const SCRIPT = decodeURIComponent(new URL("../../../../scripts/course-upload.mjs", import.meta.url).pathname);
const TOKEN = "tok_script_Zq8_9b1c7e5a3f";
const FIXTURE = `${COURSE_FIXTURE_DIR}/pq_essentiel`;

interface Server {
  base: string;
  store: MemoryStore;
  puts: string[];
  close(): Promise<void>;
}

/** The API on 127.0.0.1 (random port) with the upload window open for an hour; `lie` falsifies the listing. */
async function startServer(opts: { lie?: boolean; until?: string } = {}): Promise<Server> {
  const store = new MemoryStore();
  const until = opts.until ?? new Date(Date.now() + 3_600_000).toISOString();
  const config = testConfig({ WAVE_API_KEY: undefined, COURSE_UPLOAD_TOKEN_SHA256: await sha256Hex(TOKEN), COURSE_UPLOAD_UNTIL: until });
  const app = createApp({ store, wave: null, config, now: () => new Date() });
  const puts: string[] = [];
  const handler = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (req.method === "PUT") puts.push(decodeURIComponent(url.pathname.replace(/^.*\/admin\/course-assets\//, "")));
    const res = await app(req);
    if (opts.lie && req.method === "GET" && url.pathname.endsWith("/admin/course-assets") && res.status === 200) {
      const body = await res.json() as { assets: CourseAssetInfo[] };
      body.assets = body.assets.map((a, i) => (i === 1 ? { ...a, sha256: "0".repeat(64) } : a));
      return Response.json(body);
    }
    return res;
  };
  const ac = new AbortController();
  let port = 0;
  let listening!: () => void;
  const ready = new Promise<void>((r) => (listening = r));
  const server = Deno.serve({
    hostname: "127.0.0.1",
    port: 0,
    signal: ac.signal,
    onListen: (a) => {
      port = a.port;
      listening();
    },
  }, handler);
  await ready;
  return {
    base: `http://127.0.0.1:${port}/functions/v1/api`,
    store,
    puts,
    close: async () => {
      ac.abort();
      await server.finished;
    },
  };
}

async function run(cmd: string, args: string[], env: Record<string, string>) {
  const out = await new Deno.Command(cmd, {
    args,
    env: { ...env, NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost" },
    stdout: "piped",
    stderr: "piped",
  }).output();
  const dec = new TextDecoder();
  return { code: out.code, stdout: dec.decode(out.stdout), stderr: dec.decode(out.stderr) };
}

const hasNode = await new Deno.Command("node", { args: ["--version"], stdout: "null", stderr: "null" }).output()
  .then((r) => r.success).catch(() => false);

const RUNNERS: Array<{ name: string; cmd: string; pre: string[] }> = [
  { name: "deno", cmd: Deno.execPath(), pre: ["run", "-A", SCRIPT] },
  ...(hasNode ? [{ name: "node", cmd: "node", pre: [SCRIPT] }] : []),
];

Deno.test("course-upload.mjs: plan — upload order (manifest last), names, sizes; https only except this machine", async () => {
  const plan = planUpload(FIXTURE) as Array<{ name: string; size: number; sha256: string; mime: string }>;
  assertEquals(plan.map((a) => a.name), [
    "pq_essentiel/files/donnees-module-1.zip",
    "pq_essentiel/files/module-1.xlsx",
    "pq_essentiel/modules/module-01.html",
    "pq_essentiel/modules/module-02.html",
    "pq_essentiel/quiz.json",
    "pq_essentiel/quiz-key.json",
    "pq_essentiel/manifest.json",
  ]);
  const fixture = await fixtureAssets();
  for (const a of plan) assertEquals(a.size, fixture.find((f) => f.name === a.name)!.bytes.length, a.name);
  assertEquals(planUpload(FIXTURE, "_backup/2026-10-22").at(-1)?.name, "_backup/2026-10-22/manifest.json");
  for (const bad of ["other", "_backup/../pq_essentiel", "pq_essentiel/", "PQ_ESSENTIEL"]) {
    let refused = false;
    try {
      planUpload(FIXTURE, bad);
    } catch {
      refused = true;
    }
    assert(refused, bad);
  }
  for (const [name, ok] of [["pq_essentiel/a.json", true], ["_backup/x/y.txt", true], ["pq_essentiel/../x", false], ["pq_essentiel//x", false], ["x/y", false]] as const) {
    assertEquals(isUploadName(name), ok, name);
  }
  assertEquals(checkBase("https://example.org/functions/v1/api/"), "https://example.org/functions/v1/api");
  assertEquals(checkBase("http://127.0.0.1:8787/api"), "http://127.0.0.1:8787/api");
  for (const bad of ["http://example.org/api", "ftp://x/api", "https://u:p@example.org/api", "https://example.org/api?k=1", "nope"]) {
    let refused = false;
    try {
      checkBase(bad);
    } catch {
      refused = true;
    }
    assert(refused, bad);
  }
});

for (const runner of RUNNERS) {
  Deno.test({
    name: `course-upload.mjs [${runner.name}]: uploads the fixture (manifest last), verifies it, prints no secret`,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      const s = await startServer();
      try {
        const r = await run(runner.cmd, [...runner.pre, FIXTURE], { COURSE_UPLOAD_TOKEN: TOKEN, COURSE_API_BASE: s.base, PATH: Deno.env.get("PATH") ?? "" });
        assertEquals(r.code, 0, r.stderr);
        assertMatch(r.stdout, /OK, 7\/7 fichier\(s\) vérifiés/);
        assertEquals(s.puts.length, 7);
        assertEquals(s.puts.at(-1), "pq_essentiel/manifest.json", "manifest uploaded last");
        for (const a of await fixtureAssets()) {
          const got = await s.store.getCourseAsset(a.name);
          assertEquals([got?.mime, got?.bytes], [a.mime, a.bytes], a.name);
        }
        const printed = r.stdout + r.stderr;
        assert(!printed.includes(TOKEN) && !printed.includes(await sha256Hex(TOKEN)), "no secret printed");
        assert(!printed.includes("Lorem"), "no content printed");
        // _backup copy of the same tree.
        const b = await run(runner.cmd, [...runner.pre, FIXTURE, "--prefix", "_backup/2026-10-22"], { COURSE_UPLOAD_TOKEN: TOKEN, COURSE_API_BASE: s.base, PATH: Deno.env.get("PATH") ?? "" });
        assertEquals(b.code, 0, b.stderr);
        assert(s.store.courseAssets.has("_backup/2026-10-22/manifest.json"));
      } finally {
        await s.close();
      }
    },
  });
}

Deno.test({
  name: "course-upload.mjs: a listing that does not match, a closed window, a wrong or missing token → non-zero exit",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const runner = RUNNERS.at(-1)!;
    const env = (base: string, token = TOKEN) => ({ COURSE_UPLOAD_TOKEN: token, COURSE_API_BASE: base, PATH: Deno.env.get("PATH") ?? "" });
    const liar = await startServer({ lie: true });
    try {
      const r = await run(runner.cmd, [...runner.pre, FIXTURE], env(liar.base));
      assertEquals(r.code, 1, r.stdout);
      assertMatch(r.stderr, /ÉCART pq_essentiel\/files\/module-1\.xlsx : empreinte ou taille différente/);
      assertMatch(r.stderr, /1 écart\(s\) sur 7/);
      const wrong = await run(runner.cmd, [...runner.pre, FIXTURE], env(liar.base, "not-the-token"));
      assertEquals(wrong.code, 1);
      assertMatch(wrong.stderr, /fenêtre d'envoi fermée/);
      assert(!(wrong.stdout + wrong.stderr).includes("not-the-token"));
    } finally {
      await liar.close();
    }
    const closed = await startServer({ until: "2020-01-01" });
    try {
      const r = await run(runner.cmd, [...runner.pre, FIXTURE], env(closed.base));
      assertEquals(r.code, 1);
      assertEquals(closed.store.courseAssets.size, 0);
    } finally {
      await closed.close();
    }
    const missing = await run(runner.cmd, [...runner.pre, FIXTURE], { COURSE_API_BASE: "http://127.0.0.1:9/api", PATH: Deno.env.get("PATH") ?? "" });
    assertEquals(missing.code, 2);
    assertMatch(missing.stderr, /COURSE_UPLOAD_TOKEN manquant/);
    const clear = await run(runner.cmd, [...runner.pre, FIXTURE], { COURSE_UPLOAD_TOKEN: TOKEN, COURSE_API_BASE: "http://example.org/api", PATH: Deno.env.get("PATH") ?? "" });
    assertEquals(clear.code, 2, "never sends the token over plain http to another machine");
    const usage = await run(runner.cmd, [...runner.pre], { PATH: Deno.env.get("PATH") ?? "" });
    assertEquals(usage.code, 2);
    const dry = await run(runner.cmd, [...runner.pre, FIXTURE, "--dry-run"], { PATH: Deno.env.get("PATH") ?? "" });
    assertEquals(dry.code, 0, dry.stderr);
    assertMatch(dry.stdout, /7 fichier\(s\) vers https:\/\/seegnylaubuularegmku\.supabase\.co\/functions\/v1\/api/);
  },
});
