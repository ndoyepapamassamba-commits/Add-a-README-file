import { describe, expect, it } from 'vitest';
import { UNIVERSE, UNIVERSE_SETS, castBrief, universeCharacter, universeSetOf } from '../../coeur/studio/actor/universe';
import { lookFromSheet } from '../../coeur/studio/actor/cast3d';
import { storyMessages } from '../../coeur/studio/story';

describe('univers de la chaîne', () => {
  it('every recurring character has a role and a verbatim visual description; names are unique', () => {
    expect(UNIVERSE.length).toBeGreaterThanOrEqual(35);
    expect(new Set(UNIVERSE.map((c) => c.name)).size).toBe(UNIVERSE.length);
    for (const c of UNIVERSE) {
      expect(c.role.length).toBeGreaterThan(4);
      expect(c.visual).toMatch(/West-African/);
    }
  });
  it('a name is found whatever its spelling; the set of a location is the channel’s', () => {
    expect(universeCharacter('Maman Nounou')?.visual).toContain('gingham apron');
    expect(universeCharacter('maitre coulibaly')?.role).toContain('avocate');
    expect(universeSetOf('Au maquis chez Yao')?.name).toBe('Maquis');
    expect(universeSetOf('salon de la famille')?.visual).toContain('teal walls');
    expect(universeSetOf('nulle part')).toBeNull();
    expect(UNIVERSE_SETS.length).toBeGreaterThanOrEqual(12);
  });
  it('the writer gets the recurring cast with their comic roles', () => {
    const m = storyMessages({ idea: 'Le prix du garba', durationSec: 40, language: 'fr', platform: 'tiktok', characters: [], recurring: castBrief() });
    const u = m[1]!.content;
    expect(u).toContain('DISTRIBUTION RÉCURRENTE');
    expect(u).toContain('- MAMAN NOUNOU : reine du marchandage');
    expect(u).toContain('- KOFFI : faux riche fauché');
  });
  it('the 3D / sheet actors of the universe read their descriptions (silhouette, outfit, prop)', () => {
    const koffi = lookFromSheet(universeCharacter('KOFFI')!);
    expect(koffi.gender).toBe('m');
    const boubacar = lookFromSheet(universeCharacter('BOUBACAR')!);
    expect(boubacar.shape).toBe('rond');
    expect(boubacar.prop).toBe('assiette');
    const khadija = lookFromSheet(universeCharacter('PETITE KHADIJA')!);
    expect(khadija.age).toBe('enfant');
    expect(khadija.gender).toBe('f');
  });
});

describe('décor adapté (créé par le moteur)', () => {
  it('an EMPTY vertical set of the place, nobody in it, floor in the lower part, the owner’s picture as reference', async () => {
    const { decorPrompt } = await import('../../coeur/studio/actor/universe');
    const p = decorPrompt('au marché de Treichville', true);
    expect(p.name).toBe('Marché');
    expect(p.text).toMatch(/EMPTY SET for a vertical 9:16/);
    expect(p.text).toMatch(/no people/);
    expect(p.text).toMatch(/floor visible in the lower fifth/);
    expect(p.text).toMatch(/reference picture/);
    expect(p.text).toMatch(/market/);
    const q = decorPrompt('sur le toit de la mosquée', false);
    expect(q.name).toBe('sur le toit de la mosquée');
    expect(q.text).not.toMatch(/reference picture/);
  });
});
