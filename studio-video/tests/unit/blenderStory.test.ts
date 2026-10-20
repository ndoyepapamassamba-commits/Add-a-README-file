import { describe, expect, it } from 'vitest';
import { newBlueprint } from '../../coeur/studio/blueprint';
import { poseOfEmotion, storyFromBlueprint } from '../../coeur/studio/blenderStory';
import type { Blueprint, DialogueLine, Scene } from '../../coeur/studio/types';

const line = (speaker: string, text: string, emotion = ''): DialogueLine => ({
  speaker,
  text,
  emotion,
  language: 'fr',
  intensity: 0.6,
  pace: 1,
  pauseAfterMs: 200,
});
const scene = (id: string, beat: string, location: string, dialogue: DialogueLine[]): Scene =>
  ({
    scene_id: id,
    act: '1',
    beat,
    duration: 10,
    location,
    time: 'soir',
    characters: [...new Set(dialogue.map((d) => d.speaker))],
    action: '',
    dialogue,
    emotion: '',
    camera: '',
    lighting: '',
    sound: '',
    music: '',
    transition: 'cut',
    visual_prompt: '',
    video_prompt: '',
    voice_prompt: '',
    subtitle_prompt: '',
    status: 'DRAFT',
  }) as Scene;
function bp(scenes: Scene[], title = 'Le poulet disparu'): Blueprint {
  const b = newBlueprint({ id: 't', idea: 'poulet', options: { music: true } });
  return {
    ...b,
    title,
    scenes,
    story: {
      title,
      logline: '',
      hook: 'Qui a mangé le poulet ? Toute la famille est suspecte.',
    } as Blueprint['story'],
  };
}

describe('HISTOIRE DE L’APP → FILM BLENDER', () => {
  it('the writer’s emotion becomes the pose of the sheet (FR / EN, accents, free wording)', () => {
    expect(poseOfEmotion('éclate de rire')).toBe('rire');
    expect(poseOfEmotion('shock')).toBe('choc');
    expect(poseOfEmotion('Colère froide')).toBe('accuse');
    expect(poseOfEmotion('gêné')).toBe('haussement');
    expect(poseOfEmotion('mauvaise foi totale')).toBe('haussement');
    expect(poseOfEmotion('calme')).toBe('neutre');
  });
  it('drawn characters act with the height and voice of their sheet; the punch is the last line of the « chute »', () => {
    const r = storyFromBlueprint(
      bp([
        scene('S1', 'hook', 'Dans le salon', [
          line('MAMAN NOUNOU', 'Qui a mangé mon poulet ?', 'colère'),
          line('BAYE NDIAYE', 'Moi ? Jamais de la vie.', 'innocent'),
        ]),
        scene('S2', 'chute', 'Dans le salon', [
          line('MAMAN NOUNOU', 'Et la sauce sur ta barbe ?', 'accuse'),
          line('BAYE NDIAYE', 'C’est du parfum.', 'gêné'),
        ]),
        scene('S3', 'tag', 'Dans le salon', [line('MAMAN NOUNOU', 'Dehors !', 'colère')]),
      ]),
    );
    expect(r.problems).toEqual([]);
    const s = r.story as {
      decor: string;
      hook: string;
      cast: { name: string; height: number; voice: string; x: number }[];
      beats: { who: string; pose: string; react?: Record<string, string> }[];
      punch: { beat: number };
    };
    expect(s.decor).toBe('Salon');
    expect(s.hook).toBe('Qui a mangé le poulet ?');
    expect(s.cast.map((c) => c.name)).toEqual(['MAMAN NOUNOU', 'BAYE NDIAYE']);
    expect(s.cast.map((c) => c.x)).toEqual([-0.42, 0.42]);
    for (const c of s.cast) expect(['siwis', 'jessica', 'tom', 'gilles', 'pierre']).toContain(c.voice);
    expect(s.beats[0]!.pose).toBe('accuse');
    expect(s.beats[2]!.react).toBeDefined(); // the one accused reacts with the shock
    expect(s.punch.beat).toBe(3);
  });
  it('an invented character or one not drawn yet is reported, never silently replaced', () => {
    const r = storyFromBlueprint(
      bp([
        scene('S1', 'hook', 'Au salon', [
          line('MAMAN NOUNOU', 'Bonjour.'),
          line('ZORGLUB', 'Salut.'),
          line('MADAME KONAN', 'Bonsoir.'),
        ]),
      ]),
    );
    expect(r.problems.join('\n')).toMatch(/ZORGLUB.*inventé/);
    expect(r.problems.join('\n')).toMatch(/MADAME KONAN.*pas encore dessiné/);
  });
  it('a place without a painted set is built by Blender (living world), and an empty story is refused', () => {
    const h = storyFromBlueprint(
      bp([scene('S1', 'hook', 'À l’hôpital', [line('MAMAN NOUNOU', 'Docteur !')])]),
    );
    expect((h.story as { decor: string }).decor).toBe('Hôpital'); // painted set of the kit
    expect(h.notes).toEqual([]);
    const r = storyFromBlueprint(
      bp([scene('S1', 'hook', 'Au parc', [line('MAMAN NOUNOU', 'Mamadou, viens ici !')])]),
    );
    expect((r.story as { decor: string }).decor).toBe('Parc');
    expect(r.notes.join(' ')).toMatch(/Blender construit/);
    // A painted set the user's kit does not hold → the living place instead.
    expect(
      (
        storyFromBlueprint(bp([scene('S1', 'hook', 'À l’hôpital', [line('MAMAN NOUNOU', 'Docteur !')])]), {
          decors: ['Salon'],
        }).story as { decor: string }
      ).decor,
    ).toBe('Hôpital');
    expect(storyFromBlueprint(bp([])).problems).toEqual(['aucune réplique à tourner']);
  });
});
