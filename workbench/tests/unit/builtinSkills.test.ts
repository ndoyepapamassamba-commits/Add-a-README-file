import { describe, expect, it } from 'vitest';
import { builtinSkills } from '../../direct/lib/builtinSkills';

describe('compétences embarquées dans l’application monofichier (.claude/skills)', () => {
  const all = builtinSkills();
  const apex = all.find((s) => s.name === 'apex-credit-risk')!;
  it('carries the APEX credit risk skill with its reference sheets and its codification referential', () => {
    expect(apex).toBeDefined();
    expect(apex.description).toMatch(/engagements/i);
    expect(apex.body).toMatch(/Table de routage/);
    const refs = Object.keys(apex.files).filter((f) => /^references\/\d\d-.*\.md$/.test(f));
    expect(refs.length).toBeGreaterThanOrEqual(12);
    expect(apex.files['references/04-douteux-recouvrement-pcb.md']).toMatch(/article 16|art\. 16/i);
    const codif = JSON.parse(apex.files['data/codification.json']!) as Record<string, unknown>;
    expect(Object.keys(codif)).toEqual(expect.arrayContaining(['sic', 'sec', 'prod', 'seg', 'ccy', 'dom', 'ag', 'pp']));
    // No client groups nor internal sector limits in the public referential.
    expect(codif).not.toHaveProperty('grp');
    expect(codif).not.toHaveProperty('seclim');
  });
  it('is triggered by the words of a credit request and enabled by default', () => {
    expect(apex.triggers).toEqual(expect.arrayContaining(['douteux', 'acte 7', 'bceao']));
    expect(apex.enabled).toBe(true);
    expect(apex.category).toBe('Métier');
  });
});
