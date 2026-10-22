// Personalised downloads (SPEC_COURSE §3.6 and §6): licence injected in the workbooks, LICENCE.txt in the data
// packs, headers, gating, names that are not listed files, and the 30-per-24-hours limit.
import { assert, assertEquals, assertFalse, assertThrows } from "jsr:@std/assert@1.0.13";
import { strFromU8, strToU8, unzipSync, zipSync } from "npm:fflate@0.8.2";
import { addZipLicence, injectXlsxLicence, licenceTxt, xmlEscape } from "../lib/course_files.ts";
import { COURSE_MESSAGES, DOWNLOADS_PER_DAY, LICENCE_PLACEHOLDER, licenceLine } from "../lib/course.ts";
import { MemoryStore } from "../lib/store_memory.ts";
import { DAY, HOUR } from "./fixtures/backend_harness.ts";
import {
  BUYER_NAME,
  courseHarness,
  createCourseOrder,
  download,
  fixtureAsset,
  paidCourseOrder,
  rawGet,
  seedCourseMemory,
  XLSX_MIME,
} from "./fixtures/course_harness.ts";

const NBSP = String.fromCharCode(0xa0);
const BOM = String.fromCharCode(0xfeff);
/** UTF-8 that keeps a leading BOM (strFromU8 / a default TextDecoder drop it). */
const withBom = (b: Uint8Array) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(b);
const XLSX = "pq_essentiel/files/module-1.xlsx";
const ZIP = "pq_essentiel/files/donnees-module-1.zip";

Deno.test("xmlEscape: the five XML special characters", () => {
  assertEquals(xmlEscape(`a & b < c > d " e ' f`), "a &amp; b &lt; c &gt; d &quot; e &apos; f");
  assertEquals(xmlEscape("Aïssatou N'Diaye-Bâ"), "Aïssatou N&apos;Diaye-Bâ");
  assertEquals(xmlEscape("&amp;"), "&amp;amp;", "no double-unescape trick");
});

Deno.test("injectXlsxLicence: both placeholders replaced (shared and inline strings), the rest byte for byte", async () => {
  const original = (await fixtureAsset(XLSX)).bytes;
  const licence = licenceLine(BUYER_NAME, "TCV-7K2M9QXA");
  const { bytes, replaced } = injectXlsxLicence(original, licence);
  assertEquals(replaced, 2);
  const before = unzipSync(original);
  const after = unzipSync(bytes);
  assertEquals(Object.keys(after), Object.keys(before), "same entries, same order");
  const expected = "Licence personnelle — Aïssatou N&apos;Diaye-Bâ — TCV-7K2M9QXA";
  const shared = strFromU8(after["xl/sharedStrings.xml"]);
  const sheet1 = strFromU8(after["xl/worksheets/sheet1.xml"]);
  assert(shared.includes(`<t>${expected}</t>`), shared);
  assert(sheet1.includes(`<is><t>${expected}</t></is>`), sheet1);
  for (const [name, data] of Object.entries(after)) {
    assertFalse(strFromU8(data).includes(LICENCE_PLACEHOLDER), name);
    if (name !== "xl/sharedStrings.xml" && name !== "xl/worksheets/sheet1.xml") assertEquals(data, before[name], `${name} untouched`);
  }
  // Every special character of the licence is escaped (a hostile name could not break the XML).
  const hostile = injectXlsxLicence(original, `<x a="1">&'</x>`);
  assert(strFromU8(unzipSync(hostile.bytes)["xl/sharedStrings.xml"]).includes("&lt;x a=&quot;1&quot;&gt;&amp;&apos;&lt;/x&gt;"));
  // A workbook without the placeholder is served as a valid zip, replaced = 0.
  const plain = zipSync({ "xl/workbook.xml": strToU8("<workbook/>"), "docProps/app.xml": strToU8("{{LICENCE}}") });
  const none = injectXlsxLicence(plain, licence);
  assertEquals(none.replaced, 0, "only xl/**/*.xml entries are personalised");
  assertEquals(strFromU8(unzipSync(none.bytes)["docProps/app.xml"]), "{{LICENCE}}");
  assertThrows(() => injectXlsxLicence(new TextEncoder().encode("not a zip"), licence));
});

Deno.test("addZipLicence: LICENCE.txt (BOM + CRLF) replaced when present, added when absent", async () => {
  const original = (await fixtureAsset(ZIP)).bytes;
  const text = licenceTxt(BUYER_NAME, "TCV-7K2M9QXA");
  assertEquals(text.split("\r\n"), [
    "Licence personnelle — Aïssatou N'Diaye-Bâ — TCV-7K2M9QXA",
    `Formation «${NBSP}Power Query pour le reporting bancaire${NBSP}» — édition Essentiel (Teranga Pro).`,
    `Usage personnel uniquement${NBSP}: ne pas partager, revendre ni publier ces fichiers.`,
    "Toutes les données sont fictives, générées pour la formation.",
    "",
  ]);
  const before = unzipSync(original);
  const after = unzipSync(addZipLicence(original, text));
  assertEquals(Object.keys(after), Object.keys(before));
  assertEquals(withBom(after["LICENCE.txt"]), BOM + text);
  assertEquals([...after["LICENCE.txt"].subarray(0, 3)], [0xef, 0xbb, 0xbf], "UTF-8 BOM bytes");
  assertEquals(after["exemple.csv"], before["exemple.csv"]);
  const added = unzipSync(addZipLicence(zipSync({ "a.csv": strToU8("x;y\r\n") }), text));
  assertEquals(Object.keys(added), ["a.csv", "LICENCE.txt"]);
  assertEquals(withBom(added["LICENCE.txt"]), BOM + text);
  // Applied twice, the last licence wins (no duplicate entry).
  const twice = unzipSync(addZipLicence(addZipLicence(original, "first"), text));
  assertEquals(Object.keys(twice).filter((k) => k === "LICENCE.txt").length, 1);
  assertEquals(withBom(twice["LICENCE.txt"]), BOM + text);
});

Deno.test("GET /orders/:id/files/module-1.xlsx: personalised workbook, attachment headers, CORS", async () => {
  const h = await courseHarness();
  const { id, token } = await paidCourseOrder(h);
  const res = await download(h, id, token, "module-1.xlsx");
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), XLSX_MIME);
  assertEquals(res.headers.get("content-disposition"), 'attachment; filename="module-1.xlsx"');
  assertEquals(res.headers.get("cache-control"), "no-store, private");
  assertEquals(res.headers.get("x-content-type-options"), "nosniff");
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
  assertEquals(res.headers.get("access-control-expose-headers"), "content-disposition");
  const bytes = new Uint8Array(await res.arrayBuffer());
  assertEquals(res.headers.get("content-length"), String(bytes.length));
  const shared = strFromU8(unzipSync(bytes)["xl/sharedStrings.xml"]);
  assert(shared.includes(`Licence personnelle — Aïssatou N&apos;Diaye-Bâ — ${id}`));
  assertFalse(shared.includes(LICENCE_PLACEHOLDER));
  assertEquals(h.logs.warn.length, 0);
});

Deno.test("GET /orders/:id/files/donnees-module-1.zip: the data pack carries the buyer's LICENCE.txt", async () => {
  const h = await courseHarness();
  const { id, token } = await paidCourseOrder(h, { fullName: "Jean-Pierre Diop" });
  const res = await download(h, id, token, "donnees-module-1.zip");
  assertEquals([res.status, res.headers.get("content-type")], [200, "application/zip"]);
  assertEquals(res.headers.get("content-disposition"), 'attachment; filename="donnees-module-1.zip"');
  const entries = unzipSync(new Uint8Array(await res.arrayBuffer()));
  assertEquals(withBom(entries["LICENCE.txt"]), BOM + licenceTxt("Jean-Pierre Diop", id));
  assert(strFromU8(entries["exemple.csv"]).startsWith("contrat;agence;encours"));
});

Deno.test("files: only names listed in the manifest; unpaid / wrong token / unknown order are 404", async () => {
  const h = await courseHarness();
  const { id, token } = await paidCourseOrder(h);
  const t = encodeURIComponent(token);
  const fileNotFound = { error: "not_found", message: COURSE_MESSAGES.fileNotFound };
  for (const name of ["nope.xlsx", "manifest.json", "quiz-key.json", "quiz.json", "module-01.html", "MODULE-1.XLSX"]) {
    const res = await download(h, id, token, name);
    assertEquals([res.status, await res.json()], [404, fileNotFound], name);
  }
  for (const raw of ["..%2Fmanifest.json", "..%2F..%2Fquiz-key.json", "%2E%2E%2Fquiz-key.json", "files%2Fmodule-1.xlsx"]) {
    const res = await rawGet(h, `/orders/${id}/files/${raw}?t=${t}`);
    assertEquals(res.status, 404, raw);
    const body = await res.json();
    assert(body.error === "not_found", raw);
  }
  const notFound = { error: "not_found", message: "Commande introuvable." };
  const unpaid = await createCourseOrder(h);
  for (const [oid, tok] of [[unpaid.id, unpaid.token], [id, "wrong"], ["TCV-ZZZZZZZZ", token]]) {
    const res = await download(h, oid, tok, "module-1.xlsx");
    assertEquals([res.status, await res.json()], [404, notFound], oid);
  }
  assertEquals(h.store instanceof MemoryStore && (h.store as MemoryStore).rateLimits.has(`course-dl:${unpaid.id}`), false);
});

Deno.test("files: the 31st download in 24 hours → 429; the next day it works again", async () => {
  const h = await courseHarness();
  const { id, token } = await paidCourseOrder(h);
  assertEquals(DOWNLOADS_PER_DAY, 30);
  for (let i = 0; i < 30; i++) {
    const res = await download(h, id, token, i % 2 ? "module-1.xlsx" : "donnees-module-1.zip");
    assertEquals(res.status, 200, `download ${i + 1}`);
    await res.body?.cancel();
  }
  const limited = await download(h, id, token, "module-1.xlsx");
  assertEquals([limited.status, await limited.json()], [429, { error: "rate_limited", message: COURSE_MESSAGES.downloadsLimited }]);
  h.clock.advance(23 * HOUR);
  assertEquals((await download(h, id, token, "module-1.xlsx")).status, 429);
  h.clock.advance(DAY);
  const again = await download(h, id, token, "module-1.xlsx");
  assertEquals(again.status, 200);
  await again.body?.cancel();
  // The limit is per order.
  const other = await paidCourseOrder(h);
  const res = await download(h, other.id, other.token, "module-1.xlsx");
  assertEquals(res.status, 200);
  await res.body?.cancel();
});

Deno.test("files: listed but missing asset → 404 logged; workbook without placeholder → served + warning; corrupt → 503", async () => {
  const store = new MemoryStore();
  await seedCourseMemory(store);
  store.courseAssets.delete(ZIP);
  const plainXlsx = zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "xl/workbook.xml": strToU8("<workbook/>") });
  await store.putCourseAsset(XLSX, XLSX_MIME, plainXlsx);
  const h = await courseHarness({ store });
  const { id, token } = await paidCourseOrder(h);
  const missing = await download(h, id, token, "donnees-module-1.zip");
  assertEquals([missing.status, (await missing.json()).message], [404, COURSE_MESSAGES.fileNotFound]);
  assert(h.logs.error.includes(`course file ${ZIP} is missing`), h.logs.error.join(" | "));
  const served = await download(h, id, token, "module-1.xlsx");
  assertEquals(served.status, 200);
  assertEquals(Object.keys(unzipSync(new Uint8Array(await served.arrayBuffer()))), ["[Content_Types].xml", "xl/workbook.xml"]);
  assert(h.logs.warn.includes("licence placeholder missing in module-1.xlsx"));
  await store.putCourseAsset(XLSX, XLSX_MIME, new TextEncoder().encode("PK but not really"));
  const corrupt = await download(h, id, token, "module-1.xlsx");
  assertEquals([corrupt.status, (await corrupt.json()).error], [503, "course_unavailable"]);
  assert(h.logs.error.some((l) => l.startsWith(`course file ${XLSX} could not be personalised`)));
});

Deno.test("files: no manifest → 503 (after the order checks)", async () => {
  const h = await courseHarness({ seed: false });
  const { id, token } = await paidCourseOrder(h);
  const res = await download(h, id, token, "module-1.xlsx");
  assertEquals([res.status, (await res.json()).error], [503, "course_unavailable"]);
  const unpaid = await createCourseOrder(h);
  assertEquals((await download(h, unpaid.id, unpaid.token, "module-1.xlsx")).status, 404, "an unpaid order learns nothing");
});
