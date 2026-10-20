import { describe, expect, it } from 'vitest';
import {
  BLOCKS,
  BLOCK_IDS,
  TEMPLATES,
  compile,
  docVars,
  estimateRunCost,
  extractVars,
  lintBlocks,
  lintPrompt,
  newDoc,
  parseImproved,
  promptJudgeState,
  snapshot,
} from '../../direct/lib/promptStudio';

describe('Prompt Studio — blocs, variables, compilation', () => {
  it('every template fills role, mission, deliverable and the house constraints; its variables are declared', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(5);
    for (const t of TEMPLATES) {
      expect(t.blocks.role).toBeTruthy();
      expect(t.blocks.mission).toBeTruthy();
      expect(t.blocks.deliverable).toBeTruthy();
      expect(t.blocks.constraints).toContain('Aucun chiffre inventé');
      const d = newDoc('x', t);
      for (const v of docVars(d)) expect(d.vars[v], `${t.id}: {{${v}}}`).toBeTruthy();
      expect(compile(d).missing).toEqual([]);
    }
  });
  it('compiles the filled blocks in order with their headings, substitutes variables and names the missing ones', () => {
    const d = newDoc('a');
    d.blocks.role = 'Analyste de {{banque}}.';
    d.blocks.mission = 'Dire qui porte les impayés de {{fichier}} au {{arrete}}.';
    d.vars = { banque: 'Banque Exemple', fichier: 'uploads/impayes.xlsx' };
    const c = compile(d);
    expect(c.text).toBe('## RÔLE\nAnalyste de Banque Exemple.\n\n## MISSION\nDire qui porte les impayés de uploads/impayes.xlsx au {{arrete}}.');
    expect(c.missing).toEqual(['arrete']);
    expect(c.blocksFilled).toBe(2);
    expect(c.tokens).toBe(Math.ceil(c.text.length / 3.6));
    expect(extractVars('{{a}} et {{ b }} et {{a}}')).toEqual(['a', 'b']);
    expect(BLOCKS.map((b) => b.id)).toEqual([...BLOCK_IDS]);
  });
});

describe('Prompt Studio — contrôle maison (appliqué par le code)', () => {
  it('a secret or an empty mission blocks the run; invented figures, missing data, missing deliverable are warned', () => {
    const d = newDoc('b');
    d.blocks.mission = 'Analyser le fichier xlsx des encours.';
    d.blocks.context = 'Clé API : sk-abcdefghijklmnopqrstuvwxyz';
    const l1 = lintPrompt(d);
    expect(l1.find((x) => x.code === 'secret')?.level).toBe('error');
    expect(lintBlocks(l1)).toBe(true);
    d.blocks.context = 'uploads/encours.xlsx, arrêté du 30/09/2026';
    const l2 = lintPrompt(d);
    expect(lintBlocks(l2)).toBe(false);
    expect(l2.map((x) => x.code)).toEqual(expect.arrayContaining(['invention', 'deliverable']));
    d.blocks.constraints = 'Aucun chiffre inventé.';
    d.blocks.deliverable = 'report.export docx au thème « extraordinaire »';
    d.blocks.output = 'Thèse puis fichiers.';
    const l3 = lintPrompt(d);
    expect(l3.map((x) => x.code)).not.toContain('invention');
    expect(l3.map((x) => x.code)).not.toContain('theme');
    expect(lintPrompt(newDoc('c')).find((x) => x.code === 'mission')?.level).toBe('error');
    const t = newDoc('t', TEMPLATES[0]);
    expect(lintPrompt(t).filter((x) => x.level !== 'info')).toEqual([]);
  });
  it('the JEV state carries the compiled prompt and the goal; the improvement answer is read and bounded to the blocks', () => {
    const d = newDoc('t', TEMPLATES[1]);
    const st = promptJudgeState(d);
    expect(String(st.prompt)).toContain('## MISSION');
    expect(String(st.goal)).toBe(d.blocks.mission.slice(0, 1000));
    const p = parseImproved('```json\n{"blocks":{"role":"R","mission":"M","bogus":"x"},"changes":["rôle précisé"]}\n```');
    expect(p).toEqual({ blocks: { role: 'R', mission: 'M' }, changes: ['rôle précisé'] });
    expect(parseImproved('rien')).toBeNull();
    expect(parseImproved('{"blocks":{}}')).toBeNull();
  });
  it('versions: a snapshot only when the blocks changed, thirty at most; the cost estimate follows the listed prices', () => {
    let d = newDoc('v');
    d.blocks.mission = 'A';
    d = snapshot(d, 'un');
    d = snapshot(d, 'deux');
    expect(d.versions).toHaveLength(1);
    d.blocks = { ...d.blocks, mission: 'B' };
    d = snapshot(d);
    expect(d.versions).toHaveLength(2);
    for (let i = 0; i < 40; i++) {
      d.blocks = { ...d.blocks, mission: `M${i}` };
      d = snapshot(d);
    }
    expect(d.versions).toHaveLength(30);
    expect(estimateRunCost({ inputPrice: 1, outputPrice: 4 }, 1000, 500)).toBeCloseTo(0.003, 9);
    expect(estimateRunCost({ inputPrice: null, outputPrice: 4 }, 1000)).toBeNull();
    expect(estimateRunCost(undefined, 1000)).toBeNull();
  });
});
