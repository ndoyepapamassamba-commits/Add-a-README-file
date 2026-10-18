// Identifiers, tokens and the small crypto helpers built on WebCrypto.

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const encoder = new TextEncoder();

export const ORDER_ID_RE = /^TCV-[0-9A-HJKMNP-TV-Z]{8}$/;

/** "TCV-" + 8 Crockford base32 characters (40 random bits). */
export function newOrderId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = "TCV-";
  for (const b of bytes) out += CROCKFORD[b & 31];
  return out;
}

/** 192-bit random customer access token, base64url without padding. */
export function newAccessToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(24)));
}

export function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (const b of view) out += b.toString(16).padStart(2, "0");
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/**
 * Constant-time string equality: the running time depends only on the length of `b`
 * (the expected value), never on where the first mismatching byte is.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < y.length; i++) diff |= (x[i % Math.max(x.length, 1)] ?? 0) ^ y[i];
  return diff === 0;
}

/** Peppered hash of a client IP so raw addresses are never stored. */
export async function hashIp(ip: string, pepper: string): Promise<string> {
  return (await sha256Hex(`tcv-ip:${pepper}:${ip}`)).slice(0, 32);
}
