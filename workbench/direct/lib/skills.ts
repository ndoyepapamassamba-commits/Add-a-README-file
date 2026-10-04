import { strFromU8, unzipSync } from 'fflate';
import {
  agentId,
  extractTriggers,
  mapAgentTools,
  matchSkills,
  parseFrontmatter,
} from '../../server/services/skillsCore';
import type { AgentDef, EffortLike, SkillDef } from './skillTypes';

export { matchSkills };

function toSkill(md: string, fallbackName: string, files: Record<string, string> = {}): SkillDef {
  const { meta, body } = parseFrontmatter(md);
  const name = String(meta.name ?? fallbackName)
    .trim()
    .replace(/[^\w.-]+/g, '-');
  const description = String(meta.description ?? '').trim();
  if (!description)
    throw new Error(`${fallbackName} : le SKILL.md doit avoir un en-tête avec « name » et « description ».`);
  return {
    name,
    description,
    body: body.trim(),
    files,
    triggers: extractTriggers(description, name),
    enabled: true,
  };
}

/** Imports skills from SKILL.md, .zip or .skill files (Claude format). */
export async function importSkillFile(file: File): Promise<SkillDef[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.md$/i.test(file.name))
    return [toSkill(strFromU8(bytes), file.name.replace(/\.md$/i, '').replace(/^SKILL$/i, 'skill'))];
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error('Archive invalide (attendu : .zip ou .skill)');
  }
  const out: SkillDef[] = [];
  for (const [p, data] of Object.entries(entries)) {
    if (!/(^|\/)SKILL\.md$/i.test(p)) continue;
    const dir = p.replace(/SKILL\.md$/i, '');
    const files: Record<string, string> = {};
    for (const [q, d] of Object.entries(entries)) {
      if (q === p || !q.startsWith(dir) || q.endsWith('/') || d.length > 400_000) continue;
      const text = strFromU8(d);
      if (!text.includes('\u0000')) files[q.slice(dir.length)] = text;
    }
    out.push(toSkill(strFromU8(data), dir.split('/').filter(Boolean).pop() ?? file.name, files));
  }
  if (!out.length) throw new Error('Aucun SKILL.md trouvé dans l’archive');
  return out;
}

export const DIRECT_TOOLS = [
  'filesystem.list',
  'filesystem.read',
  'filesystem.search',
  'filesystem.write',
  'filesystem.edit',
  'filesystem.delete',
  'data.inspect',
  'data.query',
  'data.chart',
  'code.run',
  'web.search',
  'artifact.create',
  'plan.update',
  'skill.use',
  'skill.read',
  'agent.delegate',
];

/** Imports a Claude Code agent (.md with frontmatter). */
export async function importAgentFile(file: File): Promise<AgentDef> {
  const { meta, body } = parseFrontmatter(await file.text());
  const name = String(meta.name ?? file.name.replace(/\.md$/i, ''));
  const rawTools =
    meta.tools === undefined
      ? null
      : Array.isArray(meta.tools)
        ? meta.tools.map(String)
        : String(meta.tools).split(',');
  const known = new Set(DIRECT_TOOLS);
  const tools = rawTools
    ? mapAgentTools(rawTools, known).filter((t) => known.has(t) || t.startsWith('mcp.'))
    : null;
  const skills = Array.isArray(meta.skills)
    ? meta.skills.map(String)
    : meta.skills
      ? String(meta.skills)
          .split(',')
          .map((s) => s.trim())
      : [];
  return {
    id: agentId(name) || `agent-${Date.now()}`,
    name,
    description: String(meta.description ?? ''),
    prompt: body.trim(),
    tools,
    model: meta.model ? String(meta.model) : null,
    effort: (meta.effort ? String(meta.effort) : null) as EffortLike,
    skills,
  };
}

export { agentId };
