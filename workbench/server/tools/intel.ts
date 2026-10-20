import { z } from 'zod';
import {
  buildGraph,
  queryGraph,
  rankInformation,
  simulateDecision,
  type DecisionInput,
} from '../agent/intelligence';
import { defineTool, ok, type AnyTool } from './types';

export const intelTools: AnyTool[] = [
  defineTool({
    name: 'decision.simulate',
    description:
      'Decision simulator + counterfactuals: compare options with an outcome formula under scenarios (optimistic / central / stress / failure by default, or yours with variable shocks and probabilities). Returns the table, expected value, worst case, critical variables and the change that would flip the decision.',
    schema: z.object({
      formula: z.string().min(1),
      goal: z.enum(['max', 'min']).optional(),
      options: z
        .array(z.object({ name: z.string(), vars: z.record(z.string(), z.number()) }))
        .min(1)
        .max(20),
      scenarios: z
        .array(
          z.object({
            name: z.string(),
            shocks: z.record(z.string(), z.number()),
            probability: z.number().optional(),
          }),
        )
        .max(12)
        .optional(),
    }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: () => 'Simulation de décision',
    async execute(a) {
      const out = simulateDecision(a as DecisionInput);
      return ok('simulation', undefined, { forModel: out });
    },
  }),
  defineTool({
    name: 'info.value',
    description:
      'Information value engine: rank missing information by expected value (impact on the decision × uncertainty) per unit of cost.',
    schema: z.object({
      items: z
        .array(
          z.object({ question: z.string(), impact: z.number(), uncertainty: z.number(), cost: z.number() }),
        )
        .min(1)
        .max(40),
    }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: () => 'Valeur de l’information',
    async execute(a) {
      return ok('classement', undefined, { forModel: rankInformation(a.items) });
    },
  }),
  defineTool({
    name: 'knowledge.query',
    description:
      'Personal knowledge graph: missions that read / wrote a file, models and agents used, outcomes, recorded decisions (why).',
    schema: z.object({ query: z.string().min(1) }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: (a) => `Graphe de connaissances : ${a.query}`,
    async execute(a, ctx) {
      const decisions = await ctx.services.workspace
        .readText(ctx.projectId, '.ai/DECISIONS.md')
        .catch(() => '');
      const g = buildGraph(ctx.services.brain.ledger, decisions, []);
      return ok(`${g.nodes.size} nœuds`, undefined, { forModel: queryGraph(g, a.query) });
    },
  }),
  defineTool({
    name: 'manual.add',
    description:
      "Add a durable rule to the user's Personal Operating Manual (applied to every future task): standard, preference, method, forbidden, favorite.",
    schema: z.object({
      kind: z.enum(['standard', 'preference', 'method', 'forbidden', 'favorite']),
      rule: z.string().min(3).max(400),
    }),
    readOnly: false,
    assess: () => ({ risk: 'read' }),
    label: (a) => `Manuel : ${a.rule.slice(0, 60)}`,
    async execute(a, ctx) {
      const added = ctx.services.brain.addRules([{ kind: a.kind, rule: a.rule, source: 'agent' }]);
      return ok(added.length ? 'règle ajoutée' : 'déjà présent', undefined, {
        forModel: added.length ? 'Rule added to the Personal Operating Manual.' : 'Rule already present.',
      });
    },
  }),
];
