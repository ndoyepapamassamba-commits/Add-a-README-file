// RÈGLES STRICTES D'EXCEL — what Excel itself refuses when it opens a workbook (« Nous avons trouvé un problème dans le
// contenu… »), and that the Open XML SDK validator does NOT check (it validates the schema, not these rules):
//  - merged ranges reversed (AT11:AS12), single-cell, or overlapping another merge;
//  - drawing anchors whose end is before their start;
//  - cell style indexes beyond the styles' cellXfs list;
//  - sheet names not unique (Excel compares them case-insensitively), too long or with forbidden characters;
//  - table columns with duplicate / empty names; slicer caches pointing outside their table.
// Merges, anchors and style indexes are FIXED in place; the rest is reported (renaming would break references).
import { strFromU8, strToU8 } from 'fflate';

type Zip = Record<string, Uint8Array>;
const rd = (z: Zip, p: string) => (z[p] ? strFromU8(z[p]!) : '');
const wr = (z: Zip, p: string, s: string) => {
  z[p] = strToU8(s);
};

export function excelStrict(z: Zip): { fixes: string[]; warnings: string[] } {
  const fixes: string[] = [];
  const warnings: string[] = [];
  const st = rd(z, 'xl/styles.xml');
  const xfCount = (() => {
    const b = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(st)?.[1];
    return b ? (b.match(/<xf\b/g) ?? []).length : Infinity;
  })();
  let merges = 0;
  let styles = 0;
  for (const p of Object.keys(z).filter((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k))) {
    let x = rd(z, p);
    let changed = false;
    const mb = /<mergeCells\b[^>]*>([\s\S]*?)<\/mergeCells>/.exec(x);
    if (mb) {
      const refs = [...mb[1]!.matchAll(/<mergeCell\b[^>]*\bref="([^"]+)"/g)].map((m) => m[1]!);
      const ok = validMerges(refs);
      if (ok.length !== refs.length) {
        merges += refs.length - ok.length;
        x = x.replace(
          mb[0],
          ok.length
            ? `<mergeCells count="${ok.length}">${ok.map((r) => `<mergeCell ref="${r}"/>`).join('')}</mergeCells>`
            : '',
        );
        changed = true;
      }
    }
    if (Number.isFinite(xfCount)) {
      x = x.replace(/<c\b([^>]*?)\bs="(\d+)"/g, (m, a: string, s: string) => {
        if (+s < xfCount) return m;
        styles++;
        changed = true;
        return `<c${a}s="0"`;
      });
      x = x.replace(/<row\b([^>]*?)\bs="(\d+)"/g, (m, a: string, s: string) => {
        if (+s < xfCount) return m;
        styles++;
        changed = true;
        return `<row${a}s="0"`;
      });
    }
    if (changed) wr(z, p, x);
  }
  if (merges)
    fixes.push(
      `${merges} fusion(s) de cellules invalide(s) retirée(s) (inversée, d'une seule cellule ou en chevauchement — Excel les refuse)`,
    );
  if (styles) fixes.push(`${styles} cellule(s) au style inexistant remise(s) au style normal`);
  // Drawing anchors: start after end → swapped.
  let anchors = 0;
  for (const p of Object.keys(z).filter((k) => /^xl\/drawings\/[^/]+\.xml$/.test(k))) {
    const d = rd(z, p);
    const out = d.replace(
      /<xdr:from><xdr:col>(\d+)<\/xdr:col><xdr:colOff>(-?\d+)<\/xdr:colOff><xdr:row>(\d+)<\/xdr:row><xdr:rowOff>(-?\d+)<\/xdr:rowOff><\/xdr:from><xdr:to><xdr:col>(\d+)<\/xdr:col><xdr:colOff>(-?\d+)<\/xdr:colOff><xdr:row>(\d+)<\/xdr:row><xdr:rowOff>(-?\d+)<\/xdr:rowOff><\/xdr:to>/g,
      (m, ...g: string[]) => {
        let [c0, co0, r0, ro0, c1, co1, r1, ro1] = g.slice(0, 8).map((v) => Math.max(0, +v)) as [
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
        ];
        const bad =
          g.slice(0, 8).some((v) => +v < 0) ||
          c1 * 1e8 + co1 < c0 * 1e8 + co0 ||
          r1 * 1e8 + ro1 < r0 * 1e8 + ro0;
        if (!bad) return m;
        anchors++;
        if (c1 * 1e8 + co1 < c0 * 1e8 + co0) [c0, co0, c1, co1] = [c1, co1, c0, co0];
        if (r1 * 1e8 + ro1 < r0 * 1e8 + ro0) [r0, ro0, r1, ro1] = [r1, ro1, r0, ro0];
        return `<xdr:from><xdr:col>${c0}</xdr:col><xdr:colOff>${co0}</xdr:colOff><xdr:row>${r0}</xdr:row><xdr:rowOff>${ro0}</xdr:rowOff></xdr:from><xdr:to><xdr:col>${c1}</xdr:col><xdr:colOff>${co1}</xdr:colOff><xdr:row>${r1}</xdr:row><xdr:rowOff>${ro1}</xdr:rowOff></xdr:to>`;
      },
    );
    if (out !== d) wr(z, p, out);
  }
  if (anchors) fixes.push(`${anchors} objet(s) dessiné(s) à l'ancrage inversé remis d'aplomb`);
  // Reported only.
  const wb = rd(z, 'xl/workbook.xml');
  const names = [...wb.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map((m) =>
    m[1]!
      .replace(/&amp;/g, '&')
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"'),
  );
  const seen = new Set<string>();
  for (const n of names) {
    const k = n.toLocaleLowerCase('fr');
    if (seen.has(k))
      warnings.push(`deux feuilles portent le même nom « ${n} » (Excel ne distingue pas les majuscules)`);
    seen.add(k);
    if (n.length > 31 || /[[\]*?/\\:]/.test(n)) warnings.push(`nom de feuille refusé par Excel : « ${n} »`);
  }
  const tableCols = new Map<string, number>();
  for (const p of Object.keys(z).filter((k) => /^xl\/tables\/[^/]+\.xml$/.test(k))) {
    const t = rd(z, p);
    const id = /\bid="(\d+)"/.exec(t)?.[1] ?? '?';
    const cols = [...t.matchAll(/<tableColumn\b[^>]*\bname="([^"]*)"/g)].map((m) =>
      m[1]!.toLocaleLowerCase('fr'),
    );
    tableCols.set(id, cols.length);
    if (new Set(cols).size !== cols.length || cols.some((c) => !c.trim()))
      warnings.push(`tableau ${id} : noms de colonnes vides ou en double`);
  }
  for (const p of Object.keys(z).filter((k) => /^xl\/slicerCaches\/[^/]+\.xml$/.test(k))) {
    const m = /tableSlicerCache\b[^>]*tableId="(\d+)"[^>]*column="(\d+)"/.exec(rd(z, p));
    if (m && (!tableCols.has(m[1]!) || +m[2]! < 1 || +m[2]! > tableCols.get(m[1]!)!))
      warnings.push(`segment ${p.split('/').pop()} : colonne hors du tableau`);
  }
  return { fixes, warnings };
}

/**
 * Merged ranges Excel accepts: A1-style, start ≤ end, more than one cell, no overlap with an earlier merge (Excel opens
 * a file breaking any of these with « Nous avons trouvé un problème dans le contenu » — the Open XML validator does not
 * check them). The others are dropped, in order.
 */
export function validMerges(refs: string[]): string[] {
  const col = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const kept: { c0: number; r0: number; c1: number; r1: number }[] = [];
  const out: string[] = [];
  for (const ref of refs) {
    const m = /^([A-Z]{1,3})(\d+):([A-Z]{1,3})(\d+)$/.exec(ref);
    if (!m) continue;
    const b = { c0: col(m[1]!), r0: +m[2]!, c1: col(m[3]!), r1: +m[4]! };
    if (b.c1 < b.c0 || b.r1 < b.r0 || (b.c1 === b.c0 && b.r1 === b.r0) || b.r0 < 1) continue;
    if (kept.some((k) => k.c0 <= b.c1 && b.c0 <= k.c1 && k.r0 <= b.r1 && b.r0 <= k.r1)) continue;
    kept.push(b);
    out.push(ref);
  }
  return out;
}
