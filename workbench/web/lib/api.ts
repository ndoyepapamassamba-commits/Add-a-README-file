// HTTP client for the local agent server. The token is a bearer token stored
// in this browser only (localStorage); the OpenRouter key never reaches the UI.

export interface Connection {
  baseUrl: string;
  token: string;
}

const LS_KEY = 'wb.connection';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}
export const storage = { get: safeGet, set: safeSet };

export function defaultBaseUrl(): string {
  if (location.protocol === 'http:' || location.protocol === 'https:') return location.origin;
  return 'http://127.0.0.1:8787';
}

/** Reads `#token=…` (from the server's start-up link) or the saved connection. */
export function loadConnection(): Connection | null {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const token = hash.get('token');
  if (token) {
    const c = { baseUrl: hash.get('server') ?? defaultBaseUrl(), token };
    safeSet(LS_KEY, JSON.stringify(c));
    history.replaceState(null, '', location.pathname + location.search);
    return c;
  }
  const raw = safeGet(LS_KEY);
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Connection;
    return c.token ? c : null;
  } catch {
    return null;
  }
}

let conn: Connection | null = null;
export function setConnection(c: Connection | null): void {
  conn = c;
  safeSet(LS_KEY, c ? JSON.stringify(c) : null);
}
export function getConnection(): Connection | null {
  return conn;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  if (!conn) throw new ApiError(0, 'Non connecté');
  const url = new URL(conn.baseUrl.replace(/\/$/, '') + path);
  if (query)
    for (const [k, v] of Object.entries(query))
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  return url.toString();
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Query; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${conn?.token ?? ''}` };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(
      0,
      `Serveur injoignable (${conn?.baseUrl}). Lancez « npm start » dans le dossier workbench.`,
    );
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, msg);
  }
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

export async function apiBlob(path: string, query?: Query): Promise<Blob> {
  const res = await fetch(buildUrl(path, query), {
    headers: { Authorization: `Bearer ${conn?.token ?? ''}` },
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return res.blob();
}

const blobCache = new Map<string, Promise<string>>();
/** Authenticated resource → object URL (cached), for <img> etc. */
export function blobUrl(path: string, query?: Query): Promise<string> {
  const key = path + JSON.stringify(query ?? {});
  let p = blobCache.get(key);
  if (!p) {
    p = apiBlob(path, query).then((b) => URL.createObjectURL(b));
    p.catch(() => blobCache.delete(key));
    blobCache.set(key, p);
  }
  return p;
}

export async function downloadFile(
  path: string,
  filename: string,
  query?: Query,
  init?: { method?: string; body?: unknown },
): Promise<void> {
  let blob: Blob;
  if (init?.method === 'POST') {
    const res = await fetch(buildUrl(path, query), {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn?.token ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(init.body ?? {}),
    });
    if (!res.ok)
      throw new ApiError(
        res.status,
        ((await res.json().catch(() => ({ error: res.statusText }))) as { error: string }).error,
      );
    blob = await res.blob();
  } else blob = await apiBlob(path, query);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function wsUrl(): string {
  if (!conn) throw new Error('not connected');
  return `${conn.baseUrl.replace(/^http/, 'ws').replace(/\/$/, '')}/api/ws`;
}

const previewCache = new Map<string, Promise<string>>();
/** Capability URL on the isolated preview server (project file or artifact). */
export function previewUrl(q: { projectId?: string; artifactId?: string; path?: string }): Promise<string> {
  const key = JSON.stringify(q);
  let p = previewCache.get(key);
  if (!p) {
    p = api<{ url: string }>('/api/preview-url', { query: q }).then((r) => r.url);
    p.catch(() => previewCache.delete(key));
    previewCache.set(key, p);
  }
  return p;
}
