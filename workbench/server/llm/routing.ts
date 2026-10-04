// Multi-model routing (pure, shared by the server and the direct edition).
// A task is profiled (type, difficulty, context, needs), mapped to a quality
// tier — CHEAP / BALANCED / QUALITY / MAXIMUM — then candidate models are
// ranked by tier patterns, capabilities, context window, price and observed
// reliability. The ranking also yields an automatic fallback chain.
import type { ModelInfo } from '@shared/types';
import type { AutoTiers } from '../services/settings';

export type QualityTier = 'cheap' | 'balanced' | 'quality' | 'maximum';
export type TaskType =
  'chat' | 'code' | 'data' | 'research' | 'browser' | 'document' | 'review' | 'vision' | 'writing';

export const QUALITY_TIERS: QualityTier[] = ['cheap', 'balanced', 'quality', 'maximum'];
export const TIER_LABEL: Record<QualityTier, string> = {
  cheap: 'CHEAP',
  balanced: 'BALANCED',
  quality: 'QUALITY',
  maximum: 'MAXIMUM',
};
/** Quality tier → configured model families (settings.autoTiers keys). */
export const TIER_FAMILIES: Record<QualityTier, keyof AutoTiers> = {
  cheap: 'fast',
  balanced: 'balanced',
  quality: 'powerful',
  maximum: 'reasoning',
};
export const FAMILY_TIER: Record<keyof AutoTiers, QualityTier> = {
  fast: 'cheap',
  balanced: 'balanced',
  powerful: 'quality',
  reasoning: 'maximum',
  vision: 'balanced',
};

export interface TaskProfile {
  type: TaskType;
  /** 0 (trivial) → 1 (very hard) */
  difficulty: number;
  tier: QualityTier;
  needsVision: boolean;
  /** Estimated prompt tokens (system + history + attachments). */
  contextTokens: number;
  reasons: string[];
  /** Specialists the orchestrator should involve, in order. */
  team: string[];
}

const RX: Record<string, RegExp> = {
  code: /\b(code|bug|erreur|error|fonction|function|api|react|typescript|javascript|python|html|css|sql|compile|build|npm|test|refactor|application|app\b|site|script|composant|component|backend|frontend|d[ée]ploi)/i,
  data: /\b(excel|xlsx|xlsm|xlsb|csv|json|donn[ée]es|data|tableau|colonnes?|statisti|graphique|chart|kpi|dashboard|tableau de bord|portefeuille|npl|ifrs9|provision|ratio)/i,
  research: /\b(recherche|cherche|search|web|internet|actualit|news|sources?|compare[rz]?|veille|benchmark)/i,
  browser:
    /\b(navigu|ouvre (le|la|ce) site|page web|website|browser|navigateur|clique|click|connecte-toi|login|formulaire|scrape|capture d'?[ée]cran|screenshot)/i,
  document: /\b(pdf|docx|word|pptx|powerpoint|document|contrat|rapport joint|extrai)/i,
  review: /\b(relis|review|audit|v[ée]rifie|contr[ôo]le|qualit[ée]|s[ée]curit[ée]|vuln[ée]rab)/i,
  writing:
    /\b(r[ée]dige|[ée]cris|write|email|mail|lettre|note|synth[èe]se|r[ée]sum|rapport|report|pr[ée]sentation|slides?)\b/i,
  hard: /\b(architecture|from scratch|de z[ée]ro|compl[eè]te?|enti[eè]re?|tout le projet|whole|refactor|migr|optimi[sz]|performance|algorithm|complexe|complex|racine|root cause|d[ée]bogue|debug|r[ée]pare tout|fix everything|teste tout|s[ée]curit[ée]|strat[ée]gie|mod[eè]le financier|risque)/i,
  trivial:
    /\b(typo|faute|renomm|rename|traduis|translate|formate?|bonjour|salut|merci|hello|quelle heure|capitale)\b/i,
};

/** Profiles a request for routing and team selection (transparent heuristics). */
export function analyzeTask(o: {
  text: string;
  attachmentNames?: string[];
  hasImages?: boolean;
  role?: string;
  historyTokens?: number;
  mission?: boolean;
}): TaskProfile {
  const t = `${o.text} ${(o.attachmentNames ?? []).join(' ')}`;
  const reasons: string[] = [];
  const scores: [TaskType, number][] = [
    ['code', RX.code!.test(t) ? 2 : 0],
    ['data', RX.data!.test(t) ? 2.2 : 0],
    ['research', RX.research!.test(t) ? 1.6 : 0],
    ['browser', RX.browser!.test(t) || o.role === 'browser' ? 2.4 : 0],
    ['document', RX.document!.test(t) ? 1.8 : 0],
    ['review', RX.review!.test(t) || o.role === 'reviewer' || o.role === 'final_reviewer' ? 1.5 : 0],
    ['writing', RX.writing!.test(t) ? 1.2 : 0],
  ];
  if ((o.attachmentNames ?? []).some((n) => /\.(xlsx|xlsm|xlsb|xls|csv|tsv|json|ods)$/i.test(n)))
    scores.find((s) => s[0] === 'data')![1] += 2;
  if ((o.attachmentNames ?? []).some((n) => /\.(pdf|docx|pptx|odt|rtf)$/i.test(n)))
    scores.find((s) => s[0] === 'document')![1] += 2;
  scores.sort((a, b) => b[1] - a[1]);
  let type: TaskType = scores[0]![1] > 0 ? scores[0]![0] : 'chat';
  const needsVision = Boolean(o.hasImages);
  if (needsVision && type === 'chat') type = 'vision';

  let d = 0.25;
  const len = o.text.length;
  if (len > 300) d += 0.1;
  if (len > 1200) d += 0.15;
  if (RX.hard!.test(t)) {
    d += 0.3;
    reasons.push('demande complexe');
  }
  if (RX.trivial!.test(t) && len < 160) {
    d -= 0.2;
    reasons.push('demande simple');
  }
  if (o.mission) {
    d += 0.2;
    reasons.push('mission autonome');
  }
  if (type === 'review') d += 0.15;
  if ((o.attachmentNames ?? []).length > 2) d += 0.1;
  if ((o.historyTokens ?? 0) > 60_000) d += 0.05;
  d = Math.max(0, Math.min(1, d));

  const tier: QualityTier = d >= 0.8 ? 'maximum' : d >= 0.55 ? 'quality' : d >= 0.3 ? 'balanced' : 'cheap';
  reasons.unshift(`type ${type}`, `difficulté ${Math.round(d * 100)} %`);
  if (needsVision) reasons.push('images → modèle vision');

  const team: Record<TaskType, string[]> = {
    code:
      d >= 0.55
        ? ['architect', 'coder', 'qa_engineer', 'security_reviewer', 'final_reviewer']
        : ['coder', 'qa_engineer'],
    data: ['data_analyst', 'reporting', 'final_reviewer'],
    research: ['researcher', 'reporting'],
    browser: ['browser', 'qa_engineer'],
    document: ['document_analyst', 'reporting'],
    review: ['qa_engineer', 'security_reviewer', 'final_reviewer'],
    writing: ['reporting', 'final_reviewer'],
    vision: ['document_analyst'],
    chat: [],
  };
  return {
    type,
    difficulty: d,
    tier,
    needsVision,
    contextTokens: Math.round((o.historyTokens ?? 0) + o.text.length / 3.6 + 6000),
    reasons,
    team: o.mission || d >= 0.55 ? team[type] : team[type].slice(0, 1),
  };
}

/** Observed reliability per model (success / failure), persisted by the caller. */
export interface HealthRecord {
  ok: number;
  fail: number;
  lastFailAt: number;
}
export type HealthMap = Record<string, HealthRecord>;

export function recordHealth(map: HealthMap, model: string, ok: boolean, now = Date.now()): HealthMap {
  const h = map[model] ?? { ok: 0, fail: 0, lastFailAt: 0 };
  // Exponential decay keeps the score responsive.
  const next = ok
    ? { ok: h.ok * 0.9 + 1, fail: h.fail * 0.9, lastFailAt: h.lastFailAt }
    : { ok: h.ok * 0.9, fail: h.fail * 0.9 + 1, lastFailAt: now };
  return { ...map, [model]: next };
}

/** 0 (unreliable) → 1 (reliable). A model that failed in the last 2 minutes is avoided. */
export function reliability(map: HealthMap, model: string, now = Date.now()): number {
  const h = map[model];
  if (!h) return 0.9;
  if (h.lastFailAt && now - h.lastFailAt < 120_000 && h.fail >= 1) return 0.1;
  return (h.ok + 1) / (h.ok + h.fail + 1.2);
}

export interface RouteResult {
  model: string;
  fallbacks: string[];
  tier: QualityTier;
  reason: string;
  /** Estimated cost range of the task in USD (null if prices unknown). */
  estimate: { low: number; high: number } | null;
}

function familyMatch(models: ModelInfo[], patterns: string[]): ModelInfo[] {
  const out: ModelInfo[] = [];
  for (const p of patterns) {
    let re: RegExp;
    try {
      re = new RegExp(p);
    } catch {
      continue;
    }
    // Newest model of each family first.
    const hits = models
      .filter((m) => re.test(m.id) && !out.includes(m))
      .sort((a, b) => b.created - a.created);
    out.push(...hits.slice(0, 2));
  }
  return out;
}

const usable = (m: ModelInfo) =>
  !m.id.startsWith('~') && !m.id.endsWith(':free') && !/openrouter\/auto/.test(m.id);

/** Chooses a model + fallback chain for a profiled task. */
export function routeModel(
  models: ModelInfo[],
  tiers: AutoTiers,
  p: TaskProfile,
  health: HealthMap = {},
): RouteResult | null {
  const ok = models.filter(
    (m) =>
      usable(m) &&
      m.capabilities.tools &&
      (!p.needsVision || m.capabilities.vision) &&
      (!m.contextLength || m.contextLength >= p.contextTokens * 1.25),
  );
  if (!ok.length) return null;
  const order = [
    p.tier,
    ...QUALITY_TIERS.filter((t) => t !== p.tier).sort(
      (a, b) =>
        Math.abs(QUALITY_TIERS.indexOf(a) - QUALITY_TIERS.indexOf(p.tier)) -
        Math.abs(QUALITY_TIERS.indexOf(b) - QUALITY_TIERS.indexOf(p.tier)),
    ),
  ];
  const ranked: { m: ModelInfo; tier: QualityTier; score: number }[] = [];
  order.forEach((tier, ti) => {
    const fam = familyMatch(
      ok,
      p.needsVision ? [...tiers.vision, ...tiers[TIER_FAMILIES[tier]]] : tiers[TIER_FAMILIES[tier]],
    );
    fam.forEach((m, i) => {
      if (ranked.some((r) => r.m.id === m.id)) return;
      const rel = reliability(health, m.id);
      ranked.push({ m, tier, score: 100 - ti * 20 - i * 3 + rel * 30 - (rel < 0.3 ? 60 : 0) });
    });
  });
  if (!ranked.length) {
    const newest = [...ok].sort((a, b) => b.created - a.created).slice(0, 3);
    newest.forEach((m, i) => ranked.push({ m, tier: p.tier, score: 10 - i }));
  }
  ranked.sort((a, b) => b.score - a.score);
  const best = ranked[0]!;
  const fallbacks = ranked
    .slice(1)
    .filter((r) => r.m.provider !== best.m.provider || r.tier !== best.tier)
    .slice(0, 2)
    .map((r) => r.m.id);
  if (fallbacks.length < 2)
    for (const r of ranked.slice(1))
      if (!fallbacks.includes(r.m.id) && fallbacks.length < 2) fallbacks.push(r.m.id);
  return {
    model: best.m.id,
    fallbacks,
    tier: best.tier,
    reason: `${TIER_LABEL[best.tier]} — ${p.reasons.join(', ')}`,
    estimate: estimateTaskCost(best.m, p),
  };
}

/** Rough cost range: steps × (context in + answer out), from real per-token prices. */
export function estimateTaskCost(
  m: ModelInfo | undefined,
  p: Pick<TaskProfile, 'difficulty' | 'contextTokens'>,
  mission = false,
): { low: number; high: number } | null {
  if (!m || m.inputPrice === null || m.outputPrice === null) return null;
  const steps = Math.max(1, Math.round(1 + p.difficulty * (mission ? 24 : 10)));
  const perStep = (p.contextTokens * m.inputPrice + 900 * m.outputPrice) / 1_000_000;
  // Prompt caching makes later steps cheaper; growth of context makes them larger.
  return { low: perStep * Math.max(1, steps * 0.4), high: perStep * steps * 1.6 };
}
