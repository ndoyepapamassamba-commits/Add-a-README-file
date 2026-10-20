// JEV COGNITIVE OS — COGNITIVE DIAGNOSIS ENGINE.
// Before a mission, JEV diagnoses the problem: what kind of thinking it needs, how hard, how ambiguous, how risky,
// whether fresh knowledge / tools / memory / vision / several models are needed, and what cost, latency and quality
// are acceptable. Transparent heuristics over the text (and the existing routing profile) — every field says why.
import { analyzeTask, type TaskProfile } from '../../llm/routing';
import type { JevMode } from '../tools';

export type CognitiveType =
  'recall' | 'compute' | 'extract' | 'analyze' | 'create' | 'code' | 'plan' | 'verify' | 'converse';
export type Risk = 'low' | 'normal' | 'high';

export interface CognitiveDiagnosis {
  /** Compact identity of the problem class, e.g. « data/analyze/high ». Used as a key by caches and strategies. */
  taskDNA: string;
  cognitiveType: CognitiveType;
  taskType: TaskProfile['type'];
  difficulty: number;
  ambiguity: number;
  risk: Risk;
  freshness: boolean;
  reasoningNeed: number;
  toolNeed: boolean;
  memoryNeed: boolean;
  visionNeed: boolean;
  codeNeed: boolean;
  calcNeed: boolean;
  precisionNeed: number;
  creativityNeed: number;
  /** Several models are worth considering (high risk or high difficulty). */
  councilWorthy: boolean;
  costSensitivity: number;
  latencySensitivity: number;
  /** Minimal acceptable quality 0-100 (a TARGET, never a measurement). */
  qualityTarget: number;
  /** The text is a very short, self-contained request. */
  trivial: boolean;
  reasons: string[];
}

const RX = {
  fresh:
    /\b(aujourd'?hui|actuel(le)?|dernier(e)?s?|r[ée]cent|202[5-9]|cours (du|de la)|taux actuel|news|actualit[ée]|en ce moment|latest|current|price|prix)\b/i,
  memory:
    /\b(comme (tout à l'heure|avant|hier|d[ée]j[àa])|la derni[èe]re fois|rappelle|souviens|pr[ée]c[ée]dent(e)?|ci-dessus|continue|reprends|as before|earlier|previous)\b/i,
  calc: /\b(calcul|total|somme|moyenne|pourcentage|ratio|taux|\d+\s*[+\-*/x×÷%]\s*\d+|combien)\b/i,
  precise:
    /\b(exact|pr[ée]cis|chiffres?|montants?|r[ée]glementaire|conforme|audit|contr[ôo]le|v[ée]rifie|bceao|ifrs ?9|provision|npl|comit[ée]|comex|contrat|juridique)\b/i,
  creative:
    /\b(id[ée]e|cr[ée]atif|slogan|histoire|sc[ée]nario|blague|humour|po[èe]me|nom (de|pour)|invente|imagine|brainstorm|campagne|storytelling)\b/i,
  plan: /\b(plan|roadmap|strat[ée]gie|[ée]tapes|organise|architecture|planifie|feuille de route|d[ée]coupe)\b/i,
  verify: /\b(v[ée]rifie|contr[ôo]le|valide|audit|relis|review|corrige|teste|est-ce correct|check)\b/i,
  extract: /\b(extrai|liste les|trouve les|relev[ée]|quels? sont les|identifie|r[ée]cup[èe]re)\b/i,
  compare: /\b(compare|versus|vs\.?|diff[ée]rence entre|lequel|meilleur(e)?|avantages|inconv[ée]nients)\b/i,
  vague:
    /\b(un peu|quelque chose|des trucs|comme tu veux|ce que tu veux|etc\.?|genre|machin|truc|à peu près|globalement)\b/i,
  security: /\b(s[ée]curit[ée]|vuln[ée]rab|injection|secret|mot de passe|token|xss|csrf|permission)\b/i,
};

const MODE_COST: Record<JevMode, number> = { eco: 0.9, balanced: 0.55, performance: 0.3, max: 0.1 };

export function cognitiveDiagnosis(o: {
  text: string;
  attachments?: string[];
  hasImages?: boolean;
  mission?: boolean;
  historyTokens?: number;
  mode?: JevMode;
  hasTools?: boolean;
}): CognitiveDiagnosis {
  const text = o.text;
  const profile = analyzeTask({
    text,
    attachmentNames: o.attachments,
    hasImages: o.hasImages,
    mission: o.mission,
    historyTokens: o.historyTokens,
  });
  const reasons: string[] = [];
  const freshness = RX.fresh.test(text);
  if (freshness) reasons.push('information récente demandée');
  const calcNeed = RX.calc.test(text) || profile.type === 'data';
  if (calcNeed) reasons.push('calcul ou données chiffrées');
  const codeNeed = profile.type === 'code';
  const toolNeed =
    Boolean(o.hasTools) &&
    (profile.type === 'data' ||
      profile.type === 'code' ||
      profile.type === 'browser' ||
      profile.type === 'document' ||
      (o.attachments?.length ?? 0) > 0 ||
      freshness);
  const memoryNeed = RX.memory.test(text) || Boolean(o.mission);
  const precisionNeed = Math.min(
    1,
    (RX.precise.test(text) ? 0.55 : 0.15) + (calcNeed ? 0.25 : 0) + (profile.difficulty >= 0.8 ? 0.15 : 0),
  );
  const creativityNeed = Math.min(
    1,
    (RX.creative.test(text) ? 0.7 : 0.1) + (profile.type === 'writing' ? 0.15 : 0),
  );
  const vague = RX.vague.test(text);
  const ambiguity = Math.max(
    0,
    Math.min(
      1,
      (vague ? 0.35 : 0) +
        (text.trim().length < 25 && !calcNeed ? 0.3 : 0) +
        ((text.match(/\?/g)?.length ?? 0) > 2 ? 0.2 : 0) +
        (profile.reasons.includes('demande simple') ? -0.2 : 0) +
        0.1,
    ),
  );
  const critical = profile.reasons.includes('enjeu critique');
  const risk: Risk =
    critical || precisionNeed >= 0.8
      ? 'high'
      : profile.difficulty >= 0.55 || precisionNeed >= 0.5
        ? 'normal'
        : 'low';
  if (critical) reasons.push('enjeu critique (gouvernance, réglementation, argent)');
  const reasoningNeed = Math.min(
    1,
    profile.difficulty * 0.7 +
      (RX.plan.test(text) || RX.compare.test(text) ? 0.2 : 0) +
      (RX.verify.test(text) ? 0.1 : 0),
  );
  const cognitiveType: CognitiveType = codeNeed
    ? 'code'
    : RX.verify.test(text)
      ? 'verify'
      : RX.plan.test(text)
        ? 'plan'
        : RX.extract.test(text)
          ? 'extract'
          : calcNeed && profile.type !== 'data'
            ? 'compute'
            : profile.type === 'data' ||
                profile.type === 'research' ||
                profile.type === 'review' ||
                RX.compare.test(text)
              ? 'analyze'
              : creativityNeed >= 0.6 || profile.type === 'writing'
                ? 'create'
                : profile.difficulty < 0.3
                  ? 'converse'
                  : 'recall';
  const mode = o.mode ?? 'balanced';
  const costSensitivity = MODE_COST[mode];
  const latencySensitivity = profile.difficulty < 0.3 ? 0.8 : mode === 'max' ? 0.1 : 0.4;
  const qualityTarget = Math.round(
    Math.max(
      60,
      Math.min(
        98,
        68 +
          profile.difficulty * 14 +
          (risk === 'high' ? 12 : risk === 'normal' ? 4 : 0) +
          (precisionNeed >= 0.7 ? 4 : 0) -
          (mode === 'eco' ? 4 : 0) +
          (mode === 'max' ? 4 : 0),
      ),
    ),
  );
  const trivial = profile.difficulty < 0.3 && risk === 'low' && !toolNeed && !o.mission && text.length < 220;
  return {
    taskDNA: `${profile.type}/${cognitiveType}/${risk}`,
    cognitiveType,
    taskType: profile.type,
    difficulty: Number(profile.difficulty.toFixed(2)),
    ambiguity: Number(ambiguity.toFixed(2)),
    risk,
    freshness,
    reasoningNeed: Number(reasoningNeed.toFixed(2)),
    toolNeed,
    memoryNeed,
    visionNeed: profile.needsVision,
    codeNeed,
    calcNeed,
    precisionNeed: Number(precisionNeed.toFixed(2)),
    creativityNeed: Number(creativityNeed.toFixed(2)),
    councilWorthy: risk === 'high' && profile.difficulty >= 0.55,
    costSensitivity,
    latencySensitivity,
    qualityTarget,
    trivial,
    reasons: [...profile.reasons, ...reasons],
  };
}
