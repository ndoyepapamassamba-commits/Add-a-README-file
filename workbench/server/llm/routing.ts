// Multi-model routing (pure, shared by the server and the direct edition).
// A task is profiled (type, difficulty, context, needs), mapped to a quality
// tier — CHEAP / BALANCED / QUALITY / MAXIMUM. Each tier has a minimum
// independent intelligence score (modelIntel.ts); among the models that reach
// it, the cheapest live price wins and the next ones are the fallbacks. No
// provider is preferred. Family patterns are only a last resort.
import type { ModelInfo } from '@shared/types';
import type { AutoTiers } from '../services/settings';
import { intelMax, intelligenceInfo, type IntelMetric } from './modelIntel';

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
  apex: /\b(apex|dashboard|tableau de bord|cockpit|reporting|mail (quotidien|du jour)|exports? (excel|word|powerpoint|pptx|pdf))/i,
  app: /\b(application|app|appli)\b/i,
  // High-stakes deliverables (governance, regulator, money): never the cheapest tier.
  critical:
    /\b(comex|comit[ée]|conseil d'administration|board|bceao|commission bancaire|ifrs ?9|b[âa]le|r[ée]glementaire|r[ée]gulateur|audit externe|provisions?|npl|cr[ée]ances? (douteuses|en souffrance)|juridique|contrat|production|prod\b)/i,
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
  if (RX.critical!.test(t)) {
    d += 0.3;
    reasons.push('enjeu critique');
  }
  if (RX.trivial!.test(t) && len < 160 && !RX.critical!.test(t)) {
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
    team: withApex(
      o.mission || d >= 0.55 ? team[type] : team[type].slice(0, 1),
      RX.apex!.test(t) || (RX.app!.test(t) && (type === 'data' || type === 'document')),
    ),
  };
}

/** Business apps / dashboards / house exports go to the APEX Studio specialist first. */
function withApex(team: string[], apex: boolean): string[] {
  return apex ? ['apex_studio', ...team.filter((r) => r !== 'apex_studio' && r !== 'coder')] : team;
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
  /** Top of the value ranking (score = intelligence index, price = blended $/M). */
  ranking?: { id: string; score: number; price: number }[];
  metric?: IntelMetric;
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

// '-contributor' tiers are cheaper because prompts may be used by the provider:
// never chosen automatically (confidential data).
const usable = (m: ModelInfo) =>
  !/-contributor\b/.test(m.id) &&
  !m.id.startsWith('~') &&
  !/:(free|batch)$/.test(m.id) &&
  !/^openrouter\//.test(m.id);

export const METRIC_LABEL: Record<IntelMetric, string> = {
  intelligence: 'Intelligence',
  coding: 'Coding',
  agentic: 'Agentique',
};

/** Minimum score per tier, as a share of the best known score on the task's metric. */
export const TIER_MIN_INTEL: Record<QualityTier, number> = {
  cheap: 0.6,
  balanced: 0.75,
  quality: 0.86,
  maximum: 0.95,
};

/** Blended USD / 1M tokens for agent work (prompts dominate: 12 in : 1 out). */
export function blendedPrice(m: ModelInfo): number | null {
  if (m.inputPrice === null || m.outputPrice === null) return null;
  return (12 * m.inputPrice + m.outputPrice) / 13;
}

/** Personal leaderboard: missions won / lost per model (fed by QA verdicts). */
export type LeaderboardMap = Record<string, { won: number; lost: number }>;
export function recordOutcome(map: LeaderboardMap, model: string, won: boolean): LeaderboardMap {
  const e = map[model] ?? { won: 0, lost: 0 };
  return { ...map, [model]: won ? { ...e, won: e.won + 1 } : { ...e, lost: e.lost + 1 } };
}
/** ±3 points max, shrunk toward 0 while few missions were observed. */
export function leaderboardBoost(map: LeaderboardMap, model: string): number {
  const e = map[model];
  if (!e) return 0;
  const n = e.won + e.lost;
  return ((e.won - e.lost) / (n + 2)) * 3;
}

export interface RankedModel {
  m: ModelInfo;
  /** Relative score 0-100 on the task's metric (+ leaderboard, − unreliability). */
  score: number;
  /** Raw Artificial Analysis index on that metric. */
  raw: number;
  metric: IntelMetric;
  estimated: boolean;
  /** Blended USD / 1M tokens. */
  price: number;
  /** Not dominated: no other candidate is both cheaper (or equal) and smarter. */
  pareto: boolean;
  /** Benchmark variant the score comes from (e.g. "GPT-6 Luna (Max)"). */
  ref: string;
}

/** Which index measures the task best: coding for code, agentic for tools/browser, else intelligence. */
export function metricFor(type: TaskType | undefined): IntelMetric {
  return type === 'code' ? 'coding' : type === 'browser' ? 'agentic' : 'intelligence';
}

/**
 * Provider-neutral ranking: the candidates that reach the tier's minimum on the
 * task's metric, cheapest first; when prices are within 10 % the smarter model
 * wins. A dearer AND less intelligent model can therefore never come first.
 */
export function rankByValue(
  models: ModelInfo[],
  p: Pick<TaskProfile, 'tier' | 'needsVision' | 'contextTokens'> & { type?: TaskType },
  health: HealthMap = {},
  board: LeaderboardMap = {},
): RankedModel[] {
  const metric = metricFor(p.type);
  const min = TIER_MIN_INTEL[p.tier] * 100;
  const maxM = intelMax(metric);
  const maxI = intelMax('intelligence');
  const pool: RankedModel[] = [];
  for (const m of models) {
    if (!usable(m) || !m.capabilities.tools) continue;
    if (p.needsVision && !m.capabilities.vision) continue;
    if (m.contextLength && m.contextLength < p.contextTokens * 1.25) continue;
    const info = intelligenceInfo(m.id, m.slug);
    const price = blendedPrice(m);
    if (!info || price === null || price <= 0) continue;
    const v = metric === 'intelligence' ? info.score : info[metric];
    // Metric not measured for this model: fall back on its intelligence index (flagged as estimate).
    const rel = v !== null ? (v / maxM) * 100 : (info.score / maxI) * 100;
    // A specialised index (coding / agentic) is not enough on its own: the model
    // must also keep a minimum of general intelligence for the tier.
    if (metric !== 'intelligence' && (info.score / maxI) * 100 < min * 0.85) continue;
    const r = reliability(health, m.id);
    const score = rel + leaderboardBoost(board, m.id) - (r < 0.3 ? 60 : (0.9 - Math.min(r, 0.9)) * 15);
    pool.push({
      m,
      score,
      raw: v ?? info.score,
      metric: v !== null ? metric : 'intelligence',
      estimated: info.estimated || v === null,
      ref: info.name,
      price,
      pareto: true,
    });
  }
  const eligible = pool.filter((r) => r.score >= min);
  for (const r of eligible)
    r.pareto = !eligible.some(
      (o) => o !== r && o.price <= r.price && o.score >= r.score && (o.price < r.price || o.score > r.score),
    );
  const cmp = (a: RankedModel, b: RankedModel) => {
    const lo = Math.min(a.price, b.price);
    if (Math.abs(a.price - b.price) <= lo * 0.1)
      return (
        b.score - a.score ||
        Number(a.estimated) - Number(b.estimated) ||
        a.price - b.price ||
        a.m.id.length - b.m.id.length
      );
    return a.price - b.price;
  };
  // One entry per measured model: '-pro', dated or estimated twins of the same
  // benchmark entry keep only the best-placed one.
  const seen = new Set<string>();
  return eligible.sort(cmp).filter((r) => {
    const k = `${r.m.provider}:${r.ref}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Chooses a model + fallback chain for a profiled task. */
export function routeModel(
  models: ModelInfo[],
  tiers: AutoTiers,
  p: TaskProfile,
  health: HealthMap = {},
  board: LeaderboardMap = {},
): RouteResult | null {
  // 1. Value routing: cheapest model that is intelligent enough, then the next ones.
  let tier = p.tier;
  let ranked = rankByValue(models, p, health, board);
  // Nothing reaches the tier (tiny catalog, vision, huge context): relax downward then upward.
  for (const t of [...QUALITY_TIERS].reverse()) {
    if (ranked.length) break;
    if (t === p.tier) continue;
    ranked = rankByValue(models, { ...p, tier: t }, health, board);
    if (ranked.length) tier = t;
  }
  if (ranked.length) {
    const best = ranked[0]!;
    const fallbacks = ranked.slice(1, 3).map((r) => r.m.id);
    return {
      model: best.m.id,
      fallbacks,
      tier,
      reason: `${TIER_LABEL[tier]} — le moins cher assez intelligent (${METRIC_LABEL[best.metric]} ${best.raw.toFixed(1)}${best.estimated ? ' estimé' : ''}, ${best.price.toFixed(2)} $/M) — ${p.reasons.join(', ')}`,
      estimate: estimateTaskCost(best.m, p),
      ranking: ranked.slice(0, 5).map((r) => ({ id: r.m.id, score: r.raw, price: r.price })),
      metric: best.metric,
    };
  }
  return routeByFamilies(models, tiers, p, health);
}

/** Legacy routing on family patterns (used only when no model has a known score). */
function routeByFamilies(
  models: ModelInfo[],
  tiers: AutoTiers,
  p: TaskProfile,
  health: HealthMap,
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

export interface Category {
  key: string;
  label: string;
  rule: string;
  best: RankedModel | null;
  backup: RankedModel | null;
}

/** Model categorization with best + backup per category (same ranking as AUTO). */
export function categorize(
  models: ModelInfo[],
  health: HealthMap = {},
  board: LeaderboardMap = {},
): Category[] {
  const base = { needsVision: false, contextTokens: 0 };
  const cat = (key: string, label: string, rule: string, list: RankedModel[]): Category => ({
    key,
    label,
    rule,
    best: list[0] ?? null,
    backup: list[1] ?? null,
  });
  const out = QUALITY_TIERS.map((t) =>
    cat(
      t,
      TIER_LABEL[t],
      `Intelligence ≥ ${(TIER_MIN_INTEL[t] * intelMax()).toFixed(1)} — le moins cher d'abord`,
      rankByValue(models, { ...base, tier: t }, health, board),
    ),
  );
  const q = (extra: Partial<Parameters<typeof rankByValue>[1]>) =>
    rankByValue(models, { ...base, tier: 'quality', ...extra }, health, board);
  out.push(
    cat(
      'code',
      'CODE',
      `Coding ≥ ${(TIER_MIN_INTEL.quality * intelMax('coding')).toFixed(1)} (palier QUALITY)`,
      q({ type: 'code' }),
    ),
    cat(
      'agentic',
      'AGENTIQUE',
      `Agentique ≥ ${(TIER_MIN_INTEL.quality * intelMax('agentic')).toFixed(1)} (palier QUALITY)`,
      q({ type: 'browser' }),
    ),
    cat(
      'vision',
      'VISION',
      'images en entrée, palier BALANCED',
      rankByValue(models, { ...base, tier: 'balanced', needsVision: true }, health, board),
    ),
    cat(
      'long',
      'LONG CONTEXTE',
      'contexte ≥ 800 k tokens, palier BALANCED',
      rankByValue(models, { ...base, tier: 'balanced', contextTokens: 640_000 }, health, board),
    ),
  );
  const all = rankByValue(models, { ...base, tier: 'cheap' }, health, board).sort(
    (a, b) => b.score / b.price - a.score / a.price,
  );
  out.push(cat('value', 'MEILLEUR RAPPORT', "points d'intelligence par $ le plus élevé (palier CHEAP)", all));
  return out;
}

/** Representative tasks: what AUTO picks by default for each (same code path as a real request). */
export const SAMPLE_TASKS: {
  label: string;
  text: string;
  attachments?: string[];
  images?: boolean;
  mission?: boolean;
}[] = [
  { label: 'Question simple / traduction', text: 'traduis bonjour en anglais' },
  { label: 'Rédaction (mail, note, synthèse)', text: 'Rédige un mail de synthèse pour la direction' },
  { label: 'Code : fonction / bug', text: 'Corrige ce bug dans la fonction python' },
  {
    label: 'Code : application complète',
    text: 'Construis une application complète avec architecture, tests et sécurité',
    mission: true,
  },
  {
    label: 'Données : analyse Excel',
    text: 'Analyse ce fichier et fais un tableau de bord',
    attachments: ['portefeuille.xlsx'],
  },
  {
    label: 'Données : risque / IFRS9 (critique)',
    text: 'Analyse le risque du portefeuille, provisions IFRS9 et ratio NPL, stratégie complète',
    attachments: ['portefeuille.xlsb'],
    mission: true,
  },
  { label: 'Recherche web / veille', text: 'Recherche les sources récentes et compare les offres' },
  { label: 'Navigateur / automatisation', text: 'Ouvre le site, connecte-toi et remplis le formulaire' },
  {
    label: 'Document (PDF, Word) à extraire',
    text: 'Extrais les clauses de ce contrat',
    attachments: ['contrat.pdf'],
  },
  { label: 'Image / capture à analyser', text: 'Décris cette capture', images: true },
  {
    label: 'Audit / revue de sécurité',
    text: 'Audit de sécurité complet du projet, vérifie les vulnérabilités',
    mission: true,
  },
];

export interface TaskRoute {
  label: string;
  tier: QualityTier;
  metric: IntelMetric;
  model: string | null;
  fallbacks: string[];
  estimate: { low: number; high: number } | null;
}

/** Default model priority per task (cheapest capable model + its backups). */
export function taskMatrix(
  models: ModelInfo[],
  tiers: AutoTiers,
  health: HealthMap = {},
  board: LeaderboardMap = {},
): TaskRoute[] {
  return SAMPLE_TASKS.map((t) => {
    const p = analyzeTask({
      text: t.text,
      attachmentNames: t.attachments,
      hasImages: t.images,
      mission: t.mission,
    });
    const r = routeModel(models, tiers, p, health, board);
    return {
      label: t.label,
      tier: r?.tier ?? p.tier,
      metric: r?.metric ?? metricFor(p.type),
      model: r?.model ?? null,
      fallbacks: r?.fallbacks ?? [],
      estimate: r?.estimate ?? null,
    };
  });
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
