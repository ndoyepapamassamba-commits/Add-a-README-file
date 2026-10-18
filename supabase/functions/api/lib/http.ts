// HTTP plumbing shared by every route: JSON responses, CORS, error format, bounded body reading.

export const MAX_BODY_BYTES = 32 * 1024;

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, x-cron-secret",
};

const JSON_TYPE = "application/json; charset=utf-8";

/** Thrown by route handlers; converted to the standard error body by the app. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": JSON_TYPE, "cache-control": "no-store" },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
): Response {
  return json(status, fields ? { error: code, message, fields } : { error: code, message });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: { ...CORS_HEADERS, "access-control-max-age": "86400" } });
}

/** `/functions/v1/api/orders` and `/api/orders` → `/orders`. Paths without an `api` segment are kept. */
export function routePath(pathname: string): string {
  const segments = pathname.split("/");
  const i = segments.indexOf("api");
  if (i === -1) return pathname || "/";
  const rest = segments.slice(i + 1).join("/");
  return "/" + rest.replace(/\/+$/, "");
}

const tooLarge = () => new HttpError(413, "payload_too_large", "La demande est trop volumineuse.");

/** Reads the raw body as UTF-8, refusing anything above `maxBytes` (declared or actual). */
export async function readBodyText(req: Request, maxBytes = MAX_BODY_BYTES): Promise<string> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw tooLarge();
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** Reads and parses a JSON object body; anything else is a 400. */
export async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  const text = await readBodyText(req);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, "bad_request", "La demande est illisible.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "bad_request", "La demande est illisible.");
  }
  return parsed as Record<string, unknown>;
}

/** Best-effort client IP behind Supabase's proxy. */
export function clientIp(req: Request): string {
  const h = req.headers;
  const direct = h.get("cf-connecting-ip") ?? h.get("x-real-ip");
  if (direct) return direct.trim();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

export function bearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m ? m[1].trim() : null;
}
