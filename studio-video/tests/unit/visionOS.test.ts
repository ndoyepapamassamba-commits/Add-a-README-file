// Vision OS, étapes 1 et 2 : directeur artistique (juge + amélioration) et pipeline vidéo (contrôle qualité avant le
// montage). Venu de Workbench le 16/10/2026 (les étapes 3 et 4 y restent).
import { describe, expect, it } from 'vitest';
import { artQuality, artVerdict, enhanceInstruction, judgePrompt, parseJudgement, regenerateHint } from '../../coeur/studio/artJudge';
import { PIPELINE, PIPE_LABEL } from '../../coeur/studio/director';

describe('ÉTAPE 1 — directeur artistique (juge + amélioration)', () => {
  const good = parseJudgement('{"scores":{"face":9,"anatomy":8,"detail":8,"lighting":8,"composition":9,"style":9,"coherence":9,"artifacts":10},"issues":[]}')!;
  const eyes = parseJudgement('{"scores":{"face":4,"anatomy":5,"detail":6,"lighting":7,"composition":9,"style":8,"coherence":8,"artifacts":9},"issues":[{"criterion":"face","note":"left eye smaller"},{"criterion":"anatomy","note":"six fingers"}]}')!;
  const offshot = parseJudgement('{"scores":{"face":8,"anatomy":8,"detail":8,"lighting":8,"composition":3,"style":8,"coherence":4,"artifacts":9},"issues":[{"criterion":"composition","note":"comic page with 4 panels"}]}')!;
  it('accept / enhance / regenerate from the rubric', () => {
    expect(artVerdict(good)).toBe('accept');
    expect(artVerdict(eyes)).toBe('enhance');
    expect(artVerdict(offshot)).toBe('regenerate');
  });
  it('the enhancement keeps the shot and fixes only the defects; the redraw carries the notes', () => {
    const e = enhanceInstruction(eyes);
    expect(e).toMatch(/keep exactly the same composition/i);
    expect(e).toContain('left eye smaller');
    expect(e).toContain('five fingers');
    expect(regenerateHint(offshot)).toContain('comic page with 4 panels');
    expect(judgePrompt({ style: '3D', characters: 'AWA: red boubou', action: 'spills tea' })).toContain('AWA: red boubou');
  });
  it('no score without a real judgement (nothing invented)', () => {
    expect(parseJudgement('pas de JSON')).toBeNull();
    expect(parseJudgement('{"scores":{"face":9}}')).toBeNull();
    expect(artQuality(null)).toBeNull();
    expect(artQuality(good)).toBe(Math.round(good.overall * 10));
  });
});

describe('ÉTAPE 2 — pipeline vidéo : contrôle qualité avant le montage cinéma', () => {
  it('QA sits between animation and montage', () => {
    expect(PIPELINE.indexOf('QA')).toBe(PIPELINE.indexOf('ANIMATION') + 1);
    expect(PIPELINE.at(-1)).toBe('MONTAGE');
    expect(PIPE_LABEL.MONTAGE).toMatch(/CINÉMA/);
  });
});

