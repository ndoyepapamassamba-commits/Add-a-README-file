/**
 * BUILT-IN SKILLS of the single-file app: the project skills of `.claude/skills` (Claude format: SKILL.md + references)
 * embedded at build time, so the app that runs alone in the browser carries the same know-how as the agent in this
 * repository. Today:
 * - `apex-credit-risk` — the whole know-how of the APEX Credit Risk OS application (commitments, arrears, doubtful
 *   loans, IFRS 9 / BCEAO compliance, capital and stress, premium exports), with its 12 reference sheets and its
 *   codification referential;
 * - `frontend-design` — Anthropic's skill for distinctive, intentional visual design of pages and interfaces (Apache
 *   2.0, LICENSE.txt bundled), with French triggers in its frontmatter; the agent follows it for every page / UI request
 *   and the design check of `frontendDesignLint` runs on every HTML page it writes while the skill is enabled.
 * Installed once at startup; the user then keeps, turns off or deletes them like any skill.
 */
import { extractTriggers, normalizeText, parseFrontmatter } from '../../server/services/skillsCore';
import type { SkillDef } from './types';

const RAW = import.meta.glob(
  [
    '../../../.claude/skills/*/SKILL.md',
    '../../../.claude/skills/*/MASSAMBA.md',
    '../../../.claude/skills/*/LICENSE*',
    '../../../.claude/skills/*/{references,data,examples,templates,skills,remotion-captions,remotion-create,remotion-render,remotion-multimedia,remotion-studio,remotion-docs,remotion-markup,remotion-interactivity}/**/*.{md,json,txt,csv}',
    '!../../../.claude/skills/m365-verification/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
/** Container-only skills (need .NET / LibreOffice): not embedded. */
const SKIP = new Set(['m365-verification']);
const MAX_FILE = 150_000;

/** The embedded skills, one per SKILL.md found (empty when the build had none). */
export function builtinSkills(): SkillDef[] {
  const out: SkillDef[] = [];
  for (const [path, md] of Object.entries(RAW)) {
    if (!/\/SKILL\.md$/.test(path)) continue;
    const dir = path.replace(/SKILL\.md$/, '');
    const { meta, body } = parseFrontmatter(md);
    const name = String(meta.name ?? dir.split('/').filter(Boolean).pop() ?? 'skill').trim();
    const description = String(meta.description ?? '').replace(/\s+/g, ' ').trim();
    if (!name || !description || SKIP.has(name)) continue;
    const files: Record<string, string> = {};
    for (const [q, text] of Object.entries(RAW)) if (q !== path && q.startsWith(dir) && text.length <= MAX_FILE) files[q.slice(dir.length)] = text;
    const extra = Array.isArray(meta.triggers) ? (meta.triggers as unknown[]).map((t) => normalizeText(String(t))) : [];
    const category = typeof meta.category === 'string' && meta.category.trim() ? meta.category.trim() : 'Métier';
    out.push({ name, description, body: body.trim(), files, triggers: [...new Set([...extractTriggers(description, name), ...extra])], enabled: true, category });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
