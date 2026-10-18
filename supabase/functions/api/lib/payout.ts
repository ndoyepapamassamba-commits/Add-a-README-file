// Nightly job (POST /cron/daily): settle earlier payouts, pay today's Wave revenue to the owner, purge old data.
import { WaveError } from "./types.ts";
import type { Deps, PayoutRow, WavePayout } from "./types.ts";
import { log } from "./http.ts";

export const PAYOUT_REASON = "Revenus Teranga CV";
export const UNPAID_RETENTION_DAYS = 3;
export const PAID_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

export function payoutIdFor(day: string): string {
  return `PO-${day.replaceAll("-", "")}`;
}

export function idempotencyKeyFor(payoutId: string): string {
  return `teranga-cv-${payoutId}`;
}

/**
 * Amount sent to the owner. Plain IEEE-754 double arithmetic in this exact order: tcv.payout_amount in SQL
 * performs the same float8 operations so both stores always agree to the franc.
 */
export function computePayoutAmount(
  gross: number,
  feeRate: number,
  payoutFeeRate: number,
  maxAmount: number | null,
): number {
  const net = Math.floor(gross * (1 - feeRate));
  const base = maxAmount === null ? net : Math.min(net, maxAmount);
  const amount = Math.floor((base - 1) / (1 + payoutFeeRate));
  return amount < 0 ? 0 : amount;
}

/** Deterministic request body: the same bytes on every retry with the same idempotency key. */
export function buildPayoutBody(row: Pick<PayoutRow, "id" | "amount" | "mobile">): string {
  return JSON.stringify({
    currency: "XOF",
    receive_amount: String(row.amount),
    mobile: row.mobile,
    client_reference: row.id,
    payment_reason: PAYOUT_REASON,
  });
}

export interface DailyResult {
  ok: true;
  payout: PayoutRow | null;
  settled: number;
  purged: number;
  errors: string[];
}

const describe = (err: unknown) =>
  err instanceof WaveError ? `${err.code} (${err.status})` : err instanceof Error ? err.message : String(err);

const isFinal = (row: PayoutRow) => row.status === "succeeded" || row.status === "failed";

/** Records what Wave answered for a payout and returns the updated row. */
async function applyWaveResult(deps: Deps, row: PayoutRow, res: WavePayout, nowIso: string): Promise<PayoutRow> {
  if (res.status === "failed" || res.status === "reversed") {
    const error = res.payout_error?.error_code ?? `payout-${res.status}`;
    await deps.store.failPayout(row.id, error, nowIso);
    return { ...row, status: "failed", error, updated_at: nowIso };
  }
  const fee = res.fee !== undefined && Number.isFinite(Number(res.fee)) ? Number(res.fee) : null;
  const patch: Partial<PayoutRow> = res.status === "succeeded"
    ? { status: "succeeded", wave_payout_id: res.id ?? null, fee, error: null, updated_at: nowIso }
    : { status: "processing", wave_payout_id: res.id ?? null, updated_at: nowIso };
  await deps.store.updatePayout(row.id, patch);
  return { ...row, ...patch };
}

/**
 * True only when Wave refused the request before acting on it: a 4xx other than timeout, conflict, rate
 * limit or idempotency mismatch (whose HTTP status Wave does not document). A 2xx whose body could not be
 * read, or any other surprise, may hide a payout that was executed.
 */
export function isDefinitiveRefusal(err: unknown): err is WaveError {
  return err instanceof WaveError && !err.retryable && err.status >= 400 && err.status < 500 &&
    err.status !== 409 && err.code !== "idempotency-mismatch";
}

/**
 * Sends (or re-sends) a payout with its idempotency key. Only a definitive refusal fails the payout; anything
 * ambiguous leaves it `unknown` so the next run retries with the same key and the same stored bytes, because
 * failing detaches its orders and they would then be paid a second time.
 */
async function sendPayout(deps: Deps, row: PayoutRow, nowIso: string): Promise<PayoutRow> {
  const body = row.request_body || buildPayoutBody(row);
  if (row.request_body !== body) await deps.store.updatePayout(row.id, { request_body: body, updated_at: nowIso });
  const sent = { ...row, request_body: body };
  try {
    return await applyWaveResult(deps, sent, await deps.wave!.createPayout(body, row.idempotency_key), nowIso);
  } catch (err) {
    if (isDefinitiveRefusal(err)) {
      await deps.store.failPayout(row.id, err.code, nowIso);
      return { ...sent, status: "failed", error: err.code, updated_at: nowIso };
    }
    const error = err instanceof WaveError ? err.code : "send_error";
    log.warn(`payout ${row.id}: outcome unknown, will retry with the same key`, describe(err));
    await deps.store.updatePayout(row.id, { status: "unknown", error, updated_at: nowIso });
    return { ...sent, status: "unknown", error, updated_at: nowIso };
  }
}

/** Picks the most meaningful of several Wave payouts sharing a client_reference. */
function pickOutcome(results: WavePayout[]): WavePayout | null {
  for (const status of ["succeeded", "processing", "failed", "reversed"]) {
    const hit = results.find((r) => r.status === status);
    if (hit) return hit;
  }
  return null;
}

async function settlePayout(deps: Deps, row: PayoutRow, nowIso: string): Promise<PayoutRow> {
  if (row.status !== "processing") return await sendPayout(deps, row, nowIso);
  const results = (await deps.wave!.searchPayouts(row.id)).filter((r) => !r.client_reference || r.client_reference === row.id);
  const outcome = pickOutcome(results);
  if (!outcome || outcome.status === "processing") return row;
  return await applyWaveResult(deps, row, outcome, nowIso);
}

export async function runDaily(deps: Deps): Promise<DailyResult> {
  const { store, wave, config } = deps;
  const now = deps.now();
  const nowIso = now.toISOString();
  const day = nowIso.slice(0, 10);
  const errors: string[] = [];
  const report = (step: string, err: unknown) => {
    const msg = `${step}: ${describe(err)}`;
    errors.push(msg);
    log.error(`daily ${msg}`);
  };

  let settled = 0;
  if (wave) {
    try {
      for (const row of await store.listUnsettledPayouts()) {
        try {
          if (isFinal(await settlePayout(deps, row, nowIso))) settled++;
        } catch (err) {
          report(`settle ${row.id}`, err);
        }
      }
    } catch (err) {
      report("settle", err);
    }
  }

  let payout: PayoutRow | null = null;
  if (config.payoutEnabled && config.ownerWaveMobile && wave) {
    try {
      let maxAmount: number | null = null;
      try {
        maxAmount = (await wave.getBalance()).amount - config.payoutReserve;
      } catch (err) {
        log.warn("daily: balance unavailable, payout not capped", describe(err));
      }
      const id = payoutIdFor(day);
      const row = await store.createPayout({
        id,
        day,
        mobile: config.ownerWaveMobile,
        idempotencyKey: idempotencyKeyFor(id),
        feeRate: config.waveFeeRate,
        payoutFeeRate: config.payoutFeeRate,
        maxAmount,
        minAmount: config.payoutMin,
        nowIso,
      });
      if (row) payout = await sendPayout(deps, row, nowIso);
    } catch (err) {
      report("payout", err);
    }
  }

  let purged = 0;
  try {
    purged = await store.purge(
      new Date(now.getTime() - UNPAID_RETENTION_DAYS * DAY_MS).toISOString(),
      new Date(now.getTime() - PAID_RETENTION_DAYS * DAY_MS).toISOString(),
      nowIso,
    );
  } catch (err) {
    report("purge", err);
  }

  return { ok: true, payout, settled, purged, errors };
}
