// Wave client, webhook signature verification and FakeWave behaviour.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.13";
import { WaveError } from "../lib/types.ts";
import {
  DEFAULT_WAVE_TIMEOUT_MS,
  FakeWave,
  HttpWaveClient,
  parseSignatureHeader,
  signWaveBody,
  verifySharedSecret,
  verifyWaveSignature,
  waveErrorFromResponse,
  withDeadline,
} from "../lib/wave.ts";

const VECTOR_SECRET = "wave_sn_WHS_xz4m6g8rjs9bshxy05xj4khcvjv7j3hcp4fbpvv6met0zdrjvezg";
const VECTOR_T = "1667920421";
const VECTOR_V1 = "53c971695230e9c51b1030d673eee76e70bbcdf8a7c5b8c1d44e0b8b1329647b";
const vectorBody = await Deno.readTextFile(new URL("./fixtures/wave_vector_body.txt", import.meta.url));

Deno.test("signature: official Wave test vector", async () => {
  assert(!vectorBody.endsWith("\n"), "fixture must not end with a newline");
  assertEquals(await signWaveBody(VECTOR_SECRET, VECTOR_T, vectorBody), VECTOR_V1);
  assert(await verifyWaveSignature(VECTOR_SECRET, `t=${VECTOR_T},v1=${VECTOR_V1}`, vectorBody, null));
  assert(await verifyWaveSignature(VECTOR_SECRET, `t=${VECTOR_T},v1=${VECTOR_V1}`, vectorBody, Number(VECTOR_T)));
});

Deno.test("signature: tampering, wrong secret and malformed headers are refused", async () => {
  const header = `t=${VECTOR_T},v1=${VECTOR_V1}`;
  assertEquals(await verifyWaveSignature(VECTOR_SECRET, header, vectorBody + " ", null), false);
  assertEquals(await verifyWaveSignature(VECTOR_SECRET + "x", header, vectorBody, null), false);
  assertEquals(await verifyWaveSignature(VECTOR_SECRET, `t=1667920422,v1=${VECTOR_V1}`, vectorBody, null), false);
  assertEquals(await verifyWaveSignature(VECTOR_SECRET, null, vectorBody, null), false);
  assertEquals(await verifyWaveSignature(VECTOR_SECRET, `v1=${VECTOR_V1}`, vectorBody, null), false);
  assertEquals(await verifyWaveSignature(VECTOR_SECRET, `t=${VECTOR_T}`, vectorBody, null), false);
  assertEquals(await verifyWaveSignature(VECTOR_SECRET, `t=abc,v1=${VECTOR_V1}`, vectorBody, null), false);
  assertEquals(await verifyWaveSignature(VECTOR_SECRET, `t=${VECTOR_T},v1=${VECTOR_V1.slice(0, 63)}`, vectorBody, null), false);
  assert(await verifyWaveSignature(VECTOR_SECRET, `t=${VECTOR_T},v1=${VECTOR_V1.toUpperCase()}`, vectorBody, null));
});

Deno.test("signature: any of several v1 values may match", async () => {
  const bogus = "0".repeat(64);
  assert(await verifyWaveSignature(VECTOR_SECRET, `t=${VECTOR_T},v1=${bogus},v1=${VECTOR_V1}`, vectorBody, null));
  assert(await verifyWaveSignature(VECTOR_SECRET, ` t=${VECTOR_T} , v1=${VECTOR_V1} , v1=${bogus}`, vectorBody, null));
  assertEquals(await verifyWaveSignature(VECTOR_SECRET, `t=${VECTOR_T},v1=${bogus},v1=${"f".repeat(64)}`, vectorBody, null), false);
  assertEquals(parseSignatureHeader(`t=1,v1=AB,v0=cd,v1=ef`), { t: "1", v1: ["ab", "ef"] });
});

Deno.test("signature: the timestamp must be within 300 s of now", async () => {
  const header = `t=${VECTOR_T},v1=${VECTOR_V1}`;
  const t = Number(VECTOR_T);
  assert(await verifyWaveSignature(VECTOR_SECRET, header, vectorBody, t + 300));
  assert(await verifyWaveSignature(VECTOR_SECRET, header, vectorBody, t - 300));
  assertEquals(await verifyWaveSignature(VECTOR_SECRET, header, vectorBody, t + 301), false);
  assertEquals(await verifyWaveSignature(VECTOR_SECRET, header, vectorBody, t - 301), false);
});

Deno.test("shared secret mode compares the bearer token", () => {
  assert(verifySharedSecret("s3cret", "Bearer s3cret"));
  assert(verifySharedSecret("s3cret", "bearer   s3cret "));
  assertEquals(verifySharedSecret("s3cret", "Bearer s3cre"), false);
  assertEquals(verifySharedSecret("s3cret", "s3cret"), false);
  assertEquals(verifySharedSecret("s3cret", null), false);
});

// --- HttpWaveClient ---------------------------------------------------------------------------

interface Captured {
  url: string;
  method: string;
  headers: Headers;
  body: string | null;
}

function stubFetch(respond: (c: Captured) => Response | Promise<Response>): { fetchFn: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const c: Captured = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : null,
    };
    calls.push(c);
    return await respond(c);
  }) as typeof fetch;
  return { fetchFn, calls };
}

const jsonRes = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.test("HttpWaveClient sends the documented requests", async () => {
  const { fetchFn, calls } = stubFetch((c) => {
    if (c.url.endsWith("/v1/balance")) return jsonRes(200, { amount: "12500", currency: "XOF" });
    if (c.url.includes("/v1/payouts/search")) return jsonRes(200, { result: [{ id: "pt-1", status: "succeeded", receive_amount: "100" }] });
    if (c.url.endsWith("/v1/payout")) return jsonRes(200, { id: "pt-2", status: "processing", receive_amount: "100" });
    return jsonRes(200, { id: "cos-1", amount: "1500", currency: "XOF", checkout_status: "open", payment_status: "processing", client_reference: "TCV-AAAAAAAA", wave_launch_url: "https://pay.wave.com/c/cos-1" });
  });
  const wave = new HttpWaveClient({ apiKey: "wave_sn_prod_KEY", fetchFn });

  const session = await wave.createCheckoutSession({
    amount: 1500,
    currency: "XOF",
    clientReference: "TCV-AAAAAAAA",
    successUrl: "https://x/success",
    errorUrl: "https://x/error",
  });
  assertEquals(session.id, "cos-1");
  assertEquals([calls[0].method, calls[0].url], ["POST", "https://api.wave.com/v1/checkout/sessions"]);
  assertEquals(calls[0].headers.get("authorization"), "Bearer wave_sn_prod_KEY");
  assertEquals(calls[0].headers.get("content-type"), "application/json");
  assertEquals(JSON.parse(calls[0].body!), {
    amount: "1500",
    currency: "XOF",
    client_reference: "TCV-AAAAAAAA",
    success_url: "https://x/success",
    error_url: "https://x/error",
  });

  await wave.getCheckoutSession("cos/1");
  assertEquals([calls[1].method, calls[1].url], ["GET", "https://api.wave.com/v1/checkout/sessions/cos%2F1"]);

  assertEquals(await wave.getBalance(), { amount: 12500, currency: "XOF" });

  const body = '{"currency":"XOF","receive_amount":"100"}';
  assertEquals((await wave.createPayout(body, "teranga-cv-PO-20261018")).status, "processing");
  const payoutCall = calls.find((c) => c.url.endsWith("/v1/payout"))!;
  assertEquals(payoutCall.body, body, "body sent verbatim");
  assertEquals(payoutCall.headers.get("idempotency-key"), "teranga-cv-PO-20261018");

  assertEquals((await wave.searchPayouts("PO-20261018")).map((p) => p.id), ["pt-1"]);
  assertEquals(calls.at(-1)!.url, "https://api.wave.com/v1/payouts/search?client_reference=PO-20261018");
});

Deno.test("HttpWaveClient maps both Wave error shapes and retryability", async () => {
  const cases: Array<[number, unknown, string, string, boolean]> = [
    [400, { code: "request-validation-error", message: "Invalid amount" }, "request-validation-error", "Invalid amount", false],
    [401, { code: "missing-auth-header", message: "No key" }, "missing-auth-header", "No key", false],
    [404, { error: { code: "not-found", message: "Nope", httpcode: 404 } }, "not-found", "Nope", false],
    [408, { code: "timeout", message: "Slow" }, "timeout", "Slow", true],
    [429, { error: { code: "rate-limit-exceeded", message: "Too many", httpcode: 429 } }, "rate-limit-exceeded", "Too many", true],
    [500, { code: "internal-server-error", message: "Boom" }, "internal-server-error", "Boom", true],
    [503, "<html>gateway</html>", "http_503", "Wave API error 503", true],
  ];
  for (const [status, body, code, message, retryable] of cases) {
    const { fetchFn } = stubFetch(() => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
    const err = await assertRejects(() => new HttpWaveClient({ apiKey: "k", fetchFn }).getBalance(), WaveError);
    assertEquals([err.status, err.code, err.message, err.retryable], [status, code, message, retryable], `HTTP ${status}`);
  }
  assertEquals(waveErrorFromResponse(502, "").retryable, true);
});

Deno.test("HttpWaveClient: network errors and timeouts are retryable WaveErrors", async () => {
  const offline = (() => Promise.reject(new TypeError("error sending request"))) as typeof fetch;
  const netErr = await assertRejects(() => new HttpWaveClient({ apiKey: "k", fetchFn: offline }).getBalance(), WaveError);
  assertEquals([netErr.status, netErr.code, netErr.retryable], [0, "network_error", true]);

  const hanging = ((_: unknown, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
    })) as typeof fetch;
  const started = Date.now();
  const timeout = await assertRejects(() => new HttpWaveClient({ apiKey: "k", fetchFn: hanging, timeoutMs: 50 }).getBalance(), WaveError);
  assertEquals([timeout.status, timeout.code, timeout.retryable], [0, "timeout", true]);
  assert(Date.now() - started < 2000);

  const badJson = (() => Promise.resolve(new Response("not json", { status: 200 }))) as typeof fetch;
  const invalid = await assertRejects(() => new HttpWaveClient({ apiKey: "k", fetchFn: badJson }).getBalance(), WaveError);
  assertEquals([invalid.code, invalid.retryable], ["invalid_response", false]);
});

Deno.test("HttpWaveClient uses a 10 s default timeout", () => {
  let seen: AbortSignal | undefined;
  const fetchFn = ((_: unknown, init?: RequestInit) => {
    seen = init?.signal ?? undefined;
    return Promise.resolve(jsonRes(200, { amount: "1", currency: "XOF" }));
  }) as typeof fetch;
  assertEquals(DEFAULT_WAVE_TIMEOUT_MS, 10_000);
  return new HttpWaveClient({ apiKey: "k", fetchFn }).getBalance().then(() => {
    assert(seen instanceof AbortSignal, "every request carries an AbortSignal");
  });
});

Deno.test("withDeadline rejects slow promises with a retryable timeout", async () => {
  assertEquals(await withDeadline(Promise.resolve(7), 50), 7);
  const err = await assertRejects(() => withDeadline(new Promise(() => {}), 20), WaveError);
  assertEquals([err.code, err.retryable], ["timeout", true]);
});

// --- FakeWave ---------------------------------------------------------------------------------

Deno.test("FakeWave: payouts are idempotent per key and refuse a different body", async () => {
  const wave = new FakeWave({ balance: 10_000 });
  const body = JSON.stringify({ currency: "XOF", receive_amount: "1000", mobile: "+221771234567", client_reference: "PO-1" });
  const first = await wave.createPayout(body, "key-1");
  const again = await wave.createPayout(body, "key-1");
  assertEquals(first, again);
  assertEquals(wave.payouts.length, 1);
  assertEquals(wave.balance, 10_000 - 1000 - 10);
  const err = await assertRejects(() => wave.createPayout(body.replace("1000", "999"), "key-1"), WaveError);
  assertEquals([err.status, err.retryable], [409, false]);
  assertEquals((await wave.searchPayouts("PO-1")).length, 1);
});

Deno.test("FakeWave: sessions, scripted failures and settlement", async () => {
  const wave = new FakeWave({ launchBase: "http://localhost:8787/fake-wave/pay/" });
  const s = await wave.createCheckoutSession({ amount: 1500, currency: "XOF", clientReference: "TCV-AAAAAAAA", successUrl: "https://ok", errorUrl: "https://ko" });
  assertEquals(s.wave_launch_url, `http://localhost:8787/fake-wave/pay/${s.id}`);
  assertEquals((await wave.getCheckoutSession(s.id)).payment_status, "processing");
  const done = wave.completeSession(s.id);
  assertEquals([done.payment_status, done.checkout_status], ["succeeded", "complete"]);
  assert(done.transaction_id);
  assertEquals([wave.successUrlOf(s.id), wave.errorUrlOf(s.id)], ["https://ok", "https://ko"]);

  wave.failNext("getBalance", new WaveError("busy", 503, "service-unavailable", true));
  await assertRejects(() => wave.getBalance(), WaveError);
  assertEquals((await wave.getBalance()).currency, "XOF");
  assertEquals(wave.callsOf("getBalance").length, 2);

  wave.payoutOutcome = "processing";
  await wave.createPayout(JSON.stringify({ receive_amount: "100", client_reference: "PO-2" }), "k2");
  wave.settlePayout("PO-2", "reversed");
  assertEquals((await wave.searchPayouts("PO-2"))[0].status, "reversed");
});
