// Regenerates the two binary assets of the lorem course fixture (no course content) and their sizes in
// manifest.json:   TZ=UTC deno run -A supabase/functions/api/tests/fixtures/course/make_course_fixture.ts
// files/module-1.xlsx         minimal SpreadsheetML: sheets "Instructions" and "Licence"; {{LICENCE}} once in
//                             xl/sharedStrings.xml (Licence!A1) and once as an inline string (Instructions!A3)
// files/donnees-module-1.zip  exemple.csv (3 invented lines) + LICENCE.txt holding the placeholder
import { strToU8, zipSync } from "npm:fflate@0.8.2";
import type { Zippable } from "npm:fflate@0.8.2";

export const FIXTURE_MTIME = new Date("2026-10-21T00:00:00Z");
const ROOT = new URL("./pq_essentiel/", import.meta.url);

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** Shared strings, in index order. Index 3 is the licence placeholder (Licence!A1). */
const SHARED = ["Instructions (test)", "Lorem ipsum dolor sit amet, consectetur adipiscing elit.", "Licence", "{{LICENCE}}"];

function sheet(rows: string): string {
  return `${XML}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheetData>${rows}</sheetData></worksheet>`;
}

export function fixtureXlsx(): Uint8Array {
  const files: Zippable = {
    "[Content_Types].xml": strToU8(
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        "</Types>",
    ),
    "_rels/.rels": strToU8(
      `${XML}<Relationships xmlns="${NS_PKG_REL}">` +
        `<Relationship Id="rId1" Type="${REL_TYPE}/officeDocument" Target="xl/workbook.xml"/>` +
        "</Relationships>",
    ),
    "xl/workbook.xml": strToU8(
      `${XML}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>` +
        '<sheet name="Instructions" sheetId="1" r:id="rId1"/><sheet name="Licence" sheetId="2" r:id="rId2"/>' +
        "</sheets></workbook>",
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `${XML}<Relationships xmlns="${NS_PKG_REL}">` +
        `<Relationship Id="rId1" Type="${REL_TYPE}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${REL_TYPE}/worksheet" Target="worksheets/sheet2.xml"/>` +
        `<Relationship Id="rId3" Type="${REL_TYPE}/sharedStrings" Target="sharedStrings.xml"/>` +
        `<Relationship Id="rId4" Type="${REL_TYPE}/styles" Target="styles.xml"/>` +
        "</Relationships>",
    ),
    "xl/worksheets/sheet1.xml": strToU8(sheet(
      '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>1</v></c></row>' +
        '<row r="3"><c r="A3" t="inlineStr"><is><t>{{LICENCE}}</t></is></c></row>' +
        '<row r="4"><c r="A4"><v>1234567.5</v></c></row>',
    )),
    "xl/worksheets/sheet2.xml": strToU8(sheet('<row r="1"><c r="A1" t="s"><v>3</v></c></row>')),
    "xl/sharedStrings.xml": strToU8(
      `${XML}<sst xmlns="${NS_MAIN}" count="${SHARED.length}" uniqueCount="${SHARED.length}">` +
        SHARED.map((s) => `<si><t>${s}</t></si>`).join("") + "</sst>",
    ),
    "xl/styles.xml": strToU8(
      `${XML}<styleSheet xmlns="${NS_MAIN}">` +
        '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
        "</styleSheet>",
    ),
  };
  return zipSync(files, { level: 6, mtime: FIXTURE_MTIME });
}

export function fixtureZip(): Uint8Array {
  const csv = "contrat;agence;encours\r\nBFO-0001;Agence Lorem;100000\r\nBFO-0002;Agence Ipsum;250000\r\nBFO-0003;Agence Dolor;75000\r\n";
  return zipSync({
    "exemple.csv": strToU8(csv),
    "LICENCE.txt": strToU8("{{LICENCE}}\r\n"),
  }, { level: 6, mtime: FIXTURE_MTIME });
}

if (import.meta.main) {
  const xlsx = fixtureXlsx();
  const zip = fixtureZip();
  await Deno.writeFile(new URL("files/module-1.xlsx", ROOT), xlsx);
  await Deno.writeFile(new URL("files/donnees-module-1.zip", ROOT), zip);
  const manifestUrl = new URL("manifest.json", ROOT);
  const manifest = JSON.parse(await Deno.readTextFile(manifestUrl));
  const sizes: Record<string, number> = { "module-1.xlsx": xlsx.byteLength, "donnees-module-1.zip": zip.byteLength };
  for (const f of manifest.files) if (f.name in sizes) f.size = sizes[f.name];
  await Deno.writeTextFile(manifestUrl, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`fixture: module-1.xlsx ${xlsx.byteLength} B, donnees-module-1.zip ${zip.byteLength} B`);
}
