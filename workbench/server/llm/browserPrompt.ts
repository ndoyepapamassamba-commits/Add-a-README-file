// LE MODÈLE INTÉGRÉ AU NAVIGATEUR (v63, lot C) — partie pure, testée en Node : préparer une conversation pour un PETIT
// modèle local (Qwen3 0,6 B / 1,7 B, Apache-2.0) et relire ses appels d'outils.
// Un petit modèle sur le processeur lit ~100 à 300 jetons/s : lui envoyer 60 outils et 20 000 caractères de consignes
// coûterait des minutes. On lui donne donc l'essentiel — consignes résumées, derniers échanges, 6 outils au plus, choisis
// par les mots de la demande — et on le dit dans la réponse. Les appels d'outils de Qwen3 suivent le format Hermes :
// <tool_call>{"name": …, "arguments": {…}}</tool_call>.
import type { ChatMessage, ToolCall, ToolDefinition } from './types';

export interface SmallModelBudget {
  /** Characters of JEV material kept first (capsule, packet, learned knowledge, chat memory, lessons). */
  jevChars: number;
  /** Characters of the other system instructions kept. */
  systemChars: number;
  /** Characters kept per tool result. */
  toolResultChars: number;
  /** Last messages kept (besides the system prompt). */
  lastMessages: number;
  maxTools: number;
}
export const SMALL_BUDGET: SmallModelBudget = { jevChars: 4200, systemChars: 1600, toolResultChars: 2500, lastMessages: 8, maxTools: 6 };

const textOf = (c: ChatMessage['content']): string =>
  typeof c === 'string' ? c : (c ?? []).map((p) => (p.type === 'text' ? p.text : '')).join('');
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n…[abrégé pour le modèle local]` : s);

const STOP = new Set('le la les un une des de du et ou en à au aux pour par sur dans avec sans que qui quoi est sont the a an of to in on for and or is are with what how fais fait donne moi mon ma mes ton ta tes je tu il elle nous vous'.split(' '));
const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

// What JEV prepared for the model (« alimenter les LLM gratuits à partir de JEV »), in the order kept when space is short.
const JEV_BLOCKS: { name: string; rx: RegExp }[] = [
  { name: 'capsule JEV', rx: /<jev_capsule[^>]*>[\s\S]*?<\/jev_capsule>/ },
  { name: 'connaissances apprises', rx: /<LEARNED_KNOWLEDGE>[\s\S]*?<\/LEARNED_KNOWLEDGE>/ },
  { name: 'mémoire du chat', rx: /<CHAT_MEMORY>[\s\S]*?<\/CHAT_MEMORY>/ },
  { name: 'paquet JEV', rx: /<jev_packet[^>]*>[\s\S]*?<\/jev_packet>/ },
  { name: 'leçons', rx: /<LESSONS>[\s\S]*?<\/LESSONS>/ },
];
/** Splits the system prompt into the JEV blocks (kept first) and the remaining instructions. */
export function jevParts(system: string): { blocks: { name: string; text: string }[]; rest: string } {
  let rest = system;
  const blocks: { name: string; text: string }[] = [];
  for (const b of JEV_BLOCKS) {
    const m = b.rx.exec(rest);
    if (!m) continue;
    blocks.push({ name: b.name, text: m[0] });
    rest = rest.replace(m[0], '');
  }
  return { blocks, rest: rest.replace(/\n{3,}/g, '\n\n').trim() };
}
/** JEV blocks within the budget: each gets its share, the first ones first; never cut silently. */
function packJev(blocks: { name: string; text: string }[], budget: number): { text: string; kept: string[]; cut: string[] } {
  const kept: string[] = [];
  const cut: string[] = [];
  const out: string[] = [];
  let left = budget;
  blocks.forEach((b, i) => {
    const share = Math.floor(left / (blocks.length - i));
    if (share < 200) {
      cut.push(b.name);
      return;
    }
    const t = b.text.length > share ? `${b.text.slice(0, share)}\n…[abrégé]` : b.text;
    out.push(t);
    kept.push(b.name);
    left -= Math.min(b.text.length, share);
  });
  return { text: out.join('\n\n'), kept, cut };
}

/** The tools most related to the request (name + description overlap), at most `max`; the ones already used first. */
export function pickTools(tools: ToolDefinition[], request: string, used: string[] = [], max = SMALL_BUDGET.maxTools, jevText = ''): ToolDefinition[] {
  if (tools.length <= max) return tools;
  const want = new Set(words(request));
  const scored = tools.map((t, i) => {
    const name = t.function.name;
    const hay = words(`${name.replace(/__|[._]/g, ' ')} ${t.function.description}`);
    let score = 0;
    for (const w of hay) if (want.has(w)) score += 1;
    for (const w of words(name.replace(/__|[._]/g, ' '))) if (want.has(w)) score += 3;
    if (used.includes(name)) score += 10;
    // A tool JEV named in its capsule / packet for this task.
    if (jevText && (jevText.includes(name) || jevText.includes(name.replace(/__/g, '.')))) score += 6;
    return { t, score, i };
  });
  return scored
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, max)
    .map((x) => x.t);
}

export interface SmallChat {
  messages: { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_calls?: { type: 'function'; function: { name: string; arguments: Record<string, unknown> } }[] }[];
  tools: ToolDefinition[];
  /** What was cut (shown to the user, never hidden). */
  trimmed: string[];
  /** The JEV material passed to the small model. */
  jev: string[];
}
/** OpenAI-style conversation → the short conversation a small local model can read quickly. */
export function forSmallModel(messages: ChatMessage[], tools: ToolDefinition[] = [], b: SmallModelBudget = SMALL_BUDGET): SmallChat {
  const trimmed: string[] = [];
  const system = messages.filter((m) => m.role === 'system').map((m) => textOf(m.content)).join('\n\n');
  const rest = messages.filter((m) => m.role !== 'system');
  let tail = rest.slice(-b.lastMessages);
  // Never start on a tool result whose call was cut.
  while (tail.length && tail[0]!.role === 'tool') tail = tail.slice(1);
  if (tail.length < rest.length) trimmed.push(`${rest.length - tail.length} message(s) ancien(s)`);
  const parts = jevParts(system);
  const jev = packJev(parts.blocks, b.jevChars);
  if (jev.cut.length) trimmed.push(`JEV abrégé (${jev.cut.join(', ')})`);
  const sys = parts.rest.length > b.systemChars ? (trimmed.push('consignes résumées'), clip(parts.rest, b.systemChars)) : parts.rest;
  const out: SmallChat['messages'] = [];
  out.push({
    role: 'system',
    content: [
      sys,
      jev.text ? `Ce que JEV a préparé pour cette demande (à utiliser en priorité, c'est la source fiable) :\n${jev.text}` : '',
      "Réponds en français, de façon brève et exacte. N'invente aucun chiffre : si une donnée manque, dis-le ou appelle un outil.",
    ]
      .filter(Boolean)
      .join('\n\n'),
  });
  for (const m of tail) {
    const content = textOf(m.content);
    if (m.role === 'tool') {
      if (content.length > b.toolResultChars) trimmed.push('résultat d’outil abrégé');
      out.push({ role: 'tool', content: clip(content, b.toolResultChars) });
    } else if (m.role === 'assistant' && m.tool_calls?.length) {
      out.push({
        role: 'assistant',
        content,
        tool_calls: m.tool_calls.map((t) => ({ type: 'function', function: { name: t.function.name, arguments: parseArgs(t.function.arguments) } })),
      });
    } else out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content });
  }
  const lastUser = [...rest].reverse().find((m) => m.role === 'user');
  const used = rest.flatMap((m) => (m.tool_calls ?? []).map((t) => t.function.name));
  const kept = pickTools(tools, textOf(lastUser?.content ?? ''), used, b.maxTools, jev.text);
  if (kept.length < tools.length) trimmed.push(`${kept.length} outil(s) sur ${tools.length}, choisis avec JEV`);
  return { messages: out, tools: kept, trimmed: [...new Set(trimmed)], jev: jev.kept };
}
function parseArgs(a: string): Record<string, unknown> {
  try {
    const v = JSON.parse(a || '{}') as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Qwen3 output → visible text + tool calls (Hermes format), thinking blocks removed. */
export function parseQwenOutput(raw: string, idPrefix = 'local'): { content: string; toolCalls: ToolCall[] } {
  let text = raw.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/<\|im_end\|>|<\|endoftext\|>/g, '');
  const calls: ToolCall[] = [];
  text = text.replace(/<tool_call>\s*([\s\S]*?)\s*(?:<\/tool_call>|$)/g, (_m, body: string) => {
    const j = firstJson(body);
    if (j && typeof j.name === 'string') {
      const args = j.arguments ?? j.parameters ?? {};
      calls.push({
        id: `${idPrefix}_${calls.length}`,
        type: 'function',
        function: { name: j.name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
      });
    }
    return '';
  });
  return { content: text.trim(), toolCalls: calls };
}
function firstJson(s: string): { name?: unknown; arguments?: unknown; parameters?: unknown } | null {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(s.slice(start, i + 1)) as { name?: unknown };
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ── requête compacte pour les modèles gratuits EN LIGNE (quotas anonymes en jetons) ─────────────────────────────────
/** Free online services count tokens per IP and per day: JEV sends them the essentials (its blocks first). */
export const FREE_CLOUD_BUDGET: SmallModelBudget = { jevChars: 9000, systemChars: 5000, toolResultChars: 6000, lastMessages: 14, maxTools: 14 };
/**
 * The same OpenAI-format request, compacted: JEV's blocks kept first, the other instructions clipped, the last messages
 * (never a tool result without its call), long tool results clipped, the tools most related to the request (JEV's pack
 * order breaks ties). Message structure (ids, tool_call_id) is preserved.
 */
export function compactRequest(messages: ChatMessage[], tools: ToolDefinition[] = [], b: SmallModelBudget = FREE_CLOUD_BUDGET): { messages: ChatMessage[]; tools: ToolDefinition[]; saved: number } {
  const before = JSON.stringify(messages).length + JSON.stringify(tools).length;
  const system = messages.filter((m) => m.role === 'system').map((m) => textOf(m.content)).join('\n\n');
  const parts = jevParts(system);
  const jev = packJev(parts.blocks, b.jevChars);
  const rest = parts.rest.length > b.systemChars ? clip(parts.rest, b.systemChars) : parts.rest;
  const sys = [rest, jev.text].filter(Boolean).join('\n\n');
  const convo = messages.filter((m) => m.role !== 'system');
  let tail = convo.slice(-b.lastMessages);
  while (tail.length && tail[0]!.role === 'tool') tail = tail.slice(1);
  const out: ChatMessage[] = [
    ...(sys ? [{ role: 'system' as const, content: sys }] : []),
    ...tail.map((m) => (m.role === 'tool' && textOf(m.content).length > b.toolResultChars ? { ...m, content: clip(textOf(m.content), b.toolResultChars) } : m)),
  ];
  const lastUser = [...convo].reverse().find((m) => m.role === 'user');
  const used = convo.flatMap((m) => (m.tool_calls ?? []).map((t) => t.function.name));
  const kept = pickTools(tools, textOf(lastUser?.content ?? ''), used, b.maxTools, jev.text);
  return { messages: out, tools: kept, saved: Math.max(0, before - JSON.stringify(out).length - JSON.stringify(kept).length) };
}
