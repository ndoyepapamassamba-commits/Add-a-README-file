// Adversarial review of the money path: a payout must never leave twice, whatever Wave answers and however
// cron runs overlap. Scenarios run against MemoryStore and SqlStore (PGlite + the real migration); the
// payout state-machine guarantees also run through the PostgREST stand-in.
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { WaveError } from "../lib/types.ts";
import type { Deps, Store, WavePayout } from "../lib/types.ts";
import { MemoryStore } from "../lib/store_memory.ts";
import { buildPayoutBody, computePayoutAmount, runDaily } from "../lib/payout.ts";
import { FakeWave, HttpWaveClient } from "../lib/wave.ts";
import { Clock, CRON_SECRET, DAY, insertPaid, makeHarness, testConfig } from "./fixtures/backend_harness.ts";
import type { Harness } from "./fixtures/backend_harness.ts";
import { openTestDb, sqlStore, supabaseStore } from "./fixtures/backend_pglite.ts";

const db = await openTestDb();

const STORES: Array<[string, () => Promise<Store>]> = [
  ["MemoryStore", () => Promise.resolve(new MemoryStore())],
  ["SqlStore(PGlite)", async () => {
    await db.reset();
    return sqlStore(db);
  }],
  ["SupabaseStore(PostgREST stand-in)", async () => {
    await db.reset();
    return supabaseStore(db);
  }],
];

const EVENING = "2026-10-18T20:30:00.000Z";

/** FakeWave that can execute a request and then lose the answer, as a dropped connection or a proxy would. */
class LossyWave extends FakeWave {
  private lost: WaveError[] = [];

  /** The next createPayout is executed by Wave, but the caller receives `err` instead of the payout. */
  loseNextPayoutAnswer(err: WaveError): this {
    this.lost.push(err);
    return this;
  }

  override async createPayout(body: string, idempotencyKey: string): Promise<WavePayout> {
    const payout = await super.createPayout(body, idempotencyKey);
    const err = this.lost.shift();
    if (err) throw err;
    return payout;
  }
}

/** The exact error HttpWaveClient raises when Wave answers 2xx with a body it cannot parse. */
async function unreadable2xxError(): Promise<WaveError> {
  const client = new HttpWaveClient({
    apiKey: "k",
    fetchFn: () => Promise.resolve(new Response('{"id":"pt-1","status":"succ', { status: 200 })),
  });
  try {
    await client.createPayout("{}", "key");
  } catch (err) {
    if (err instanceof WaveError) return err;
  }
  throw new Error("expected a WaveError");
}

async function setup(makeStore: () => Promise<Store>): Promise<Harness & { wave: LossyWave }> {
  const clock = new Clock(EVENING);
  const wave = new LossyWave({ now: clock.now, balance: 1_000_000 });
  return makeHarness({ store: await makeStore(), clock, wave }) as Harness & { wave: LossyWave };
}

const daily = (h: Harness) => h.call("POST", "/cron/daily", { headers: { "x-cron-secret": CRON_SECRET } });

function scenario(name: string, fn: (makeStore: () => Promise<Store>) => Promise<void>, stores = STORES.slice(0, 2)) {
  for (const [storeName, makeStore] of stores) {
    Deno.test({
      name: `review payout [${storeName}] ${name}`,
      sanitizeOps: false,
      sanitizeResources: false,
      fn: () => fn(makeStore),
    });
  }
}

scenario("a 2xx answer that cannot be read is ambiguous: the payout stays unknown and is never paid twice", async (makeStore) => {
  const h = await setup(makeStore);
  const order = await insertPaid(h.store, { amount: 1500, paidAt: "2026-10-18T09:00:00.000Z" });
  const garbled = await unreadable2xxError();
  assertEquals([garbled.status, garbled.retryable], [200, false], "what HttpWaveClient reports for a garbled 200");
  h.wave.loseNextPayoutAnswer(garbled);

  const first = await daily(h);
  assertEquals(first.body.payout.status, "unknown", "Wave may have paid: the outcome is unknown, not failed");
  assertEquals((await h.store.getOrder(order.id))?.payout_id, "PO-20261018", "orders stay attached");

  h.clock.advance(DAY);
  const next = await daily(h);
  assertEquals([next.body.settled, next.body.payout], [1, null]);
  assertEquals(h.wave.payouts.length, 1, "Wave executed exactly one payout");
  assertEquals((await h.store.getOrder(order.id))?.payout_id, "PO-20261018");
});

scenario("idempotency-mismatch never fails a payout, whatever HTTP status Wave uses for it", async (makeStore) => {
  for (const status of [400, 422]) {
    const h = await setup(makeStore);
    const order = await insertPaid(h.store, { amount: 5000, paidAt: "2026-10-18T09:00:00.000Z" });
    // Day 1: Wave pays, the answer is lost in a timeout.
    h.wave.loseNextPayoutAnswer(new WaveError("timeout", 0, "timeout", true));
    assertEquals((await daily(h)).body.payout.status, "unknown");
    // Day 2: the retry is answered with idempotency-mismatch (not 409).
    h.clock.advance(DAY);
    h.wave.failNext("createPayout", new WaveError("Idempotency key reused", status, "idempotency-mismatch", false));
    const second = await daily(h);
    assertEquals(second.body.payout, null, `status ${status}: nothing new may be paid while the outcome is unknown`);
    assertEquals((await h.store.listUnsettledPayouts()).map((p) => [p.id, p.status]), [["PO-20261018", "unknown"]]);
    assertEquals((await h.store.getOrder(order.id))?.payout_id, "PO-20261018");
    assertEquals(h.wave.payouts.length, 1, `status ${status}: Wave executed exactly one payout`);
  }
});

scenario('Wave\'s {error: "<code>"} body shape is understood end to end', async (makeStore) => {
  const clock = new Clock(EVENING);
  const store = await makeStore();
  const order = await insertPaid(store, { amount: 5000, paidAt: "2026-10-18T09:00:00.000Z" });
  // A real HttpWaveClient whose payout endpoint answers with the documented `{"error": "<code>"}` shape.
  const wave = new HttpWaveClient({
    apiKey: "k",
    fetchFn: (input) => {
      const url = String(input);
      if (url.endsWith("/v1/balance")) return Promise.resolve(Response.json({ amount: "1000000", currency: "XOF" }));
      return Promise.resolve(Response.json({ error: "idempotency-mismatch", message: "Key reused" }, { status: 400 }));
    },
  });
  const deps: Deps = { store, wave, config: testConfig(), now: clock.now };
  const res = await runDaily(deps);
  assertEquals([res.payout?.status, res.payout?.error], ["unknown", "idempotency-mismatch"]);
  assertEquals((await store.getOrder(order.id))?.payout_id, "PO-20261018");
});

scenario("retries send the stored request body verbatim, never a rebuilt one", async (makeStore) => {
  const h = await setup(makeStore);
  await insertPaid(h.store, { amount: 1500, paidAt: "2026-10-18T09:00:00.000Z" });
  h.wave.failNext("createPayout", new WaveError("timeout", 0, "timeout", true));
  await daily(h);
  const [pending] = await h.store.listUnsettledPayouts();
  assertEquals(pending.request_body, buildPayoutBody(pending));
  // Bytes recorded by an earlier deploy (other key order): Wave holds the key against THESE bytes.
  const earlier = JSON.stringify({
    receive_amount: String(pending.amount),
    currency: "XOF",
    mobile: pending.mobile,
    client_reference: pending.id,
    payment_reason: "Revenus Teranga CV",
  });
  await h.store.updatePayout(pending.id, { request_body: earlier, updated_at: h.clock.iso() });

  h.clock.advance(DAY);
  await daily(h);
  const calls = h.wave.callsOf("createPayout");
  assertEquals(calls.length, 2);
  assertEquals(calls[1], [earlier, "teranga-cv-PO-20261018"]);
});

scenario("overlapping cron runs: a stale run can neither fail nor reopen a payout that succeeded", async (makeStore) => {
  const clock = new Clock(EVENING);
  const store = await makeStore();
  const order = await insertPaid(store, { amount: 5000, paidAt: "2026-10-18T09:00:00.000Z" });
  const fake = new FakeWave({ now: clock.now, balance: 1_000_000 });

  // Run A sends first but is held until run B has also picked the pending payout up; B is then answered
  // with a definitive-looking 401 (e.g. the API key was rotated between the two runs).
  let bStarted!: () => void;
  const bInFlight = new Promise<void>((r) => (bStarted = r));
  let releaseB!: () => void;
  const bGate = new Promise<void>((r) => (releaseB = r));
  let call = 0;
  const wave = Object.assign(Object.create(fake), {
    createPayout: async (body: string, key: string) => {
      call += 1;
      if (call === 1) {
        await bInFlight;
        return fake.createPayout(body, key);
      }
      bStarted();
      await bGate;
      throw new WaveError("Invalid API key", 401, "missing-auth-header", false);
    },
  }) as FakeWave;
  const deps: Deps = { store, wave, config: testConfig(), now: clock.now };

  const runA = runDaily(deps);
  for (let i = 0; (await store.listUnsettledPayouts()).length === 0; i++) {
    if (i > 2000) throw new Error("run A never created its payout");
    await new Promise((r) => setTimeout(r, 1));
  }
  const runB = runDaily(deps);
  const a = await runA;
  assertEquals(a.payout?.status, "succeeded");
  releaseB();
  await runB;

  const [payout] = (await store.stats(clock.iso())).payouts;
  assertEquals(payout.status, "succeeded", "a succeeded payout is final");
  assertEquals((await store.getOrder(order.id))?.payout_id, "PO-20261018", "its orders are never detached");

  clock.advance(DAY);
  const next = await runDaily({ ...deps, wave: fake });
  assertEquals(next.payout, null, "nothing is paid a second time");
  assertEquals(fake.payouts.length, 1);
});

scenario("a succeeded or failed payout is final in the store", async (makeStore) => {
  const store = await makeStore();
  const o = await insertPaid(store, { amount: 5000 });
  const args = {
    day: "2026-10-18",
    mobile: "+221771234567",
    feeRate: 0.01,
    payoutFeeRate: 0.01,
    maxAmount: null,
    minAmount: 1000,
    nowIso: EVENING,
  };
  const won = await store.createPayout({ ...args, id: "PO-20261018", idempotencyKey: "teranga-cv-PO-20261018" });
  assert(won);
  await store.updatePayout(won.id, { status: "succeeded", wave_payout_id: "pt-1", fee: 50, updated_at: EVENING });
  await store.updatePayout(won.id, { status: "unknown", error: "timeout", updated_at: "2026-10-18T20:31:00.000Z" });
  await store.failPayout(won.id, "missing-auth-header", "2026-10-18T20:32:00.000Z");
  const after = (await store.stats(EVENING)).payouts.find((p) => p.id === won.id)!;
  assertEquals([after.status, after.error, after.wave_payout_id, after.fee], ["succeeded", null, "pt-1", 50]);
  assertEquals((await store.getOrder(o.id))?.payout_id, won.id);
  assertEquals(await store.listUnsettledPayouts(), []);

  const o2 = await insertPaid(store, { amount: 5000 });
  const lost = await store.createPayout({
    ...args,
    day: "2026-10-19",
    id: "PO-20261019",
    idempotencyKey: "teranga-cv-PO-20261019",
  });
  assert(lost);
  await store.failPayout(lost.id, "insufficient-funds", "2026-10-19T20:30:00.000Z");
  assertEquals((await store.getOrder(o2.id))?.payout_id, null);
  await store.updatePayout(lost.id, { status: "processing", updated_at: "2026-10-19T20:31:00.000Z" });
  assertEquals(await store.listUnsettledPayouts(), [], "a failed payout is never reopened");
}, STORES);

Deno.test("payout rounding never spends more than the capped base, even with Wave's fee rounded up", () => {
  let x = 987654321;
  const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 20_000; i++) {
    const gross = Math.floor(rnd() * 5_000_000);
    const feeRate = [0, 0.01, 0.015, 0.02][i % 4];
    const payoutFeeRate = [0.01, 0.005, 0.02, 0][i % 4];
    const maxAmount = i % 3 === 0 ? null : Math.floor(rnd() * 5_000_000) - 10_000;
    const amount = computePayoutAmount(gross, feeRate, payoutFeeRate, maxAmount);
    const net = Math.floor(gross * (1 - feeRate));
    const base = maxAmount === null ? net : Math.min(net, maxAmount);
    assert(Number.isSafeInteger(amount) && amount >= 0);
    if (amount > 0) {
      const spent = amount + Math.ceil(amount * payoutFeeRate);
      assert(spent <= base, JSON.stringify({ gross, feeRate, payoutFeeRate, maxAmount, amount, spent, base }));
    }
  }
});

globalThis.addEventListener("unload", () => {
  db.close();
});
