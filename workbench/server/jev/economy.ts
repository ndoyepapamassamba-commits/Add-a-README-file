// L'ÉCONOMIE JEV ÷100 (v64 — « je peux utiliser un modèle payant ultra puissant mais JEV doit faire en sorte que je
// paie 1/100 du prix standard »). Partie pure, testée en Node.
//
// Le modèle payant ne fait plus le travail entier. Méthodes publiées reprises ici :
//  • brouillon puis relecture (« draft-then-review », Local-Splitter, arXiv 2604.12301) : un modèle gratuit écrit, le
//    modèle payant relit et CORRIGE PAR PATCHS (quelques dizaines de jetons de sortie, entrée compacte sans outils) ;
//  • cascade à confiance apprise (FrugalGPT, TMLR 2024 ; RouteLLM, LMSYS 2024) : une famille de demandes dont les
//    brouillons sont validés à répétition n'est plus vérifiée qu'en sondage ; les sujets à risque le sont toujours ;
//  • contre-vérification entre modèles gratuits (esprit Mixture-of-Agents, arXiv 2406.04692) quand aucun modèle payant
//    n'est choisi : un second modèle gratuit relit le premier.
// Tout est MESURÉ : « prix standard » = la requête brute (messages + outils) envoyée telle quelle au modèle payant, au
// tarif public, sans cache ; « payé » = ce qu'OpenRouter a réellement facturé. Le facteur affiché est leur rapport.
import type { ChatMessage, ToolCall, ToolDefinition } from '../llm/types';
import { brainTopic, langOfRequest } from './brain';

// ── prix ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Prices in $ per million tokens (as in the model catalogue). */
export interface Price {
  inputPrice: number | null;
  outputPrice: number | null;
}
/** A model worth economising on: at least 1 $ per million input tokens (Claude Opus / Sonnet, GPT-5.x, Gemini Pro…). */
export const PREMIUM_MIN_INPUT = 1;
export const isPremium = (p?: Price | null): boolean => Boolean(p && (p.inputPrice ?? 0) >= PREMIUM_MIN_INPUT);
export const approxTokens = (s: string): number => Math.ceil(s.length / 4);
const textOf = (c: ChatMessage['content']): string =>
  typeof c === 'string' ? c : (c ?? []).map((p) => (p.type === 'text' ? p.text : '')).join('\n');
/** Tokens of a request as it would be sent raw (messages + tool schemas), ≈ 4 characters per token. */
export function requestTokens(messages: ChatMessage[], tools?: ToolDefinition[]): number {
  let chars = 0;
  for (const m of messages) chars += textOf(m.content).length + JSON.stringify(m.tool_calls ?? []).length + 8;
  return Math.ceil((chars + JSON.stringify(tools ?? []).length) / 4);
}
export const standardCost = (p: Price | null | undefined, tokensIn: number, tokensOut: number): number =>
  p ? (tokensIn * (p.inputPrice ?? 0) + tokensOut * (p.outputPrice ?? 0)) / 1_000_000 : 0;

// ── registre : prix standard contre prix payé ────────────────────────────────────────────────────────────────────────
export type EcoPath =
  | 'free' // brouillon gratuit accepté sans vérification (famille fiable, sondage)
  | 'free-tools' // étape d'outils écrite par un modèle gratuit (appels contrôlés localement)
  | 'free-verified' // brouillon gratuit validé tel quel par le modèle payant
  | 'free-patched' // brouillon gratuit corrigé par patchs du modèle payant
  | 'free-crosschecked' // brouillon gratuit relu par un second modèle gratuit (aucun modèle payant)
  | 'premium-redo' // brouillon refusé : réponse complète du modèle payant
  | 'premium-direct'; // pas de brouillon possible (données privées, images, aucun modèle gratuit)
export interface EcoEntry {
  at: number;
  purpose: string;
  premium: string;
  drafter: string | null;
  path: EcoPath;
  standardUsd: number;
  paidUsd: number;
  family: string;
  ms: number;
  verdict?: Verdict['verdict'];
}
export interface EcoStats {
  n: number;
  standardUsd: number;
  paidUsd: number;
  /** standard / paid; null when nothing was paid (or nothing measured). */
  factor: number | null;
  byPath: Partial<Record<EcoPath, { n: number; standardUsd: number; paidUsd: number }>>;
  /** Share of requests that cost 0 $. */
  freeShare: number;
}
export function ecoStats(entries: EcoEntry[]): EcoStats {
  const byPath: EcoStats['byPath'] = {};
  let standardUsd = 0;
  let paidUsd = 0;
  let zero = 0;
  for (const e of entries) {
    standardUsd += e.standardUsd;
    paidUsd += e.paidUsd;
    if (e.paidUsd === 0) zero++;
    const b = (byPath[e.path] ??= { n: 0, standardUsd: 0, paidUsd: 0 });
    b.n++;
    b.standardUsd += e.standardUsd;
    b.paidUsd += e.paidUsd;
  }
  return { n: entries.length, standardUsd, paidUsd, factor: paidUsd > 0 ? standardUsd / paidUsd : null, byPath, freeShare: entries.length ? zero / entries.length : 0 };
}
export function factorLabel(s: Pick<EcoStats, 'standardUsd' | 'paidUsd' | 'n'>): string {
  if (!s.n) return '—';
  if (s.paidUsd === 0) return s.standardUsd > 0 ? '0 $ payé' : '—';
  const f = s.standardUsd / s.paidUsd;
  return f >= 10 ? `÷${Math.round(f)}` : `÷${f.toFixed(1).replace('.', ',')}`;
}

// ── contrôle local du brouillon (0 $) ────────────────────────────────────────────────────────────────────────────────
const REFUSAL = /\b(je ne (peux|suis pas en mesure)|i can(no|')t (help|assist|do)|as an ai|en tant qu['’]ia|je n['’]ai pas accès)\b/i;
const EN_WORDS = /\b(the|and|with|which|this|that|is|are|of)\b/gi;
const FR_WORDS = /\b(le|la|les|des|est|sont|avec|pour|une|dans|qui)\b/gi;
/** The draft is worth paying a verifier for: not empty, not a refusal, not cut, in the language of the request. */
export function draftGate(draft: string, ask: string): { ok: boolean; why: string[] } {
  const t = draft.trim();
  const why: string[] = [];
  const long = ask.trim().split(/\s+/).length > 6;
  if (!t) why.push('vide');
  else if (long && t.length < 40) why.push('trop court');
  if (REFUSAL.test(t.slice(0, 300))) why.push('refus');
  if (t.length > 400 && !/[.!?…:)\]»`|*\d]$/.test(t)) why.push('coupé');
  if (/\[(\.\.\.|…|à compléter|TODO)\]/i.test(t)) why.push('trous');
  const lang = langOfRequest(ask);
  if (lang && t.length > 200) {
    const en = (t.match(EN_WORDS) ?? []).length;
    const fr = (t.match(FR_WORDS) ?? []).length;
    if (lang === 'fr' && en > fr * 2 && en > 8) why.push('langue');
    if (lang === 'en' && fr > en * 2 && fr > 8) why.push('langue');
  }
  return { ok: why.length === 0, why };
}

/**
 * A tool step written by a free model is accepted when every call carries JSON-object arguments. The tool name itself
 * is left to the agent (it knows aliases such as « fs.write » and answers the model when a name is wrong), exactly as
 * on the normal path; `unknown` lists the names outside the offered tools.
 */
export function toolCallsSane(calls: ToolCall[], tools: ToolDefinition[] | undefined): { ok: boolean; why?: string; unknown: string[] } {
  if (!calls.length) return { ok: false, why: 'aucun appel', unknown: [] };
  const names = new Set((tools ?? []).map((t) => t.function.name));
  const unknown = calls.map((c) => c.function.name).filter((n) => !names.has(n));
  for (const c of calls) {
    if (!/^[\w.-]{1,80}$/.test(c.function.name)) return { ok: false, why: `nom d’outil invalide « ${c.function.name.slice(0, 40)} »`, unknown };
    try {
      const a: unknown = JSON.parse(c.function.arguments || '{}');
      if (!a || typeof a !== 'object' || Array.isArray(a)) return { ok: false, why: `arguments invalides pour ${c.function.name}`, unknown };
    } catch {
      return { ok: false, why: `arguments non JSON pour ${c.function.name}`, unknown };
    }
  }
  return { ok: true, unknown };
}

// ── vérificateur payant : valider ou corriger par patchs ─────────────────────────────────────────────────────────────
export interface Patch {
  find: string;
  replace: string;
}
export interface Verdict {
  verdict: 'ok' | 'fix' | 'redo';
  patches: Patch[];
  /** One general rule that would have avoided the error (no figure, no client name). */
  lesson: string;
  why: string;
}
const VERIFIER_RULES = [
  'Tu es le VÉRIFICATEUR FINAL. Un brouillon a été écrit par un modèle plus petit. Tu ne réécris PAS la réponse : tu la valides ou tu la corriges par patchs.',
  'Réponds UNIQUEMENT par un objet JSON, sans texte autour :',
  '{"verdict":"ok"|"fix"|"redo","patches":[{"find":"extrait EXACT du brouillon","replace":"texte corrigé"}],"lesson":"règle générale","why":"raison courte"}',
  '• ok : le brouillon est exact, complet et répond à la demande (patches vide).',
  '• fix : erreurs localisées. Chaque « find » est copié À L’IDENTIQUE du brouillon (≤ 200 caractères, unique) ; « replace » est le texte juste. Au plus 8 patchs.',
  '• redo : faux dans l’ensemble, hors sujet, langue erronée, ou chiffres absents des éléments fournis (inventés).',
  '• lesson : une phrase, la règle qui aurait évité l’erreur (sans chiffre ni nom de client) ; vide si ok.',
  'Sois exigeant sur les faits, la réglementation et les chiffres ; indulgent sur le style.',
].join('\n');
export function verifierMessages(o: { ask: string; draft: string; evidence?: string; focus?: string }): ChatMessage[] {
  const parts = [`DEMANDE :\n${o.ask.slice(0, 4000)}`];
  if (o.focus) parts.push(`CADRE (JEV) :\n${o.focus.slice(0, 1200)}`);
  if (o.evidence) parts.push(`ÉLÉMENTS DISPONIBLES (résultats d’outils, extraits) :\n${o.evidence}`);
  parts.push(`BROUILLON :\n<<<\n${o.draft.slice(0, 16000)}\n>>>`);
  return [
    { role: 'system', content: VERIFIER_RULES },
    { role: 'user', content: parts.join('\n\n') },
  ];
}
export function parseVerdict(text: string): Verdict | null {
  const s = text.replace(/```(?:json)?/g, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(s.slice(a, b + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const v = String(j.verdict ?? '').toLowerCase();
  const verdict = v === 'ok' || v === 'valid' || v === 'validé' ? 'ok' : v === 'fix' || v === 'patch' ? 'fix' : v === 'redo' ? 'redo' : null;
  if (!verdict) return null;
  const patches = (Array.isArray(j.patches) ? j.patches : [])
    .map((p) => p as Record<string, unknown>)
    .filter((p) => typeof p.find === 'string' && (p.find as string).length > 0 && typeof p.replace === 'string')
    .slice(0, 8)
    .map((p) => ({ find: p.find as string, replace: p.replace as string }));
  return { verdict: verdict === 'fix' && !patches.length ? 'redo' : verdict, patches, lesson: String(j.lesson ?? '').slice(0, 300), why: String(j.why ?? '').slice(0, 300) };
}
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Applies the verifier's patches: exact match first, then a whitespace-insensitive match. */
export function applyPatches(draft: string, patches: Patch[]): { text: string; applied: number; failed: number } {
  let text = draft;
  let applied = 0;
  let failed = 0;
  for (const p of patches) {
    const i = text.indexOf(p.find);
    if (i >= 0) {
      text = text.slice(0, i) + p.replace + text.slice(i + p.find.length);
      applied++;
      continue;
    }
    // Whitespace-insensitive: the same words, spaced or wrapped differently.
    const words = squash(p.find).split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const m = words.length ? new RegExp(words.join('\\s+')).exec(text) : null;
    if (m) {
      text = text.slice(0, m.index) + p.replace + text.slice(m.index + m[0].length);
      applied++;
    } else failed++;
  }
  return { text, applied, failed };
}

// ── confiance apprise : quand vérifier ───────────────────────────────────────────────────────────────────────────────
export interface TrustRow {
  family: string;
  /** Verdicts « ok » (validated as is). */
  ok: number;
  /** Verdicts received. */
  n: number;
  /** Unverified answers served since the last spot check. */
  sinceSpot: number;
}
/** Wilson lower bound of a proportion (z = 1.64 ≈ 90 % one-sided). */
export function wilsonLower(ok: number, n: number, z = 1.64): number {
  if (!n) return 0;
  const p = ok / n;
  const d = 1 + (z * z) / n;
  return (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
}
export const TRUST_MIN_N = 8;
export const TRUST_MIN_LB = 0.8;
/** One answer in SPOT_EVERY is still verified in a trusted family (drift detection). */
export const SPOT_EVERY = 5;
export type Risk = 'low' | 'normal' | 'high';
/** Light tasks (ideas, titles, summaries…): JEV's pilot already gives them to the free models first. */
export const LIGHT_PURPOSE = /^(prompt-improve|stage-directions|id[ée]es|titre|title|r[ée]sum[ée]|summary|reformul|traduction|translate)/i;
const HIGH = /\b(provision\w*|d[ée]pr[ée]ciation|ifrs|bceao|cobac|b[âa]le|ratio\w*|solvabilit\w*|fonds propres|comit[ée]|d[ée]cision|contrat|juridique|l[ée]gal|fiscal\w*|imp[ôo]t|m[ée]dical|posologie|dosage|ordonnance|s[ée]curit[ée]|production|d[ée]ployer|supprimer|virement|paiement)\b/i;
export function riskOf(ask: string, purpose: string): Risk {
  if (LIGHT_PURPOSE.test(purpose)) return 'low';
  const numbers = (ask.match(/\d[\d\s.,]*\d|\d/g) ?? []).length;
  if (HIGH.test(ask) || numbers >= 4) return 'high';
  return ask.trim().split(/\s+/).length <= 4 ? 'low' : 'normal';
}
/** The family of a request: its purpose and its two main technical words (no figures, no proper names). */
export function familyOf(ask: string, purpose: string): string {
  const t = (brainTopic(ask, 6) ?? '').split(' ').filter((w) => w.length > 3).slice(0, 2).sort().join(' ');
  return `${purpose}:${t || 'général'}`;
}
export function needsVerification(o: { risk: Risk; trust?: TrustRow; mode: 'smart' | 'always' }): { verify: boolean; why: string } {
  if (o.mode === 'always') return { verify: true, why: 'vérification systématique (réglage)' };
  if (o.risk === 'high') return { verify: true, why: 'sujet à risque (chiffres, réglementation, décision)' };
  const t = o.trust;
  if (!t || t.n < TRUST_MIN_N) return { verify: true, why: `famille encore en apprentissage (${t?.n ?? 0}/${TRUST_MIN_N} vérifications)` };
  const lb = wilsonLower(t.ok, t.n);
  if (lb < TRUST_MIN_LB) return { verify: true, why: `fiabilité insuffisante (borne basse ${Math.round(lb * 100)} % < ${TRUST_MIN_LB * 100} %)` };
  if (t.sinceSpot + 1 >= SPOT_EVERY) return { verify: true, why: `contrôle par sondage (1 sur ${SPOT_EVERY})` };
  return { verify: false, why: `famille fiable : ${t.ok}/${t.n} validés (borne basse ${Math.round(lb * 100)} %)` };
}
export function updateTrust(rows: TrustRow[], family: string, event: Verdict['verdict'] | 'served'): TrustRow[] {
  const cur = rows.find((r) => r.family === family) ?? { family, ok: 0, n: 0, sinceSpot: 0 };
  // A sliding window: the last 40 verdicts weigh, so a drift is caught.
  const decay = cur.n >= 40 ? 39 / 40 : 1;
  const next: TrustRow =
    event === 'served'
      ? { ...cur, sinceSpot: cur.sinceSpot + 1 }
      : { family, ok: Math.round((cur.ok * decay + (event === 'ok' ? 1 : 0)) * 100) / 100, n: Math.min(cur.n + 1, 40), sinceSpot: 0 };
  return [next, ...rows.filter((r) => r.family !== family)].slice(0, 300);
}

// ── ce que le vérificateur voit (compact : pas d'outils, pas d'historique) ────────────────────────────────────────────
/** The tool results of the turn (clipped) and the earlier user turns: what the draft may rely on. */
export function evidenceDigest(messages: ChatMessage[], max = 6000): string {
  const out: string[] = [];
  let used = 0;
  const tools = messages.filter((m) => m.role === 'tool').slice(-8).reverse();
  for (const m of tools) {
    const t = textOf(m.content).trim();
    if (!t) continue;
    const piece = `[${m.name ?? 'outil'}] ${t.slice(0, 1500)}`;
    if (used + piece.length > max) break;
    out.unshift(piece);
    used += piece.length;
  }
  const users = messages.filter((m) => m.role === 'user').slice(-3, -1);
  for (const m of users) {
    const t = textOf(m.content).trim().slice(0, 600);
    if (t && used + t.length < max) out.unshift(`[demande précédente] ${t}`);
  }
  return out.join('\n');
}

// ── modèles gratuits rédacteurs ──────────────────────────────────────────────────────────────────────────────────────
/** OpenRouter free models in order of strength (measured catalogue of 15/10/2026: Nemotron 3 Ultra 550B, Super 120B…). */
export const FREE_DRAFT_PREFERENCE: RegExp[] = [/nemotron-3-ultra/, /nemotron-3\.5-super|nemotron-3-super/, /gemma-4-31b/, /dots-3/, /laguna-s-/, /nemotron-3\.5-lightning/, /gemma-4-26b/];
export interface CatalogEntry {
  id: string;
  contextLength: number;
  capabilities: { tools: boolean };
}
/** The drafters: the strongest OpenRouter free models (with a key), then the keyless services. */
export function draftChain(o: { catalog: CatalogEntry[]; hasKey: boolean; keyless: string[]; needsTools: boolean; blocked?: string[]; max?: number }): string[] {
  const rank = (id: string) => {
    const i = FREE_DRAFT_PREFERENCE.findIndex((re) => re.test(id));
    return i < 0 ? FREE_DRAFT_PREFERENCE.length : i;
  };
  const free = o.hasKey
    ? o.catalog
        .filter((m) => m.id.endsWith(':free') && (!o.needsTools || m.capabilities.tools) && !(o.blocked ?? []).includes(m.id))
        // Not a general chat model: content-safety classifiers, « agentic harness » only models.
        .filter((m) => !/content-safety|guard|inkling/.test(m.id))
        .sort((a, b) => rank(a.id) - rank(b.id) || b.contextLength - a.contextLength)
        .slice(0, 3)
        .map((m) => m.id)
    : [];
  return [...new Set([...free, ...o.keyless])].slice(0, o.max ?? 5);
}

/** A verifier lesson worth keeping: one general sentence, no figure, no e-mail or link. */
export function cleanLesson(s: string): string | null {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length < 15 || t.length > 260) return null;
  if (/\d{3,}|https?:\/\/|\S+@\S+/.test(t)) return null;
  return t;
}
