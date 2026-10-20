// L'œil de JEV dans la boucle de correction du bac à sable « Réalisation » : seul ce que l'œil n'a pas VU revient au
// modèle (partie vidéo du test jevEye de Workbench, séparée le 16/10/2026).
import { describe, expect, it } from 'vitest';
import {
  EYE_HEADER,
  EYE_MODEL,
  callEye,
  eyeBody,
  eyeProblems,
  eyeSize,
  fidelityQuestions,
  rankVariants,
  readEye,
  type EyeVerdict,
} from '@workbench/server/jev/eye';
import {
  eyeTargets,
  realizeWithCorrection,
  verdict,
  type RealizeRun,
} from '../../coeur/realize/realize';

const els = [{ name: 'une maison rouge', where: 'à gauche' }, { name: 'un baobab' }];
const answers = (o: Record<string, unknown>) =>
  ({ answers: o, usage: { input_tokens: 1487 } }) as Parameters<typeof readEye>[0];

describe('œil de JEV — bac à sable', () => {
  const stats = { elements: 3, text: 0, canvases: 1, svgs: 0, ms: 5 };
  const runOf = (spec: string | null): RealizeRun => ({
    ...verdict([], [], stats, '<canvas></canvas>'),
    stats: { ...stats, libs: [], spec, declared: ['maison', 'baobab'] },
  });
  it('cibles : les éléments de la spec de la page (avec leur place), sinon ceux de la demande', () => {
    const t = eyeTargets(
      'Dessine une maison et un baobab au coucher du soleil',
      runOf(JSON.stringify({ elements: [{ name: 'maison', where: 'gauche' }, 'baobab'] })),
    );
    expect(t.elements).toEqual([
      { name: 'maison', where: 'gauche' },
      { name: 'baobab', where: undefined },
    ]);
    const u = eyeTargets('Dessine une maison et un baobab', runOf(null));
    expect(u.elements.map((e) => e.name).join(' | ')).toMatch(/maison.*baobab/);
  });
  it('boucle : ce que l’œil ne voit pas revient au modèle ; tout vu → fini ; œil indisponible → la boucle continue', async () => {
    const page = '```html\n<body><canvas></canvas></body>\n```';
    const run = async (): Promise<RealizeRun> => runOf(JSON.stringify({ elements: ['maison', 'baobab'] }));
    // 1) the eye misses the baobab on the first render, sees everything on the second
    const msgs: string[] = [];
    let look = 0;
    const r = await realizeWithCorrection({
      prompt: 'une maison et un baobab',
      kind: 'svg',
      generate: async (m) => (msgs.push(m.at(-1)!.content), page),
      run,
      see: async () => (look++ === 0 ? ['l’œil de JEV ne voit pas « baobab » (probabilité 0,12)'] : []),
    });
    expect(look).toBe(2);
    expect(r.ok).toBe(true);
    expect(r.rounds).toHaveLength(2);
    expect(msgs[1]).toContain('ne voit pas « baobab »');
    // 2) the eye cannot look (null) or throws → one round, ok
    for (const see of [async () => null, async () => Promise.reject(new Error('CORS'))]) {
      let n = 0;
      const r2 = await realizeWithCorrection({
        prompt: 'une maison',
        kind: 'svg',
        generate: async () => (n++, page),
        run,
        see,
      });
      expect(r2.ok).toBe(true);
      expect(n).toBe(1);
    }
  });
});

