// Adversarial review of the order rows: once paid, an order keeps the record of the Wave session that paid
// it. Runs against MemoryStore, SqlStore (PGlite) and the PostgREST stand-in.
import { assertEquals } from "jsr:@std/assert@1.0.13";
import type { Store } from "../lib/types.ts";
import { MemoryStore } from "../lib/store_memory.ts";
import { orderRow } from "./fixtures/backend_harness.ts";
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

for (const [name, makeStore] of STORES) {
  Deno.test({
    name: `review store [${name}] a paid order keeps its paying session; only the template may still change`,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      const store = await makeStore();
      const row = orderRow({
        status: "checkout",
        checkout_session_id: "cos-paid",
        wave_launch_url: "https://pay.wave.com/c/cos-paid",
        checkout_expires_at: "2026-10-18T10:30:00.000Z",
      });
      await store.insertOrder(row);
      await store.markPaid(row.id, {
        method: "wave",
        paidAmount: 1500,
        transactionId: "T_1",
        sessionId: "cos-paid",
        paidAt: "2026-10-18T10:05:00.000Z",
      });
      // A checkout request that started before the payment lands afterwards.
      await store.updateOrder(row.id, {
        status: "checkout",
        checkout_session_id: "cos-late",
        wave_launch_url: "https://pay.wave.com/c/cos-late",
        checkout_expires_at: "2026-10-18T11:00:00.000Z",
        manual_payer_phone: "+221771234567",
        template: "elegant",
      });
      const got = (await store.getOrder(row.id))!;
      assertEquals(
        [got.status, got.checkout_session_id, got.wave_launch_url, got.checkout_expires_at, got.manual_payer_phone, got.template],
        ["paid", "cos-paid", "https://pay.wave.com/c/cos-paid", "2026-10-18T10:30:00.000Z", null, "elegant"],
      );
    },
  });
}

globalThis.addEventListener("unload", () => {
  db.close();
});
