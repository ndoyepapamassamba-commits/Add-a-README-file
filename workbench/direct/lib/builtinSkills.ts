/**
 * BUILT-IN SKILLS of the single-file app: the project skills of `.claude/skills` (Claude format: SKILL.md + references)
 * embedded at build time, so the app that runs alone in the browser carries the same know-how as the agent in this
 * repository. Today: `apex-credit-risk` — the whole know-how of the APEX Credit Risk OS application (commitments,
 * arrears, doubtful loans, IFRS 9 / BCEAO compliance, capital and stress, premium exports), with its 12 reference
 * sheets and its codification referential. Installed once at startup; the user then keeps, turns off or deletes them
 * like any skill.
 */
import { extractTriggers, parseFrontmatter } from '../../server/services/skillsCore';
import type { SkillDef } from './types';

const RAW = import.meta.glob('../../../.claude/skills/apex-credit-risk/**/*.{md,json}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** The embedded skills, one per SKILL.md found (empty when the build had none). */
export function builtinSkills(): SkillDef[] {
  const out: SkillDef[] = [];
  for (const [path, md] of Object.entries(RAW)) {
    if (!/\/SKILL\.md$/.test(path)) continue;
    const dir = path.replace(/SKILL\.md$/, '');
    const { meta, body } = parseFrontmatter(md);
    const name = String(meta.name ?? dir.split('/').filter(Boolean).pop() ?? 'skill').trim();
    const description = String(meta.description ?? '').replace(/\s+/g, ' ').trim();
    if (!name || !description) continue;
    const files: Record<string, string> = {};
    for (const [q, text] of Object.entries(RAW)) if (q !== path && q.startsWith(dir)) files[q.slice(dir.length)] = text;
    const extra = Array.isArray(meta.triggers) ? (meta.triggers as unknown[]).map((t) => String(t).toLowerCase()) : [];
    out.push({ name, description, body: body.trim(), files, triggers: [...new Set([...extractTriggers(description, name), ...extra])], enabled: true, category: 'Métier' });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
