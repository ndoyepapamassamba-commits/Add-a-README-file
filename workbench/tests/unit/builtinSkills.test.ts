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
  it('carries the installed skills (lots 1 and 2) with French triggers, their MASSAMBA adaptation and their licence', () => {
    const names = all.map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'frontend-design',
        'video-prompting',
        'character-design',
        'blender-cinematic-scene',
        'video-storyboard',
        'video-director',
        'remotion-motion-graphics',
        'remotion-marketing-video',
        'remotion-best-practices',
        'cinema-skills',
        'cinema-shot-list',
        'frontend-visual-qa',
        'visual-regression',
        'excel-pro',
        'pptx-comex',
        'docx-editorial',
        'pdf-livrable',
        'documents-validation',
      ]),
    );
    expect(names).not.toContain('m365-verification');
    const fd = all.find((s) => s.name === 'frontend-design')!;
    expect(fd.category).toBe('Design');
    expect(fd.triggers).toEqual(expect.arrayContaining(['landing', 'interface', 'maquette', 'identite visuelle']));
    expect(fd.body).toMatch(/design lead at a design studio/);
    expect(fd.files['LICENSE.txt']).toMatch(/Apache License/);
    const vp = all.find((s) => s.name === 'video-prompting')!;
    expect(vp.category).toBe('Vidéo');
    expect(vp.triggers).toEqual(expect.arrayContaining(['grok', 'image vers video', 'prompt video']));
    expect(Object.keys(vp.files)).toEqual(expect.arrayContaining(['MASSAMBA.md', 'references/models/veo3/prompting.md']));
    expect(vp.files['MASSAMBA.md']).toMatch(/shapeVideoPrompt/);
    const rb = all.find((s) => s.name === 'remotion-best-practices')!;
    expect(Object.keys(rb.files).some((f) => f.startsWith('remotion-captions/'))).toBe(true);
    expect(Object.keys(rb.files).some((f) => f.startsWith('remotion-maps/'))).toBe(false);
    const xl = all.find((s) => s.name === 'excel-pro')!;
    expect(xl.category).toBe('Office');
    expect(xl.body).toMatch(/Formules vivantes/);
    // Every embedded file stays under the size cap (the app is a single HTML file).
    for (const s of all) for (const [f, t] of Object.entries(s.files)) expect(t.length, `${s.name}/${f}`).toBeLessThanOrEqual(150_000);
  });
});
