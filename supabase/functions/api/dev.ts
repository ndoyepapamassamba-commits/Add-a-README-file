// Local server: the real API (MemoryStore + FakeWave) at /api/*, the static site from cv/ at /, and a fake
// Wave payment page at /fake-wave/pay/<sessionId>.  Run: deno run -A supabase/functions/api/dev.ts
// Env: PORT (default 8787), DEV_PAYMENT = wave (default) | manual | none.
import { createApp } from "./lib/app.ts";
import { DEFAULT_RETURN_PREFIXES, envFrom, loadConfig } from "./lib/config.ts";
import { MemoryStore } from "./lib/store_memory.ts";
import { checkoutCompletedEvent, FakeWave, signedWebhookRequest } from "./lib/wave.ts";
import type { Config } from "./lib/types.ts";

export type DevPayment = "wave" | "manual" | "none";

export const DEV_ADMIN_KEY = "dev-admin";
export const DEV_CRON_SECRET = "dev-cron";
export const DEV_WEBHOOK_SECRET = "dev-wave-webhook-secret";
export const DEV_MANUAL_NUMBER = "+221770000000";

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  ico: "image/x-icon",
  woff2: "font/woff2",
  webmanifest: "application/manifest+json",
  pdf: "application/pdf",
};

export function contentTypeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export function devConfig(port: number, payment: DevPayment): Config {
  const config = loadConfig(envFrom({
    WAVE_API_KEY: payment === "wave" ? "dev-fake-wave" : undefined,
    WAVE_WEBHOOK_SECRET: DEV_WEBHOOK_SECRET,
    MANUAL_WAVE_NUMBER: payment === "manual" ? DEV_MANUAL_NUMBER : undefined,
    OWNER_WAVE_MOBILE: DEV_MANUAL_NUMBER,
    PAYOUT_ENABLED: "true",
    ADMIN_KEY: DEV_ADMIN_KEY,
    CRON_SECRET: DEV_CRON_SECRET,
  }));
  // The only place where an http:// return URL is accepted.
  const local = [`http://localhost:${port}/`, "http://localhost:8787/"];
  return { ...config, allowedReturnPrefixes: [...DEFAULT_RETURN_PREFIXES, ...new Set(local)] };
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function fakeWavePage(sessionId: string, amount: string, reference: string): Response {
  const id = escapeHtml(sessionId);
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Wave (simulation)</title>
<style>body{font-family:system-ui,sans-serif;background:#1dc4ff;margin:0;display:grid;place-items:center;min-height:100vh}
main{background:#fff;border-radius:16px;padding:24px;max-width:340px;width:calc(100% - 32px);text-align:center}
button{display:block;width:100%;padding:14px;margin-top:12px;border:0;border-radius:10px;font-size:17px;cursor:pointer}
.pay{background:#1dc4ff;color:#fff}.cancel{background:#eee}</style></head><body><main>
<p>Paiement Wave <strong>(simulation locale)</strong></p>
<p style="font-size:28px;margin:8px 0"><strong>${escapeHtml(amount)} FCFA</strong></p>
<p>Référence : ${escapeHtml(reference)}</p>
<form method="post" action="/fake-wave/pay/${id}/payer"><button class="pay">Payer</button></form>
<form method="post" action="/fake-wave/pay/${id}/annuler"><button class="cancel">Annuler</button></form>
</main></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

const redirect = (location: string) => new Response(null, { status: 303, headers: { location } });
const text = (status: number, body: string) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

/** Resolves a URL path inside `root`, refusing anything that escapes it. Directories serve index.html. */
async function resolveStatic(root: string, pathname: string): Promise<string | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.split("/").includes("..")) return null;
  try {
    const rootReal = await Deno.realPath(root);
    let real = await Deno.realPath(rootReal + decoded);
    if ((await Deno.stat(real)).isDirectory) real = await Deno.realPath(real + "/index.html");
    return real === rootReal || real.startsWith(rootReal + "/") ? real : null;
  } catch {
    return null;
  }
}

export interface DevServer {
  handler: (req: Request) => Promise<Response>;
  store: MemoryStore;
  wave: FakeWave | null;
  config: Config;
}

export function createDevServer(opts: { port: number; payment: DevPayment; cvRoot: string }): DevServer {
  const origin = `http://localhost:${opts.port}`;
  const config = devConfig(opts.port, opts.payment);
  const store = new MemoryStore();
  const wave = opts.payment === "wave" ? new FakeWave({ launchBase: `${origin}/fake-wave/pay/` }) : null;
  const api = createApp({ store, wave, config, now: () => new Date() });

  async function fakeWave(req: Request, sessionId: string, action: string | undefined): Promise<Response> {
    const session = wave?.sessions.get(sessionId);
    if (!wave || !session) return text(404, "Session Wave inconnue.");
    if (!action && req.method === "GET") return fakeWavePage(session.id, session.amount, session.client_reference ?? "");
    if (req.method !== "POST") return text(405, "Méthode non autorisée.");
    if (action === "annuler") {
      wave.cancelSession(sessionId);
      return redirect(wave.errorUrlOf(sessionId));
    }
    if (action === "payer") {
      const paid = wave.completeSession(sessionId);
      const webhook = await signedWebhookRequest(`${origin}/api/wave/webhook`, DEV_WEBHOOK_SECRET, checkoutCompletedEvent(paid));
      const res = await api(webhook);
      console.log(`[dev] webhook checkout.session.completed ${paid.client_reference} → ${res.status} ${await res.text()}`);
      return redirect(wave.successUrlOf(sessionId));
    }
    return text(404, "Action inconnue.");
  }

  async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === "/api" || path.startsWith("/api/")) return api(req);
    const fake = /^\/fake-wave\/pay\/([^/]+)(?:\/(payer|annuler))?$/.exec(path);
    if (fake) return fakeWave(req, decodeURIComponent(fake[1]), fake[2]);
    if (req.method !== "GET" && req.method !== "HEAD") return text(405, "Méthode non autorisée.");
    if (path === "/config.js") {
      const js = `window.TCV_CONFIG = { apiBase: ${JSON.stringify(`${origin}/api`)} };\n`;
      return new Response(js, { headers: { "content-type": CONTENT_TYPES.js, "cache-control": "no-store" } });
    }
    const file = await resolveStatic(opts.cvRoot, path === "/" ? "/index.html" : path);
    if (!file) return text(404, "Page introuvable.");
    const body = req.method === "HEAD" ? null : await Deno.readFile(file);
    return new Response(body, { headers: { "content-type": contentTypeFor(file), "cache-control": "no-store" } });
  }

  return { handler, store, wave, config };
}

if (import.meta.main) {
  const port = Number(Deno.env.get("PORT") ?? "8787") || 8787;
  const raw = (Deno.env.get("DEV_PAYMENT") ?? "wave").toLowerCase();
  const payment: DevPayment = raw === "manual" || raw === "none" ? raw : "wave";
  const cvRoot = decodeURIComponent(new URL("../../../cv", import.meta.url).pathname);
  const { handler } = createDevServer({ port, payment, cvRoot });
  const origin = `http://localhost:${port}`;
  Deno.serve({
    port,
    onListen: () => {
      console.log(`Teranga CV dev server (paiement: ${payment})`);
      console.log(`  Site      ${origin}/index.html`);
      console.log(`  Admin     ${origin}/admin.html#k=${DEV_ADMIN_KEY}`);
      console.log(`  API       ${origin}/api/health   ${origin}/api/config`);
      console.log(`  Cron      curl -X POST -H 'x-cron-secret: ${DEV_CRON_SECRET}' ${origin}/api/cron/daily`);
      if (payment === "wave") console.log(`  Wave      ${origin}/fake-wave/pay/<sessionId> (simulation)`);
    },
  }, handler);
}
