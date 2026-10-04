import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { resolveInside } from '../security/paths';
import { BadRequestError, NotFoundError } from './workspace';

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

async function listFiles(dir: string, base = dir, out: string[] = [], depth = 0): Promise<string[]> {
  if (depth > 4 || out.length > 200) return out;
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '__pycache__') continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) await listFiles(abs, base, out, depth + 1);
    else out.push(path.relative(base, abs).split(path.sep).join('/'));
  }
  return out;
}

/**
 * Skills (SKILL.md folders, Claude-compatible) and custom agents (markdown
 * with frontmatter, Claude Code-compatible). Sources, by priority:
 * data/skills (imported, private) > ./skills (workbench) > ~/.claude/skills.
 */
export class SkillRegistry {
  private skills = new Map<string, Skill>();
  private agents = new Map<string, CustomAgent>();
  private scannedAt = 0;
  readonly importDir: string;
  readonly agentsDir: string;

  constructor(
    private readonly opts: { dataDir: string; cwd: string; extraDirs: string[]; includeClaudeHome: boolean },
  ) {
    this.importDir = path.join(opts.dataDir, 'skills');
    this.agentsDir = path.join(opts.dataDir, 'agents');
    fs.mkdirSync(this.importDir, { recursive: true });
    fs.mkdirSync(this.agentsDir, { recursive: true });
  }

  private sources(): { dir: string; source: SkillSource }[] {
    const list: { dir: string; source: SkillSource }[] = [
      { dir: this.importDir, source: 'imported' },
      { dir: path.join(this.opts.cwd, 'skills'), source: 'workbench' },
      ...this.opts.extraDirs.map((dir) => ({ dir, source: 'custom' as const })),
    ];
    if (this.opts.includeClaudeHome)
      list.push({ dir: path.join(os.homedir(), '.claude', 'skills'), source: 'claude' });
    return list;
  }

  async scan(force = false): Promise<void> {
    if (!force && Date.now() - this.scannedAt < 30_000) return;
    const skills = new Map<string, Skill>();
    const agents = new Map<string, CustomAgent>();
    for (const { dir, source } of this.sources()) {
      const found: string[] = [];
      const walk = async (d: string, depth: number) => {
        if (depth > 4) return;
        let entries: fs.Dirent[];
        try {
          entries = await fsp.readdir(d, { withFileTypes: true });
        } catch {
          return;
        }
        if (entries.some((e) => e.isFile() && e.name === 'SKILL.md')) {
          found.push(d);
          return;
        }
        for (const e of entries)
          if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
            await walk(path.join(d, e.name), depth + 1);
      };
      await walk(dir, 0);
      for (const skillDir of found) {
        try {
          const text = await fsp.readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
          const { meta } = parseFrontmatter(text);
          const name = String(meta.name ?? path.basename(skillDir)).trim();
          if (!name || skills.has(name)) continue;
          const description = String(meta.description ?? '')
            .replace(/\s+/g, ' ')
            .trim();
          const extra = Array.isArray(meta.triggers)
            ? (meta.triggers as unknown[]).map((t) => normalizeText(String(t)))
            : [];
          const files = (await listFiles(skillDir)).filter((f) => f !== 'SKILL.md');
          skills.set(name, {
            name,
            description,
            dir: skillDir,
            source,
            files,
            triggers: [...new Set([...extractTriggers(description, name), ...extra])],
            size: text.length,
          });
          // Agents bundled inside a skill (e.g. skill-creator/agents/grader.md)
          for (const f of files.filter((x) => /^agents\/[^/]+\.md$/.test(x))) {
            const agent = await this.readAgent(
              path.join(skillDir, f),
              'skill',
              `${name}/${path.basename(f, '.md')}`,
              false,
            );
            if (agent && !agents.has(agent.id)) agents.set(agent.id, agent);
          }
        } catch {
          /* unreadable skill */
        }
      }
    }
    // Standalone agents: data/agents (editable), ./agents, ~/.claude/agents
    const agentDirs: { dir: string; source: SkillSource; editable: boolean }[] = [
      { dir: this.agentsDir, source: 'imported', editable: true },
      { dir: path.join(this.opts.cwd, 'agents'), source: 'workbench', editable: false },
    ];
    if (this.opts.includeClaudeHome)
      agentDirs.push({
        dir: path.join(os.homedir(), '.claude', 'agents'),
        source: 'claude',
        editable: false,
      });
    for (const { dir, source, editable } of agentDirs) {
      let entries: string[];
      try {
        entries = (await fsp.readdir(dir)).filter((f) => f.endsWith('.md'));
      } catch {
        continue;
      }
      for (const f of entries) {
        const agent = await this.readAgent(path.join(dir, f), source, null, editable);
        if (agent && !agents.has(agent.id)) agents.set(agent.id, agent);
      }
    }
    this.skills = skills;
    this.agents = agents;
    this.scannedAt = Date.now();
  }

  private async readAgent(
    file: string,
    source: CustomAgent['source'],
    forcedId: string | null,
    editable: boolean,
  ): Promise<CustomAgent | null> {
    try {
      const text = await fsp.readFile(file, 'utf8');
      const { meta, body } = parseFrontmatter(text);
      const name = String(meta.name ?? forcedId ?? path.basename(file, '.md')).trim();
      const id = forcedId ?? agentId(name);
      const firstPara =
        body
          .replace(/^#.*$/m, '')
          .trim()
          .split(/\n\s*\n/)[0] ?? '';
      const toList = (v: unknown): string[] | null =>
        Array.isArray(v)
          ? v.map(String)
          : typeof v === 'string' && v.trim()
            ? v.split(',').map((s) => s.trim())
            : null;
      return {
        id,
        name: forcedId ? (/^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? name) : name,
        description: String(meta.description ?? firstPara)
          .replace(/\s+/g, ' ')
          .slice(0, 400),
        prompt: body.trim(),
        tools: toList(meta.tools),
        model: meta.model ? String(meta.model) : null,
        effort: meta.effort ? String(meta.effort) : null,
        skills: toList(meta.skills) ?? [],
        source,
        file,
        editable,
      };
    } catch {
      return null;
    }
  }

  // ── skills ────────────────────────────────────────────────────────────
  async list(): Promise<Skill[]> {
    await this.scan();
    return [...this.skills.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(name: string): Promise<Skill> {
    await this.scan();
    const s = this.skills.get(name);
    if (!s) throw new NotFoundError(`Skill not found: ${name}`);
    return s;
  }

  async body(name: string): Promise<string> {
    const s = await this.get(name);
    return parseFrontmatter(await fsp.readFile(path.join(s.dir, 'SKILL.md'), 'utf8')).body.trim();
  }

  async readFile(name: string, rel: string): Promise<string> {
    const s = await this.get(name);
    const abs = resolveInside(s.dir, rel);
    const st = await fsp.stat(abs).catch(() => {
      throw new NotFoundError(`File not found in skill ${name}: ${rel}`);
    });
    if (st.size > 2_000_000) throw new BadRequestError('File too large');
    return fsp.readFile(abs, 'utf8');
  }

  /** Skills whose trigger phrases appear in the request, best first. */
  async match(text: string, disabled: string[] = []): Promise<SkillMatch[]> {
    await this.scan();
    const t = ` ${normalizeText(text)} `;
    const out: SkillMatch[] = [];
    for (const s of this.skills.values()) {
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

  /** Imports skills from a .zip / .skill archive or a single SKILL.md into data/skills. */
  async import(fileName: string, data: Buffer): Promise<string[]> {
    const imported: string[] = [];
    if (/\.md$/i.test(fileName)) {
      const { meta } = parseFrontmatter(data.toString('utf8'));
      const name = String(meta.name ?? path.basename(fileName, '.md')).replace(/[^\w.-]+/g, '-');
      if (!meta.description)
        throw new BadRequestError('SKILL.md must have a frontmatter with name and description');
      const dir = path.join(this.importDir, name);
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(path.join(dir, 'SKILL.md'), data);
      imported.push(name);
    } else {
      let files: Record<string, Uint8Array>;
      try {
        files = unzipSync(new Uint8Array(data));
      } catch {
        throw new BadRequestError('Archive invalide (attendu : .zip ou .skill)');
      }
      const skillRoots = Object.keys(files)
        .filter((f) => /(^|\/)SKILL\.md$/.test(f) && !f.startsWith('__MACOSX'))
        .map((f) => f.replace(/SKILL\.md$/, ''));
      if (!skillRoots.length) throw new BadRequestError('Aucun SKILL.md trouvé dans l’archive');
      for (const root of skillRoots) {
        const { meta } = parseFrontmatter(Buffer.from(files[`${root}SKILL.md`]!).toString('utf8'));
        const name = String(meta.name ?? (root.replace(/\/$/, '').split('/').pop() || 'skill')).replace(
          /[^\w.-]+/g,
          '-',
        );
        const dest = path.join(this.importDir, name);
        for (const [f, content] of Object.entries(files)) {
          if (!f.startsWith(root) || f.endsWith('/')) continue;
          const rel = f.slice(root.length);
          if (rel.includes('..')) continue;
          const target = path.join(dest, rel);
          await fsp.mkdir(path.dirname(target), { recursive: true });
          await fsp.writeFile(target, content);
        }
        imported.push(name);
      }
    }
    await this.scan(true);
    return imported;
  }

  async remove(name: string): Promise<void> {
    const s = await this.get(name);
    if (s.source !== 'imported')
      throw new BadRequestError('Seuls les skills importés peuvent être supprimés ici');
    await fsp.rm(s.dir, { recursive: true, force: true });
    await this.scan(true);
  }

  // ── agents ────────────────────────────────────────────────────────────
  async listAgents(): Promise<CustomAgent[]> {
    await this.scan();
    return [...this.agents.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getAgent(id: string): Promise<CustomAgent | undefined> {
    await this.scan();
    return this.agents.get(id);
  }

  async saveAgent(a: {
    id?: string;
    name: string;
    description: string;
    prompt: string;
    tools?: string[] | null;
    model?: string | null;
    effort?: string | null;
    skills?: string[];
  }): Promise<CustomAgent> {
    const id = agentId(a.id ?? a.name);
    if (!id) throw new BadRequestError('Nom d’agent invalide');
    const meta: Record<string, unknown> = { name: a.name, description: a.description };
    if (a.tools?.length) meta.tools = a.tools;
    if (a.model) meta.model = a.model;
    if (a.effort) meta.effort = a.effort;
    if (a.skills?.length) meta.skills = a.skills;
    const file = path.join(this.agentsDir, `${id}.md`);
    await fsp.writeFile(file, `---\n${stringifyYaml(meta).trim()}\n---\n\n${a.prompt.trim()}\n`);
    await this.scan(true);
    return (await this.getAgent(id))!;
  }

  async deleteAgent(id: string): Promise<void> {
    const a = await this.getAgent(id);
    if (!a) throw new NotFoundError('Agent introuvable');
    if (!a.editable) throw new BadRequestError('Cet agent est en lecture seule (fichier externe)');
    await fsp.rm(a.file, { force: true });
    await this.scan(true);
  }
}
