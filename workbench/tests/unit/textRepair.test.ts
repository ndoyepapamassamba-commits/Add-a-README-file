import { describe, expect, it } from 'vitest';
import { repairWordPerLine } from '../../direct/lib/textRepair';

describe('v48 — one word per paragraph (free model streaming)', () => {
  it('re-joins a sentence cut into one-word paragraphs', () => {
    const bad = 'The\n\n"Table\n\nau\n\nde\n\nbord\n\n"\n\nsheet\n\nis\n\nmissing\n\n.';
    expect(repairWordPerLine(bad)).toBe('The "Table au de bord" sheet is missing.');
  });
  it('leaves normal text, lists and code alone', () => {
    const ok = 'Premier paragraphe complet ici.\n\nDeuxième paragraphe tout aussi complet.';
    expect(repairWordPerLine(ok)).toBe(ok);
    const list = Array.from({ length: 10 }, (_, i) => `- point ${i}`).join('\n\n');
    expect(repairWordPerLine(list)).toBe(list);
    const code = '```\na\n\nb\n\nc\n\nd\n\ne\n\nf\n\ng\n\nh\n```';
    expect(repairWordPerLine(code)).toBe(code);
  });
});
