// Runs supabase/functions/api/dev.ts (real API + MemoryStore + FakeWave + the cv/ site) as a child process.
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export const REPO = path.resolve(import.meta.dirname, "../..");
export const DEV_ADMIN_KEY = "dev-admin";
export const DEV_CRON_SECRET = "dev-cron";

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Starts dev.ts with DEV_PAYMENT=`payment` on a free port and resolves once GET /api/health answers.
 * `site` uses "localhost" on purpose: dev.ts accepts http://localhost:<port>/ as the only http Wave return URL.
 */
export async function startDevServer({ payment, logFile, timeoutMs = 90_000 }) {
  const port = await freePort();
  const log = fs.createWriteStream(logFile);
  const child = spawn("deno", ["run", "-A", "supabase/functions/api/dev.ts"], {
    cwd: REPO,
    env: { ...process.env, PORT: String(port), DEV_PAYMENT: payment },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  let exit = null;
  child.on("exit", (code, signal) => {
    exit = { code, signal };
  });

  const server = {
    payment,
    port,
    site: `http://localhost:${port}`,
    api: `http://127.0.0.1:${port}/api`,
    logFile,
    stop() {
      if (exit) return Promise.resolve();
      return new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill("SIGTERM");
      });
    },
  };

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (exit) throw new Error(`dev.ts (${payment}) exited early ${JSON.stringify(exit)} — see ${logFile}`);
    try {
      const res = await fetch(`${server.api}/health`);
      if (res.ok && (await res.json()).ok === true) return server;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      await server.stop();
      throw new Error(`dev.ts (${payment}) did not answer /api/health within ${timeoutMs} ms — see ${logFile}`);
    }
    await sleep(250);
  }
}

/** JSON call to the dev API from Node. Resolves with { status, body }. */
export async function api(server, method, route, { body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(server.api + route, init);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
