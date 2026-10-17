import { describe, expect, it } from 'vitest';
import { IDEA_FAMILIES, IDEA_LIBRARY, ideaBrief, newsIdeasPrompt, parseIdeas } from '../../coeur/studio/ideas';
import { pool } from '../../navigateur/studio/filmAutopilot';

describe('BIBLIOTHÈQUE D’IDÉES (style @comedyvideos_100, actualité)', () => {
  it('has original sketches in every family, each with a setup, an escalation and a short punchline', () => {
    expect(IDEA_LIBRARY.length).toBeGreaterThanOrEqual(30);
    for (const f of IDEA_FAMILIES) expect(IDEA_LIBRARY.some((i) => i.family === f)).toBe(true);
    for (const i of IDEA_LIBRARY) {
      expect(i.setup.length).toBeGreaterThan(20);
      expect(i.punchline.length).toBeGreaterThan(5);
    }
    expect(new Set(IDEA_LIBRARY.map((i) => i.id)).size).toBe(IDEA_LIBRARY.length);
    expect(ideaBrief(IDEA_LIBRARY[0]!)).toMatch(/Chute/);
  });
  it('news → ideas: humour on everyday life only, parsed safely', () => {
    expect(newsIdeasPrompt(['Hausse du prix de l’attiéké'])).toMatch(/JAMAIS un drame/);
    const ideas = parseIdeas('{"ideas":[{"family":"Marché & maquis","title":"L’attiéké de luxe","setup":"Le prix de l’attiéké a doublé, la vendeuse le vend au gramme.","escalation":"…","punchline":"[sursaute] « Tu veux l’attiéké ou le crédit ? »"},{"title":"x"}]}', '2026-10-11');
    expect(ideas).toHaveLength(1);
    expect(ideas[0]!.source).toBe('actualité');
    expect(parseIdeas('rien')).toEqual([]);
  });
});
describe('PRODUCTION RAPIDE — pool parallèle', () => {
  it('runs at most n jobs at a time and does them all', async () => {
    let live = 0;
    let peak = 0;
    const done: number[] = [];
    await pool([1, 2, 3, 4, 5, 6, 7], 3, async (x) => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      done.push(x);
      live--;
    });
    expect(peak).toBe(3);
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
