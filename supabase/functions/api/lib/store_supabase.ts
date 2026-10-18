// Production Store: the same public.tcv_* functions as SqlStore, called through supabase.rpc() with the service key.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { RpcStore } from "./store_sql.ts";
import type { EnvGet } from "./config.ts";

/** The slice of SupabaseClient this store needs (lets tests substitute a PostgREST stand-in). */
export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

export class SupabaseStore extends RpcStore {
  constructor(client: RpcClient) {
    super(async (fn, args) => {
      const { data, error } = await client.rpc(fn, args);
      if (error) throw new Error(`${fn} failed: ${error.code ? `${error.code} ` : ""}${error.message}`);
      return data ?? null;
    });
  }
}

/** SUPABASE_SERVICE_ROLE_KEY, or the `default` entry of the newer SUPABASE_SECRET_KEYS JSON object. */
export function serviceKeyFromEnv(envGet: EnvGet): string | null {
  const legacy = envGet("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) return legacy;
  const raw = envGet("SUPABASE_SECRET_KEYS");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.default === "string" && parsed.default ? parsed.default : null;
  } catch {
    return null;
  }
}

export function createSupabaseStore(url: string, serviceKey: string): SupabaseStore {
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return new SupabaseStore(client as unknown as RpcClient);
}
