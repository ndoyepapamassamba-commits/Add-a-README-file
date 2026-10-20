import { describe, expect, it } from 'vitest';
import { checkFormula } from '../../server/services/formulaCheck';

describe('grammaire des formules Excel (ce qu’Excel refuse et « répare »)', () => {
  it('accepts the formulas the exports write', () => {
    for (const f of [
      'SUBTOTAL(9,B25:B29)',
      "COUNTA('7. Données'!A:A)-1",
      "SUMPRODUCT(('Données filtrables'!$H$2:$H$612=C2)*'Données filtrables'!$I$2:$I$612*'Données filtrables'!$B$2:$B$612)",
      'IF(I2=1,N(B2),-1E+300)+ROW()/1E+9',
      'IFERROR(INDEX(A2:A9,MATCH(LARGE(B2:B9,1),B2:B9,0)),"")',
      '"Total : "&TEXT(SUM(B2:B9),"#,##0")&" XOF"',
      'A1 A2',
      '-A1*2%',
      '{1,2;3,4}',
      'SUM(Table1[Montant])',
      "'Feuille ''x'''!A1",
      '#N/A',
      'Sheet2!$A$1:$B$3',
      'SUM(A:A)',
      'SUM(1:1)',
      'IF(A1>0,B1,)',
    ])
      expect(checkFormula(f), f).toEqual({ ok: true });
  });
  it('refuses a text written as a formula', () => {
    expect(checkFormula(' Total Douteux (100 %)').ok).toBe(false);
    expect(checkFormula('Encours total').ok).toBe(false);
    expect(checkFormula('Doublon de la colonne B').ok).toBe(false);
    expect(checkFormula('SUM(A1').ok).toBe(false);
    expect(checkFormula('A1+').ok).toBe(false);
    expect(checkFormula('A1 B1 (2)').ok).toBe(false);
    expect(checkFormula('"a" 1').ok).toBe(false);
    expect(checkFormula('').ok).toBe(false);
  });
  it('keeps an intersection of defined names when the names exist', () => {
    expect(checkFormula('Encours Total', new Set(['Encours', 'Total']))).toEqual({ ok: true });
  });
  it('translates French formulas and adds the _xlfn. prefix', () => {
    expect(checkFormula('SOMME(A1;A2)')).toEqual({ ok: true, fixed: 'SUM(A1,A2)' });
    expect(checkFormula('SI(A1>0;"oui";"non")')).toEqual({ ok: true, fixed: 'IF(A1>0,"oui","non")' });
    expect(checkFormula('SOMME.SI.ENS(C:C;A:A;"x")')).toEqual({ ok: true, fixed: 'SUMIFS(C:C,A:A,"x")' });
    expect(checkFormula('UNIQUE(A1:A9)')).toEqual({ ok: true, fixed: '_xlfn.UNIQUE(A1:A9)' });
    expect(checkFormula('_xlfn.XLOOKUP(A1,B:B,C:C)')).toEqual({ ok: true });
    expect(checkFormula('IFS(A1>1,"a",TRUE,"b")')).toEqual({ ok: true, fixed: '_xlfn.IFS(A1>1,"a",TRUE,"b")' });
    expect(checkFormula('"UNIQUE(x)"&A1')).toEqual({ ok: true });
  });
});
