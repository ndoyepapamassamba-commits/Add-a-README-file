import { describe, expect, it } from 'vitest';
import { actingAt, actorFor, castFilm, colorIn, lookFromSheet, mouthShape, outfitOf, propFor, setOf, vrmVisemes } from '../../coeur/studio/actor/cast3d';
import { TROUPE } from '../../coeur/studio/actor/troupe';

describe('acteur 3D depuis la fiche personnage', () => {
  it('what the sheet says is used: colours, glasses, beard, build, age', () => {
    const a = lookFromSheet({ name: 'PATRON', age: '55 ans', gender: 'homme', skin: 'peau très foncée', hair: 'cheveux gris courts', body: 'corpulent, gros ventre', clothing: 'costume bleu marine, chemise blanche', accessories: 'lunettes, barbe grise' });
    expect(a.gender).toBe('m');
    expect(a.age).toBe('senior');
    expect(a.top).toBe('#1d2b53');
    expect(a.bottom).toBe('#1d2b53');
    expect(a.glasses).toBe(true);
    expect(a.beard).toBe(true);
    expect(a.belly).toBe(true);
    expect(a.build).toBeGreaterThan(1.2);
    expect(a.hair).toBe('#b9b6b0');
    expect(a.skin).toBe('#3a1d0e');
  });
  it('a woman in a yellow boubou with a red head-wrap; a child is small', () => {
    const w = lookFromSheet({ name: 'TANTIE ADJO', gender: 'femme', clothing: 'grand boubou jaune en wax', accessories: 'foulard rouge noué' });
    expect(w.gender).toBe('f');
    expect(w.dress).toBe(true);
    expect(w.pattern).toBe('wax');
    expect(w.top).toBe('#f2c12e');
    expect(w.hairStyle).toBe('foulard');
    expect(w.wrap).toBe('#c62828');
    expect(lookFromSheet({ name: 'PETIT KOFFI', age: '8 ans' }).height).toBeLessThan(0.7);
  });
  it('accents do not break the reading (élancé, rasé, chemise orangée)', () => {
    const a = lookFromSheet({ name: 'KOUASSI', body: 'grand et élancé', hair: 'crâne rasé', clothing: 'chemise orangée, pantalon kaki' });
    expect(a.build).toBeLessThan(1);
    expect(a.height).toBeGreaterThan(1);
    expect(a.hairStyle).toBe('chauve');
    expect(a.top).toBe('#ef7d1a');
    expect(a.bottom).toBe('#6b6b2a');
  });
  it('one garment per segment; shoes are not the shirt', () => {
    expect(outfitOf('t-shirt vert, jean bleu et baskets blanches')).toMatchObject({ top: '#2e8b57', bottom: '#2456b8', shoes: '#f2f0ea' });
    expect(colorIn('rien')).toBeNull();
  });
  it('what the sheet does not say is chosen ONCE from the name: same name → same actor', () => {
    expect({ ...lookFromSheet({ name: 'Frère (off)' }), name: '' }).toEqual({ ...lookFromSheet({ name: 'FRÈRE' }), name: '' });
    expect(lookFromSheet({ name: 'AYA' }).gender).toBe('f');
  });
});

describe('bibliothèque : riggé une fois, réutilisé dans chaque film', () => {
  it('a known actor keeps its look (even if the new sheet differs); a new one is added', () => {
    const lib = { KOFFI: { ...lookFromSheet({ name: 'KOFFI', clothing: 'chemise rouge' }), source: 'manuel' as const, films: 3 } };
    const r = castFilm([{ name: 'Koffi', clothing: 'chemise verte' }, { name: 'AYA' }, { name: 'aya' }], lib, 5);
    expect(r.cast.KOFFI!.top).toBe('#c62828');
    expect(r.reused).toEqual(['KOFFI']);
    expect(r.added.map((a) => a.key)).toEqual(['AYA']);
    expect(r.added[0]!.updatedAt).toBe(5);
    expect(actorFor(r.cast, 'Aya').key).toBe('AYA');
  });
});

describe('lip-sync et jeu', () => {
  it('mouth shapes: O is round, E is wide, M/B/P is closed; a shout opens wider', () => {
    expect(mouthShape('O').round).toBeGreaterThan(0.8);
    expect(mouthShape('E').wide).toBeGreaterThan(0.8);
    expect(mouthShape('MBP', 1).open).toBe(0);
    expect(mouthShape('AI', 0.5).open).toBeGreaterThan(mouthShape('AI', 0.05).open);
    const v = vrmVisemes(mouthShape('O', 0.4));
    expect(v.oh).toBeGreaterThan(v.aa);
    expect(vrmVisemes(mouthShape('AI', 0.4)).aa).toBeGreaterThan(0.5);
  });
  it('the speaker moves on the voice, the listener nods, a laugh throws the head back', () => {
    const still = actingAt({ t: 1, speaking: false, listening: false, energy: 0, beat: 0 });
    const talk = actingAt({ t: 1, speaking: true, listening: false, energy: 0.4, beat: 0.8 });
    expect(Math.abs(talk.headPitch)).toBeGreaterThan(Math.abs(still.headPitch));
    expect(talk.armR).toBeGreaterThan(0.3);
    const laugh = actingAt({ t: 1, speaking: true, listening: false, energy: 0.3, beat: 0, gesture: 'éclate de rire', lineAge: 1 });
    expect(laugh.laugh).toBe(1);
    expect(laugh.headPitch).toBeLessThan(0);
    // Never a frozen body: two instants differ even in silence.
    expect(actingAt({ t: 2, speaking: false, listening: false, energy: 0, beat: 0 })).not.toEqual(still);
  });
  it('procedural set of the location', () => {
    expect(setOf('Bureau open space').kind).toBe('bureau');
    expect(setOf('Marché d’Adjamé').kind).toBe('marché');
    expect(setOf('Cour de la concession').kind).toBe('cour');
    expect(setOf('').kind).toBe('neutre');
  });
});

import { shotAt } from '../../coeur/studio/actor/cast3d';
describe('découpage des plans', () => {
  const lines = [
    { speaker: 'TOGO', start: 0.4, end: 2 },
    { speaker: 'KOUASSI', start: 2.3, end: 4 },
    { speaker: 'TOGO', start: 4.3, end: 6 },
    { speaker: 'KOUASSI', start: 6.3, end: 8 },
  ];
  it('the exchange in a two-shot (long shots, like the owner’s sketches), punchline in close-up, then the reaction of the other one', () => {
    const names = ['TOGO', 'KOUASSI'];
    expect(shotAt(1, lines, names)).toEqual({ kind: 'two', who: 'TOGO' });
    expect(shotAt(3, lines, names)).toEqual({ kind: 'two', who: 'KOUASSI' });
    expect(shotAt(5, lines, names).kind).toBe('two');
    expect(shotAt(7, lines, names)).toEqual({ kind: 'close', who: 'KOUASSI' });
    expect(shotAt(9, lines, names)).toEqual({ kind: 'react', who: 'TOGO' });
    expect(shotAt(1, lines, ['TOGO']).kind).toBe('single');
  });
});

describe('troupe de la chaîne (bible des personnages + clip 041701)', () => {
  const look = (n: string) => lookFromSheet(TROUPE.find((c) => c.name === n)!);
  it('the tonton of the reference clip: lanky, pot belly, receding hairline, long face, a bottle in hand', () => {
    const t = look('LE TONTON');
    expect(t.shape).toBe('élancé');
    expect(t.belly).toBe(true);
    expect(t.hairStyle).toBe('dégarni');
    expect(t.face.chin).toBeGreaterThan(1.3);
    expect(t.face.lid).toBeGreaterThan(0.4);
    expect(t.sleeves).toBe('longues');
    expect(t.feet).toBe('chaussures');
    expect(t.prop).toBe('bouteille');
  });
  it('the neighbour: curvy, twists + red headband, sleeveless pink dress, flip-flops', () => {
    const v = look('LA VOISINE');
    expect(v.shape).toBe('courbes');
    expect(v.hairStyle).toBe('twists');
    expect(v.headband).toBe('#c62828');
    expect(v.dress).toBe(true);
    expect(v.sleeves).toBe('sans');
    expect(v.feet).toBe('tongs');
    expect(v.top).toBe('#e0559a');
  });
  it('the bible verbatim: royal-blue embroidered boubou, orange-and-yellow wax + head-wrap, floral shirt over a white vest', () => {
    const b = look('BAYE NDIAYE');
    expect(b.shape).toBe('rond');
    expect(b.pattern).toBe('brodé');
    expect(b.dress).toBe(true);
    expect(b.beads).toBe(true);
    expect(b.face.smile).toBeGreaterThan(0.3);
    const a = look('TANTIE AWA');
    expect(a.hairStyle).toBe('foulard');
    expect([a.top, a.accent]).toEqual(['#ef7d1a', '#f2c12e']);
    expect(a.face.angry).toBeGreaterThan(0.4);
    const d = look('TONTON DIENG');
    expect(d.pattern).toBe('fleurs');
    expect(d.inner).toBe('#f2f0ea');
    expect(d.cap?.kind).toBe('béret');
    expect(d.watch).toBe(true);
    const m = look('PETIT MAMADOU');
    expect(m.age).toBe('enfant');
    expect(m.pattern).toBe('maillot');
    expect(m.face.eyes).toBeGreaterThan(1.2);
    expect(look('COUMBA').face.raise).toBeGreaterThan(0.5);
  });
  it('the prop of the scene: the clause of the action that names the actor', () => {
    expect(propFor('KOFFI', 'KOFFI boit sa bouteille, ADJO lit le journal')).toBe('bouteille');
    expect(propFor('ADJO', 'KOFFI boit sa bouteille, ADJO lit le journal')).toBe('journal');
    expect(propFor('AYA', 'KOFFI boit', 'téléphone')).toBe('téléphone');
  });
  it('the chute: the listener jumps, eyes popping, then freezes looking at the camera; the other laughs leaning back', () => {
    const early = actingAt({ t: 3, speaking: false, listening: false, energy: 0, beat: 0, react: 'choc', reactAge: 0.15, toCamera: 0.6 });
    const frozen = actingAt({ t: 4, speaking: false, listening: false, energy: 0, beat: 0, react: 'choc', reactAge: 1.2, toCamera: 0.6 });
    expect(early.hop).toBeGreaterThan(0.03);
    expect(frozen.shock).toBe(1);
    expect(frozen.headYaw).toBeCloseTo(0.6, 5);
    expect(frozen.armL).toBeGreaterThan(1);
    const laugh = actingAt({ t: 4, speaking: false, listening: false, energy: 0, beat: 0, react: 'rire', reactAge: 1 });
    expect(laugh.laugh).toBe(1);
    expect(laugh.spinePitch).toBeLessThan(-0.1);
  });
  it('the sets of the sketches', () => {
    expect(setOf('cour de la maison')).toMatchObject({ surface: 'parpaings', outdoor: true });
    expect(setOf('village').props).toContain('case');
    expect(setOf('salon').props).toEqual(expect.arrayContaining(['télé', 'photos', 'canapé']));
    expect(setOf('mariage de Coumba').kind).toBe('cérémonie');
    expect(setOf('plage de Bassam').kind).toBe('plage');
  });
});

describe('découpage calibré sur les sketches du compte (~5 s par plan)', () => {
  it('a long scene: a close-up every third line only, the punchline in close-up', () => {
    const ls = Array.from({ length: 8 }, (_, i) => ({ speaker: i % 2 ? 'B' : 'A', start: i * 2.5, end: i * 2.5 + 2.2 }));
    const kinds = ls.map((l) => shotAt(l.start + 1, ls, ['A', 'B']).kind);
    expect(kinds).toEqual(['two', 'two', 'close', 'two', 'two', 'close', 'two', 'close']);
    // Shots of the scene: changes of kind/who over its 20 s stay near the measured rhythm (≤ 6 shots for 20 s).
    let shots = 0;
    let prev = '';
    for (let t = 0; t < 22; t += 0.1) {
      const s = shotAt(t, ls, ['A', 'B']);
      const k = `${s.kind}:${s.kind === 'two' ? '' : s.who}`;
      if (k !== prev) shots++;
      prev = k;
    }
    expect(shots).toBeLessThanOrEqual(7);
  });
});

