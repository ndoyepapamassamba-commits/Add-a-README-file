import { describe, expect, it } from 'vitest';
import { buildBrief } from '../../server/services/reportBrief';
import { dossierFromBrief, verifyAgainstBrief } from '../../server/services/dossier/dossierCompose';
import { checkDepth } from '../../server/services/dossier/dossier';
import { corpusFor, researchSubject } from '../../server/services/dossier/sourceCorpus';
import { creditRoles } from '../../server/services/dossier/creditFacts';

// A SYNTHETIC « Top 20 » with the columns of the owner's export (no real client, no real figure).
function top20() {
  const columns = ['Code Client', 'Relationship', 'Encours total (XOF)', 'Intérêts courus (XOF)', 'Provisions IFRS9 (XOF)', 'Exposition nette (XOF)', 'Impayés PDO (XOF)', 'Garanties (XOF)', 'Limites (XOF)', 'Nb facilités'];
  const rows = Array.from({ length: 20 }, (_, i) => {
    const enc = Math.round(4_000_000_000 / (i + 1) ** 0.9);
    const imp = i % 4 === 0 ? Math.round(enc * 0.7) : i % 3 === 0 ? Math.round(enc * 0.1) : 0;
    const prov = i % 4 === 0 ? Math.round(imp * 0.05) : Math.round(enc * 0.01);
    return {
      'Code Client': 100000 + i,
      Relationship: `CLIENT ${String.fromCharCode(65 + i)} SA`,
      'Encours total (XOF)': enc,
      'Intérêts courus (XOF)': 0,
      'Provisions IFRS9 (XOF)': prov,
      'Exposition nette (XOF)': enc - prov,
      'Impayés PDO (XOF)': imp,
      'Garanties (XOF)': i % 5 === 0 ? 0 : Math.round(enc * 0.6),
      'Limites (XOF)': i === 1 ? Math.round(enc * 2.5) : i === 2 ? Math.round(enc * 0.9) : enc,
      'Nb facilités': 1 + (i % 4),
    };
  });
  return { columns, rows };
}

describe('v62 — the analyst writes a COMPLETE reading of a counterparty ranking (Top 20 Local Corporate)', () => {
  const { columns, rows } = top20();
  const brief = buildBrief(columns, rows, { title: 'Top 20', source: 'synthétique' });
  it('the measure is the outstanding, never the authorised limits; the credit lens is recognised', () => {
    expect(brief.measure).toBe('Encours total (XOF)');
    expect(brief.lens?.kind).toBe('credit');
    expect(creditRoles(columns, rows)).toMatchObject({ outstanding: 'Encours total (XOF)', arrears: 'Impayés PDO (XOF)', provision: 'Provisions IFRS9 (XOF)', collateral: 'Garanties (XOF)', limit: 'Limites (XOF)', exposure: 'Exposition nette (XOF)', facilities: 'Nb facilités' });
  });
  it('seven analytical chapters (veille: Basel watchlist, uncovered exposure), each with findings, analysis, a figure or table and a recommendation', () => {
    const d = dossierFromBrief({ focus: 'Top 20', brief });
    expect(d.chapters.map((c) => c.title)).toEqual(["Concentration de l'encours", 'Impayés et dégradation', 'Provisions et couverture', 'Garanties', 'Exposition non couverte', 'Utilisation des limites', 'Liste de surveillance']);
    for (const c of d.chapters) {
      expect(c.constats.length, c.title).toBeGreaterThanOrEqual(2);
      expect(c.analyse.length, c.title).toBeGreaterThanOrEqual(1);
      expect(c.figures.length + c.tables.length, c.title).toBeGreaterThanOrEqual(1);
      expect(c.recommandations.length, c.title).toBeGreaterThanOrEqual(1);
    }
    expect(d.kpis.map((k) => k.label)).toEqual(expect.arrayContaining(['Encours total', 'Part du premier', "Taux d'impayés", 'Couverture des impayés', 'Couverture par garanties', 'Utilisation des limites']));
    expect(d.thesis).toMatch(/CLIENT A SA/);
    expect(d.decisions.length).toBeGreaterThanOrEqual(3);
    expect(d.hypotheses.some((h) => /aucune insuffisance de provision/i.test(h.text))).toBe(true);
    // Far fewer depth gaps than the old one-chapter dossier (sources and glossary come from the research step).
    expect(checkDepth(d).filter((x) => /chapitres|indicateurs|messages|décisions|recommandations/.test(x.where))).toEqual([]);
  });
  it('NO FABRICATED FIGURE: every number of the written analysis comes from the table', () => {
    const d = dossierFromBrief({ focus: 'Top 20', brief });
    const v = verifyAgainstBrief(d, brief);
    expect(v.checked).toBeGreaterThan(20);
    expect(v.unknown).toEqual([]);
  });
  it('the names flagged are the real ones (arrears ≥ 50 % of the outstanding, over-limit…)', () => {
    const d = dossierFromBrief({ focus: 'Top 20', brief });
    const arrears = d.chapters.find((c) => c.title === 'Impayés et dégradation')!;
    expect(arrears.constats.join(' ')).toMatch(/CLIENT A SA, CLIENT E SA, CLIENT I SA, CLIENT M SA, CLIENT Q SA/);
    const limits = d.chapters.find((c) => c.title === 'Utilisation des limites')!;
    expect(limits.constats.join(' ')).toMatch(/1 contrepartie\(s\) utilisent au moins 90 %|CLIENT C SA/);
  });
  it("the analyst's own notes (other queries, documents, the web) enter as a chapter; outside figures are marked « à vérifier »", () => {
    const d = dossierFromBrief({ focus: 'Top 20', brief, notes: '- Le segment entier compte 71 clients pour 36 848 942 813 XOF d’encours.\n- Les 20 premiers portent l’essentiel des impayés du segment, à suivre au prochain comité.' });
    const c = d.chapters.find((x) => x.title === "Lecture de l'analyste")!;
    expect(c.constats[0]).toMatch(/à vérifier : .*36 848 942 813/);
  });
  it('sources: the corpus serves the subject (credit here), with real references', () => {
    const r = corpusFor(researchSubject('donnes moi un fichier excel ultra design analysant le top 20 du segment code 8200 Local Corporate', ['risque de crédit']), 'credit');
    expect(r.map((x) => x.title)).toEqual(expect.arrayContaining(['IFRS 9 — Instruments financiers', 'Supervisory framework for measuring and controlling large exposures']));
    const d = dossierFromBrief({ focus: 'Top 20', brief, research: r });
    expect(d.sources.length).toBe(r.length);
    expect(d.sources[0]!.id).toMatch(/^R\d-01$/);
  });
});

describe('v62 — the analyst is not limited to credit: any ranking is read (sales by customer)', () => {
  const columns = ['Client', 'Chiffre d’affaires (EUR)', 'Remises (EUR)', 'Marge (EUR)'];
  const rows = Array.from({ length: 15 }, (_, i) => {
    const ca = Math.round(900_000 / (i + 1));
    return { Client: `Client ${i + 1}`, 'Chiffre d’affaires (EUR)': ca, 'Remises (EUR)': i === 3 || i === 7 ? Math.round(ca * 0.3) : Math.round(ca * 0.05), 'Marge (EUR)': Math.round(ca * (i === 5 ? 0.05 : 0.3)) };
  });
  const brief = buildBrief(columns, rows, { title: 'Ventes par client' });
  it('generic reading: concentration + each measure against the main one, outliers named, no invented figure', () => {
    expect(brief.lens?.kind).toBe('ranking');
    const d = dossierFromBrief({ focus: 'Ventes', brief });
    expect(d.chapters[0]!.title).toMatch(/^Concentration — Chiffre d’affaires \(EUR\)/);
    expect(d.chapters.some((c) => /^Remises \(EUR\) rapporté/.test(c.title) && c.constats.join(' ').includes('Client 4'))).toBe(true);
    expect(d.chapters.some((c) => /^Marge \(EUR\) rapporté/.test(c.title) && c.constats.join(' ').includes('Client 6'))).toBe(true);
    expect(verifyAgainstBrief(d, brief).unknown).toEqual([]);
    expect(corpusFor('ventes par client concentration', 'ranking').map((x) => x.title)).toEqual(expect.arrayContaining(['Quality Control Handbook']));
  });
});

describe('v62 — veille analyses: watchlist (Basel 2025), uncovered exposure, UMOA large exposures, Pareto and deviation charts', () => {
  const { columns, rows } = top20();
  const brief = buildBrief(columns, rows, { title: 'Top 20' });
  const d = dossierFromBrief({ focus: 'Top 20', brief });
  it('watchlist: names with two signals or more, scored, with the size × degradation matrix', () => {
    const w = d.chapters.find((c) => c.title === 'Liste de surveillance')!;
    expect(w.tables[0]!.title).toBe('Liste de surveillance proposée');
    expect(w.tables[0]!.rows[0]![0]).toBe('CLIENT A SA');
    expect(w.tables[1]!.title).toBe('Matrice de priorisation');
    expect(w.constats.join(' ')).toMatch(/gros et dégradés \d+ nom\(s\)/);
    expect(d.decisions.some((x) => /liste de surveillance/.test(x.text))).toBe(true);
  });
  it('uncovered exposure = outstanding − provisions − declared collateral, never negative', () => {
    const u = d.chapters.find((c) => c.title === 'Exposition non couverte')!;
    const first = rows[0]!;
    const expected = Math.max(0, (first['Encours total (XOF)'] as number) - (first['Provisions IFRS9 (XOF)'] as number) - (first['Garanties (XOF)'] as number));
    expect(u.kpis![0]!.num).toBeGreaterThan(expected - 1);
    expect(u.tables[0]!.head).toEqual(['Contrepartie', 'encours', 'Provisions', 'Garanties', 'Non couvert', 'Non couvert / encours']);
  });
  it('the UMOA rule is quoted exactly (10 % / 25 % of T1), the Pareto curve is in %, the limit deviation is signed', () => {
    const c = d.chapters[0]!;
    expect(c.cadre[0]).toMatch(/10 % des fonds propres de base \(T1\).*25 % du T1/);
    const pareto = c.figures.find((f) => f.kind === 'line')!;
    expect(pareto.unit).toBe('%');
    expect(pareto.series[0]!.values.at(-1)).toBeCloseTo(100, 0);
    const lim = d.chapters.find((x) => x.title === 'Utilisation des limites')!.figures[0]!;
    expect(lim.fmt).toMatch(/^\+/);
    expect(verifyAgainstBrief(d, brief).unknown).toEqual([]);
    expect(corpusFor('division des risques grands risques UMOA', 'credit').map((x) => x.date)).toContain('24 juin 2016');
  });
});
