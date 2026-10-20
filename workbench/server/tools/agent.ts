import { z } from 'zod';
import type { PlanStep } from '@shared/types';
import { defineTool, ok, ToolError, type AnyTool } from './types';

export const agentTools: AnyTool[] = [
  defineTool({
    name: 'plan.update',
    description:
      'Create/update your task checklist (shown live to the user). Use it for any task with 3+ steps: list all steps, keep exactly one "in_progress", mark steps "done" as soon as they are finished.',
    schema: z.object({
      steps: z
        .array(
          z.object({
            title: z.string().min(1).max(200),
            status: z.enum(['pending', 'in_progress', 'done', 'skipped']),
          }),
        )
        .min(1)
        .max(40),
    }),
    readOnly: false,
    assess: () => ({ risk: 'read' }),
    label: (a) => `Plan: ${a.steps.filter((s) => s.status === 'done').length}/${a.steps.length} done`,
    async execute(a, ctx) {
      const steps: PlanStep[] = a.steps.map((s, i) => ({
        id: String(i + 1),
        title: s.title,
        status: s.status,
      }));
      ctx.setPlan?.(steps);
      return ok(
        `${steps.filter((s) => s.status === 'done').length}/${steps.length}`,
        { steps },
        { forModel: 'Checklist updated.' },
      );
    },
  }),
  defineTool({
    name: 'plan.propose',
    description:
      'PLAN MODE ONLY: submit your execution plan for user approval after inspecting the project. Steps must be concrete and verifiable. Do not modify anything before approval.',
    schema: z.object({
      summary: z.string().min(1).max(3000),
      steps: z.array(z.string().min(1).max(300)).min(1).max(30),
    }),
    readOnly: false,
    assess: () => ({ risk: 'read' }),
    label: (a) => `Propose plan (${a.steps.length} steps)`,
    async execute(a, ctx) {
      if (!ctx.proposePlan) throw new ToolError('plan.propose is only available in plan mode');
      ctx.proposePlan(a.summary, a.steps);
      return ok(
        `${a.steps.length} steps proposed`,
        { steps: a.steps },
        { forModel: 'Plan submitted; waiting for the user decision.' },
      );
    },
  }),
  defineTool({
    name: 'agent.delegate',
    description:
      'Delegate a self-contained sub-task to a specialised sub-agent: built-in roles coder, researcher, browser, data_analyst, reviewer, tester, or a custom agent id listed in the system prompt. It works with its own tools and returns a summary. Give it complete context: it does not see this conversation. Use reviewer to double-check significant changes.',
    schema: z.object({ role: z.string().min(2).max(120), task: z.string().min(10).max(8000) }),
    readOnly: false,
    assess: () => ({ risk: 'read' }),
    label: (a) => `Delegate to ${a.role}`,
    async execute(a, ctx) {
      if (!ctx.delegate) throw new ToolError('Delegation is not available at this depth');
      const r = await ctx.delegate(a.role, a.task);
      return {
        ok: r.ok,
        summary: r.ok ? `${a.role} finished` : `${a.role} failed`,
        data: { childRunId: r.childRunId },
        forModel: `Sub-agent (${a.role}) report:\n${r.summary}`,
        error: r.ok ? undefined : 'sub-agent failed',
      };
    },
  }),
];
