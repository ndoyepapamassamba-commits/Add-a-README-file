// LES MODÈLES GRATUITS SANS CLÉ (v63 — « tout en gratuit sans que je ne mette de clé »). Partie pure, testée en Node.
//  • LLM7.io : passerelle OpenAI-compatible, appel anonyme accepté (mesuré le 15/10/2026 : gpt-oss 20B en 1,5 s, appels
//    d'outils et streaming OK ; ≈ 30 requêtes/min sans clé selon les annuaires ; service tenu par un particulier, UK) ;
//  • Pollinations (ancien point text.pollinations.ai/openai) : gpt-oss 20B, outils OK, mais refus 402 après 2 appels
//    rapprochés → dernier secours ;
//  • le modèle intégré au navigateur (Qwen3, Apache-2.0, transformers.js) : rien ne sort de l'ordinateur.
// Règle de confidentialité : une conversation qui porte des données de l'utilisateur (fichiers, résultats d'outils de
// données) ne part JAMAIS vers un service gratuit anonyme sans son accord explicite ; seul le modèle intégré la traite.
import type { ChatMessage } from './types';

/** Cloud models answering without any key, in order of preference (tools verified live). */
export const FREE_CLOUD = ['llm7:gpt-oss:20b', 'llm7:nemotron-3-nano:30b', 'llm7:codestral-latest', 'pollinations:openai'] as const;
/** The in-browser model (nothing leaves the computer). */
export const BROWSER_MODELS = ['browser:qwen3-0.6b', 'browser:qwen3-1.7b'] as const;
export type BrowserModel = (typeof BROWSER_MODELS)[number];

const DATA_TOOL = /^(data|report|dossier|filesystem|memory|knowledge|decision|project|vault|terminal|code|apex)(__|\.)/;
const DATA_FILE = /\.(xlsx|xlsm|xls|csv|tsv|json|parquet|docx|pdf|pptx|txt)\b/i;
/**
 * True when the conversation carries the user's own material: a result of a data / file / report tool, or an attached
 * data file. Web searches and public lookups do not count.
 */
export function carriesPrivateData(messages: ChatMessage[]): boolean {
  const toolNames = new Map<string, string>();
  for (const m of messages) {
    for (const t of m.tool_calls ?? []) toolNames.set(t.id, t.function.name);
    if (m.role === 'tool' && m.tool_call_id && DATA_TOOL.test(toolNames.get(m.tool_call_id) ?? '')) return true;
    if (m.role === 'user') {
      const text = typeof m.content === 'string' ? m.content : (m.content ?? []).map((p) => (p.type === 'text' ? p.text : '')).join(' ');
      // Attachments are announced in the user turn (« Data file attached: /uploads/portefeuille.xlsx », « File attached: … »).
      if (/\b(?:Data file|File|Binary file|Image|SVG image) attached: \S+/.test(text)) return true;
      if (/\/(uploads|files|data)\/[^\s]+/i.test(text) && DATA_FILE.test(text)) return true;
    }
  }
  return false;
}

/** An error after which the free models should take over: no key, refused key, no credit, quota, network, outage. */
export function freeCanTakeOver(err: unknown): boolean {
  const e = err as { status?: number; code?: string; message?: string };
  if (e?.code === 'cancelled' || e?.status === 499) return false;
  const s = e?.status ?? 0;
  const msg = e?.message ?? '';
  // A model refusing THIS request (« only available on agentic harnesses », moderation, unsupported input) is not a key
  // or credit problem: the caller's own handling (next vision model, list of refusing models) must see the error.
  if (/only available|not available|not supported|unsupported|moderation|flagged|content policy/i.test(msg)) return false;
  if ([0, 401, 402, 408, 429].includes(s) || s >= 500) return true;
  return /clé|key|credit|crédit|quota|insufficient|fetch|network|timeout|délai/i.test(msg);
}

/** True when a message carries an image: the free models read text only, so they never take such a request over. */
export const carriesImages = (messages: ChatMessage[]): boolean =>
  messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type !== 'text'));

export interface FreePlan {
  chain: string[];
  /** Why this chain (shown to the user once). */
  note: string;
}
/**
 * The free chain for a request. Cooled providers (quota reached in the last minutes) are skipped; the in-browser model
 * closes the chain when it is enabled. Private material goes to the in-browser model only, unless allowed.
 */
export function freePlan(o: { privateData: boolean; allowCloudOnPrivate: boolean; browser: BrowserModel | null; cooled: Record<string, number>; now: number }): FreePlan {
  const ok = (id: string) => (o.cooled[id.split(':')[0]!] ?? 0) <= o.now;
  const cloud = FREE_CLOUD.filter(ok);
  if (o.privateData && !o.allowCloudOnPrivate)
    return o.browser
      ? { chain: [o.browser], note: 'vos données restent sur cet ordinateur : modèle intégré au navigateur (gratuit, sans clé)' }
      : { chain: [], note: 'vos données ne partent pas vers un service gratuit anonyme : activez le modèle intégré au navigateur (Réglages → Modèles gratuits), ou autorisez les modèles gratuits en ligne sur vos données' };
  return {
    chain: [...cloud, ...(o.browser ? [o.browser] : [])],
    note: cloud.length ? 'modèles gratuits sans clé (LLM7, Pollinations)' : o.browser ? 'services gratuits saturés : modèle intégré au navigateur' : 'services gratuits saturés pour quelques minutes',
  };
}

/** Minutes a free provider rests after a quota / payment refusal (402, 429). */
export const FREE_REST_MS = 10 * 60_000;
export const isFreeQuota = (status: number | undefined) => status === 402 || status === 429;

/**
 * How long a free provider rests after a refusal: the delay the service announces (Retry-After header, or « retry_after »
 * / « Retry after N seconds » in its message), at least 1 minute, at most 12 hours; 10 minutes when it says nothing.
 */
export function restMsFor(retryAfterS: number | null | undefined, message = ''): number {
  const fromBody = Number(/"retry_after"\s*:\s*(\d+)/.exec(message)?.[1] ?? /retry after (\d+) seconds?/i.exec(message)?.[1] ?? NaN);
  const s = Number.isFinite(fromBody) ? fromBody : (retryAfterS ?? null);
  if (s === null || !Number.isFinite(s)) return FREE_REST_MS;
  return Math.min(12 * 3_600_000, Math.max(60_000, s * 1000));
}
