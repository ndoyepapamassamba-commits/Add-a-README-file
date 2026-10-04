import type { ModelInfo, RoleId } from '@shared/types';
import type { AutoTiers } from '../services/settings';

export type Tier = keyof AutoTiers;

export interface TaskSignals {
  text: string;
  hasImages: boolean;
  role: RoleId;
  /** Number of prior turns in the session. */
  historyLength: number;
}

const RE = {
  browser: /\b(navigu|ouvre|open|site|page web|website|browser|navigateur|clique|click|connecte|login|t[ée]l[ée]charge|download|scrape|capture d'?[ée]cran|screenshot)/i,
  heavy: /\b(refactor|refactoris|architecture|construis|build (me|an?|the)|cr[ée]e[- ]moi|application compl[eè]te|migrat|r[ée][ée]cri|rewrite|from scratch|multi[- ]?fichiers?|ensemble du projet|whole (project|codebase))/i,
  reasoning: /\b(pourquoi|why|analy[sz]e|diagnos|debug|bug|root cause|cause racine|prouve|prove|optimi[sz]|algorithm|complexit|strat[ée]gie|compare|[ée]value|reason)/i,
  simple: /\b(typo|faute|renomm|rename|corrige (la|une) (ligne|faute)|explain this|explique (ce|cette)|traduis|translate|r[ée]sume|summari[sz]e|formate?)\b/i,
};

/** Heuristic task classification for AUTO mode (transparent, no extra LLM call). */
export function classifyTask(s: TaskSignals): { tier: Tier; reason: string } {
  if (s.hasImages) return { tier: 'vision', reason: 'la requête contient des images → modèle vision' };
  if (s.role === 'reviewer') return { tier: 'reasoning', reason: 'revue de code → modèle de raisonnement' };
  if (s.role === 'browser' || RE.browser.test(s.text)) return { tier: 'balanced', reason: 'tâche navigateur → modèle fiable en tool calling' };
  if (RE.heavy.test(s.text)) return { tier: 'powerful', reason: 'travail de grande ampleur → modèle puissant' };
  if (RE.reasoning.test(s.text) && s.text.length > 60) return { tier: 'reasoning', reason: 'analyse complexe → modèle de raisonnement' };
  if (RE.simple.test(s.text) || s.text.length < 80) return { tier: 'fast', reason: 'tâche simple → modèle rapide' };
  return { tier: 'balanced', reason: 'tâche générale → modèle équilibré' };
}

/** Newest model of the first family pattern that matches the live catalog. */
export function pickFromTier(models: ModelInfo[], patterns: string[], needs: { tools?: boolean; vision?: boolean } = {}): ModelInfo | undefined {
  const usable = models.filter(
    (m) =>
      !m.id.startsWith('~') &&
      !m.id.endsWith(':free') &&
      (!needs.tools || m.capabilities.tools) &&
      (!needs.vision || m.capabilities.vision),
  );
  for (const pattern of patterns) {
    let re: RegExp;
    try {
      re = new RegExp(pattern);
    } catch {
      continue;
    }
    const hits = usable.filter((m) => re.test(m.id)).sort((a, b) => b.created - a.created);
    if (hits[0]) return hits[0];
  }
  return undefined;
}

export interface Selection {
  model: string;
  reason: string;
  auto: boolean;
}

export function selectModel(opts: {
  requested: string;
  models: ModelInfo[];
  tiers: AutoTiers;
  signals: TaskSignals;
  fallbackDefault: string;
}): Selection {
  if (opts.requested && opts.requested !== 'auto') return { model: opts.requested, reason: 'modèle choisi', auto: false };
  const { tier, reason } = classifyTask(opts.signals);
  const order: Tier[] = [tier, 'balanced', 'fast', 'powerful'];
  for (const t of order) {
    const m = pickFromTier(opts.models, opts.tiers[t], { tools: true, vision: t === 'vision' });
    if (m) return { model: m.id, reason: t === tier ? reason : `${reason} (repli sur le palier ${t})`, auto: true };
  }
  const anyTools = opts.models.filter((m) => m.capabilities.tools).sort((a, b) => b.created - a.created)[0];
  return { model: anyTools?.id ?? opts.fallbackDefault, reason: `${reason} (catalogue indisponible)`, auto: true };
}
