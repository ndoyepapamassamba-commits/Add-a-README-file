// Personalisation of the course downloads: the buyer's licence line is written into each exercise workbook
// (.xlsx, where the content kit put the literal {{LICENCE}}) and a LICENCE.txt is added to each data pack (.zip).
// Pure functions over bytes (npm:fflate); the files are small (≤ 2 MB each), far below the Edge CPU limit.
import { strFromU8, strToU8, unzipSync, zipSync } from "npm:fflate@0.8.2";
import type { Unzipped } from "npm:fflate@0.8.2";
import type { CourseProduct } from "./types.ts";
import { COURSE_CATALOG, LICENCE_PLACEHOLDER, licenceLine } from "./course_catalog.ts";

/** Entries of a workbook that may carry the placeholder: shared strings, sheets (inline strings), headers… */
export const XLSX_LICENCE_ENTRY_RE = /^xl\/.+\.xml$/;
export const ZIP_LICENCE_NAME = "LICENCE.txt";
const ZIP_LEVEL = 6;
const BOM = "\ufeff";

const XML_ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

/** & < > " ' → &amp; &lt; &gt; &quot; &apos; (safe in XML text and attribute values). */
export function xmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => XML_ENTITIES[c]);
}

/** Re-zips `entries` in their own key order (the order unzipSync read them in). */
function rezip(entries: Unzipped): Uint8Array {
  return zipSync(entries, { level: ZIP_LEVEL });
}

/**
 * Replaces every LICENCE_PLACEHOLDER in the entries matching XLSX_LICENCE_ENTRY_RE with the XML-escaped
 * licence. Other entries are kept byte for byte, in the original order. Throws on bytes that are not a zip.
 */
export function injectXlsxLicence(xlsx: Uint8Array, licence: string): { bytes: Uint8Array; replaced: number } {
  const entries = unzipSync(xlsx);
  const escaped = xmlEscape(licence);
  let replaced = 0;
  const out: Unzipped = {};
  for (const [name, data] of Object.entries(entries)) {
    if (!XLSX_LICENCE_ENTRY_RE.test(name)) {
      out[name] = data;
      continue;
    }
    const text = strFromU8(data);
    const parts = text.split(LICENCE_PLACEHOLDER);
    if (parts.length === 1) {
      out[name] = data;
      continue;
    }
    replaced += parts.length - 1;
    out[name] = strToU8(parts.join(escaped));
  }
  return { bytes: rezip(out), replaced };
}

/** Adds or replaces LICENCE.txt (UTF-8 with BOM, so Windows Notepad shows the accents) at the root of a zip. */
export function addZipLicence(zip: Uint8Array, text: string): Uint8Array {
  const entries = unzipSync(zip);
  const licence = strToU8(BOM + text);
  const out: Unzipped = {};
  let placed = false;
  for (const [name, data] of Object.entries(entries)) {
    if (name === ZIP_LICENCE_NAME) {
      out[name] = licence;
      placed = true;
    } else out[name] = data;
  }
  if (!placed) out[ZIP_LICENCE_NAME] = licence;
  return rezip(out);
}

/** Text of LICENCE.txt: CRLF line ends, French typography (NBSP inside « » and before « : »). */
export function licenceTxt(fullName: string, orderId: string, product: CourseProduct = "pq_essentiel"): string {
  return [
    licenceLine(fullName, orderId),
    `${COURSE_CATALOG[product].label} (Teranga Pro).`,
    "Usage personnel uniquement\u00a0: ne pas partager, revendre ni publier ces fichiers.",
    "Toutes les données sont fictives, générées pour la formation.",
    "",
  ].join("\r\n");
}
