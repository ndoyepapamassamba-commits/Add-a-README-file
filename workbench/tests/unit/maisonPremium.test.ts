import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { DESIGN } from '../../server/services/houseDesign';
import { maisonBand, refreshSommaire } from '../../server/services/maisonBand';

function workbook(): Uint8Array {
  const wb = XLSX.utils.book_new();
  // Five columns: room for LIGNES + two amounts + the PROFIL card (the two-column « Segments » sheet has none).
  const rows = Array.from({ length: 12 }, (_, i) => ({ Agence: `Agence ${i + 1}`, Région: i % 2 ? 'Nord' : 'Sud', Encours: 120_000 * (i + 1), Impayés: 2_500 * (12 - i), Statut: 'OK' }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Données');
  const seg = Array.from({ length: 4 }, (_, i) => ({ Segment: ['PME', 'GE', 'Particuliers', 'Institutionnels'][i], Montant: 2_000_000_000 * (i + 1) }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(seg), 'Segments');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

describe('Maison band — premium workbook (#124)', () => {
  const r = maisonBand(workbook(), DESIGN)!;
  const z = unzipSync(r.bytes);
  const wb = strFromU8(z['xl/workbook.xml']!);
  const styles = strFromU8(z['xl/styles.xml']!);
  it('a Sommaire sheet comes first: hyperlinks to every sheet, live row counts and totals', () => {
    expect(r.sommaire).toBe(true);
    expect(wb).toMatch(/<sheets><sheet name="Sommaire"/);
    const som = strFromU8(z['xl/worksheets/sheet-sommaire.xml']!);
    expect(som).toContain(`location="'Données'!A1"`);
    expect(som).toContain(`location="'Segments'!A1"`);
    expect(som).toContain('SUBTOTAL(3,');
    expect(som).toContain("SUM('Données'!$C$");
    expect(som).toContain('tabSelected="1"');
    // The other sheets are no longer selected (no grouped tabs).
    expect(strFromU8(z['xl/worksheets/sheet1.xml']!)).not.toContain('tabSelected="1"');
    expect(strFromU8(z['[Content_Types].xml']!)).toContain('sheet-sommaire.xml');
  });
  it('card values in M / k (two conditions), Md / M for billions; a PROFIL card carries a native sparkline', () => {
    expect(styles).toContain('[&gt;=1000]#,##0.0,&quot; k&quot;');
    expect(styles).toContain('&quot; Md&quot;');
    const s1 = strFromU8(z['xl/worksheets/sheet1.xml']!);
    expect(s1).toContain('PROFIL · ENCOURS');
    expect(s1).toContain('<x14:sparklineGroups');
    expect(s1).toMatch(/<xm:f>'Données'!\$C\$\d+:\$C\$\d+<\/xm:f>/);
    expect(s1).toMatch(/<extLst>.*<\/extLst><\/worksheet>$/s);
    expect(r.sparklines).toBe(1);
    // Billions on « Segments »: the Md / M style is the one with the Md format.
    const fmtMd = /numFmtId="(\d+)" formatCode="\[&gt;=1000000000\]/.exec(styles)![1];
    const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)![1]!.match(/<xf\b[^>]*>/g)!;
    const s2 = strFromU8(z['xl/worksheets/sheet2.xml']!);
    const total = /<c r="[A-Z]+\d+" s="(\d+)"><f>SUBTOTAL\(9,/.exec(s2)![1];
    expect(xfs[+total!]).toContain(`numFmtId="${fmtMd}"`);
  });
  it('a dashboard sheet keeps the first place: the Sommaire comes right after it', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Tableau de bord'], ['(image)']]), 'Tableau de bord');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Array.from({ length: 6 }, (_, i) => ({ Agence: `A${i}`, Région: 'Nord', Encours: 1000 * (i + 1), Impayés: 10 * (i + 1), Statut: 'OK' }))), 'Données');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
    const out = unzipSync(maisonBand(bytes, DESIGN)!.bytes);
    const names = [...strFromU8(out['xl/workbook.xml']!).matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(['Tableau de bord', 'Sommaire', 'Données']);
    expect(strFromU8(out['xl/worksheets/sheet-sommaire.xml']!)).not.toContain('tabSelected');
  });
  it('second pass: nothing to band (null); refreshSommaire rebuilds one Sommaire, never two', () => {
    expect(maisonBand(r.bytes, DESIGN)).toBeNull();
    const again = unzipSync(refreshSommaire(r.bytes, DESIGN)!);
    const names = [...strFromU8(again['xl/workbook.xml']!).matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(['Sommaire', 'Données', 'Segments']);
    expect(strFromU8(again['xl/workbook.xml']!).match(/sheet-sommaire|rIdSommaire/g)!.length).toBe(1);
  });
});
