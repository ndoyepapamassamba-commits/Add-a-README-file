import { z } from 'zod';
import { JevQuestionSchema } from '../services/jev';
import { defineTool, ok, type AnyTool } from './types';

export const jevTools: AnyTool[] = [
  defineTool({
    name: 'jev.judge',
    description:
      'TypeSafe Jev (System One): fast, calibrated TYPED judgments instead of generated text. Ask several independent questions about the same state in one call (they run in parallel). Question types: "noul" = probability of yes (0..1) with optional criteria {true,false}; "choice" = one option from criteria map {option: description} (include a "none" option when nothing may fit) → choice + probabilities + confidence; "score" = position on ordered levels (criteria: array of 2-10 level descriptions) → score + confidence. Use for classification, routing, triage, verification of claims against evidence, relevance ranking, scoring many items consistently. Put source data in `state` (string or JSON) and reference nested fields with backticked paths like `ticket.text`.',
    schema: z.object({
      state: z.union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())]),
      questions: z.record(z.string(), JevQuestionSchema),
      model: z.string().default('jev-latest'),
    }),
    readOnly: true,
    assess: () => ({ risk: 'network' }),
    label: (a) => `Jev · ${Object.keys(a.questions).length} question(s)`,
    async execute(a, ctx) {
      const r = await ctx.services.jev.evaluate(a.state, a.questions, { model: a.model, signal: ctx.signal });
      const lines = Object.entries(r.answers).map(([id, ans]) => {
        if (ans.type === 'noul') return `${id}: noul=${ans.noul}`;
        if (ans.type === 'choice')
          return `${id}: choice=${ans.choice} (confidence ${ans.confidence}) probabilities=${JSON.stringify(ans.probabilities)}`;
        return `${id}: score=${ans.score} (confidence ${ans.confidence}) legend=${JSON.stringify(ans.legend)}`;
      });
      return ok(`${r.model} · ${lines.length} réponse(s)`, r, {
        forModel: `${r.model}\n${lines.join('\n')}\n(tokens: ${r.usage.input_tokens} in / ${r.usage.output_tokens} out)`,
      });
    },
  }),
];
