import { z } from 'zod';
import { defineTool, ok, type AnyTool } from './types';

export const skillTools: AnyTool[] = [
  defineTool({
    name: 'skill.use',
    description:
      'Load a skill (expert instructions + workflow). MUST be called before working on a request that matches a skill listed in the system prompt. After loading, follow the skill instructions strictly.',
    schema: z.object({ name: z.string().min(1) }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: (a) => `Skill ${a.name}`,
    async execute(a, ctx) {
      const skill = await ctx.services.skills.get(a.name);
      const body = await ctx.services.skills.body(a.name);
      ctx.emit({ type: 'skills_activated', skills: [{ name: skill.name, reason: 'model' }] });
      const files = skill.files.length
        ? `\n\nSkill files (read with skill.read): ${skill.files.slice(0, 60).join(', ')}`
        : '';
      return ok(
        `${skill.name} chargé`,
        { name: skill.name, files: skill.files },
        {
          forModel: `<skill name="${skill.name}">\nMANDATORY: follow these instructions exactly for this task (workflow, questions to ask, output format, language). They override your default style; only safety rules and the permission system take precedence.\n\n${body}${files}\n</skill>`,
        },
      );
    },
  }),
  defineTool({
    name: 'skill.read',
    description: "Read a reference/template file bundled with a skill (e.g. 'references/glossaire.md').",
    schema: z.object({ name: z.string().min(1), path: z.string().min(1) }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: (a) => `Skill ${a.name}/${a.path}`,
    async execute(a, ctx) {
      const text = await ctx.services.skills.readFile(a.name, a.path);
      return ok(
        `${text.length} caractères`,
        { path: a.path },
        { forModel: text.length > 60_000 ? `${text.slice(0, 60_000)}\n…[truncated]` : text },
      );
    },
  }),
];
