// PGlite (Postgres 17 in WASM) with the real schema migration, for SqlStore / SupabaseStore tests.
import { PGlite } from "npm:@electric-sql/pglite@0.3.14";
import { RPC_SIGNATURES, SqlStore, sqlRpc } from "../../lib/store_sql.ts";
import type { QueryFn } from "../../lib/store_sql.ts";
import { SupabaseStore } from "../../lib/store_supabase.ts";
import type { RpcClient } from "../../lib/store_supabase.ts";

export const SCHEMA_MIGRATION = new URL("../../../../migrations/20261018000001_schema.sql", import.meta.url);
export const MIGRATIONS_DIR = new URL("../../../../migrations/", import.meta.url);

/**
 * Every migration PGlite can run, in file-name order: the schema, then the product migrations
 * (20261018000003_stage.sql, 20261018000004_premium.sql, …). The cron migration needs pg_cron and pg_net
 * (Supabase only) and is skipped.
 */
export async function testMigrations(): Promise<URL[]> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(MIGRATIONS_DIR)) {
    if (entry.isFile && entry.name.endsWith(".sql") && !entry.name.includes("_cron")) names.push(entry.name);
  }
  return names.sort().map((name) => new URL(name, MIGRATIONS_DIR));
}

const ROLES = `do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;`;

export interface TestDb {
  db: PGlite;
  query: QueryFn;
  migrate(): Promise<void>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export async function openTestDb(): Promise<TestDb> {
  const db = await PGlite.create();
  const query: QueryFn = async (sql, params) => {
    const res = await db.query<Record<string, unknown>>(sql, params);
    return { rows: res.rows };
  };
  const migrate = async () => {
    for (const file of await testMigrations()) await db.exec(await Deno.readTextFile(file));
  };
  await db.exec(ROLES);
  await migrate();
  return {
    db,
    query,
    migrate,
    reset: async () => {
      await db.exec("truncate tcv.orders, tcv.payouts, tcv.events, tcv.rate_limits, tcv.settings cascade");
    },
    close: () => db.close(),
  };
}

export function sqlStore(t: TestDb): SqlStore {
  return new SqlStore(t.query);
}

/**
 * Stand-in for supabase-js `rpc()` that behaves like PostgREST: arguments travel as JSON (undefined keys
 * vanish), every function parameter must be present, and failures come back as `{ error }`.
 */
export function postgrestClient(t: TestDb): RpcClient {
  const run = sqlRpc(t.query);
  return {
    async rpc(fn, args) {
      const sent = JSON.parse(JSON.stringify(args)) as Record<string, unknown>;
      const missing = (RPC_SIGNATURES[fn] ?? []).filter(([name]) => !(name in sent));
      if (!RPC_SIGNATURES[fn] || missing.length) {
        return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${fn}` } };
      }
      try {
        return { data: await run(fn, sent), error: null };
      } catch (err) {
        return { data: null, error: { code: "P0001", message: (err as Error).message } };
      }
    },
  };
}

export function supabaseStore(t: TestDb): SupabaseStore {
  return new SupabaseStore(postgrestClient(t));
}
