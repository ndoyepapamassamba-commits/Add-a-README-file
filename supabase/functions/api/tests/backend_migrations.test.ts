// Migrations: they apply in file-name order on a fresh database AND on the live one (which already ran
// 20261018000001_schema.sql and the Supabase-only cron migration), they can run again, and from 000003 on
// none contains the keyword the deployment tool stops on (it asks for an interactive confirmation).
import { assert, assertEquals, assertMatch, assertRejects } from "jsr:@std/assert@1.0.13";
import { PGlite } from "npm:@electric-sql/pglite@0.3.14";
import { migrationFiles, MIGRATIONS_DIR, SCHEMA_MIGRATION, sqlStore } from "./fixtures/backend_pglite.ts";
import type { TestDb } from "./fixtures/backend_pglite.ts";
import { orderRow } from "./fixtures/backend_harness.ts";

const ROLES = `do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;`;

const PRODUCTS = ["cv", "lettre", "pack", "stage", "premium"] as const;
const name = (u: URL) => u.pathname.split("/").pop()!;

/** A bare database with the Supabase roles and no migration applied. */
async function emptyDb(): Promise<TestDb> {
  const db = await PGlite.create();
  await db.exec(ROLES);
  const query = async (sql: string, params: unknown[]) => ({ rows: (await db.query<Record<string, unknown>>(sql, params)).rows });
  return {
    db,
    query,
    migrate: async () => {
      for (const f of await migrationFiles()) await db.exec(await Deno.readTextFile(f));
    },
    reset: async () => {},
    close: () => db.close(),
  };
}

async function allMigrationNames(): Promise<string[]> {
  const names: string[] = [];
  for await (const e of Deno.readDir(MIGRATIONS_DIR)) if (e.isFile && e.name.endsWith(".sql")) names.push(e.name);
  return names.sort();
}

/** Columns of tcv.orders, sorted. */
async function orderColumns(t: TestDb): Promise<string[]> {
  const r = await t.query(
    "select column_name from information_schema.columns where table_schema = 'tcv' and table_name = 'orders' order by column_name",
    [],
  );
  return r.rows.map((x) => String(x.column_name));
}

/** Source of every function of the Store API and the tcv helpers, as the database holds it now. */
async function functionSources(t: TestDb): Promise<Array<{ fn: string; src: string }>> {
  const r = await t.query(`select n.nspname || '.' || p.proname as fn, pg_get_functiondef(p.oid) as src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname like 'tcv\\_%') or n.nspname = 'tcv' order by 1`, []);
  return r.rows.map((x) => ({ fn: String(x.fn), src: String(x.src) }));
}

Deno.test("migrations: the expected files, in order; PGlite runs all of them but the Supabase-only cron jobs", async () => {
  assertEquals(await allMigrationNames(), [
    "20261018000001_schema.sql",
    "20261018000002_cron.sql",
    "20261018000003_stage.sql",
    "20261018000004_premium.sql",
    "20261018000005_autopay.sql",
  ]);
  assertEquals((await migrationFiles()).map(name), [
    "20261018000001_schema.sql",
    "20261018000003_stage.sql",
    "20261018000004_premium.sql",
    "20261018000005_autopay.sql",
  ]);
});

Deno.test("migrations from 000003 on never contain the word « delete » (deployment needs no confirmation)", async () => {
  for (const file of await allMigrationNames()) {
    if (file < "20261018000003") continue;
    const sql = await Deno.readTextFile(new URL(file, MIGRATIONS_DIR));
    assert(!/delete/i.test(sql), `${file} contains « delete »`);
  }
});

Deno.test({
  name: "migrations on a fresh database: all products, every order column in order_json, no row removal left",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const t = await emptyDb();
    try {
      await t.migrate();
      await t.migrate(); // idempotent: the whole chain runs again without error
      const store = sqlStore(t);
      for (const product of PRODUCTS) await store.insertOrder(orderRow({ product }));
      await assertRejects(() => store.insertOrder(orderRow({ product: "deluxe" as "cv" })));

      // order_json (redefined by 000005) returns every column of the table, no more, no less.
      const keys = await t.query("select array_agg(k order by k) as keys from tcv.orders o, jsonb_object_keys(tcv.order_json(o)) k where o.product = 'cv'", []);
      assertEquals(keys.rows[0].keys, await orderColumns(t));
      // tcv_stats (redefined by 000005) keeps every block and adds the phone heartbeat.
      const stats = (await t.query("select public.tcv_stats(now()) as s", [])).rows[0].s as Record<string, unknown>;
      assertEquals(Object.keys(stats).sort(), [
        "allTime",
        "last30",
        "last7",
        "lastPhoneNotificationAt",
        "payouts",
        "pendingPayout",
        "recentOrders",
        "today",
        "yesterday",
      ]);
      // After the whole chain no SQL function removes rows any more (tcv_purge was rewritten by 000005).
      for (const { fn, src } of await functionSources(t)) assert(!/\bdelete\b/i.test(src), `${fn} still removes rows`);
      // The payout safety of the reviewed 000001 is untouched by the later migrations.
      const updatePayout = (await functionSources(t)).find((f) => f.fn === "public.tcv_update_payout")!.src;
      assertMatch(updatePayout, /status not in \('succeeded', 'failed'\)/);
      const updateOrder = (await functionSources(t)).find((f) => f.fn === "public.tcv_update_order")!.src;
      assertMatch(updateOrder, /o\.status <> 'paid' and p_patch \? 'checkout_session_id'/);
    } finally {
      await t.close();
    }
  },
});

Deno.test({
  name: "migrations on the live database (000001 already applied, with data): 000003 → 000005 keep every row",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const t = await emptyDb();
    try {
      // The live project: only the reviewed schema (000002 schedules pg_cron jobs and does not touch tcv).
      await t.db.exec(await Deno.readTextFile(SCHEMA_MIGRATION));
      const legacy = (over: Record<string, unknown>) => ({
        ...orderRow(),
        manual_amount: undefined,
        payment_detected_at: undefined,
        payment_detected_text: undefined,
        ...over,
      });
      const paid = legacy({ id: "TCV-LIVE0001", product: "pack", status: "paid", payment_method: "wave", paid_amount: 1500, paid_at: "2026-10-18T10:00:00.000Z" });
      const waiting = legacy({ id: "TCV-LIVE0002", product: "cv", status: "awaiting_manual", manual_payer_phone: "+221771234567" });
      for (const row of [paid, waiting]) await t.query("select public.tcv_insert_order($1::jsonb)", [JSON.stringify(row)]);
      await t.query("select public.tcv_record_event('evt-live', 'checkout.session.completed', 'cos-live', '{}'::jsonb)", []);
      await assertRejects(() => t.query("select public.tcv_insert_order($1::jsonb)", [JSON.stringify(legacy({ id: "TCV-LIVE0003", product: "stage" }))]));

      for (const f of await migrationFiles()) if (name(f) > "20261018000001_schema.sql") await t.db.exec(await Deno.readTextFile(f));

      const store = sqlStore(t);
      const got = await store.getOrder(paid.id);
      assertEquals([got?.status, got?.paid_amount, got?.payment_method, got?.product], ["paid", 1500, "wave", "pack"]);
      assertEquals([got?.manual_amount, got?.payment_detected_at, got?.payment_detected_text], [null, null, null]);
      assertEquals((await store.getOrder(waiting.id))?.manual_payer_phone, "+221771234567");
      assertEquals(await store.recordEvent("evt-live", "checkout.session.completed", "cos-live", {}), false, "events kept");
      for (const product of PRODUCTS) await store.insertOrder(orderRow({ product }));
      assertEquals((await store.stats("2026-10-18T12:00:00.000Z")).allTime, { paid: 1, revenue: 1500 });
      // The new autopay functions work on rows created before the migration.
      await store.updateOrder(waiting.id, { status: "checkout" });
      assertEquals(await store.assignManualAmount(waiting.id, 1000, 49, "2000-01-01T00:00:00.000Z"), 999);
    } finally {
      await t.close();
    }
  },
});
