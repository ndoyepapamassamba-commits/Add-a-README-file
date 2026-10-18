// Daily payout (POST /cron/daily) and purge, run against MemoryStore and SqlStore (PGlite).
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { WaveError } from "../lib/types.ts";
import type { Store } from "../lib/types.ts";
import { MemoryStore } from "../lib/store_memory.ts";
import { buildPayoutBody, computePayoutAmount, idempotencyKeyFor, payoutIdFor } from "../lib/payout.ts";
import { FakeWave } from "../lib/wave.ts";
import { Clock, CRON_SECRET, DAY, insertPaid, makeHarness, OWNER_MOBILE, orderRow } from "./fixtures/backend_harness.ts";
import type { Harness, HarnessOptions } from "./fixtures/backend_harness.ts";
import { openTestDb, sqlStore } from "./fixtures/backend_pglite.ts";

const db = await openTestDb();

const STORES: Array<[string, () => Promise<Store>]> = [
  ["MemoryStore", () => Promise.resolve(new MemoryStore())],
  ["SqlStore(PGlite)", async () => {
    await db.reset();
    return sqlStore(db);
  }],
];

const EVENING = "2026-10-18T20:30:00.000Z";

async function setup(makeStore: () => Promise<Store>, opts: HarnessOptions = {}): Promise<Harness> {
  const clock = opts.clock ?? new Clock(EVENING);
  return makeHarness({ store: await makeStore(), clock, wave: new FakeWave({ now: clock.now, balance: 1_000_000 }), ...opts });
}

const daily = (h: Harness) => h.call("POST", "/cron/daily", { headers: { "x-cron-secret": CRON_SECRET } });

function scenario(name: string, fn: (makeStore: () => Promise<Store>) => Promise<void>) {
  for (const [storeName, makeStore] of STORES) {
    Deno.test({ name: `payout [${storeName}] ${name}`, sanitizeOps: false, sanitizeResources: false, fn: () => fn(makeStore) });
  }
}

Deno.test("computePayoutAmount follows the SPEC formula", () => {
  const cases: Array<[number, number, number, number | null, number]> = [
    // gross, feeRate, payoutFeeRate, maxAmount, expected
    [0, 0.01, 0.01, null, 0],
    [1, 0.01, 0.01, null, 0],
    [1000, 0.01, 0.01, null, 979], // net 990 → floor(989 / 1.01)
    [1500, 0.01, 0.01, null, 1469], // net 1485 → floor(1484 / 1.01)
    [2500, 0.01, 0.01, null, 2449],
    [10_000, 0.01, 0.01, null, 9800], // net 9900 → floor(9899 / 1.01) = floor(9800.99)
    [100_000, 0.01, 0.01, null, 98_018],
    [10_000, 0.01, 0.01, 5000, 4949], // capped by the balance
    [10_000, 0.01, 0.01, 20_000, 9800], // cap above net: no effect
    [10_000, 0.01, 0.01, 0, 0],
    [10_000, 0.01, 0.01, -500, 0], // reserve larger than the balance
    [10_000, 0, 0, null, 9999],
    [10_000, 0.02, 0.015, null, 9654], // net 9800 → floor(9799 / 1.015)
  ];
  for (const [gross, fee, pfee, max, expected] of cases) {
    assertEquals(computePayoutAmount(gross, fee, pfee, max), expected, JSON.stringify([gross, fee, pfee, max]));
  }
});

Deno.test("payout ids, idempotency keys and the request body are deterministic", () => {
  assertEquals(payoutIdFor("2026-10-18"), "PO-20261018");
  assertEquals(idempotencyKeyFor("PO-20261018"), "teranga-cv-PO-20261018");
  const row = { id: "PO-20261018", amount: 2449, mobile: "+221771234567" };
  const body = '{"currency":"XOF","receive_amount":"2449","mobile":"+221771234567","client_reference":"PO-20261018","payment_reason":"Revenus Teranga CV"}';
  assertEquals(buildPayoutBody(row), body);
  assertEquals(buildPayoutBody({ ...row }), body);
});

scenario("pays the day's Wave revenue once even when the cron runs twice", async (makeStore) => {
  const h = await setup(makeStore);
  const a = await insertPaid(h.store, { amount: 1500, paidAt: "2026-10-18T09:00:00.000Z" });
  const b = await insertPaid(h.store, { amount: 1000, paidAt: "2026-10-18T19:00:00.000Z" });
  const first = await daily(h);
  assertEquals(first.status, 200);
  assertEquals([first.body.ok, first.body.payout.id, first.body.payout.status, first.body.payout.amount], [true, "PO-20261018", "succeeded", 2449]);
  assertEquals(first.body.errors, []);
  const second = await daily(h);
  assertEquals([second.body.payout, second.body.settled], [null, 0]);

  const sent = h.wave!.callsOf("createPayout");
  assertEquals(sent.length, 1);
  assertEquals(sent[0], [buildPayoutBody({ id: "PO-20261018", amount: 2449, mobile: OWNER_MOBILE }), "teranga-cv-PO-20261018"]);
  assertEquals(JSON.parse(sent[0][0] as string).payment_reason, "Revenus Teranga CV");
  for (const o of [a, b]) assertEquals((await h.store.getOrder(o.id))?.payout_id, "PO-20261018");
  const stats = await h.store.stats(h.clock.iso());
  const payout = stats.payouts[0];
  assertEquals([payout.status, payout.wave_payout_id !== null, payout.fee, payout.request_body], ["succeeded", true, 25, sent[0][0]]);
  assertEquals(stats.pendingPayout, 0);
});

scenario("a retryable error leaves the payout unknown and the next run resends identical bytes and key", async (makeStore) => {
  const h = await setup(makeStore);
  await insertPaid(h.store, { amount: 1500, paidAt: "2026-10-18T09:00:00.000Z" });
  h.wave!.failNext("createPayout", new WaveError("timeout", 0, "timeout", true));
  const first = await daily(h);
  assertEquals([first.body.payout.status, first.body.payout.error], ["unknown", "timeout"]);
  assertEquals((await h.store.listUnsettledPayouts()).map((p) => p.status), ["unknown"]);

  h.wave!.failNext("createPayout", new WaveError("bad gateway", 502, "http_502", true));
  const second = await daily(h); // same day, still ambiguous
  assertEquals(second.body.settled, 0);

  h.clock.advance(DAY);
  const third = await daily(h);
  assertEquals([third.body.settled, third.body.payout], [1, null], "yesterday's payout settled; nothing new to pay");
  const calls = h.wave!.callsOf("createPayout");
  assertEquals(calls.length, 3);
  assertEquals(calls[1], calls[0], "same body bytes and idempotency key");
  assertEquals(calls[2], calls[0]);
  assertEquals(h.wave!.payouts.length, 1, "Wave executed it exactly once");
  const stored = (await h.store.stats(h.clock.iso())).payouts.find((p) => p.id === "PO-20261018")!;
  assertEquals([stored.status, stored.request_body], ["succeeded", calls[0][0]]);
});

scenario("a definitive failure detaches the orders and they are paid out the next day", async (makeStore) => {
  const h = await setup(makeStore);
  const o1 = await insertPaid(h.store, { amount: 1500, paidAt: "2026-10-18T09:00:00.000Z" });
  h.wave!.payoutOutcome = "failed";
  const first = await daily(h);
  assertEquals([first.body.payout.status, first.body.payout.error], ["failed", "recipient-limit-exceeded"]);
  assertEquals((await h.store.getOrder(o1.id))?.payout_id, null);

  h.wave!.payoutOutcome = "succeeded";
  h.clock.advance(DAY);
  const o2 = await insertPaid(h.store, { amount: 1000, paidAt: h.clock.iso() });
  const next = await daily(h);
  assertEquals([next.body.payout.id, next.body.payout.status, next.body.payout.amount], ["PO-20261019", "succeeded", computePayoutAmount(2500, 0.01, 0.01, null)]);
  for (const o of [o1, o2]) assertEquals((await h.store.getOrder(o.id))?.payout_id, "PO-20261019");
});

scenario("a non-retryable Wave error fails the payout; a 409 stays unknown", async (makeStore) => {
  const h = await setup(makeStore);
  const o = await insertPaid(h.store, { amount: 5000, paidAt: "2026-10-18T09:00:00.000Z" });
  h.wave!.failNext("createPayout", new WaveError("invalid mobile", 400, "invalid-wallet", false));
  const res = await daily(h);
  assertEquals([res.body.payout.status, res.body.payout.error], ["failed", "invalid-wallet"]);
  assertEquals((await h.store.getOrder(o.id))?.payout_id, null);

  h.clock.advance(DAY);
  h.wave!.failNext("createPayout", new WaveError("key reused", 409, "idempotency-mismatch", false));
  const conflict = await daily(h);
  assertEquals(conflict.body.payout.status, "unknown", "money may have left: never detach on a conflict");
  assertEquals((await h.store.getOrder(o.id))?.payout_id, "PO-20261019");
});

scenario("a processing payout is settled later through searchPayouts", async (makeStore) => {
  const h = await setup(makeStore);
  await insertPaid(h.store, { amount: 3000, paidAt: "2026-10-18T09:00:00.000Z" });
  h.wave!.payoutOutcome = "processing";
  assertEquals((await daily(h)).body.payout.status, "processing");
  h.clock.advance(DAY);
  assertEquals((await daily(h)).body.settled, 0, "still processing at Wave");
  h.wave!.settlePayout("PO-20261018", "succeeded");
  h.clock.advance(DAY);
  assertEquals((await daily(h)).body.settled, 1);
  assertEquals(await h.store.listUnsettledPayouts(), []);
  assertEquals(h.wave!.callsOf("createPayout").length, 1);
  assertEquals(h.wave!.callsOf("searchPayouts").map((c) => c[0]), ["PO-20261018", "PO-20261018"]);
});

scenario("a reversed payout is failed and its orders roll over", async (makeStore) => {
  const h = await setup(makeStore);
  const o = await insertPaid(h.store, { amount: 3000, paidAt: "2026-10-18T09:00:00.000Z" });
  h.wave!.payoutOutcome = "processing";
  await daily(h);
  h.wave!.settlePayout("PO-20261018", "reversed");
  h.wave!.payoutOutcome = "succeeded";
  h.clock.advance(DAY);
  const res = await daily(h);
  assertEquals([res.body.settled, res.body.payout.id], [1, "PO-20261019"]);
  assertEquals((await h.store.getOrder(o.id))?.payout_id, "PO-20261019");
});

scenario("nothing is sent below PAYOUT_MIN", async (makeStore) => {
  const h = await setup(makeStore, { env: { PAYOUT_MIN: "2000" } });
  const o = await insertPaid(h.store, { amount: 1500, paidAt: "2026-10-18T09:00:00.000Z" });
  const res = await daily(h);
  assertEquals(res.body.payout, null);
  assertEquals(h.wave!.callsOf("createPayout").length, 0);
  assertEquals((await h.store.getOrder(o.id))?.payout_id, null);
});

scenario("the payout is capped by the live balance minus the reserve", async (makeStore) => {
  const h = await setup(makeStore, { env: { PAYOUT_RESERVE: "1000" } });
  h.wave!.balance = 5000;
  await insertPaid(h.store, { amount: 10_000, paidAt: "2026-10-18T09:00:00.000Z" });
  const res = await daily(h);
  assertEquals(res.body.payout.amount, computePayoutAmount(10_000, 0.01, 0.01, 4000));
  assertEquals(res.body.payout.amount, 3959);
});

scenario("an unknown balance does not block the payout", async (makeStore) => {
  const h = await setup(makeStore);
  h.wave!.failNext("getBalance", new WaveError("down", 503, "unavailable", true));
  await insertPaid(h.store, { amount: 1500, paidAt: "2026-10-18T09:00:00.000Z" });
  assertEquals((await daily(h)).body.payout.amount, 1469);
});

scenario("manual-method orders are never paid out", async (makeStore) => {
  const h = await setup(makeStore);
  const manual = await insertPaid(h.store, { amount: 50_000, method: "manual", paidAt: "2026-10-18T09:00:00.000Z" });
  const wave = await insertPaid(h.store, { amount: 1500, paidAt: "2026-10-18T09:00:00.000Z" });
  const res = await daily(h);
  assertEquals(res.body.payout.amount, 1469);
  assertEquals((await h.store.getOrder(manual.id))?.payout_id, null);
  assertEquals((await h.store.getOrder(wave.id))?.payout_id, "PO-20261018");
});

scenario("no payout when disabled, without a valid owner number or without Wave", async (makeStore) => {
  for (const env of [{ PAYOUT_ENABLED: "false" }, { OWNER_WAVE_MOBILE: "+33612345678" }]) {
    const h = await setup(makeStore, { env });
    await insertPaid(h.store, { amount: 5000, paidAt: "2026-10-18T09:00:00.000Z" });
    const res = await daily(h);
    assertEquals([res.body.ok, res.body.payout], [true, null], JSON.stringify(env));
    assertEquals(h.wave!.callsOf("createPayout").length, 0);
  }
  const clock = new Clock(EVENING);
  const noWave = makeHarness({ store: await makeStore(), clock, wave: null });
  await insertPaid(noWave.store, { amount: 5000, paidAt: "2026-10-18T09:00:00.000Z" });
  assertEquals((await daily(noWave)).body.payout, null);
});

scenario("daily purges personal data (unpaid > 3 days, paid > 30 days)", async (makeStore) => {
  const h = await setup(makeStore, { env: { PAYOUT_ENABLED: "false" } });
  const ago = (d: number) => new Date(h.clock.t - d * DAY).toISOString();
  const staleUnpaid = orderRow({ created_at: ago(3.1) });
  const freshUnpaid = orderRow({ created_at: ago(2.9) });
  await h.store.insertOrder(staleUnpaid);
  await h.store.insertOrder(freshUnpaid);
  const oldPaid = await insertPaid(h.store, { paidAt: ago(30.5) });
  const paid = await insertPaid(h.store, { paidAt: ago(29) });
  const res = await daily(h);
  assertEquals(res.body.purged, 2);
  assertEquals((await h.store.getOrder(staleUnpaid.id))?.input, null);
  assertEquals((await h.store.getOrder(oldPaid.id))?.document, null);
  assert((await h.store.getOrder(freshUnpaid.id))?.input);
  assert((await h.store.getOrder(paid.id))?.document);
  assertEquals((await daily(h)).body.purged, 0);
});

Deno.test("daily never throws: store failures are reported in errors", async () => {
  const h = await setup(() => Promise.resolve(new MemoryStore()));
  h.store.createPayout = () => Promise.reject(new Error("db down"));
  h.store.purge = () => Promise.reject(new Error("db still down"));
  const res = await daily(h);
  assertEquals(res.status, 200);
  assertEquals([res.body.ok, res.body.payout, res.body.purged], [true, null, 0]);
  assertEquals(res.body.errors, ["payout: db down", "purge: db still down"]);
});

globalThis.addEventListener("unload", () => {
  db.close();
});
