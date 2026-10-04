import { describe, expect, it } from 'vitest';
import { analyzeTask } from '../../server/llm/routing';
import {
  BENCH_TASKS,
  ShadowMonitor,
  buildGraph,
  buildTwin,
  compressTrajectory,
  detectRules,
  dnaSimilarity,
  emptyLedger,
  evalFormula,
  failureMemory,
  functionalDiff,
  impactOf,
  parseChallenge,
  planStrategy,
  queryGraph,
  rankInformation,
  recordEntry,
  regressionSuite,
  simulateDecision,
  taskDna,
  unsupportedNumbers,
  type LedgerEntry,
} from '../../server/agent/intelligence';

const dnaOf = (text: string, att: string[] = [], mission = false) =>
  taskDna(text, att, analyzeTask({ text, attachmentNames: att, mission }));
const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
  id: Math.random().toString(36).slice(2),
  at: Date.now(),
  goal: 'Synthèse des impayés par agence',
  dna: dnaOf('Synthèse des impayés par agence en Excel', ['impayes.xlsx']),
  tier: 'balanced',
  model: 'a/m',
  team: [],
  verdict: 'PASSED',
  cost: 0.01,
  durationMs: 1000,
  steps: 5,
  toolErrors: [],
  rounds: 0,
  files: { read: ['uploads/impayes.xlsx'], written: ['outputs/synthese.xlsx'] },
  checks: [],
  lessons: [],
  ...over,
});

describe('Task DNA & strategy engine', () => {
  it('fingerprints criticality, outputs, risks and verification needs', () => {
    const d = dnaOf('Prépare le rapport COMEX sur les provisions IFRS9 en Word', ['portefeuille.xlsb']);
    expect(d.criticality).toBe('critical');
    expect(d.outputs).toContain('word');
    expect(d.risks).toEqual(expect.arrayContaining(['financial', 'governance']));
    expect(d.verification).toContain('adversarial-challenge');
    expect(dnaSimilarity(d, dnaOf('Rapport COMEX provisions IFRS9 Word', ['p.xlsb']))).toBeGreaterThan(0.6);
    expect(dnaSimilarity(d, dnaOf('Écris un poème sur la mer'))).toBeLessThan(0.3);
  });
  it('learns: a cheaper tier that keeps succeeding is chosen; failures escalate', () => {
    const goal = 'Synthèse des impayés par agence en Excel';
    const p = { ...analyzeTask({ text: goal, attachmentNames: ['impayes.xlsx'] }), tier: 'quality' as const };
    const dna = dnaOf(goal, ['impayes.xlsx']);
    let l = emptyLedger();
    l = recordEntry(l, entry({ tier: 'cheap' }));
    l = recordEntry(l, entry({ tier: 'cheap' }));
    l = recordEntry(l, entry({ tier: 'cheap' }));
    const s = planStrategy(dna, p, l, { mission: false, rand: () => 0.99 });
    expect(s.tier).toBe('cheap');
    expect(s.tierReason).toMatch(/appris/);
    expect(s.reuse.length).toBeGreaterThan(0);
    let bad = emptyLedger();
    for (let i = 0; i < 3; i++)
      bad = recordEntry(
        bad,
        entry({
          tier: 'quality',
          verdict: 'FAILED',
          toolErrors: [{ tool: 'data.query', error: 'colonne inconnue Encours' }],
        }),
      );
    const s2 = planStrategy(dna, p, bad, { mission: true, rand: () => 0.99 });
    expect(s2.tier).toBe('maximum');
    expect(failureMemory(bad, dna).join(' ')).toMatch(/colonne inconnue/);
  });
  it('critical tasks never go below QUALITY and get an adversarial review', () => {
    const t = 'Note au Comité des risques sur le ratio NPL';
    const s = planStrategy(
      dnaOf(t, [], true),
      { ...analyzeTask({ text: t, mission: true }), tier: 'cheap' },
      emptyLedger(),
      { mission: true, rand: () => 0 },
    );
    expect(['quality', 'maximum']).toContain(s.tier);
    expect(s.verify.adversarial).toBe(true);
    expect(s.team).toContain('adversarial');
  });
});

describe('Shadow monitor', () => {
  it('flags repeated failures, source alteration, unverified claims, drift and dependents', () => {
    const sh = new ShadowMonitor('Corrige le calcul du total dans app.js', {
      writeTask: true,
      dependents: (p) => (p === 'lib/calc.js' ? ['app.js'] : []),
    });
    sh.observeTool('data.query', { path: 'x.csv' }, false, 'Error: colonne inconnue');
    sh.observeTool('data.query', { path: 'x.csv' }, false, 'Error: colonne inconnue');
    sh.observeTool('filesystem.write', { path: 'uploads/source.xlsx' }, true, 'ok');
    sh.observeTool('filesystem.edit', { path: 'lib/calc.js' }, true, 'ok');
    const kinds = sh.take().map((a) => a.kind);
    expect(kinds).toEqual(expect.arrayContaining(['repeat-failure', 'source-altered', 'dependents']));
    sh.observeFinal('Tout est testé et fonctionne parfaitement.');
    expect(sh.take().map((a) => a.kind)).toContain('unverified-claim');
    for (let i = 0; i < 6; i++)
      sh.observeTool('web.search', { query: 'recette tarte pommes cannelle dessert' }, true, '');
    expect(sh.take().map((a) => a.kind)).toContain('drift');
    expect(sh.drift).toBe(1);
  });
});

describe('Evidence, adversarial, compression', () => {
  it('finds figures that appear in no tool result', () => {
    const ev = ['| agence | total |\n| Dakar | 1250000000 |\n| Thiès | 430500000 |', 'ratio: 0.07'];
    const bad = unsupportedNumbers(
      'Dakar : 1 250 000 000 XOF, Thiès 430 500 000, Ziguinchor 98 765 432, NPL 7 %, en 2026, 3 agences.',
      ev,
    );
    expect(bad).toEqual(['98 765 432']);
  });
  it('parses the red-team report', () => {
    const c = parseChallenge(
      'CONFIDENCE: 62%\nBLOCKING: total faux (1 900 000 au lieu de 1 900 250)\nMINOR: libellé\nBLOCKING: none',
    );
    expect(c.blocking).toEqual(['total faux (1 900 000 au lieu de 1 900 250)']);
    expect(c.confidence).toBe(62);
  });
  it('compresses a trajectory into facts, failures, files and state', () => {
    const s = compressTrajectory(
      [
        {
          role: 'assistant',
          content: 'Je vais lire le fichier.',
          tool_calls: [{ function: { name: 'data__query', arguments: '{"path":"v.csv"}' } }],
        },
        { role: 'tool', content: 'total = 42' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ function: { name: 'filesystem__write', arguments: '{"path":"out/r.md"}' } }],
        },
        { role: 'tool', content: 'Error: denied' },
      ],
      'Calcule le total',
    );
    expect(s).toContain('Facts obtained');
    expect(s).toContain('total = 42');
    expect(s).toContain('Failed approaches');
    expect(s).toContain('Files read: v.csv');
  });
});

describe('Knowledge graph, digital twin, functional diff', () => {
  it('links missions, files and models', () => {
    const l = recordEntry(emptyLedger(), entry({ goal: 'Tableau des impayés', model: 'x/m1' }));
    const g = buildGraph(l, '- 2026-10-01 — garder synthese.xlsx comme référence', ['outputs/synthese.xlsx']);
    const out = queryGraph(g, 'synthese');
    expect(out).toContain('outputs/synthese.xlsx');
    expect(out).toMatch(/wrote/);
  });
  it('maps dependencies and transitive impact', () => {
    const t = buildTwin([
      { path: 'index.html', text: '<script src="app.js"></script>' },
      {
        path: 'app.js',
        text: "import { total } from './lib/calc.js'; fetch('data/v.csv')\nfunction main(){}",
      },
      { path: 'lib/calc.js', text: 'export function total(){}' },
      { path: 'data/v.csv', text: 'a,b' },
    ]);
    expect(t.deps['app.js']).toEqual(expect.arrayContaining(['lib/calc.js', 'data/v.csv']));
    expect(impactOf(t, 'lib/calc.js')).toEqual(expect.arrayContaining(['app.js', 'index.html']));
    const d = functionalDiff(
      { 'lib/calc.js': 'export function total(){}\nexport function old(){}', 'gone.md': 'x' },
      {
        'lib/calc.js': 'export function total(){}\nexport function moyenne(){}',
        'new.py': 'def f():\n  pass',
      },
      t,
    );
    expect(d.summary).toContain('fonctions ajoutées : moyenne');
    expect(d.summary).toContain('fonctions supprimées : old');
    expect(d.summary).toMatch(/impactés.*app\.js/);
  });
});

describe('Decision simulator, information value, operating manual, regression suite, benchmark', () => {
  it('evaluates formulas safely', () => {
    expect(evalFormula('a*(1-b)+max(c,2)^2', { a: 100, b: 0.25, c: 1 })).toBe(79);
    expect(() => evalFormula('alert(1)', {})).toThrow();
    expect(() => evalFormula('a;b', { a: 1, b: 2 })).toThrow();
  });
  it('compares options under scenarios and finds the flip point', () => {
    const out = simulateDecision({
      formula: 'volume*marge - cout',
      options: [
        { name: 'A', vars: { volume: 100, marge: 3, cout: 50 } },
        { name: 'B', vars: { volume: 80, marge: 3, cout: 20 } },
      ],
      scenarios: [
        { name: 'central', shocks: {}, probability: 0.6 },
        { name: 'stress', shocks: { volume: 0.7 }, probability: 0.4 },
      ],
    });
    expect(out).toContain('| A |');
    expect(out).toMatch(/Meilleure option.*\*\*(A|B)\*\*/);
    expect(out).toMatch(/s'inverse si/);
  });
  it('ranks information by value / cost', () => {
    const r = rankInformation([
      { question: 'Taux de défaut 2025', impact: 0.9, uncertainty: 0.8, cost: 1 },
      { question: 'Couleur du logo', impact: 0.1, uncertainty: 0.9, cost: 1 },
    ]);
    expect(r.split('\n')[0]).toContain('Taux de défaut');
  });
  it('detects explicit user rules', () => {
    const r = detectRules(
      'Merci. À partir de maintenant, les montants sont toujours en XOF. Ne jamais utiliser de fond noir dans les exports.',
    );
    expect(r.map((x) => x.kind)).toEqual(['standard', 'forbidden']);
  });
  it('keeps re-runnable checks of successful missions', () => {
    const l = recordEntry(
      emptyLedger(),
      entry({ checks: [{ name: 'total', status: 'pass', command: 'grep -c Dakar out.csv', expect: '2' }] }),
    );
    expect(regressionSuite(l)[0]).toMatchObject({
      command: 'grep -c Dakar out.csv',
      files: ['outputs/synthese.xlsx'],
    });
  });
  it('benchmark checkers accept right answers and reject wrong ones', () => {
    const by = Object.fromEntries(BENCH_TASKS.map((t) => [t.id, t]));
    expect(by['arith-table']!.check('Total : 1 900 250 000 XOF')).toBe(true);
    expect(by['arith-table']!.check('1 900 000 000')).toBe(false);
    expect(by.ratio!.check('7,0 %')).toBe(true);
    expect(
      by['json-extract']!.check('{"client":"SOW Mamadou","montant":2500000,"echeance":"2026-03-15"}'),
    ).toBe(true);
    expect(
      by['code-fn']!.check(
        '```js\nfunction formatXof(n){return Math.round(n).toLocaleString("fr-FR").replace(/[\\u202f\\u00a0]/g," ")}\n```',
      ),
    ).toBe(true);
    expect(by.reasoning!.check('7 500 000')).toBe(true);
  });
});
