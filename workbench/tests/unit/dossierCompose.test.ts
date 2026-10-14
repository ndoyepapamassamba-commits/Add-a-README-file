import { describe, expect, it } from 'vitest';
import { checkDepth, normalizeDossier } from '../../server/services/dossier/dossier';
import {
  composeSystemPrompt,
  composeUserPrompt,
  deepenPrompt,
  dossierFromBrief,
  dossierSummaryMarkdown,
  parseDossierJson,
  verifyAgainstBrief,
} from '../../server/services/dossier/dossierCompose';
import { applyJudgments, chaptersFromPlan, dossierQuestions, dossierState, planQuestions, planState, promptQuestions } from '../../server/services/dossier/dossierJudge';
import { exampleDossier } from '../../server/services/dossier/exemple';
import { LOGO_TOOLS, THEMED_TOOLS, kindForTool } from '../../server/services/premiumDesigns';
import { buildBrief } from '../../server/services/reportBrief';

const COLS = ['Client', 'Agence', 'Segment', 'Produit', 'Encours XOF', 'Date'];
const ROWS = Array.from({ length: 60 }, (_, i) => ({
  Client: `C${String(i + 1).padStart(3, '0')}`,
  Agence: ['Dakar', 'Thiès', 'Kaolack', 'Saint-Louis'][i % 4]!,
  Segment: ['Corporate', 'PME', 'Particulier'][i % 3]!,
  Produit: ['Découvert', 'CMT', 'Escompte'][i % 3]!,
  'Encours XOF': (i % 7 === 0 ? 900_000_000 : 25_000_000) + i * 1_000_000,
  Date: `2026-0${1 + (i % 9)}-15`,
}));
const brief = buildBrief(COLS, ROWS, { title: 'Impayés', source: 'uploads/impayes.xlsx' });

describe('dossier.compose — prompts, lecture tolérante, repli par les règles', () => {
  it('the system prompt carries the closed grammar and the depth rules; the user prompt carries the brief, the notes, the sources and the judged plan', () => {
    const sys = composeSystemPrompt();
    expect(sys).toContain('Aucun chiffre inventé');
    expect(sys).toContain('"kpis"');
    expect(sys).toMatch(/3 chapitres/);
    const u = composeUserPrompt({
      focus: 'Comité Watchlist : qui porte les impayés ?',
      audience: 'Comité Watchlist',
      org: 'Banque Exemple',
      brief,
      notes: 'Kaolack porte 37,5 % des encours.',
      research: [{ title: 'EBA/GL/2020/06', axis: 'R1', lesson: 'suivi des covenants' }],
      plan: { chapters: ['Agence', 'Segment'], lead: 'concentration' },
    });
    expect(u).toContain('DEMANDE : Comité Watchlist');
    expect(u).toContain("BRIEF D'ANALYSE");
    expect(u).toContain('Kaolack porte 37,5 %');
    expect(u).toContain('[R1-01] EBA/GL/2020/06');
    expect(u).toContain('PLAN JUGÉ');
    expect(u).toContain('Agence ; Segment');
    expect(u).toContain('concentration');
  });
  it('reads the model JSON through fences, prose and trailing commas; refuses the unreadable', () => {
    expect(parseDossierJson('Voici le dossier :\n```json\n{"title":"T","kpis":[{"label":"A","num":1,},],}\n```\nFin.')).toEqual({ title: 'T', kpis: [{ label: 'A', num: 1 }] });
    expect(parseDossierJson('pas de json ici')).toBeNull();
    expect(parseDossierJson('{"a": [1, 2')).toBeNull();
  });
  it('the rules build a dossier from the brief alone; its thinness is reported by the depth rules, and the deepen prompt names each point', () => {
    const d = dossierFromBrief({ focus: 'Qui porte les impayés ?', brief, org: 'Banque Exemple', audience: 'Comité' });
    expect(d.kpis.length).toBeGreaterThanOrEqual(3);
    expect(d.chapters.length).toBeGreaterThanOrEqual(2);
    expect(d.chapters.every((c) => c.constats.length >= 1)).toBe(true);
    const issues = checkDepth(d);
    const p = deepenPrompt(d, issues);
    for (const i of issues) expect(p).toContain(i.issue);
    expect(p).toContain('DOSSIER COMPLET');
    // Every figure of the rules dossier comes from the brief.
    const v = verifyAgainstBrief(d, brief);
    expect(v.checked).toBeGreaterThan(0);
    expect(v.unknown).toEqual([]);
    // An invented figure is named.
    const d2 = normalizeDossier({ ...d, thesis: `${d.thesis} Un chiffre inventé : 987 654 dossiers.` });
    expect(verifyAgainstBrief(d2, brief).unknown).toContain('987 654');
    expect(dossierSummaryMarkdown(d)).toContain('# ');
  });
});

describe('JEV dans chaque décision du dossier', () => {
  it('the plan: one question per dimension and one for the lead; JEV answers kept when confident, the rules otherwise', () => {
    const q = planQuestions(brief);
    const dims = brief.dims.slice(0, 8);
    expect(Object.keys(q)).toEqual([...dims.map((_, i) => `dim_${i}`), 'lead']);
    expect(q.lead!.type).toBe('choice');
    const st = planState(brief, 'qui porte ?');
    expect(st.request).toBe('qui porte ?');
    expect((st.dims as unknown[]).length).toBe(dims.length);
    // JEV keeps two dimensions with confidence: the plan follows it.
    const ans: Record<string, { choice?: string; confidence?: number }> = {};
    dims.forEach((_, i) => (ans[`dim_${i}`] = { choice: i < 2 ? 'chapitre' : 'ignorer', confidence: 0.9 }));
    expect(chaptersFromPlan(brief, ans)).toEqual([0, 1]);
    // Low confidence or a single chapter: the rules decide (η² or concentration), never an empty plan from a shrug.
    dims.forEach((_, i) => (ans[`dim_${i}`] = { choice: 'chapitre', confidence: 0.2 }));
    expect(chaptersFromPlan(brief, ans)).toEqual(chaptersFromPlan(brief, null));
  });
  it('tones, priorities and figures: confident answers apply, weak ones do not, a doughnut never takes two series; readiness is labelled', () => {
    const d = exampleDossier();
    const q = dossierQuestions(d);
    expect(q.ready!.type).toBe('score');
    expect(q.thesisDecisional!.type).toBe('noul');
    expect(Object.keys(q).filter((k) => k.startsWith('kpi_'))).toHaveLength(d.kpis.length);
    const st = dossierState(d);
    expect((st.kpis as unknown[]).length).toBe(d.kpis.length);
    const k0 = d.kpis[0]!.tone;
    const newTone = k0 === 'risk' ? 'ok' : 'risk';
    const multi = d.chapters.findIndex((c) => c.figures.some((f) => f.series.length > 1));
    const fi = multi >= 0 ? d.chapters[multi]!.figures.findIndex((f) => f.series.length > 1) : -1;
    const answers: Record<string, { choice?: string; confidence?: number; score?: number; noul?: number }> = {
      kpi_0: { choice: newTone, confidence: 0.8 },
      kpi_1: { choice: 'warn', confidence: 0.3 },
      reco_0_0: { choice: d.chapters[0]!.recommandations[0]!.priority === 'P1' ? 'P3' : 'P1', confidence: 0.7 },
      ready: { score: 3.2, confidence: 0.66 },
      thesisDecisional: { noul: 0.91 },
    };
    if (fi >= 0) answers[`fig_${multi}_${fi}`] = { choice: 'doughnut', confidence: 0.95 };
    const tone1 = d.kpis[1]!.tone;
    const rep = applyJudgments(d, answers);
    expect(d.kpis[0]!.tone).toBe(newTone);
    expect(d.kpis[1]!.tone).toBe(tone1);
    expect(rep.tones).toBe(1);
    expect(rep.priorities).toBe(1);
    expect(rep.figures).toBe(0);
    expect(rep.ready).toEqual({ score: 3.2, label: 'prêt pour le comité', confidence: 0.66 });
    expect(rep.thesisDecisional).toBe(0.91);
  });
  it('the Prompt Studio asks clarity, completeness, invention risk, secret risk and the best lever', () => {
    expect(Object.keys(promptQuestions()).sort()).toEqual(['bestLever', 'clarity', 'completeness', 'inventionRisk', 'secretRisk']);
  });
});

describe('câblage dans l’agent : galerie, thème, logo', () => {
  it('dossier.export asks the gallery for the leading format; the theme wraps compose and export; the logo reaches every export', () => {
    expect(kindForTool('dossier.export', { formats: ['pptx'] })).toBe('slides');
    expect(kindForTool('dossier.export', { formats: ['xlsx'] })).toBe('excel');
    expect(kindForTool('dossier.export', {})).toBe('document');
    expect(kindForTool('dossier.compose', {})).toBeNull();
    for (const t of ['report.export', 'data.export', 'dossier.export', 'dossier.compose', 'apex.build_app']) expect(THEMED_TOOLS.test(t)).toBe(true);
    expect(THEMED_TOOLS.test('data.query')).toBe(false);
    for (const t of ['report.export', 'data.export', 'dossier.export']) expect(LOGO_TOOLS.test(t)).toBe(true);
    expect(LOGO_TOOLS.test('dossier.compose')).toBe(false);
  });
});
