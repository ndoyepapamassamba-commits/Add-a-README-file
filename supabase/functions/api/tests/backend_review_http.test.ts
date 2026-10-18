// Adversarial review of the HTTP surface: client IP trust, return-URL prefix tricks, Wave error shapes,
// body limits and error leakage.
//
// Client IP on Supabase (measured on the live project, 2026-10-18, function_edge_logs + tcv.rate_limits):
// * cf-connecting-ip is set by Cloudflare; a request that sends its own is refused with 403 at the edge.
// * x-real-ip is overwritten by the Supabase edge with the connecting address (a spoofed value never arrives).
// * x-forwarded-for arrives exactly as the client sent it, so it must never feed the rate limiter.
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { clientIp, readBodyText } from "../lib/http.ts";
import { waveErrorFromResponse } from "../lib/wave.ts";
import { normalizeReturnBase } from "../lib/validate.ts";
import { DEFAULT_RETURN_PREFIXES } from "../lib/config.ts";
import { HttpError } from "../lib/http.ts";
import { MemoryStore } from "../lib/store_memory.ts";
import { makeHarness, orderBody } from "./fixtures/backend_harness.ts";

const req = (headers: Record<string, string>) => new Request("https://x.test/api/health", { headers });

Deno.test("review clientIp: trusts cf-connecting-ip, then x-real-ip, never the client-controlled x-forwarded-for", () => {
  assertEquals(
    clientIp(req({ "cf-connecting-ip": "41.82.1.1", "x-real-ip": "10.0.0.1", "x-forwarded-for": "1.1.1.1" })),
    "41.82.1.1",
  );
  assertEquals(clientIp(req({ "x-real-ip": "41.82.1.2", "x-forwarded-for": "1.1.1.1, 41.82.1.2" })), "41.82.1.2");
  assertEquals(clientIp(req({ "x-forwarded-for": "1.1.1.1" })), "unknown");
  assertEquals(clientIp(req({})), "unknown");
});

Deno.test("review rate limit: rotating X-Forwarded-For does not buy more previews", async () => {
  const h = makeHarness({ env: { PREVIEW_RATE_LIMIT_PER_HOUR: "3" } });
  const post = (headers: Record<string, string>) =>
    h.app(
      new Request("https://x.test/functions/v1/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(orderBody("cv")),
      }),
    );
  const behindCloudflare = [] as number[];
  const noTrustedHeader = [] as number[];
  for (let i = 0; i < 5; i++) {
    behindCloudflare.push((await post({ "cf-connecting-ip": "41.82.207.199", "x-forwarded-for": `198.51.100.${i}` })).status);
    noTrustedHeader.push((await post({ "x-forwarded-for": `203.0.113.${i}` })).status);
  }
  assertEquals(behindCloudflare, [201, 201, 201, 429, 429]);
  assertEquals(noTrustedHeader, [201, 201, 201, 429, 429]);
});

Deno.test("review return URL: prefix look-alikes, dot segments, encodings and userinfo are all refused", () => {
  const prefixes = [...DEFAULT_RETURN_PREFIXES];
  const good = "https://ndoyepapamassamba-commits.github.io/Add-a-README-file/cv";
  assertEquals(normalizeReturnBase(good, prefixes), good);
  const evil = [
    "https://ndoyepapamassamba-commits.github.io.evil.com/Add-a-README-file/cv",
    "https://ndoyepapamassamba-commits.github.io/Add-a-README-file-evil/cv",
    "https://ndoyepapamassamba-commits.github.io/Add-a-README-file/../evil",
    "https://ndoyepapamassamba-commits.github.io/Add-a-README-file/%2e%2e/evil",
    "https://ndoyepapamassamba-commits.github.io/Add-a-README-file/.%2E/evil",
    "https://ndoyepapamassamba-commits.github.io/Add-a-README-file/cv/..",
    "https://NDOYEPAPAMASSAMBA-COMMITS.github.io/Add-a-README-file/cv",
    "https://ndoyepapamassamba-commits.github.io:443/Add-a-README-file/cv",
    "https://ndoyepapamassamba-commits.github.io:8443/Add-a-README-file/cv",
    "https://evil.com@ndoyepapamassamba-commits.github.io/Add-a-README-file/cv",
    "https://ndoyepapamassamba-commits.github.io@evil.com/Add-a-README-file/cv",
    "https://ndoyepapamassamba-commits.github.io\\@evil.com/Add-a-README-file/cv",
    "https:/\\evil.com/Add-a-README-file/cv",
    "//ndoyepapamassamba-commits.github.io/Add-a-README-file/cv",
    "http://ndoyepapamassamba-commits.github.io/Add-a-README-file/cv",
    "https://ndoyepapamassamba-commits.github.io/Add-a-README-file/cv?next=https://evil.com",
    "https://ndoyepapamassamba-commits.github.io/Add-a-README-file/cv#https://evil.com",
    " https://ndoyepapamassamba-commits.github.io/Add-a-README-file/cv/\t?x",
    "https://rawcdn.githack.com/someone-else/Add-a-README-file/main/cv",
    "https://rawcdn.githack.com/ndoyepapamassamba-commits/Add-a-README-file.evil/main/cv",
    "javascript:alert(1)//ndoyepapamassamba-commits.github.io/Add-a-README-file/",
    "https://xn--ndoyepapamassamba-commits-.github.io/Add-a-README-file/cv",
    "http://localhost:8787/cv",
  ];
  for (const url of evil) assertEquals(normalizeReturnBase(url, prefixes), null, JSON.stringify(url));
  // Surrounding whitespace is trimmed, never carried into the Wave success/error URLs.
  assertEquals(normalizeReturnBase(` ${good}/\n`, prefixes), good);
});

Deno.test("review Wave errors: all three documented body shapes keep their error code", () => {
  // docs.wave.com/business: {"code", "message"} and {"error": {"code", "message", "httpcode"}};
  // docs.wave.com/payout: {"error": "<code>", "message"} (the code as a plain string).
  const flat = waveErrorFromResponse(400, '{"code":"request-validation-error","message":"Request invalid"}');
  const nested = waveErrorFromResponse(403, '{"error":{"code":"ip-not-allowed","message":"Not in allowlist","httpcode":403}}');
  const stringCode = waveErrorFromResponse(400, '{"error":"request-validation-error","message":"Invalid phone number."}');
  assertEquals([flat.code, flat.message, flat.retryable], ["request-validation-error", "Request invalid", false]);
  assertEquals([nested.code, nested.message], ["ip-not-allowed", "Not in allowlist"]);
  assertEquals([stringCode.code, stringCode.message, stringCode.status], [
    "request-validation-error",
    "Invalid phone number.",
    400,
  ]);
  assertEquals(waveErrorFromResponse(502, "<html>Bad gateway</html>").code, "http_502");
});

Deno.test("review body limit: a streamed body without content-length is cut at 32 KB", async () => {
  const chunk = new TextEncoder().encode("x".repeat(8 * 1024));
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= 10) return controller.close();
      sent += 1;
      controller.enqueue(chunk);
    },
  });
  const request = new Request("https://x.test/api/orders", { method: "POST", body });
  assertEquals(request.headers.get("content-length"), null);
  const err = await readBodyText(request).then(() => null, (e) => e);
  assert(err instanceof HttpError && err.status === 413, String(err));
  assert(sent < 10, "reading stops early instead of buffering everything");
});

Deno.test("review errors: an internal failure leaks neither its message nor its stack", async () => {
  const store = new MemoryStore();
  store.insertOrder = () => Promise.reject(new Error("connection to db.secret-host:5432 failed, password=hunter2"));
  const h = makeHarness({ store });
  const res = await h.call("POST", "/orders", { body: orderBody("cv") });
  assertEquals(res.status, 500);
  assertEquals(Object.keys(res.body).sort(), ["error", "message"]);
  assertEquals(res.body.error, "internal");
  const text = JSON.stringify(res.body);
  for (const leak of ["hunter2", "secret-host", "at ", "Error"]) assert(!text.includes(leak), leak);
});
