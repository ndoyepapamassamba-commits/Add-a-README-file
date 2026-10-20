// Pure skill helpers (no Node APIs): shared by the server and the standalone client.
import { parse as parseYaml } from 'yaml';

export type SkillSource = 'workbench' | 'imported' | 'claude' | 'custom';

export interface Skill {
  name: string;
  description: string;
  dir: string;
  source: SkillSource;
  files: string[];
  triggers: string[];
  size: number;
}

export interface CustomAgent {
  id: string;
  name: string;
  description: string;
  prompt: string;
  tools: string[] | null;
  model: string | null;
  effort: string | null;
  skills: string[];
  source: SkillSource | 'skill';
  file: string;
  editable: boolean;
}

export interface SkillMatch {
  name: string;
  score: number;
  matched: string[];
}

// Claude Code tool names → workbench tools (agents written for Claude Code keep working).
const CLAUDE_TOOL_MAP: Record<string, string[]> = {
  read: ['filesystem.read', 'filesystem.read_many'],
  write: ['filesystem.write'],
  edit: ['filesystem.edit', 'filesystem.multi_edit'],
  multiedit: ['filesystem.multi_edit'],
  glob: ['filesystem.glob'],
  grep: ['filesystem.search'],
  ls: ['filesystem.list'],
  bash: ['terminal.execute', 'terminal.output', 'terminal.kill'],
  websearch: ['web.search'],
  webfetch: ['web.fetch'],
  todowrite: ['plan.update'],
  task: ['agent.delegate'],
  notebookedit: [],
};

export function mapAgentTools(list: string[], known: Set<string>): string[] {
  const out = new Set<string>();
  for (const raw of list) {
    const t = raw.trim();
    if (!t) continue;
    if (known.has(t)) {
      out.add(t);
    } else if (t.endsWith('.*')) {
      for (const k of known) if (k.startsWith(t.slice(0, -1))) out.add(k);
    } else {
      for (const m of CLAUDE_TOOL_MAP[t.toLowerCase().replace(/[^a-z]/g, '')] ?? []) out.add(m);
    }
  }
  return [...out];
}

export function normalizeText(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'");
}

export function agentId(name: string): string {
  return normalizeText(name)
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Splits "---\nyaml\n---\nbody" into frontmatter + body. */
export function parseFrontmatter(text: string): { meta: Record<string, unknown>; body: string } {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: {}, body: text };
  try {
    const meta = parseYaml(m[1]!) as Record<string, unknown>;
    return { meta: meta && typeof meta === 'object' ? meta : {}, body: m[2] ?? '' };
  } catch {
    return { meta: {}, body: m[2] ?? '' };
  }
}

/** Trigger phrases extracted from a skill description (quoted phrases + keyword lists). */
export function extractTriggers(description: string, name: string): string[] {
  const out = new Set<string>();
  for (const m of description.matchAll(/["“«]\s*([^"”»]{2,60}?)\s*["”»]/g))
    out.add(normalizeText(m[1]!.trim()));
  const listRe =
    /(?:mentionne|mentions?|triggers?(?: on| include)?|se d[ée]clenche(?: aussi)? (?:avec|d[eè]s que)|keywords?)\s*:?\s*([^.]+)/gi;
  for (const m of description.matchAll(listRe)) {
    for (const part of m[1]!.split(/,|\bou\b|\bor\b/)) {
      const p = normalizeText(part.replace(/["“”«»]/g, '').trim()).replace(
        /^(l'utilisateur|the user|user)\s+(mentionne|mentions?|demande|asks?(?: for)?)\s+/,
        '',
      );
      if (p.length >= 2 && p.length <= 40 && !/^(l'utilisateur|the user|toute demande|meme|any)/.test(p))
        out.add(p);
    }
  }
  const nameWords = name.split(/[-_]/).filter((w) => w.length >= 4);
  if (nameWords.length) out.add(normalizeText(nameWords.join(' ')));
  return [...out].filter((t) => t.length >= 2);
}

/** Keyword matching of a request against skills' trigger phrases (accent-insensitive). */
export function matchSkills(
  text: string,
  skills: Iterable<{ name: string; triggers: string[] }>,
  disabled: string[] = [],
): SkillMatch[] {
  const t = ` ${normalizeText(text)} `;
  const out: SkillMatch[] = [];
  for (const s of skills) {
    if (disabled.includes(s.name)) continue;
    const matched: string[] = [];
    for (const trig of s.triggers) {
      const re = new RegExp(`(^|[^a-z0-9])${trig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`);
      if (re.test(t)) matched.push(trig);
    }
    if (t.includes(` ${normalizeText(s.name)} `) || t.includes(`/${normalizeText(s.name)}`))
      matched.push(s.name);
    if (matched.length)
      out.push({
        name: s.name,
        score: matched.reduce((a, m) => a + Math.min(3, m.split(' ').length), 0),
        matched: [...new Set(matched)],
      });
  }
  return out.sort((a, b) => b.score - a.score);
}
