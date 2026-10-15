// L'ÉCONOMIE JEV ÷100 dans l'app (v64). Branchée sur chaque appel de modèle (hook `economy` de llm.ts) :
//  1. le modèle payant demandé est « ultra puissant » (≥ 1 $ / M jetons d'entrée) ;
//  2. un modèle GRATUIT écrit (les plus gros d'OpenRouter avec votre clé — Nemotron 3 Ultra 550B, Super 120B… —, puis
//     les services sans clé), nourri par JEV et par les points de vigilance déjà relevés par le modèle payant ;
//  3. JEV contrôle le brouillon localement (0 $) ; une étape d'outils bien formée passe telle quelle ;
//  4. le modèle payant ne VÉRIFIE que la réponse finale, sans outils ni historique, et la corrige par patchs ; il ne
//     réécrit tout que si le brouillon est faux ; une famille de demandes fiable n'est plus vérifiée qu'en sondage ;
//  5. tout est inscrit au registre : prix standard (requête brute au tarif public) contre prix réellement payé.
// Sans modèle payant (mode sans clé), un second modèle gratuit relit le premier (contre-vérification, 0 $).
// Confidentialité : une conversation qui porte vos données ne va jamais vers un service gratuit sans votre accord ; elle
// passe alors directement par le modèle payant (inscrite « sans brouillon possible »).
import { kv } from './db';
import { complete, freeChainFor, getKey, type BrainHooks, type CompleteOptions, type Completion } from './llm';
import { freeOptions } from './freeMode';
import { toolIncapableModels } from './apprentice';
import {
  applyPatches,
  approxTokens,
  cleanLesson,
  draftChain,
  draftGate,
  ecoStats,
  evidenceDigest,
  familyOf,
  isPremium,
  LIGHT_PURPOSE,
  needsVerification,
  parseVerdict,
  requestTokens,
  riskOf,
  standardCost,
  toolCallsSane,
  updateTrust,
  verifierMessages,
  type EcoEntry,
  type EcoPath,
  type TrustRow,
  type Verdict,
} from '../../server/jev/economy';
import { carriesImages, carriesPrivateData, isAnonFree } from '../../server/llm/freeRoute';
import { focusBlock, lastUserText } from '../../server/jev/brain';
import { recall, type MemFact } from '../../server/jev/memory/semantic';
import type { ChatRequest } from '../../server/llm/types';

// ── réglages (cet appareil) ──────────────────────────────────────────────────────────────────────────────────────────
export interface EconomyOptions {
  /** Draft with free models, verify with the paid model. Opt-in: the draft goes to free providers. */
  enabled: boolean;
  /** 'smart': trusted families are spot-checked; 'always': every final answer is verified. */
  verify: 'smart' | 'always';
  /** Without a paid model: a second free model reviews the first one. */
  crossCheck: boolean;
}
const OPT_KEY = 'wbd.economy.v1';
const DEFAULTS: EconomyOptions = { enabled: false, verify: 'smart', crossCheck: true };
const ls = typeof localStorage !== 'undefined' ? localStorage : null;
export function economyOptions(): EconomyOptions {
  try {
    return { ...DEFAULTS, ...(JSON.parse(ls?.getItem(OPT_KEY) ?? '{}') as Partial<EconomyOptions>) };
  } catch {
    return DEFAULTS;
  }
}
export function setEconomyOptions(p: Partial<EconomyOptions>): void {
  try {
    ls?.setItem(OPT_KEY, JSON.stringify({ ...economyOptions(), ...p }));
  } catch {
    /* private mode */
  }
  emit();
}

// ── registre, confiance, points de vigilance (persistés) ─────────────────────────────────────────────────────────────
let ledger: EcoEntry[] = [];
let trust: TrustRow[] = [];
let notes: MemFact[] = [];
let loaded: Promise<void> | null = null;
const load = () =>
  (loaded ??= Promise.all([
    kv.get<EcoEntry[]>('jevEconomyLedger').catch(() => undefined),
    kv.get<TrustRow[]>('jevEconomyTrust').catch(() => undefined),
    kv.get<MemFact[]>('jevEconomyNotes').catch(() => undefined),
  ]).then(([l, t, n]) => {
    ledger = l ?? [];
    trust = t ?? [];
    notes = n ?? [];
  }));
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
export const onEconomyChange = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
let saveT: ReturnType<typeof setTimeout> | null = null;
function save() {
  emit();
  if (saveT) return;
  saveT = setTimeout(() => {
    saveT = null;
    void kv.set('jevEconomyLedger', ledger.slice(-1000)).catch(() => undefined);
    void kv.set('jevEconomyTrust', trust).catch(() => undefined);
    void kv.set('jevEconomyNotes', notes.slice(-200)).catch(() => undefined);
  }, 800);
}
/** The drafters chosen for the last request (shown in Paramètres). */
let lastDrafters: { at: number; chain: string[]; why: string; failures?: string[] } | null = null;
export async function economyState() {
  await load();
  return { ledger, trust, notes, stats: ecoStats(ledger), lastDrafters };
}
export function clearEconomyNote(id: string) {
  notes = notes.filter((n) => n.id !== id);
  save();
}
export function resetEconomyLedger() {
  ledger = [];
  save();
}
function record(e: Omit<EcoEntry, 'at'>) {
  ledger = [...ledger, { ...e, at: Date.now() }].slice(-1000);
  save();
}
function learn(family: string, v: Verdict, premium: string) {
  const text = cleanLesson(v.lesson);
  if (!text || notes.some((n) => n.text === text)) return;
  const fact: MemFact = { id: `eco-${Date.now().toString(36)}`, text: `${text} (relevé par ${premium})`, kind: 'lesson', at: Date.now(), tag: family.split(':')[0] };
  notes = [...notes, fact].slice(-200);
}

// ── l'exécution ──────────────────────────────────────────────────────────────────────────────────────────────────────
const visionBlocked = (): string[] => {
  try {
    return JSON.parse(ls?.getItem('massamba.vision.blocked') ?? '[]') as string[];
  } catch {
    return [];
  }
};
const outTokens = (r: Completion) => approxTokens(r.content) + approxTokens(JSON.stringify(r.toolCalls ?? []));
const sumUsage = (a: Completion, b: Completion | null): Completion['usage'] =>
  b
    ? { promptTokens: a.usage.promptTokens + b.usage.promptTokens, completionTokens: a.usage.completionTokens + b.usage.completionTokens, cachedTokens: a.usage.cachedTokens + b.usage.cachedTokens, cost: (a.usage.cost ?? 0) + (b.usage.cost ?? 0) }
    : a.usage;

/** The vigilance notes the paid model wrote on close requests, given to the free drafter. */
function withVigilance(req: ChatRequest, ask: string, purpose: string): ChatRequest {
  const hits = recall(notes, ask, { k: 3, tag: purpose, min: 0.3 });
  if (!hits.length) return req;
  const block = `<jev_vigilance>\nPoints relevés par le modèle expert sur des demandes proches — à respecter :\n${hits.map((h) => `• ${h.fact.text}`).join('\n')}\n</jev_vigilance>`;
  return { ...req, messages: [...req.messages, { role: 'system', content: block }] };
}

type Run = (r: ChatRequest, o: CompleteOptions, override?: string[]) => Promise<Completion>;

export const economyHook: NonNullable<BrainHooks['economy']> = async (fed, raw, o, run) => {
  const opts = economyOptions();
  const purpose = o.purpose ?? 'chat';
  if (!opts.enabled || /^(jev-|test)/.test(purpose) || LIGHT_PURPOSE.test(purpose) || carriesImages(fed.messages)) return null;
  const info = o.models.find((m) => m.id === fed.model);
  const premium = isPremium(info) && !isAnonFree(fed.model);
  const hasKey = Boolean(getKey());
  if (!premium && !(opts.crossCheck && !hasKey)) return null;
  await load();
  const t0 = Date.now();
  const ask = lastUserText(fed.messages);
  const family = familyOf(ask, purpose);
  const risk = riskOf(ask, purpose);
  const rawIn = requestTokens(raw.messages, raw.tools);
  const plan = freeChainFor(fed);
  const privateData = carriesPrivateData(fed.messages) && !freeOptions().allowCloudOnPrivate;
  const chain = draftChain({
    catalog: o.models,
    hasKey: hasKey && !privateData,
    keyless: plan.chain,
    needsTools: Boolean(fed.tools?.length),
    blocked: [...visionBlocked(), ...toolIncapableModels()],
  }).filter((m) => m !== fed.model);
  const standard = (r: Completion) => standardCost(info, rawIn, outTokens(r));
  const seen = o.models.filter((m) => m.id.endsWith(':free'));
  lastDrafters = { at: Date.now(), chain, why: `${privateData ? 'données privées : aucun service gratuit en ligne' : hasKey ? 'modèles gratuits d’OpenRouter (votre clé) puis services sans clé' : 'services sans clé'} · ${seen.length} modèle(s) « :free » au catalogue, ${seen.filter((m) => m.capabilities.tools).length} avec outils` };
  emit();

  // No paid model (keyless mode): the normal path answers, a second free model reviews it.
  if (!premium) return crossCheck(fed, o, run, { ask, family, risk, chain, t0 });

  const direct = async (path: EcoPath, extra = 0, verdict?: Verdict['verdict']) => {
    const r = await run(fed, o);
    record({ purpose, premium: fed.model, drafter: null, path, standardUsd: standard(r), paidUsd: r.cost + extra, family, ms: Date.now() - t0, verdict });
    return { ...r, cost: r.cost + extra };
  };
  if (!chain.length) return direct('premium-direct');

  // 1. THE FREE DRAFT (fed by JEV + the vigilance notes). Model failures move along quietly: the chat keeps its model.
  const quiet: CompleteOptions = {
    ...o,
    fallbacks: [],
    maxRetries: 0,
    onFallback: (from, to, why) => o.onStatus?.(`JEV ÷100 : ${from} indisponible (${why.slice(0, 60)}) → ${to}`),
  };
  const drafting = withVigilance(fed, ask, purpose);
  let draft: Completion | null = null;
  let tries = 0;
  for (let i = 0; i < chain.length && tries < 2; i++) {
    if (fed.signal?.aborted) throw new Error('Cancelled');
    o.onStatus?.(`JEV ÷100 : brouillon par ${chain[i]} (gratuit)…`);
    let d: Completion;
    try {
      d = await run(drafting, quiet, [chain[i]!]);
    } catch (err) {
      if (fed.signal?.aborted) throw err;
      const why = `${chain[i]} : ${String((err as Error)?.message ?? err).slice(0, 140)}`;
      if (lastDrafters) lastDrafters = { ...lastDrafters, failures: [...(lastDrafters.failures ?? []), why].slice(-6) };
      o.onStatus?.(`JEV ÷100 : ${why}`);
      continue;
    }
    tries++;
    if (d.toolCalls?.length) {
      // A tool step: accepted when well formed (the tools themselves keep their own permissions and checks).
      if (toolCallsSane(d.toolCalls, fed.tools).ok) {
        record({ purpose, premium: fed.model, drafter: d.model, path: 'free-tools', standardUsd: standard(d), paidUsd: 0, family, ms: Date.now() - t0 });
        return { ...d, cost: 0 };
      }
      o.onReset?.();
      continue;
    }
    if (draftGate(d.content, ask).ok) {
      draft = d;
      break;
    }
    o.onReset?.();
  }
  if (!draft) {
    o.onStatus?.('JEV ÷100 : aucun brouillon gratuit utilisable → réponse du modèle payant');
    return direct('premium-redo');
  }

  // 2. VERIFY? A trusted family of low / normal risk is only spot-checked.
  const need = needsVerification({ risk, trust: trust.find((t) => t.family === family), mode: opts.verify });
  if (!need.verify) {
    trust = updateTrust(trust, family, 'served');
    record({ purpose, premium: fed.model, drafter: draft.model, path: 'free', standardUsd: standard(draft), paidUsd: 0, family, ms: Date.now() - t0 });
    o.onStatus?.(`JEV ÷100 : réponse de ${draft.model} (0 $) — ${need.why}`);
    return { ...draft, cost: 0 };
  }

  // 3. THE PAID MODEL VERIFIES (compact: the demand, JEV's frame, the tool results, the draft — no tools, no history).
  o.onStatus?.(`JEV ÷100 : ${fed.model} vérifie le brouillon de ${draft.model} (${need.why})`);
  let v: Completion;
  try {
    v = await complete(
      { model: fed.model, messages: verifierMessages({ ask, draft: draft.content, evidence: evidenceDigest(fed.messages), focus: focusBlock(raw.messages, purpose) }), maxTokens: 1500, temperature: 0, signal: fed.signal },
      { models: o.models, fallbacks: [], effort: 'low', maxRetries: 1, purpose: 'jev-verif', jev: false },
    );
  } catch (err) {
    if (fed.signal?.aborted) throw err;
    o.onReset?.();
    return direct('premium-direct');
  }
  const verdict = parseVerdict(v.content) ?? { verdict: 'redo' as const, patches: [], lesson: '', why: 'verdict illisible' };
  if (verdict.verdict === 'ok') {
    trust = updateTrust(trust, family, 'ok');
    record({ purpose, premium: fed.model, drafter: draft.model, path: 'free-verified', standardUsd: standard(draft), paidUsd: v.cost, family, ms: Date.now() - t0, verdict: 'ok' });
    o.onStatus?.(`JEV ÷100 : brouillon de ${draft.model} validé par ${fed.model}`);
    return { ...draft, cost: v.cost, usage: sumUsage(draft, v), costSource: v.costSource };
  }
  learn(family, verdict, fed.model);
  if (verdict.verdict === 'fix') {
    const p = applyPatches(draft.content, verdict.patches);
    if (p.applied > 0 && p.failed === 0) {
      trust = updateTrust(trust, family, 'fix');
      o.onReset?.();
      o.onText?.(p.text);
      const fixed = { ...draft, content: p.text };
      record({ purpose, premium: fed.model, drafter: draft.model, path: 'free-patched', standardUsd: standard(fixed), paidUsd: v.cost, family, ms: Date.now() - t0, verdict: 'fix' });
      o.onStatus?.(`JEV ÷100 : ${p.applied} correction(s) de ${fed.model} appliquée(s) au brouillon de ${draft.model}`);
      return { ...fixed, cost: v.cost, usage: sumUsage(draft, v), costSource: v.costSource };
    }
  }
  // 4. REFUSED: the paid model writes the answer (the normal path, prompt caching included).
  trust = updateTrust(trust, family, 'redo');
  o.onReset?.();
  o.onStatus?.(`JEV ÷100 : brouillon refusé par ${fed.model} (${verdict.why.slice(0, 80) || 'à refaire'}) → réponse complète`);
  return direct('premium-redo', v.cost, 'redo');
};

/** Keyless mode: the normal free answer, then a second free model reviews it and its patches are applied (0 $). */
async function crossCheck(fed: ChatRequest, o: CompleteOptions, run: Run, c: { ask: string; family: string; risk: string; chain: string[]; t0: number }): Promise<Completion | null> {
  // A light request is not worth a second call (the free quotas are shared).
  if (c.risk === 'low') return null;
  const r = await run(withVigilance(fed, c.ask, o.purpose ?? 'chat'), o);
  if (r.toolCalls?.length || !r.content.trim()) return r;
  const reviewer = c.chain.find((m) => m !== r.model && m.split(':')[0] !== r.model.split(':')[0]) ?? c.chain.find((m) => m !== r.model);
  if (!reviewer) return r;
  try {
    o.onStatus?.(`JEV : ${reviewer} relit la réponse de ${r.model} (gratuit)`);
    const v = await complete(
      { model: reviewer, messages: verifierMessages({ ask: c.ask, draft: r.content, evidence: evidenceDigest(fed.messages) }), maxTokens: 1500, temperature: 0, signal: fed.signal },
      { models: o.models, fallbacks: [], effort: 'auto', maxRetries: 0, purpose: 'jev-verif', jev: false },
    );
    const verdict = parseVerdict(v.content);
    if (verdict) learn(c.family, verdict, reviewer);
    if (verdict?.verdict === 'fix') {
      const p = applyPatches(r.content, verdict.patches);
      if (p.applied > 0 && p.failed === 0) {
        o.onReset?.();
        o.onText?.(p.text);
        record({ purpose: o.purpose ?? 'chat', premium: '—', drafter: r.model, path: 'free-crosschecked', standardUsd: 0, paidUsd: 0, family: c.family, ms: Date.now() - c.t0, verdict: 'fix' });
        return { ...r, content: p.text };
      }
    }
    record({ purpose: o.purpose ?? 'chat', premium: '—', drafter: r.model, path: 'free-crosschecked', standardUsd: 0, paidUsd: 0, family: c.family, ms: Date.now() - c.t0, verdict: verdict?.verdict });
  } catch (err) {
    if (fed.signal?.aborted) throw err;
  }
  return r;
}
