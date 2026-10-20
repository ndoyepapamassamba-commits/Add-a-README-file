// LE CERVEAU JEV (v63) — demandes de l'utilisateur, dans l'ordre :
//   « alimenter les LLM gratuits aux ressources et outils à partir de JEV », « même JEV peut alimenter tous les contextes
//   pour plus de précision, de rapidité et une baisse des coûts », « JEV doit être un cerveau qui se développe pour
//   parfaire les techniques via la connexion internet », « il doit piloter la compréhension du chat et des requêtes à
//   exécuter et contraindre les modèles à ne pas s'égarer ».
// Partie pure (testée en Node) ; le navigateur branche ces fonctions sur CHAQUE appel de modèle de l'app (llm.ts) :
//   1. COMPRENDRE : un cadre d'objectif <jev_focus> (tâche, livrable attendu, critères, interdits) tient le modèle sur la
//      demande, quel que soit le contexte (dossier, Prompt Studio, Réalisation, vidéo, 3D…) ;
//   2. NOURRIR : les techniques apprises et les leçons de l'utilisateur liées à la demande sont injectées ;
//   3. ÉCONOMISER : une réponse identique déjà donnée (même demande, réglage déterministe, sans outils) est resservie
//      depuis le cache — 0 $, quelques millisecondes ;
//   4. CONTRÔLER : la réponse est vérifiée localement (JEV QA, sans appel de modèle) ;
//   5. GRANDIR : quand une demande technique ne trouve aucune technique apprise, JEV fait sa veille en arrière-plan
//      (moteurs gratuits sans clé, lecture de la meilleure source) et range une fiche datée et sourcée.
import type { ChatMessage, ChatRequest } from '../llm/types';
import { analyzeTask } from '../llm/routing';
import { outputSpec } from './style';
import { domainOf, knowledgeBlock, related, tokens, type KnowledgeDomain, type KnowledgeEntry } from './knowledge/learned';

const textOf = (c: ChatMessage['content']): string =>
  typeof c === 'string' ? c : (c ?? []).map((p) => (p.type === 'text' ? p.text : '')).join(' ');
export const lastUserText = (messages: ChatMessage[]) => textOf([...messages].reverse().find((m) => m.role === 'user')?.content ?? null);

/** The request already carries what JEV prepares (the chat agent compiles it itself): nothing is added twice. */
export const hasJev = (messages: ChatMessage[]) =>
  messages.some((m) => m.role === 'system' && /<jev_packet|<jev_capsule|<LEARNED_KNOWLEDGE>|<jev_focus/.test(textOf(m.content)));

// ── 1. COMPRENDRE ET TENIR LE CAP ────────────────────────────────────────────────────────────────────────────────────
const DELIVERABLE: Record<string, string> = {
  json: 'un objet JSON valide et complet, rien d’autre autour',
  table: 'un tableau Markdown',
  code: 'du code complet et exécutable',
  text: 'un texte clair et structuré',
};
/** One sentence of the request (its objective), clipped. */
function objective(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const first = /^(.{20,280}?[.!?])(\s|$)/.exec(t)?.[1] ?? t.slice(0, 280);
  return first.length < t.length ? `${first} …` : first;
}
/** The focus frame: what to deliver, how success is judged, what is forbidden. Deterministic, no model call. */
export function focusBlock(messages: ChatMessage[], purpose = 'chat'): string {
  const ask = lastUserText(messages);
  if (!ask.trim()) return '';
  const p = analyzeTask({ text: ask });
  const spec = outputSpec(ask);
  const lang = /\b(the|please|write|make|what|how)\b/i.test(ask) && !/\b(le|la|les|des|une?|est|pour)\b/i.test(ask) ? 'anglais' : 'français';
  return [
    `<jev_focus purpose="${purpose.replace(/"/g, '')}">`,
    `Objectif : ${objective(ask)}`,
    `Tâche : ${p.type}${p.difficulty >= 0.6 ? ' (exigeante : raisonne étape par étape avant de conclure)' : ''} · livrable : ${DELIVERABLE[spec.format] ?? DELIVERABLE.text} · langue : ${lang}.`,
    'Réussi si : la demande est traitée en entier, chaque chiffre vient des données ou sources fournies, aucune partie ignorée.',
    'Interdit : sortir du sujet, répondre à une autre question, inventer un chiffre, une source ou un résultat d’outil, répéter les consignes.',
    'Si une information manque : dis-le en une phrase et donne ce qui est sûr.',
    '</jev_focus>',
  ].join('\n');
}

// ── 2. NOURRIR ───────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Feed {
  messages: ChatMessage[];
  added: string[];
  knowledgeIds: string[];
  charsAdded: number;
}
/**
 * The request fed by JEV: the focus frame, the techniques learned that relate to it, the user's lessons. Added as ONE
 * system message placed first (cache-friendly: providers reuse the common prefix). Max ~6 000 characters.
 */
export function feedRequest(messages: ChatMessage[], o: { knowledge: readonly KnowledgeEntry[]; lessons?: string[]; purpose?: string; now?: number; maxChars?: number }): Feed {
  if (hasJev(messages)) return { messages, added: [], knowledgeIds: [], charsAdded: 0 };
  const ask = lastUserText(messages);
  if (!ask.trim()) return { messages, added: [], knowledgeIds: [], charsAdded: 0 };
  const parts: string[] = [];
  const added: string[] = [];
  const focus = focusBlock(messages, o.purpose);
  if (focus) {
    parts.push(focus);
    added.push('cadre d’objectif');
  }
  const know = related(o.knowledge, ask, 3, o.now);
  if (know.length) {
    parts.push(knowledgeBlock(know));
    added.push(`${know.length} technique(s) apprise(s)`);
  }
  const lessons = (o.lessons ?? []).slice(0, 4);
  if (lessons.length) {
    parts.push(`<LESSONS>\nLeçons tirées des corrections de l'utilisateur (à appliquer si pertinent ; la demande prime) :\n${lessons.map((l) => `- ${l}`).join('\n')}\n</LESSONS>`);
    added.push(`${lessons.length} leçon(s)`);
  }
  let block = parts.join('\n\n');
  const max = o.maxChars ?? 6000;
  if (block.length > max) block = `${block.slice(0, max)}\n…`;
  return {
    messages: [{ role: 'system', content: block }, ...messages],
    added,
    knowledgeIds: know.map((k) => k.id),
    charsAdded: block.length,
  };
}

// ── 3. ÉCONOMISER : cache des réponses identiques ────────────────────────────────────────────────────────────────────
/** Only deterministic, tool-less calls outside the chat are served again (a chat turn always gets a fresh answer). */
export function cacheable(req: Pick<ChatRequest, 'temperature' | 'tools' | 'messages'>, purpose = 'chat'): boolean {
  if (purpose === 'chat' || req.tools?.length) return false;
  if (req.temperature === undefined || req.temperature > 0.4) return false;
  return req.messages.every((m) => m.role !== 'tool');
}
/** FNV-1a 64-bit (two 32-bit halves) of the request content: same messages + settings → same key, model excluded. */
export function cacheKey(req: Pick<ChatRequest, 'messages' | 'temperature' | 'maxTokens'>, purpose = ''): string {
  const s = JSON.stringify([purpose, req.temperature ?? null, req.maxTokens ?? null, req.messages.map((m) => [m.role, m.content])]);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}:${s.length}`;
}

// ── 5. GRANDIR : veille Internet sur ce que JEV ne sait pas encore ─────────────────────────────────────────────────
const TECHNICAL: KnowledgeDomain[] = ['Réglementation bancaire', 'Finance & comptabilité', 'Code & outils', 'Procédure', 'Création & studio'];
/**
 * The research topic of a request: its meaningful words, WITHOUT numbers, amounts, e-mails, URLs, or capitalised
 * proper names (counterparties, people) — only the technique travels to the search engines, never the user's data.
 */
export function brainTopic(text: string, max = 8): string | null {
  const cleaned = text
    .replace(/https?:\/\/\S+|\S+@\S+/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\b\d[\d\s.,%]*\b/g, ' ');
  // Proper names: a capitalised word that is not the first of its sentence and not an acronym of the domain.
  const ACRONYM = /^(IFRS|UMOA|UEMOA|BCEAO|CEMAC|BEAC|BCBS|NPL|ECL|PD|LGD|EAD|CCF|SQL|API|PDF|KPI|ROE|ROA|PNB|TVA|SYSCOHADA|OHADA|BRVM|IRB|ICAAP|ILAAP|DAX|VBA|HTML|CSS|JSON|XML|EAD|LCR|NSFR|MCP|LLM|RAG)$/;
  const kept: string[] = [];
  for (const sentence of cleaned.split(/(?<=[.!?\n])\s+/)) {
    sentence
      .split(/\s+/)
      .forEach((w, i) => {
        const bare = w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
        if (!bare) return;
        if (ACRONYM.test(bare)) return void kept.push(bare);
        if (i > 0 && /^\p{Lu}/u.test(bare)) return; // proper name
        kept.push(bare);
      });
  }
  const t = tokens(kept.join(' ')).filter((w) => w.length > 2 && !/^\d/.test(w));
  return t.length >= 3 ? t.slice(0, max).join(' ') : null;
}
/** True when the request is technical and JEV has no live technique for it yet. */
export function needsResearch(knowledge: readonly KnowledgeEntry[], text: string, now = Date.now()): boolean {
  const topic = brainTopic(text);
  if (!topic) return false;
  if (!TECHNICAL.includes(domainOf(text))) return false;
  return related(knowledge, text, 1, now).length === 0;
}
/** The messages that turn 1–2 read pages into a technique card (sourced, dated, no invention). */
export function distillMessages(topic: string, pages: { url: string; title: string; text: string; published?: string }[]): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        "Tu es le module d'apprentissage de JEV. À partir des SEULES sources fournies, écris une fiche technique réutilisable en français : 5 à 10 puces (règles, étapes, seuils, formules, pièges), chaque puce suivie de [n] = numéro de la source. N'ajoute rien qui ne soit pas dans les sources. Si les sources ne traitent pas le sujet, réponds exactement : AUCUNE TECHNIQUE.",
    },
    {
      role: 'user',
      content: `Sujet : ${topic}\n\n${pages.map((p, i) => `[${i + 1}] ${p.title} — ${p.url}${p.published ? ` (publié le ${p.published})` : ''}\n${p.text.slice(0, 5000)}`).join('\n\n')}`,
    },
  ];
}
/** The card is kept only if it is a real, sourced technique. */
export function acceptTechnique(text: string): string | null {
  const t = text.trim();
  if (!t || /AUCUNE TECHNIQUE/i.test(t)) return null;
  const bullets = t.split('\n').filter((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
  const cited = bullets.filter((l) => /\[\d+\]/.test(l));
  if (bullets.length < 3 || cited.length < Math.ceil(bullets.length / 2)) return null;
  return t.slice(0, 2400);
}

/** Brain counters shown to the user (measured on this device, never estimated). */
export interface BrainStats {
  fed: number;
  charsAdded: number;
  cacheHits: number;
  cacheSavedUsd: number;
  learned: number;
  researchToday: { day: string; n: number };
  qaChecked: number;
  qaFlagged: number;
  corrected: number;
}
export const EMPTY_BRAIN: BrainStats = { fed: 0, charsAdded: 0, cacheHits: 0, cacheSavedUsd: 0, learned: 0, researchToday: { day: '', n: 0 }, qaChecked: 0, qaFlagged: 0, corrected: 0 };
/** HARD daily cap on automatic research (enforced by `mayResearch`). */
export const RESEARCH_PER_DAY = 25;
export function mayResearch(s: BrainStats, now = Date.now()): boolean {
  const day = new Date(now).toISOString().slice(0, 10);
  return s.researchToday.day !== day || s.researchToday.n < RESEARCH_PER_DAY;
}
export function countResearch(s: BrainStats, now = Date.now()): BrainStats {
  const day = new Date(now).toISOString().slice(0, 10);
  return { ...s, researchToday: { day, n: s.researchToday.day === day ? s.researchToday.n + 1 : 1 } };
}

// ── MISE À JOUR PERPÉTUELLE (« les savoirs de JEV en perpétuelle mise à jour via Internet ») ─────────────────────────
const DAY = 86_400_000;
/** Age after which a used technique is re-checked on the Internet, by domain (rules and code move fast). */
export const REFRESH_AFTER: Record<KnowledgeDomain, number> = {
  'Réglementation bancaire': 30 * DAY,
  'Finance & comptabilité': 30 * DAY,
  'Code & outils': 21 * DAY,
  Procédure: 45 * DAY,
  'Création & studio': 30 * DAY,
  Actualité: 1 * DAY,
  Général: 30 * DAY,
};
/**
 * The techniques to refresh now: the ones about to expire that are still used, and the used ones older than their
 * domain's refresh age — most used first. Never an unused entry (no research for nothing), at most `max` per round.
 */
export function refreshQueue(knowledge: readonly KnowledgeEntry[], now = Date.now(), max = 3): KnowledgeEntry[] {
  return knowledge
    .filter((e) => e.hits > 0 && e.expiresAt > now)
    .filter((e) => e.expiresAt - now < 7 * DAY || now - e.createdAt > REFRESH_AFTER[e.domain])
    .sort((a, b) => b.hits - a.hits || a.createdAt - b.createdAt)
    .slice(0, max);
}

// ── PENDANT LA REQUÊTE (« JEV doit intervenir pendant la requête ») ─────────────────────────────────────────────────
export interface WatchState {
  text: string;
  /** Language the request expects ('fr' | 'en'); null = not watched (another language or a translation was asked). */
  lang: 'fr' | 'en' | null;
}
export interface Intervention {
  kind: 'boucle' | 'langue';
  why: string;
  /** The corrective instruction sent with the retry. */
  fix: string;
}
const EN = /\b(the|and|of|to|is|are|with|that|this|for|which|would|should|could|be|it)\b/gi;
const FR = /\b(le|la|les|des|et|est|sont|pour|avec|une?|du|que|qui|dans|sur|pas|ce|cette)\b/gi;
/**
 * Watches the text a model is streaming. Intervenes on a REPETITION LOOP (the same ≥ 30-character passage three times
 * in the last 1 500 characters) or a LANGUAGE DRIFT (≥ 600 characters clearly in the other language). Deterministic.
 */
export function streamWatch(s: WatchState): Intervention | null {
  const t = s.text;
  if (t.length < 300) return null;
  // Only PROSE is judged: code blocks, tables, HTML / JSON / CSV and lists legitimately repeat their patterns.
  const prose = t
    .slice(-2500)
    .replace(/```[\s\S]*?(```|$)/g, '\n')
    .split('\n')
    .filter((l) => !/^\s*([|<{[\]"'#>*+]|-\s|\d+[.)]\s|[A-Za-z0-9_]+\s*[:=]\s*["'{[\d])/.test(l) && !/[;,]\s*\S+[;,]\s*\S+[;,]/.test(l))
    .join('\n');
  const sentences = prose
    .split(/(?<=[.!?])\s+|\n+/)
    .map((x) => x.trim().toLowerCase().replace(/\s+/g, ' '))
    .filter((x) => x.length >= 25 && x.split(' ').length >= 5);
  const count = new Map<string, number>();
  for (const x of sentences) count.set(x, (count.get(x) ?? 0) + 1);
  const worst = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  if (worst && worst[1] >= 3)
    return { kind: 'boucle', why: `la même phrase revient ${worst[1]} fois`, fix: 'Ta réponse précédente tournait en boucle (la même phrase répétée). Réponds à nouveau, sans aucune répétition, de façon concise et complète.' };
  if (s.lang && prose.length >= 600) {
    const sample = prose.slice(-900);
    const en = (sample.match(EN) ?? []).length;
    const fr = (sample.match(FR) ?? []).length;
    if (s.lang === 'fr' && en > 25 && en > fr * 3)
      return { kind: 'langue', why: 'la réponse est partie en anglais', fix: 'Réponds en FRANÇAIS uniquement (la demande est en français).' };
    if (s.lang === 'en' && fr > 25 && fr > en * 3)
      return { kind: 'langue', why: 'la réponse est partie en français', fix: 'Answer in ENGLISH only (the request is in English).' };
  }
  return null;
}
/** The language to hold the answer to — null when the request itself asks for another language or a translation. */
export const langOfRequest = (ask: string): 'fr' | 'en' | null => {
  if (/\b(anglais|english|espagnol|spanish|allemand|german|arabe|arabic|wolof|portugais|portuguese|chinois|chinese|italien|italian|bilingue|traduction|tradui\w*|translat\w*|en langue)\b/i.test(ask)) return null;
  const en = (ask.match(EN) ?? []).length;
  const fr = (ask.match(FR) ?? []).length;
  return en > fr * 2 && en >= 2 ? 'en' : 'fr';
};

// ── JEV CODE ET INTERPRÈTE (« donne la possibilité à JEV de coder et d'interpréter ») ───────────────────────────────
/** A calculation request worth computing by code rather than by the model's mental arithmetic. */
export function computeIntent(text: string): boolean {
  const t = text.trim();
  if (t.length < 12 || t.length > 500 || /\n.*\n/.test(t)) return false;
  const numbers = (t.match(/\d[\d\s.,]*/g) ?? []).filter((x) => /\d/.test(x)).length;
  if (numbers < 2) return false;
  // A question on the user's data (file, portfolio, clients…) is answered from the data, never computed in the void.
  if (/\b(fichier|classeur|tableau|portefeuille|donn[ée]es|colonnes?|feuilles?|segments?|clients?|contreparties?|ci-dessus|pr[ée]c[ée]dent|joint|liste|ligne|dossier|ce mois|cette ann[ée]e)\b/i.test(t)) return false;
  return /\b(calcul\w*|combien|mensualit[ée]s?|annuit[ée]s?|amortissement|int[ée]r[êe]ts?( compos[ée]s)?|van\b|vna|tri\b|taux (effectif|actuariel|de rendement)|actualis\w*|capitalis\w*|rendement|moyenne|m[ée]diane|[ée]cart[- ]type|variance|pourcentage|%|croissance|cagr|remboursement|[ée]ch[ée]ancier|simul\w*|projection|valeur (actuelle|future|acquise))/i.test(t);
}
/** The coder's instructions: pure JavaScript, no network, ends with « return { … } » — JEV runs it, never trusts prose. */
export function codeMessages(question: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'Tu écris du JavaScript que JEV exécute dans un bac à sable isolé (pas de réseau, pas d’import, pas de DOM). Réponds UNIQUEMENT par un bloc ```js``` : déclare les données de la question en constantes nommées, calcule, puis termine par `return { resultat, unite, detail }` où `resultat` est un nombre ou un petit tableau, `unite` un texte, `detail` une phrase qui explique la formule. Pas de Math.random, pas de date du jour sauf si la question le demande.',
    },
    { role: 'user', content: question },
  ];
}
/** The JavaScript block of a coder's answer (fenced or bare). */
export function extractJs(text: string): string | null {
  const m = /```(?:js|javascript)?\s*\n([\s\S]*?)```/i.exec(text);
  const code = (m?.[1] ?? (/return\s*\{/.test(text) ? text : '')).trim();
  if (!code || !/\breturn\b/.test(code)) return null;
  if (/\b(fetch|XMLHttpRequest|import\s*\(|require\s*\(|localStorage|indexedDB|document\.|window\.)/.test(code)) return null;
  return code;
}
/** The interpreted answer: the result read from the executed code, the formula, and the code itself. */
export function computeAnswer(result: string, code: string, model: string): string | null {
  let r: { resultat?: unknown; unite?: unknown; detail?: unknown };
  try {
    r = JSON.parse(result) as typeof r;
  } catch {
    return null;
  }
  if (r?.resultat === undefined || r.resultat === null) return null;
  const fmtN = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : JSON.stringify(v));
  const val = Array.isArray(r.resultat) ? r.resultat.map(fmtN).join(' · ') : fmtN(r.resultat);
  return `**${val}${r.unite ? ` ${String(r.unite)}` : ''}**\n\n${r.detail ? `${String(r.detail)}\n\n` : ''}<details><summary>Code écrit et exécuté par JEV</summary>\n\n\`\`\`js\n${code}\n\`\`\`\n</details>\n\n_Calculé par JEV : programme écrit par ${model} (gratuit), exécuté dans le bac à sable de l'app ; le résultat vient de l'exécution, pas d'un calcul de tête du modèle._`;
}
