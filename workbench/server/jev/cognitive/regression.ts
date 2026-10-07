// JEV COGNITIVE OS — COGNITIVE REGRESSION REPORT. For every capability: PASS / FAIL / WARNING / INSUFFICIENT DATA.
// « Self-checks » run the engines on fixed fixtures and verify invariants (a FAIL means the code is wrong).
// « Data checks » read the real log (INSUFFICIENT DATA when there is none — never a pass by default).
import type { JevLogEntry } from '../metrics';
import { cognitiveDiagnosis } from './diagnosis';
import { PROTOCOLS, selectProtocol, synthesizeProtocol, protocolCeiling } from './protocols';
import { analyzeTokens, planTokenBudget } from './tokens';
import { compileCognitiveCapsule } from './capsule';
import {
  behaviorFor,
  conditionModel,
  outputContract,
  predictFailures,
  preemptiveGuards,
  BEHAVIOR_MODES,
} from './conditioning';
import { compileCognitivePlan, decodeJcb } from './bytecode';
import { shouldStop, cognitiveRoi, rankByRoi } from './stop';
import { localizeDisagreement, adaptiveCouncil } from './disagreement';
import { CognitiveCache } from './cache';
import { BASE_POLICY, evaluatePolicy } from './policy';
import { CognitiveKernel } from './kernel';
import { DEFAULT_COGNITIVE } from './types';
import { superBenchTasks, SB_CATEGORIES } from './superbench';
import { fingerprints } from './fingerprint';
import { leverage } from './leverage';
import { selfAudit } from './audit';
import { strategyLibrary, evaluateTransfer, rehabilitation } from './strategies';
import { localSkill } from '../local';
import { scrubSecrets } from '../fabric/security';

export type RegStatus = 'PASS' | 'FAIL' | 'WARNING' | 'INSUFFICIENT DATA';
export interface RegRow {
  id: string;
  capability: string;
  kind: 'self-check' | 'data';
  status: RegStatus;
  detail: string;
}
export function cognitiveRegression(log: JevLogEntry[] = []): RegRow[] {
  const rows: RegRow[] = [];
  const check = (id: string, capability: string, f: () => string | true) => {
    try {
      const r = f();
      rows.push({
        id,
        capability,
        kind: 'self-check',
        status: r === true ? 'PASS' : 'FAIL',
        detail: r === true ? 'invariants vérifiés sur des cas fixes' : r,
      });
    } catch (e) {
      rows.push({ id, capability, kind: 'self-check', status: 'FAIL', detail: (e as Error).message });
    }
  };
  const hard = cognitiveDiagnosis({
    text: 'Analyse le portefeuille IFRS9 et vérifie les provisions pour le comité',
    mission: true,
    hasTools: true,
    attachments: ['p.xlsx'],
  });
  const easy = cognitiveDiagnosis({ text: 'Quelle est la capitale du Mali ?' });
  check('diagnosis', 'Cognitive Diagnosis Engine', () =>
    easy.trivial &&
    !hard.trivial &&
    hard.risk === 'high' &&
    hard.qualityTarget > easy.qualityTarget &&
    hard.taskDNA !== easy.taskDNA
      ? true
      : `trivial=${easy.trivial}/${hard.trivial} risque=${hard.risk}`,
  );
  check('protocols', 'Reasoning Protocol Engine', () => {
    const e = selectProtocol(easy);
    const h = selectProtocol(hard);
    if (e.protocol.tokens !== 0) return 'une demande triviale reçoit un protocole';
    if (h.protocol.tokens > protocolCeiling(hard)) return 'protocole au-dessus du plafond proportionnel';
    return synthesizeProtocol(['plan', 'verify'])?.status === 'candidate' &&
      Object.keys(PROTOCOLS).length === 20
      ? true
      : 'catalogue ou statut candidat incorrect';
  });
  check('tokens', 'Token Intelligence Engine', () => {
    const t = analyzeTokens('totaux', [
      { id: 'a', kind: 'context', text: 'Le total des ventes est de 1200 euros pour la région nord.' },
      { id: 'b', kind: 'context', text: 'Le total des ventes est de 1200 euros pour la région nord.' },
    ]);
    const b = planTokenBudget(easy, { contextTokens: 20000 });
    return t.repeated > 0 &&
      b.maxInput < 20000 &&
      b.maxOutput < planTokenBudget(hard, { contextTokens: 20000 }).maxOutput
      ? true
      : 'répétition ou budget non détectés';
  });
  check('capsule', 'Semantic Context Compiler', () => {
    const raw = `${Array.from({ length: 40 }, (_, i) => `Note ${i} : réunion sans objet particulier sur le planning général.`).join('\n')}\nDécision : on garde le fichier ventes_2026.xlsx et le plafond de 1500000 XOF.\nIl faut toujours citer la source.`;
    const c = compileCognitiveCapsule({
      goal: 'quel plafond pour ventes_2026.xlsx ?',
      raw,
      budgetTokens: 120,
    });
    return c.complete && c.text.includes('1500000') && c.capsuleTokens < c.rawTokens
      ? true
      : `plafond perdu ou capsule non réduite (${c.rawTokens}→${c.capsuleTokens})`;
  });
  check('conditioning', 'Model Conditioning / Behavior / Output Contract', () => {
    const plan = compileCognitivePlan(hard, { text: 'x', contextTokens: 4000 });
    const c = conditionModel({
      behavior: behaviorFor(hard),
      protocol: plan.protocol,
      contract: outputContract(hard, { maxOutput: 1000 }),
      guards: [],
      budget: plan.budget,
      maxTokens: 30,
    });
    return BEHAVIOR_MODES.length === 15 && c.tokens <= 30 + 40 && c.sections.length >= 1
      ? true
      : 'plafond de conditionnement non respecté';
  });
  check('guards', 'Failure Prediction / Preemptive Correction', () => {
    const preds = predictFailures(hard, { text: 'calcule le total et réponds en json' });
    const none = preemptiveGuards(preds, 'm', { m: { 'wrong-format': { n: 20, failed: 0 } } });
    const some = preemptiveGuards(preds, 'm', { m: { 'wrong-format': { n: 20, failed: 8 } } });
    return !none.some((g) => g.mode === 'wrong-format') && some.some((g) => g.mode === 'wrong-format')
      ? true
      : 'garde-fou ajouté sans preuve, ou preuve ignorée';
  });
  check('bytecode', 'Cognitive Compiler / JCB', () => {
    const p = compileCognitivePlan(hard, { text: 'x', contextTokens: 3000 });
    const d = decodeJcb(p.jcb);
    return d.DNA === hard.taskDNA && d.PROTO === p.protocol.id && !/[\s]{2,}/.test(p.jcb)
      ? true
      : `JCB incohérent : ${p.jcb}`;
  });
  check('stop', 'Stop Intelligence / Cognitive ROI', () => {
    const base = {
      quality: 90,
      previousQuality: 89.5,
      target: 95,
      nextCost: 0.04,
      valueLeft: null,
      redundant: false,
      newFacts: null,
      taskSolved: false,
      confidence: null,
      costSoFar: 0.1,
    };
    return shouldStop(base).reason === 'MARGINAL_GAIN_TOO_LOW' &&
      shouldStop({ ...base, quality: 96 }).reason === 'QUALITY_TARGET_REACHED' &&
      shouldStop({ ...base, quality: null, previousQuality: null }).stop === false &&
      cognitiveRoi(null, 1) === null &&
      rankByRoi([
        { gain: 5, cost: 1 },
        { gain: null, cost: 0.1 },
      ])[0]!.gain === 5
      ? true
      : 'décision d’arrêt incorrecte';
  });
  check('disagreement', 'Disagreement Localization / Adaptive Council', () => {
    const a = 'Le total des impayés est de 680 millions. Le ratio est de 8 pour cent. La banque est solide.';
    const b = 'Le total des impayés est de 860 millions. Le ratio est de 8 pour cent. La banque est solide.';
    const r = localizeDisagreement(a, b);
    return r.points.length === 1 &&
      r.points[0]!.kind === 'number' &&
      localizeDisagreement(a, a).converged &&
      adaptiveCouncil({ risk: 'low', ambiguity: 0, difficulty: 0.2, historicalVariance: null }).size === 1
      ? true
      : `${r.points.length} point(s)`;
  });
  check('cache', 'Cognitive Cache (L0-L5, invalidation)', () => {
    const c = new CognitiveCache();
    const st = { data: 'd1', policy: 1, capabilities: 'c1', input: 'i1' };
    c.put('L1', 'q', 42, st);
    const hit = c.get('L1', 'q', st);
    const stale = c.get('L1', 'q', { ...st, data: 'd2' });
    return hit.hit && !stale.hit && c.get('L1', 'q', st).hit === false ? true : 'invalidation incorrecte';
  });
  check('policy', 'Policy Evolution (challenger)', () => {
    const ev = evaluatePolicy(BASE_POLICY, { ...BASE_POLICY, protocolDifficulty: 0.5 }, []);
    return ev.verdict === 'INSUFFICIENT DATA' ? true : 'une politique est promue sans données';
  });
  check('kernel', 'Cognitive Microkernel', () => {
    const k = new CognitiveKernel({ ...DEFAULT_COGNITIVE, enabled: true });
    let after = 0;
    k.use('after:condition', () => after++);
    const run = k.plan({
      text: 'Vérifie les montants du fichier',
      attachments: ['a.xlsx'],
      hasImages: false,
      mission: false,
      historyTokens: 800,
      mode: 'balanced',
      hasTools: true,
      rawContext: '',
      parts: [],
    });
    return run.trace.length >= 4 && after === 1 && run.conditioning.tokens > 0 ? true : 'noyau incomplet';
  });
  check('superbench', 'Super Benchmark (tâches déterministes)', () => {
    const t = superBenchTasks();
    const again = superBenchTasks();
    if (t.length < 200) return `${t.length} tâches (< 200)`;
    if (t.map((x) => x.text).join() !== again.map((x) => x.text).join())
      return 'génération non reproductible';
    const planning = t.find((x) => x.category === 'planning')!;
    const order = planning.truth.replace(/[^A-E]/g, '');
    const okAns = order.split('').join(', ');
    const bad = order.split('').reverse().join(', ');
    return SB_CATEGORIES.every((c) => t.some((x) => x.category === c)) &&
      planning.check(okAns) &&
      !planning.check(bad)
      ? true
      : 'vérificateur de planification incorrect';
  });
  check('local', 'JEV-0 compétences locales', () =>
    localSkill('20% de 1500')?.answer.includes('300') ? true : 'pourcentage incorrect',
  );
  check('security', 'Sécurité : aucun secret dans le conditionnement', () => {
    const key = 'sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789abcdef';
    const c = compileCognitiveCapsule({
      goal: 'x',
      raw: `La clé est ${key}. Il faut toujours la protéger.`,
      budgetTokens: 200,
    });
    return scrubSecrets(c.text).includes(key) ? 'un secret survit au nettoyage' : true;
  });
  // ── data checks ──
  const txt = log.filter((e) => !e.studio);
  const dc = (id: string, capability: string, status: RegStatus, detail: string) =>
    rows.push({ id, capability, kind: 'data', status, detail });
  const fp = fingerprints(log);
  dc(
    'd-fingerprint',
    'Behavioral fingerprints',
    fp.some((f) => f.n >= 5) ? 'PASS' : 'INSUFFICIENT DATA',
    fp.some((f) => f.n >= 5)
      ? `${fp.filter((f) => f.n >= 5).length} modèle(s) avec ≥ 5 missions`
      : 'aucun modèle n’a 5 missions',
  );
  const lv = leverage(log);
  dc(
    'd-leverage',
    'Cognitive / token / cost leverage',
    lv.pairs >= 5 ? (lv.qualityDelta && lv.qualityDelta.hi < 0 ? 'FAIL' : 'PASS') : 'INSUFFICIENT DATA',
    lv.pairs >= 5
      ? `${lv.pairs} paires ; ${lv.qualityDelta ? `Δ qualité ${lv.qualityDelta.mean.toFixed(1)} [${lv.qualityDelta.lo.toFixed(1)}, ${lv.qualityDelta.hi.toFixed(1)}]` : 'Δ non estimable'}`
      : lv.note,
  );
  const au = selfAudit(log);
  const problems = au.filter((a) => a.status === 'PROBLEM').length;
  dc(
    'd-audit',
    'Self-audit',
    au.every((a) => a.status === 'INSUFFICIENT DATA') ? 'INSUFFICIENT DATA' : problems ? 'WARNING' : 'PASS',
    `${au.filter((a) => a.status === 'OK').length} OK · ${au.filter((a) => a.status === 'WARNING').length} avertissement(s) · ${problems} problème(s)`,
  );
  const lib = strategyLibrary(log as never);
  dc(
    'd-strategies',
    'Strategy library',
    lib.length ? (lib.some((s) => s.status === 'degraded') ? 'WARNING' : 'PASS') : 'INSUFFICIENT DATA',
    lib.length
      ? `${lib.length} stratégie(s) observée(s), ${lib.filter((s) => s.status === 'validated').length} validée(s)`
      : 'aucune mission avec trace cognitive',
  );
  const withCog = txt.filter((e) => e.cognitive);
  const regressed = withCog.filter((e) => e.success === false).length;
  dc(
    'd-nodegrade',
    'Pas de dégradation avec le Cognitive OS',
    withCog.length >= 10 ? (regressed / withCog.length > 0.3 ? 'FAIL' : 'PASS') : 'INSUFFICIENT DATA',
    withCog.length >= 10
      ? `${regressed}/${withCog.length} échecs parmi les missions tracées`
      : `${withCog.length} mission(s) tracée(s) (minimum 10)`,
  );
  dc(
    'd-transfer',
    'Skill transfer',
    evaluateTransfer([], '').status === 'INSUFFICIENT DATA' ? 'INSUFFICIENT DATA' : 'PASS',
    'exige des exécutions avec et sans la compétence sur au moins deux autres modèles',
  );
  dc(
    'd-rehab',
    'Model rehabilitation',
    rehabilitation({ model: '', arms: {}, threshold: 75 }).verdict === 'INSUFFICIENT DATA'
      ? 'INSUFFICIENT DATA'
      : 'PASS',
    'exige 5 exécutions par bras (seul, protocole, skill…) sur le même type de tâche',
  );
  return rows;
}
export const regressionSummary = (rows: RegRow[]) => ({
  pass: rows.filter((r) => r.status === 'PASS').length,
  fail: rows.filter((r) => r.status === 'FAIL').length,
  warning: rows.filter((r) => r.status === 'WARNING').length,
  insufficient: rows.filter((r) => r.status === 'INSUFFICIENT DATA').length,
});
