// L'œil de JEV (Jev 1.14 lit les images) : questions typées, lecture des réponses, meilleure variante, appel, et la boucle
// de correction du bac à sable qui renvoie au modèle seulement ce que l'œil n'a pas VU.
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
} from '../../server/jev/eye';
import {
  eyeTargets,
  realizeWithCorrection,
  verdict,
  type RealizeRun,
} from '../../server/jev/realize/realize';

const els = [{ name: 'une maison rouge', where: 'à gauche' }, { name: 'un baobab' }];
const answers = (o: Record<string, unknown>) =>
  ({ answers: o, usage: { input_tokens: 1487 } }) as Parameters<typeof readEye>[0];

describe('œil de JEV — module pur', () => {
  it('taille : dans les limites de l’API (280–1568 px), jamais agrandie sans besoin', () => {
    expect(eyeSize(3000, 1500)).toEqual({ w: 1568, h: 784, scale: 1568 / 3000 });
    expect(eyeSize(800, 600).scale).toBe(1);
    const small = eyeSize(200, 100);
    expect(small.h).toBe(280);
    expect(small.w).toBe(560);
  });
  it('questions : un Noul par élément (avec sa place), un par circonstance, la finition en Score, Box en option', () => {
    const q = fidelityQuestions(els, ['en fin d’après-midi'], { boxes: true });
    expect(Object.keys(q).sort()).toEqual(['b0', 'b1', 'c0', 'e0', 'e1', 'finish']);
    expect(q.e0).toMatchObject({ type: 'noul' });
    expect((q.e0 as { instructions: string }).instructions).toContain('une maison rouge (à gauche)');
    expect(q.finish).toMatchObject({ type: 'score' });
    expect((q.finish as { criteria: string[] }).criteria).toHaveLength(4);
    expect(Object.keys(fidelityQuestions(els))).not.toContain('b0');
  });
  it('corps : modèle 1.14, image dans assets, référencée depuis state', () => {
    const b = eyeBody('QUJD', 'jpg', fidelityQuestions(els), 'img-test') as {
      model: string;
      state: Record<string, string>;
      assets: Record<string, { type: string; format: string; data_base64: string }>;
    };
    expect(b.model).toBe(EYE_MODEL);
    expect(b.state.render).toBe('img-test');
    expect(b.assets['img-test']).toEqual({ type: 'image', format: 'jpg', data_base64: 'QUJD' });
  });
  it('lecture : vu / pas vu au seuil 0,5, circonstances non rendues, fidélité moyenne, coût au prix publié', () => {
    const v = readEye(
      answers({
        e0: { noul: 0.96 },
        e1: { noul: 0.12 },
        c0: { noul: 0.3 },
        finish: { score: 1.08 },
        b0: { box: { top: 0.1, bottom: 0.5, left: 0, right: 0.4 } },
      }),
      els,
      ['en fin d’après-midi'],
    );
    expect(v.seen.map((x) => x.name)).toEqual(['une maison rouge']);
    expect(v.missing).toEqual([{ name: 'un baobab', p: 0.12 }]);
    expect(v.unmet).toEqual([{ text: 'en fin d’après-midi', p: 0.3 }]);
    expect(v.fidelity).toBeCloseTo(0.54, 5);
    expect(v.finish).toBe(1.08);
    expect(v.boxes['une maison rouge']).toBeDefined();
    expect(v.costUsd).toBeCloseTo((1487 * 0.042) / 1e6, 12);
  });
  it('problèmes : seulement ce que l’œil n’a pas vu, en français, avec la probabilité', () => {
    const v = readEye(answers({ e0: { noul: 0.96 }, e1: { noul: 0.12 }, c0: { noul: 0.3 } }), els, [
      'en fin d’après-midi',
    ]);
    const p = eyeProblems(v);
    expect(p).toHaveLength(2);
    expect(p[0]).toContain('« un baobab » (probabilité 0,12)');
    expect(p[1]).toContain('en fin d’après-midi');
    expect(eyeProblems(readEye(answers({ e0: { noul: 0.9 }, e1: { noul: 0.8 } }), els))).toEqual([]);
  });
  it('meilleure variante : la plus fidèle gagne, la finition départage', () => {
    const mk = (fidelity: number, finish: number, unmet = 0): EyeVerdict => ({
      seen: [],
      missing: [],
      unmet: Array(unmet).fill({ text: 'x', p: 0.1 }),
      finish,
      fidelity,
      boxes: {},
      tokens: 0,
      costUsd: 0,
    });
    const r = rankVariants([
      { id: 'a', verdict: mk(0.7, 3) },
      { id: 'b', verdict: mk(0.9, 1) },
      { id: 'c', verdict: mk(0.9, 2) },
      { id: 'd', verdict: mk(0.95, 2, 6) },
    ]);
    expect(r.map((x) => x.id)).toEqual(['c', 'b', 'a', 'd']);
  });
  it('appel : en-tête images, clé en Bearer, erreur HTTP levée', async () => {
    let seen: RequestInit | null = null;
    const ok = await callEye(
      { endpoint: 'https://x/v1', timeoutMs: 100 },
      'k',
      { a: 1 },
      async (_u, init) => ((seen = init), { ok: true, status: 200, json: async () => ({ answers: {} }) }),
    );
    const h = (seen as unknown as RequestInit).headers as Record<string, string>;
    expect(h['TypeSafe-Danger-Zone-Images']).toBe(EYE_HEADER['TypeSafe-Danger-Zone-Images']);
    expect(h.Authorization).toBe('Bearer k');
    expect(ok.raw).toEqual({ answers: {} });
    await expect(
      callEye({ endpoint: 'https://x/v1', timeoutMs: 100 }, null, {}, async () => ({
        ok: false,
        status: 413,
        json: async () => ({}),
      })),
    ).rejects.toThrow('413');
  });
});

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

import { sceneEyeTargets } from '../../server/jev/eye';
describe('œil de JEV — images de scène du studio', () => {
  it('les personnages par leur apparence (pas leur nom), le décor ; le moment et la lumière en circonstances', () => {
    const t = sceneEyeTargets(
      {
        location: 'marché de Treichville, étals de pagnes',
        time: 'fin d’après-midi',
        lighting: 'lumière chaude rasante',
        characters: ['koffi', 'AWA'],
      },
      [
        { name: 'KOFFI', gender: 'man', age: '35', clothing: 'yellow football jersey and jeans' },
        { name: 'AWA', gender: 'woman' },
      ],
    );
    expect(t.elements.map((e) => e.name)).toEqual([
      'man (35) wearing yellow football jersey and jeans',
      'woman',
      'the setting: marché de Treichville, étals de pagnes',
    ]);
    expect(t.circumstances).toEqual(['fin d’après-midi', 'lumière chaude rasante']);
    expect(sceneEyeTargets({ characters: ['X'] }, []).elements[0]!.name).toBe('a person');
  });
});
