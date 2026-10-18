// Senegal mobile numbers: 9 digits starting with 70, 71, 75, 76, 77 or 78.

const SN_MOBILE_RE = /^(?:\+221|00221|221)?(7[015678]\d{7})$/;

/** "77 123 45 67", "00221771234567", "+221 77-123-45-67"… → "+221771234567"; anything else → null. */
export function normalizeSnMobile(input: string): string | null {
  if (typeof input !== "string") return null;
  const compact = input.trim().replace(/[\s.\-()]/g, "");
  const m = SN_MOBILE_RE.exec(compact);
  return m ? `+221${m[1]}` : null;
}

/** "+221771234567" → "+221 77 123 45 67". Input that is not a Senegal mobile is returned trimmed. */
export function formatSnMobile(input: string): string {
  const e164 = normalizeSnMobile(input);
  if (!e164) return typeof input === "string" ? input.trim() : "";
  const d = e164.slice(4);
  return `+221 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
}
