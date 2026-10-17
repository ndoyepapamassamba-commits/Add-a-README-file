import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PROFILES,
  arcOf,
  RELATIONS,
  SITUATIONS,
  bibleFor,
  blenderCast,
  castBriefRich,
  missingProfiles,
  namesIn,
  profileOf,
  relationsBetween,
  sheetFields,
} from '../../coeur/studio/actor/characterBible';
import { UNIVERSE, UNIVERSE_SETS, universeCharacter } from '../../coeur/studio/actor/universe';
import { PLACES, placeBrief, placeFor, placeOf, worldJson } from '../../coeur/studio/world/livingWorld';
import { storyMessages } from '../../coeur/studio/story';
import { episodesOf } from '../../coeur/studio/tiktokComedy';

const BF = join(__dirname, '../../blender/film');

describe('BIBLE DES PERSONNAGES — base de connaissances permanente', () => {
  it('more than 50 characters, every universe character has a COMPLETE sheet', () => {
    expect(PROFILES.length).toBeGreaterThanOrEqual(50);
    expect(missingProfiles()).toEqual([]);
    expect(new Set(PROFILES.map((p) => p.name)).size).toBe(PROFILES.length);
    for (const p of PROFILES) {
      expect(universeCharacter(p.name), p.name).not.toBeNull();
      for (const k of ['apparence', 'tenue', 'posture', 'personnalite', 'moteur', 'activite'] as const)
        expect(p[k].length, `${p.name}.${k}`).toBeGreaterThan(8);
      expect(p.age, p.name).toMatch(/\d|cinquantaine|quarantaine|soixantaine/);
      expect(p.traits.length, p.name).toBeGreaterThanOrEqual(4);
      for (const k of [
        'habitudes',
        'emotions',
        'reactions',
        'interets',
        'forces',
        'faiblesses',
        'repliques',
      ] as const)
        expect(p[k].length, `${p.name}.${k}`).toBeGreaterThanOrEqual(3);
      for (const s of SITUATIONS) expect(p.situations[s]?.length, `${p.name} / ${s}`).toBeGreaterThan(8);
      expect(p.lieux.length, p.name).toBeGreaterThan(0);
      expect(['siwis', 'tom', 'gilles', 'jessica', 'pierre']).toContain(p.voix.piper);
    }
  });
  it('every sheet has its 2nd layer: facial expressions, mood, language, goals, narrative history (+ played episodes)', () => {
    for (const p of PROFILES) {
      const a = arcOf(p.name);
      expect(a, p.name).not.toBeNull();
      expect(a!.expressions.length, p.name).toBeGreaterThanOrEqual(3);
      expect(a!.objectifs.length, p.name).toBeGreaterThanOrEqual(2);
      expect(a!.historique.length, p.name).toBeGreaterThanOrEqual(2);
      expect(a!.humeur.length, p.name).toBeGreaterThan(10);
      expect(a!.langage.length, p.name).toBeGreaterThan(20);
    }
    expect(new Set(PROFILES.map((p) => arcOf(p.name)!.objectifs[0])).size).toBe(PROFILES.length);
    // The writer reads them, and the played episodes are the character's history.
    const b = bibleFor(['BAYE NDIAYE']);
    expect(b).toContain('Objectifs :');
    expect(b).toContain('Historique (à ne jamais contredire)');
    expect(episodesOf('PETIT MAMADOU').map((e) => e.id)).toEqual(expect.arrayContaining(['anniversaire']));
  });
  it('every identity is unique (comic engine, first line), heights fit the age, voices fit the gender', () => {
    expect(new Set(PROFILES.map((p) => p.moteur)).size).toBe(PROFILES.length);
    expect(new Set(PROFILES.map((p) => p.repliques[0])).size).toBe(PROFILES.length);
    for (const p of PROFILES) {
      const g = universeCharacter(p.name)!.gender;
      const years = Number(/(\d+)/.exec(universeCharacter(p.name)!.age ?? '')?.[1] ?? 30);
      if (years < 13) expect(p.taille, p.name).toBeLessThan(1.4);
      else expect(p.taille, p.name).toBeGreaterThan(1.5);
      if (g === 'femme' || g === 'fille') expect(['siwis', 'jessica'], p.name).toContain(p.voix.piper);
      if (g === 'homme') expect(['tom', 'gilles', 'pierre'], p.name).toContain(p.voix.piper);
    }
    // 39 drawn for Blender (7 sheets + 32 gallery figures), the rest catalogue / to draw.
    expect(PROFILES.filter((p) => p.dessin === 'planche')).toHaveLength(7);
    expect(PROFILES.filter((p) => p.dessin === 'galerie')).toHaveLength(32);
  });
  it('the relations graph only links known characters, and holds the family of the stories', () => {
    for (const r of RELATIONS) {
      expect(profileOf(r.a), r.a).not.toBeNull();
      expect(profileOf(r.b), r.b).not.toBeNull();
      expect(r.a).not.toBe(r.b);
    }
    const link = (a: string, b: string) => RELATIONS.find((r) => r.a === a && r.b === b)?.lien ?? '';
    expect(link('BAYE NDIAYE', 'MAMAN NOUNOU')).toMatch(/époux/);
    expect(link('MAMAN NOUNOU', 'COUMBA')).toMatch(/mère/);
    expect(link('BAYE NDIAYE', 'PETIT MAMADOU')).toMatch(/grand-père/);
    expect(link('PETIT MAMADOU', 'MODOU')).toMatch(/Tonton Modou/);
    expect(relationsBetween(['KOFFI', 'COUMBA', 'MODOU']).length).toBeGreaterThanOrEqual(3);
  });
  it('names in a text: longest first, a name inside a longer one counted once', () => {
    expect(namesIn('Tantie Awa Sarr sert Madame Coumba devant Coumba et Tantie Awa').sort()).toEqual([
      'COUMBA',
      'MADAME COUMBA',
      'TANTIE AWA',
      'TANTIE AWA SARR',
    ]);
    expect(namesIn('Le Patriarche et grand-père Ndiaye')).toEqual(
      expect.arrayContaining(['LE PATRIARCHE', 'GRAND-PÈRE NDIAYE']),
    );
    expect(namesIn('personne ici')).toEqual([]);
  });
  it('the writer gets every identity, and the FULL sheets + relations of the characters of the idea', () => {
    const cast = castBriefRich();
    for (const p of PROFILES) expect(cast).toContain(`- ${p.name} : `);
    const b = bibleFor(namesIn('Koffi veut épouser Coumba, Maman Nounou refuse'));
    expect(b).toContain('■ KOFFI');
    expect(b).toContain('■ COUMBA');
    expect(b).toContain('■ MAMAN NOUNOU');
    expect(b).toContain('LIENS ENTRE EUX');
    expect(b).toContain(profileOf('KOFFI')!.situations.argent);
    expect(bibleFor(['INCONNU'])).toBe('');
    const m = storyMessages({
      idea: 'Koffi au maquis',
      durationSec: 60,
      language: 'fr',
      platform: 'tiktok',
      characters: [],
      recurring: cast,
      bible: b,
      world: placeBrief('au maquis'),
    })[1]!.content;
    expect(m).toContain('FICHES DES PERSONNAGES');
    expect(m).toContain('LE LIEU EST VIVANT (Maquis)');
    expect(sheetFields('BOUBACAR')!.speakingStyle).toContain('On mange d’abord');
  });
  it('Blender reads the same knowledge: characters.json is blenderCast() + places and activities', () => {
    const file = JSON.parse(readFileSync(join(BF, 'characters.json'), 'utf8'));
    const cast = blenderCast();
    expect(Object.keys(file).sort()).toEqual(Object.keys(cast).sort());
    for (const p of PROFILES) {
      expect(file[p.name].height).toBe(p.taille);
      expect(file[p.name].voice).toBe(p.voix.piper);
      expect(file[p.name].lieux).toEqual(p.lieux);
    }
  });
});

describe('MONDE VIVANT — lieux, figurants, animaux, objets, ambiance', () => {
  it('maps every kind of place, and builds a new place for an unknown location', () => {
    const cases: [string, string][] = [
      ['à l’hôpital', 'hopital'],
      ['à la gare routière', 'gare'],
      ['à l’aéroport', 'aeroport'],
      ['au centre commercial', 'centre-commercial'],
      ['au parc', 'parc'],
      ['dans la chambre', 'chambre'],
      ['au restaurant', 'restaurant'],
      ['dans la rue', 'rue'],
      ['au salon de coiffure', 'salon-coiffure'],
      ['au maquis', 'maquis'],
      ['au village', 'village'],
      ['au bureau', 'bureau'],
      ['à l’école', 'ecole'],
    ];
    for (const [t, id] of cases) expect(placeOf(t)?.id, t).toBe(id);
    const n = placeFor('sur le chantier du stade');
    expect(n.template).toBe('rue');
    expect(n.exterieur).toBe(true);
    expect(placeFor('dans une bibliothèque').template).toBe('piece');
  });
  it('each place has objects to play with, extras, ambience — and its regulars exist in the character sheets', () => {
    const lieux = new Set(PROFILES.flatMap((p) => p.lieux));
    for (const p of PLACES) {
      expect(p.objets.length, p.id).toBeGreaterThanOrEqual(2);
      expect(p.fx.length, p.id).toBeGreaterThan(0);
      expect(p.sons.length, p.id).toBeGreaterThan(0);
      expect(
        p.habitues.some((h) => lieux.has(h)),
        p.id,
      ).toBe(true);
    }
    // Every place a character frequents is a set the engine knows.
    const known = new Set([...UNIVERSE_SETS.map((s) => s.name), ...PLACES.map((p) => p.nom)]);
    for (const l of lieux) expect(known.has(l), l).toBe(true);
    // Animals where they belong: farm animals in the village, none in the hospital.
    expect(placeOf('village')!.animaux.map((a) => a.espece)).toEqual(
      expect.arrayContaining(['poule', 'chevre']),
    );
    expect(placeOf('hôpital')!.animaux).toEqual([]);
  });
  it('the writer is told what the place holds', () => {
    const b = placeBrief('Le crédit, à la banque');
    expect(b).toContain('LE LIEU EST VIVANT (Bureau)');
    expect(b).toMatch(/Objets à utiliser/);
    expect(placeBrief('nulle part')).toBe('');
  });
  it('world.json (read by Blender) is exactly the catalogue', () => {
    expect(JSON.parse(readFileSync(join(BF, 'world.json'), 'utf8'))).toEqual(
      JSON.parse(JSON.stringify(worldJson())),
    );
  });
  it('Blender planning (world.py): extras fit their role, the signature animal is there, lines bring their props', () => {
    let out: string;
    try {
      out = execFileSync('python3', ['-c', PY], { cwd: BF, encoding: 'utf8' });
    } catch (e) {
      if (/ENOENT/.test(String(e))) return; // no python on this machine
      throw e;
    }
    const life = JSON.parse(out);
    expect(life.place).toBe('village');
    expect(life.animals.some((a: { species: string }) => a.species === 'poule')).toBe(true);
    expect(life.props.map((p: { kind: string }) => p.kind)).toEqual(
      expect.arrayContaining(['gateau', 'ballon', 'orange']),
    );
    const chars = JSON.parse(readFileSync(join(BF, 'characters.json'), 'utf8'));
    for (const e of life.extras) {
      expect(['BAYE NDIAYE', 'PETIT MAMADOU', 'TANTIE AWA']).not.toContain(e.name);
      if (/femmes/.test(e.role)) expect(chars[e.name].genre).toBe('femme');
      if (/anciens/.test(e.role)) expect(chars[e.name].age).toBeGreaterThanOrEqual(55);
      if (/enfants/.test(e.role)) expect(['garçon', 'fille']).toContain(chars[e.name].genre);
    }
    // Deterministic: the same story gives the same world.
    expect(execFileSync('python3', ['-c', PY], { cwd: BF, encoding: 'utf8' })).toBe(out);
  });
});

const drawn = UNIVERSE.map((u) => u.name).filter((n) =>
  ['planche', 'galerie'].includes(profileOf(n)!.dessin),
);
const PY = `
import json, world
story = json.load(open('stories/anniversaire.json'))
timeline = [{'start': i * 3.0, 'speak0': i * 3.0 + 0.3, 'speak1': i * 3.0 + 2.5, 'end': i * 3.0 + 3.0} for i in range(len(story['beats']))]
rig = {'cast': {n: {'poses': []} for n in ${JSON.stringify(drawn)}}, 'decors': {'Village': {}}}
print(json.dumps(world.plan_life(story, timeline, ['BAYE NDIAYE', 'PETIT MAMADOU', 'TANTIE AWA'], rig, 25, 25 * 3 * len(story['beats']))))
`;
