import { describe, expect, it } from 'vitest';
import {
  GESTES,
  directStory,
  freeModels,
  parseDirections,
  rulesDirection,
  searchGesture,
  storyFromLines,
  systemPrompt,
  validateDirection,
  type Story,
} from '../../server/jev/studio/stageDirections';

// The directed story of film 6 (« Le marché des tomates »): the same cues as director.py (rules), the model for the gaps.
const STORY: Story = {
  title: 'Le marché des tomates',
  hook: 'Mille francs les tomates ?',
  cast: [
    { id: 'modou', name: 'MODOU', poses: ['neutre', 'accuse', 'choc', 'haussement', 'rire'] },
    { id: 'nounou', name: 'MAMAN NOUNOU', poses: ['neutre', 'accuse', 'choc', 'haussement', 'rire'] },
    { id: 'mamadou', name: 'PETIT MAMADOU', poses: ['neutre'], enter: 3 },
  ],
  beats: [
    { who: 'modou', text: 'Maman, ton tas de tomates là, c’est combien ?' },
    { who: 'nounou', text: 'Pour toi, mon fils ? Mille francs.', pose: 'rire', react: { modou: 'choc' } },
    { who: 'modou', text: 'Mille ?! Hier c’était cinq cents !', pose: 'choc' },
    { who: 'nounou', text: 'Je ne sais pas moi, bof.' },
    { who: 'modou', text: 'Maman, c’est du vol !' },
    { who: 'nounou', text: 'Moi, j’ai pris. Toi, tu pars.' },
  ],
  punch: { beat: 5 },
};

describe('Réalisateur (stageDirections.ts) — vocabulaire fermé, règles mesurables', () => {
  it('finds the gesture a line calls for: whole-word cues, the longest wins, nothing otherwise', () => {
    expect(searchGesture('Je ne sais pas moi, bof')).toBe('haussement');
    expect(searchGesture('Tu es un voleur !')).toBe('dispute');
    expect(searchGesture('Allô ? oui')).toBe('telephone');
    expect(searchGesture('Bonjour tantie')).toBe('salut_main');
    expect(searchGesture('la toiture de ta maison')).toBe('aucun'); // « toi » inside « toiture » never fires
    expect(searchGesture('Toi, tu pars.')).toBe('pointe');
    expect(searchGesture('rien')).toBe('aucun');
    expect(GESTES).toContain('aucun');
  });
  it('rules: the story pose implies its gesture, « ?! » argues, the punchline is explosive', () => {
    expect(rulesDirection(STORY.beats[1]!, 1, STORY)).toMatchObject({ geste: 'pointe', energie: 0.6, reactions: { modou: 'choc' } });
    expect(rulesDirection(STORY.beats[2]!, 2, STORY)).toMatchObject({ geste: 'dispute', energie: 0.8 });
    expect(rulesDirection(STORY.beats[4]!, 4, STORY)).toMatchObject({ geste: 'dispute', energie: 0.7 });
    expect(rulesDirection(STORY.beats[5]!, 5, STORY)).toMatchObject({ geste: 'pointe', energie: 0.9 });
    expect(rulesDirection(STORY.beats[0]!, 0, STORY)).toMatchObject({ geste: 'aucun', energie: 0.6, source: 'regles' });
  });
  it('validation: the model fills the gaps only, inside the vocabulary and the drawn poses of the people on stage', () => {
    const raw = { pose: 'accuse', geste: 'explique', energie: 0.95, camera: 'punch', reactions: { 'MAMAN NOUNOU': 'choc', 'PETIT MAMADOU': 'rire', MODOU: 'rire' } };
    const d = validateDirection(raw, STORY.beats[0]!, 0, STORY);
    expect(d.geste).toBe('explique'); // the rules found nothing: the model's gesture is taken
    expect(d.energie).toBe(0.95); // a flat line may be raised by the model
    expect(d.pose).toBe('accuse'); // a drawn pose of MODOU
    expect(d.camera).toBe('aucun'); // a punch is only accepted on the punchline
    expect(d.reactions).toEqual({ nounou: 'choc' }); // PETIT MAMADOU is not on stage yet; MODOU speaks
    expect(d.source).toBe('mixte');
    // A cue in the line wins over the model; a value outside the vocabulary is dropped.
    const d2 = validateDirection({ geste: 'danse', energie: 'x', pose: 'cheval', camera: 'zoom' }, STORY.beats[1]!, 1, STORY);
    expect(d2).toMatchObject({ geste: 'pointe', energie: 0.6, camera: 'aucun', source: 'regles' });
    expect(d2.pose).toBeUndefined();
    // A flat line (no question, no cry, not the punchline) gives the partner no reason to react: the model's reaction is dropped.
    const flat: Story = { ...STORY, beats: [{ who: 'modou', text: 'Je te donne trois cents. Dernier prix.' }], punch: undefined };
    expect(validateDirection({ reactions: { 'MAMAN NOUNOU': 'accuse' } }, flat.beats[0]!, 0, flat).reactions).toEqual({});
  });
  it('parses a JSON array wrapped in prose or a fence, and the directed story carries geste / energie / react / move', () => {
    expect(parseDirections('Voici :\n```json\n[{"geste":"rire"},{"geste":"pointe"}]\n```')).toHaveLength(2);
    expect(parseDirections('pas de json')).toEqual([]);
    const s = directStory(STORY, [{ geste: 'reflechit', energie: 0.7 }, {}, {}, {}, {}, { camera: 'punch', reactions: { MODOU: 'choc' } }]);
    expect(s.beats[0]).toMatchObject({ geste: 'reflechit', energie: 0.7 });
    expect(s.beats[3]).toMatchObject({ geste: 'haussement', energie: 0.6 });
    expect(s.beats[5]).toMatchObject({ geste: 'pointe', energie: 0.9, move: 'punch', react: { modou: 'choc' } });
    expect(s._director.backend).toBe('app:modele+regles');
    expect(directStory(STORY)._director.backend).toBe('app:regles');
  });
  it('« QUI : texte » lines become a story; the prompt lists only the vocabulary and the troupe’s poses', () => {
    const s = storyFromLines('Modou : Maman, c’est combien ?\nMaman Nounou : Mille francs.\n\nligne sans deux-points');
    expect(s.cast.map((c) => c.id)).toEqual(['modou', 'maman-nounou']);
    expect(s.beats).toHaveLength(2);
    const p = systemPrompt(STORY);
    expect(p).toContain('haussement');
    expect(p).toContain('PETIT MAMADOU : neutre');
    expect(p).not.toContain('bpy');
    expect(freeModels([{ id: 'google/gemma-4-31b-it:free' }, { id: 'google/veo-3.1-lite' }]).map((m) => m.id)).toEqual(['google/gemma-4-31b-it:free']);
  });
});
