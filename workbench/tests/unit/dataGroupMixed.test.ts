import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { DataCore, QuerySpecSchema } from '../../server/services/dataCore';

// Régression du 15/10/2026 (ESN_Portfolio_*.xlsb) : « Segment 8200 appears twice in grouping » — le même code saisi en
// nombre sur certaines lignes et en texte sur d'autres formait deux groupes.
function workbook(bookType: 'xlsx' | 'xlsb'): Uint8Array {
  const aoa = [
    ['client', 'segment', 'libelle', 'encours'],
    ['A', 8200, 'Local Corporate', 100],
    ['B', '8200', 'Local Corporate ', 50],
    ['C', ' 8200 ', 'Local Corporate', 25],
    ['D', 8100, 'SME', 10],
    ['E', '0820', 'Code à zéro', 1],
    ['F', 820, 'Autre', 2],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Portefeuille');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer);
}

describe('regroupement : un code en nombre et en texte forme un seul groupe', () => {
  for (const bookType of ['xlsx', 'xlsb'] as const)
    it(`fichier .${bookType}`, () => {
      const core = new DataCore();
      const ds = core.parseBytes(`portefeuille.${bookType}`, workbook(bookType));
      const r = core.query(ds, QuerySpecSchema.parse({ groupBy: [{ column: 'segment' }, { column: 'libelle' }], aggregations: [{ column: 'encours', fn: 'sum', as: 'total' }] }));
      const seg8200 = r.rows.filter((x) => x.segment === 8200);
      expect(seg8200).toEqual([{ segment: 8200, libelle: 'Local Corporate', total: 175 }]);
      // A code with a leading zero is an identifier: it stays text, never merged with 820.
      expect(r.rows.find((x) => x.segment === '0820')?.total).toBe(1);
      expect(r.rows.find((x) => x.segment === 820)?.total).toBe(2);
      expect(r.rowCount).toBe(4);
    });
});
