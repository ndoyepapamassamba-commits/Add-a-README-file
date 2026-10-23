/**
 * HARNESS (23/10/2026, « rendre l'application comme un HARNESS complet ») — the layers a coding-agent harness puts
 * around its loop, after the veille of the day (Claude Code / Agent SDK hook events, the four-layer permission stack of
 * Codex CLI, the Agent Skills specification of agentskills.io):
 *  - permission RULES checked before the mode: deny > ask > allow, in the Claude Code syntax `Tool(pattern)` with our
 *    tool names or theirs (Bash, Read, Write, Edit, WebFetch, mcp__server__tool…);
 *  - HOOKS on PreToolUse / PostToolUse / UserPromptSubmit / Stop / SessionStart: declarative (deny, ask, allow, add a
 *    context), JavaScript run in the sandbox, or a shell command run by the local bridge (Claude Code settings.json);
 *  - INSTRUCTION FILES of the workspace (MASSAMBA.md, CLAUDE.md, AGENTS.md, .claude/CLAUDE.md) read at every turn;
 *  - SLASH COMMANDS: the app's, the plugins' (skill pack), the workspace's (.claude/commands/*.md, commands/*.md) and
 *    /<skill> for any skill;
 *  - skills WITHOUT format requirement (« enlève les exigences de format de fichier ») : a SKILL.md without front
 *    matter takes its name from its folder and its description from its first paragraph; every file format is kept.
 * Pure functions here (unit-tested); agent.ts and ChatView.tsx wire them.
 */
import {
  extractTriggers,
  matchSkills,
  normalizeText,
  parseFrontmatter,
} from '../../server/services/skillsCore';
import type { SkillDef } from './types';

export type HookEvent = 'PreToolUse' | 'PostToolUse' | 'UserPromptSubmit' | 'Stop' | 'SessionStart';
export const HOOK_EVENTS: HookEvent[] = [
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Stop',
  'SessionStart',
];
export type HookAction = 'deny' | 'ask' | 'allow' | 'context' | 'js' | 'shell';
export interface HookDef {
  id: string;
  event: HookEvent;
  /** Regular expression on the tool name (PreToolUse / PostToolUse); empty = every tool. Claude names accepted. */
  matcher?: string;
  /** Regular expression on the arguments (JSON), the prompt, or the tool result; empty = always. */
  when?: string;
  action: HookAction;
  /** Reason shown to the model / the user (deny, ask) or the context added (context). */
  message?: string;
  /** JavaScript body (action js): receives `input`, returns { decision, reason, context, args }. */
  code?: string;
  /** Shell command (action shell), run by the local bridge: exit 2 blocks, stdout JSON may carry a decision. */
  command?: string;
  enabled: boolean;
}
export interface PermissionRules {
  allow: string[];
  ask: string[];
  deny: string[];
}
export interface CommandDef {
  name: string;
  description: string;
  body: string;
  argumentHint?: string;
  source: string;
}
export interface HarnessSettings {
  hooks: HookDef[];
  permissions: PermissionRules;
  /** Read MASSAMBA.md / CLAUDE.md / AGENTS.md of the workspace at every turn (default true). */
  instructions: boolean;
  commands: CommandDef[];
  /** Skills injected at every request, whatever the matching (default: REA d'abord). */
  alwaysSkills: string[];
  /** Version of the skill pack installed (massamba-skills.js). */
  packVersion?: string;
}
export const DEFAULT_HARNESS: HarnessSettings = {
  hooks: [],
  permissions: { allow: [], ask: [], deny: [] },
  instructions: true,
  commands: [],
  alwaysSkills: ['rea-d-abord'],
};
export const harnessOf = (h?: Partial<HarnessSettings>): HarnessSettings => ({
  ...DEFAULT_HARNESS,
  ...(h ?? {}),
  permissions: { ...DEFAULT_HARNESS.permissions, ...(h?.permissions ?? {}) },
});

// ── tool names: ours ↔ Claude Code's ─────────────────────────────────────────────────────────────────────────────
/** Claude Code tool names → the Workbench tools they stand for (rules and hooks written for Claude Code work here). */
export const CLAUDE_TOOL_ALIASES: Record<string, string[]> = {
  Bash: ['terminal.execute', 'mcp.poste.bash'],
  Read: ['filesystem.read', 'mcp.poste.read_file'],
  Write: ['filesystem.write', 'mcp.poste.write_file'],
  Edit: ['filesystem.edit'],
  MultiEdit: ['filesystem.edit'],
  Glob: ['filesystem.list', 'mcp.poste.list_files'],
  Grep: ['filesystem.search', 'mcp.poste.grep'],
  WebFetch: ['web.read', 'browser.open'],
  WebSearch: ['web.search'],
  Task: ['agent.delegate'],
  Agent: ['agent.delegate'],
  Skill: ['skill.use'],
  TodoWrite: ['plan.update'],
  AskUserQuestion: ['user.ask'],
};
/** `mcp__rea__inspect` → `mcp.rea.inspect`; `mcp__rea` → `mcp.rea.*`. */
const fromClaudeName = (n: string): string => {
  const m = /^mcp__([^_].*?)(?:__(.+))?$/.exec(n);
  if (m) return m[2] ? `mcp.${m[1]}.${m[2]}` : `mcp.${m[1]}.*`;
  return n;
};
const globRe = (g: string) =>
  new RegExp(
    `^${g
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*+/g, '.*')
      .replace(/\?/g, '.')}$`,
    'i',
  );

/** Does a tool-name pattern (ours or Claude's, with * wildcards) designate this tool? */
export function toolNameMatches(pattern: string, tool: string): boolean {
  const p = pattern.trim();
  if (!p || p === '*') return true;
  const names = CLAUDE_TOOL_ALIASES[p] ?? [fromClaudeName(p)];
  return names.some((n) => globRe(n).test(tool));
}

/** The argument a rule's pattern is matched against: the command, the path, the URL, the query… */
export function primaryArg(tool: string, args: Record<string, unknown>): string {
  for (const k of ['command', 'cmd', 'path', 'file', 'file_path', 'url', 'query', 'pattern', 'name', 'agent'])
    if (typeof args[k] === 'string') return args[k] as string;
  if (tool === 'code.run' && typeof args.code === 'string') return args.code;
  return JSON.stringify(args);
}

export interface RuleHit {
  decision: 'allow' | 'ask' | 'deny';
  rule: string;
}
/** Parses `Tool`, `Tool(pattern)` and Claude's prefix form `Bash(npm run:*)`. */
export function parseRule(rule: string): { tool: string; pattern: string | null } {
  const m = /^\s*([^()]+?)\s*(?:\((.*)\))?\s*$/.exec(rule);
  if (!m) return { tool: rule.trim(), pattern: null };
  const pattern = m[2] === undefined ? null : m[2].replace(/:\*$/, '*');
  return { tool: m[1]!, pattern };
}
export function ruleMatches(rule: string, tool: string, args: Record<string, unknown>): boolean {
  const r = parseRule(rule);
  if (!toolNameMatches(r.tool, tool)) return false;
  if (r.pattern === null || r.pattern === '' || r.pattern === '*') return true;
  return globRe(r.pattern).test(primaryArg(tool, args).trim());
}
/** Permission rules first (deny > ask > allow); null when no rule speaks (the mode decides). */
export function evaluateRules(
  rules: PermissionRules,
  tool: string,
  args: Record<string, unknown>,
): RuleHit | null {
  for (const decision of ['deny', 'ask', 'allow'] as const)
    for (const rule of rules[decision] ?? []) if (ruleMatches(rule, tool, args)) return { decision, rule };
  return null;
}

// ── hooks ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface HookInput {
  event: HookEvent;
  tool?: string;
  args?: Record<string, unknown>;
  result?: string;
  prompt?: string;
  sessionId: string;
}
export interface HookOutcome {
  decision?: 'allow' | 'ask' | 'deny';
  reason?: string;
  /** Text added to the model's context (prompt, tool result, next turn). */
  context: string[];
  /** Arguments rewritten by a JavaScript hook (PreToolUse). */
  args?: Record<string, unknown>;
  fired: string[];
  errors: string[];
}
export interface HookRunners {
  js?: (code: string, input: HookInput) => Promise<unknown>;
  shell?: (command: string, input: HookInput) => Promise<{ code: number; stdout: string; stderr: string }>;
}
const safeRe = (s: string | undefined) => {
  if (!s) return null;
  try {
    return new RegExp(s, 'i');
  } catch {
    return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
};
/** Hooks of one event that apply to this input. */
export function hooksFor(hooks: HookDef[], input: HookInput): HookDef[] {
  return hooks.filter((h) => {
    if (!h.enabled || h.event !== input.event) return false;
    if (h.matcher && input.tool) {
      const parts = h.matcher
        .split('|')
        .map((p) => p.trim())
        .filter(Boolean);
      const byName = parts.some((p) => toolNameMatches(p, input.tool!));
      const re = safeRe(h.matcher);
      if (!byName && !(re && re.test(input.tool))) return false;
    }
    const w = safeRe(h.when);
    if (w) {
      const subject =
        input.event === 'PreToolUse'
          ? JSON.stringify(input.args ?? {})
          : input.event === 'PostToolUse'
            ? (input.result ?? '')
            : (input.prompt ?? '');
      if (!w.test(subject)) return false;
    }
    return true;
  });
}
const RANK = { allow: 1, ask: 2, deny: 3 } as const;
function merge(out: HookOutcome, d: unknown, reason?: unknown, context?: unknown) {
  const dec = typeof d === 'string' ? d.toLowerCase() : '';
  const norm = dec === 'block' ? 'deny' : dec === 'approve' ? 'allow' : dec;
  if (norm === 'allow' || norm === 'ask' || norm === 'deny') {
    if (!out.decision || RANK[norm] > RANK[out.decision]) {
      out.decision = norm;
      if (typeof reason === 'string' && reason) out.reason = reason;
    }
  }
  if (typeof context === 'string' && context.trim()) out.context.push(context.trim());
}
/** Runs the hooks of an event: the strictest decision wins, contexts add up, a JS hook may rewrite the arguments. */
export async function runHooks(
  hooks: HookDef[],
  input: HookInput,
  run: HookRunners = {},
): Promise<HookOutcome> {
  const out: HookOutcome = { context: [], fired: [], errors: [] };
  for (const h of hooksFor(hooks, input)) {
    out.fired.push(h.id);
    try {
      if (h.action === 'context') merge(out, null, null, h.message);
      else if (h.action === 'deny' || h.action === 'ask' || h.action === 'allow')
        merge(out, h.action, h.message || `hook ${h.id}`);
      else if (h.action === 'js') {
        if (!run.js) throw new Error('exécution JavaScript indisponible');
        const r = (await run.js(h.code ?? '', { ...input, args: input.args ?? undefined })) as Record<
          string,
          unknown
        > | null;
        if (r && typeof r === 'object') {
          merge(out, r.decision, r.reason, r.context);
          if (r.args && typeof r.args === 'object' && input.event === 'PreToolUse')
            out.args = r.args as Record<string, unknown>;
        }
      } else if (h.action === 'shell') {
        if (!run.shell) throw new Error('pont local absent : commande non exécutée');
        const r = await run.shell(h.command ?? '', input);
        // Claude Code convention: exit 2 blocks with stderr as the reason; stdout may be JSON with a decision.
        if (r.code === 2) merge(out, 'deny', r.stderr.trim() || `hook ${h.id}`);
        let j: Record<string, unknown> | null = null;
        try {
          j = JSON.parse(r.stdout) as Record<string, unknown>;
        } catch {
          if (
            r.stdout.trim() &&
            r.code === 0 &&
            (input.event === 'UserPromptSubmit' || input.event === 'SessionStart')
          )
            merge(out, null, null, r.stdout);
        }
        if (j) {
          const spec = (j.hookSpecificOutput ?? {}) as Record<string, unknown>;
          merge(
            out,
            j.decision ?? spec.permissionDecision,
            j.reason ?? spec.permissionDecisionReason,
            spec.additionalContext,
          );
        }
      }
    } catch (e) {
      out.errors.push(`${h.id} : ${(e as Error).message}`);
    }
  }
  return out;
}

/** Hooks and permissions of a Claude Code settings.json (the same project config runs in the Workbench). */
export function importClaudeSettings(json: unknown): { hooks: HookDef[]; permissions: PermissionRules } {
  const j = (json ?? {}) as {
    hooks?: Record<string, { matcher?: string; hooks?: { type?: string; command?: string }[] }[]>;
    permissions?: Partial<PermissionRules>;
  };
  const hooks: HookDef[] = [];
  for (const [ev, groups] of Object.entries(j.hooks ?? {})) {
    if (!HOOK_EVENTS.includes(ev as HookEvent)) continue;
    for (const g of groups ?? [])
      for (const hk of g.hooks ?? [])
        if (hk.type === 'command' && hk.command)
          hooks.push({
            id: `claude-${ev}-${hooks.length + 1}`,
            event: ev as HookEvent,
            matcher: g.matcher || undefined,
            action: 'shell',
            command: hk.command,
            enabled: true,
          });
  }
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  return {
    hooks,
    permissions: {
      allow: list(j.permissions?.allow),
      ask: list(j.permissions?.ask),
      deny: list(j.permissions?.deny),
    },
  };
}

// ── instruction files ─────────────────────────────────────────────────────────────────────────────────────────────
export const INSTRUCTION_FILES = [
  'MASSAMBA.md',
  'CLAUDE.md',
  'AGENTS.md',
  '.claude/CLAUDE.md',
  'CLAUDE.local.md',
];
/** The workspace instruction files present (root or one folder down), in the order above, each clipped. */
export function instructionFiles(
  files: { path: string; data: string; binary?: boolean }[],
  maxEach = 12_000,
): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const name of INSTRUCTION_FILES) {
    const f = files.find(
      (x) =>
        !x.binary &&
        (x.path === name ||
          (x.path.endsWith(`/${name}`) && x.path.split('/').length <= name.split('/').length + 1)),
    );
    if (f && f.data.trim())
      out.push({
        path: f.path,
        text: f.data.length > maxEach ? `${f.data.slice(0, maxEach)}\n…[tronqué]` : f.data,
      });
  }
  return out;
}

// ── skills without format requirement ─────────────────────────────────────────────────────────────────────────────
/** First real paragraph of a Markdown body (the description of a SKILL.md that has no front matter). */
export function firstParagraph(body: string, max = 300): string {
  for (const block of body.split(/\n\s*\n/)) {
    const t = block
      .split('\n')
      .filter((l) => !/^\s*(#|```|---|<|\|)/.test(l))
      .join(' ')
      .replace(/[*_`>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (t.length >= 12) return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  }
  return '';
}
export interface PackSkill {
  name: string;
  source: string;
  plugin?: string;
  license?: string;
  md: string;
  files: Record<string, string>;
  bin: Record<string, string>;
  omitted?: { path: string; size: number; reason: string }[];
}
const CATEGORY: Record<string, string> = {
  projet: 'Projet',
  utilisateur: 'Consignes',
  organisation: 'Organisation',
  ajout: 'Ajout',
};
/** A SKILL.md of any shape → SkillDef: no front matter, no name or no description is no longer a refusal. */
export function skillFromMarkdown(md: string, fallbackName: string, extra: Partial<SkillDef> = {}): SkillDef {
  const { meta, body } = parseFrontmatter(md);
  const name = String(meta.name ?? fallbackName).trim() || fallbackName;
  const description =
    String(meta.description ?? '')
      .replace(/\s+/g, ' ')
      .trim() ||
    firstParagraph(body) ||
    `Compétence ${name}`;
  const extraTriggers = Array.isArray(meta.triggers)
    ? (meta.triggers as unknown[]).map((t) => normalizeText(String(t)))
    : [];
  const allowed =
    typeof meta['allowed-tools'] === 'string'
      ? (meta['allowed-tools'] as string).split(/[\s,]+/).filter(Boolean)
      : undefined;
  return {
    name,
    description,
    body: body.trim(),
    files: {},
    triggers: [
      ...new Set([...extractTriggers(description, name.split(':').pop() ?? name), ...extraTriggers]),
    ],
    enabled: true,
    ...(allowed ? { allowedTools: allowed } : {}),
    ...(typeof meta.license === 'string' ? { license: meta.license } : {}),
    ...extra,
  };
}
export function packSkillToDef(p: PackSkill): SkillDef {
  return skillFromMarkdown(p.md, p.name, {
    name: p.name,
    files: p.files,
    assets: Object.keys(p.bin).length ? p.bin : undefined,
    source: p.source,
    category: p.plugin ?? CATEGORY[p.source] ?? 'Métier',
    ...(p.license ? { license: p.license } : {}),
  });
}
/** Installs the pack: new skills added, known ones refreshed (files merged), the user's on/off choice kept. */
export function mergePackSkills(
  existing: SkillDef[],
  pack: SkillDef[],
): { skills: SkillDef[]; added: number; updated: number } {
  const next = [...existing];
  let added = 0;
  let updated = 0;
  for (const p of pack) {
    const i = next.findIndex((x) => x.name === p.name);
    if (i < 0) {
      next.push(p);
      added++;
    } else {
      const cur = next[i]!;
      next[i] = {
        ...cur,
        ...p,
        files: { ...cur.files, ...p.files },
        enabled: cur.enabled,
        category: cur.category ?? p.category,
      };
      updated++;
    }
  }
  return { skills: next.sort((a, b) => a.name.localeCompare(b.name)), added, updated };
}

/** PROGRESSIVE DISCLOSURE (Agent Skills spec): the catalogue shows the skills that fit the request, not all 250. */
export function catalogFor(text: string, skills: SkillDef[], max = 40, always: string[] = []): SkillDef[] {
  const enabled = skills.filter((s) => s.enabled);
  if (enabled.length <= max) return enabled;
  const picked = new Map<string, SkillDef>();
  for (const n of always) {
    const s = enabled.find((x) => x.name === n);
    if (s) picked.set(s.name, s);
  }
  for (const m of matchSkills(text, enabled)) {
    const s = enabled.find((x) => x.name === m.name);
    if (s && picked.size < max) picked.set(s.name, s);
  }
  // Then the skills whose words meet the request, then the project's own (the house know-how).
  const words = new Set(
    normalizeText(text)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4),
  );
  const scored = enabled
    .filter((s) => !picked.has(s.name))
    .map((s) => ({
      s,
      n: normalizeText(`${s.name} ${s.description}`)
        .split(/[^a-z0-9]+/)
        .filter((w) => words.has(w)).length,
    }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  for (const { s } of scored) if (picked.size < max) picked.set(s.name, s);
  for (const s of enabled)
    if (picked.size < max && !s.name.includes(':') && !picked.has(s.name)) picked.set(s.name, s);
  for (const s of enabled) if (picked.size < max && !picked.has(s.name)) picked.set(s.name, s);
  return [...picked.values()];
}
/** skill.search: names and descriptions that answer a query (accent-insensitive words). */
export function searchSkills(query: string, skills: SkillDef[], max = 15): SkillDef[] {
  const q = normalizeText(query)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
  if (!q.length) return skills.slice(0, max);
  return skills
    .map((s) => {
      const hay = normalizeText(`${s.name} ${s.description} ${s.category ?? ''}`);
      return {
        s,
        n: q.reduce((a, w) => a + (hay.includes(w) ? (normalizeText(s.name).includes(w) ? 3 : 1) : 0), 0),
      };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((x) => x.s);
}

// ── slash commands ────────────────────────────────────────────────────────────────────────────────────────────────
export function commandFromMarkdown(md: string, name: string, source: string): CommandDef {
  const { meta, body } = parseFrontmatter(md);
  return {
    name,
    description: String(meta.description ?? '').trim() || firstParagraph(body, 120) || name,
    body: body.trim(),
    argumentHint: typeof meta['argument-hint'] === 'string' ? (meta['argument-hint'] as string) : undefined,
    source,
  };
}
/** Workspace commands: .claude/commands/<name>.md and commands/<name>.md (sub-folders give « dir:name »). */
export function workspaceCommands(files: { path: string; data: string; binary?: boolean }[]): CommandDef[] {
  const out: CommandDef[] = [];
  for (const f of files) {
    const m = /(?:^|\/)(?:\.claude\/)?commands\/(.+)\.md$/i.exec(f.path);
    if (!m || f.binary) continue;
    out.push(commandFromMarkdown(f.data, m[1]!.replace(/\//g, ':'), 'espace de travail'));
  }
  return out;
}
/** Expands $ARGUMENTS, $1…$9 and @path references (workspace files inlined). */
export function expandCommand(
  body: string,
  args: string,
  readFile: (p: string) => string | undefined = () => undefined,
): string {
  const parts = args.match(/"[^"]*"|\S+/g)?.map((p) => p.replace(/^"|"$/g, '')) ?? [];
  let out = body
    .replace(/\$ARGUMENTS/g, args)
    .replace(/\$(\d)/g, (_, d: string) => parts[Number(d) - 1] ?? '');
  out = out.replace(/(^|\s)@([\w./-]+\.\w+)/g, (all, sp: string, p: string) => {
    const t = readFile(p);
    return t === undefined ? all : `${sp}<file path="${p}">\n${t.slice(0, 40_000)}\n</file>`;
  });
  if (args && !/\$ARGUMENTS|\$\d/.test(body)) out += `\n\nArguments : ${args}`;
  return out;
}

/** The app's own commands (texts written for the Workbench; Claude Code's built-in /init, /review… have equivalents). */
export const BUILTIN_COMMANDS: { cmd: string; desc: string; prompt?: string }[] = [
  { cmd: '/help', desc: 'Liste des commandes, compétences et réglages du harness' },
  { cmd: '/clear', desc: 'Nouvelle session' },
  { cmd: '/plan', desc: 'Basculer le mode Plan' },
  { cmd: '/mission', desc: 'Basculer le mode Mission autonome' },
  { cmd: '/fix', desc: 'Mission « Répare tout »' },
  { cmd: '/review', desc: 'Faire relire le travail par l’agent Relecteur' },
  { cmd: '/export', desc: 'Exporter la session (Markdown)' },
  { cmd: '/compact', desc: 'Résumer la conversation pour libérer le contexte' },
  { cmd: '/skills', desc: 'Compétences installées (recherche : /skills mot)' },
  { cmd: '/hooks', desc: 'Hooks actifs' },
  { cmd: '/permissions', desc: 'Règles de permission (allow / ask / deny)' },
  { cmd: '/memory', desc: 'Fichiers d’instructions lus à chaque tour (MASSAMBA.md, CLAUDE.md, AGENTS.md)' },
  { cmd: '/mcp', desc: 'Serveurs MCP et pont local' },
  {
    cmd: '/init',
    desc: 'Écrire MASSAMBA.md : la carte du projet pour les prochains tours',
    prompt:
      'Explore l’espace de travail (filesystem.list puis les fichiers clés) et écris MASSAMBA.md à la racine : objectif du projet, structure des dossiers, commandes utiles, conventions (langue, formats, style), points d’attention. Court, factuel, sans rien inventer.',
  },
  {
    cmd: '/security-review',
    desc: 'Revue de sécurité du travail de la session',
    prompt:
      'Fais une revue de sécurité de tout ce qui a été produit dans cette session : secrets exposés, injections (SQL, commandes, HTML), entrées non validées, dépendances risquées, données sensibles. Liste les problèmes par gravité avec le fichier, la ligne et le correctif précis.',
  },
  {
    cmd: '/simplify',
    desc: 'Simplifier le code produit sans changer son comportement',
    prompt:
      'Relis le code produit dans cette session et simplifie-le sans changer son comportement : doublons, détours, noms obscurs, code mort. Applique les corrections puis vérifie (exécution ou relecture).',
  },
  {
    cmd: '/rea',
    desc: 'Rétro-ingénierie REA d’un fichier de l’espace (preuves, observé / déduit / inconnu)',
    prompt:
      'Applique la compétence rea-d-abord : démonte le fichier indiqué avec rea.inspect (ou les outils mcp.rea.* si le pont local est branché), puis réponds à partir des preuves en séparant observé, déduit et inconnu, avec l’identifiant de preuve.',
  },
];
