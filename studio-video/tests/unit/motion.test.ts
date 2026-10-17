import { describe, expect, it } from 'vitest';
import {
  cameraAt,
  castVoices,
  characterGender,
  voiceGender,
  voiceLang,
  fadeIn,
  moveFor,
  naturalSpeed,
  rmsEnvelope,
  speakerSide,
} from '../../coeur/studio/motion';

describe('2.5D motion engine', () => {
  it('every shot moves: the camera at the end differs from the start', () => {
    for (const m of ['push', 'pull', 'panL', 'panR', 'tiltUp', 'tiltDown', 'shake', 'drift'] as const) {
      const a = cameraAt(m, 0, { t: 0 });
      const b = cameraAt(m, 1, { t: 3 });
      expect(Math.abs(a.zoom - b.zoom) + Math.abs(a.dx - b.dx) + Math.abs(a.dy - b.dy)).toBeGreaterThan(0.02);
    }
  });
  it('the move follows the scene content and never repeats the previous one', () => {
    expect(moveFor({ action: 'Il crie de colère' }, 0)).toBe('shake');
    expect(moveFor({ camera: 'gros plan sur le visage' }, 3)).toBe('push');
    expect(moveFor({ camera: 'gros plan' }, 1, 'push')).not.toBe('push');
  });
  it('the camera punches in towards the speaker and breathes with the voice', () => {
    const quiet = cameraAt('drift', 0.5, { punch: 0, energy: 0, t: 1 });
    const talk = cameraAt('drift', 0.5, { punch: 1, side: 1, energy: 1, t: 1 });
    expect(talk.zoom).toBeGreaterThan(quiet.zoom + 0.08);
    expect(talk.dx).toBeLessThan(quiet.dx);
    expect(speakerSide(['AWA', 'MODOU'], 'modou')).toBe(1);
    expect(fadeIn(0.1)).toBeLessThan(1);
    expect(fadeIn(1)).toBe(1);
  });
  it('loudness envelope is normalised', () => {
    const s = new Float32Array(8000).map((_, i) => (i < 4000 ? 0.01 : 0.5) * Math.sin(i));
    const env = rmsEnvelope(s, 8000, 0.05);
    expect(Math.max(...env)).toBeCloseTo(1, 5);
    expect(env[0]!).toBeLessThan(0.1);
  });
});
describe('voice casting', () => {
  it('different characters get different, gender-coherent voices; speed stays natural', () => {
    const v = castVoices(
      [
        { id: '1', name: 'Awa', gender: 'femme' },
        { id: '2', name: 'Modou', gender: 'homme' },
        { id: '3', name: 'Fatou', gender: 'fille', age: '8 ans' },
      ],
      ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
    );
    expect(new Set(Object.values(v)).size).toBe(3);
    expect(['nova', 'shimmer']).toContain(v.AWA);
    expect(['onyx', 'echo']).toContain(v.MODOU);
    expect(naturalSpeed(1.6)).toBe(1.15);
    expect(naturalSpeed(undefined)).toBe(1);
  });
});
describe("voice casting on the real catalogue (v45: a woman's voice for a man)", () => {
  const ELEVEN = [
    'george',
    'sarah',
    'adam',
    'alice',
    'bella',
    'bill',
    'brian',
    'callum',
    'charlie',
    'chris',
    'daniel',
    'eric',
    'harry',
    'jessica',
    'laura',
    'liam',
    'lily',
    'matilda',
    'river',
    'roger',
    'will',
  ];
  it('ElevenLabs: KOFFI, ADJO and the PATRON (men) all get male voices; a woman gets a female one', () => {
    const v = castVoices(
      [
        { id: '1', name: 'KOFFI', gender: 'homme' },
        { id: '2', name: 'ADJO', gender: 'Homme' },
        { id: '3', name: 'PATRON', gender: '', role: 'le patron, chef de bureau' },
        { id: '4', name: 'AYA', gender: 'femme' },
      ],
      ELEVEN,
    );
    for (const n of ['KOFFI', 'ADJO', 'PATRON']) expect(voiceGender(v[n]!)).toBe('m');
    expect(voiceGender(v.AYA!)).toBe('f');
    expect(new Set(Object.values(v)).size).toBe(4);
  });
  it('a voice description saying « elle » no longer turns a man into a woman (gender field first)', () => {
    expect(characterGender({ gender: 'homme', voice: 'voix grave, elle monte quand il panique' })).toBe('m');
    expect(characterGender({ gender: '', voice: 'voix de vieille dame' })).toBe('f');
  });
  it('French voices first; every provider family is classified', () => {
    const mai = [
      'en-US-Grant:MAI-Voice-2.1',
      'fr-FR-Harper:MAI-Voice-2.1',
      'fr-FR-Marc:MAI-Voice-2.1',
      'fr-FR-Soleil:MAI-Voice-2.1',
    ];
    const v = castVoices(
      [
        { id: '1', name: 'KOFFI', gender: 'homme' },
        { id: '2', name: 'AWA', gender: 'femme' },
      ],
      mai,
      'fr',
    );
    expect(v.KOFFI).toBe('fr-FR-Marc:MAI-Voice-2.1');
    expect(['fr-FR-Harper:MAI-Voice-2.1', 'fr-FR-Soleil:MAI-Voice-2.1']).toContain(v.AWA);
    expect(voiceGender('ff_siwis')).toBe('f');
    expect(voiceGender('am_onyx')).toBe('m');
    expect(voiceGender('English_Upbeat_Woman')).toBe('f');
    expect(voiceGender('English_ManWithDeepVoice')).toBe('m');
    expect(voiceGender('Charon')).toBe('m');
    expect(voiceGender('Kore')).toBe('f');
    expect(voiceGender('fr_marie_happy')).toBe('f');
    expect(voiceGender('aura-2-hector-fr')).toBe('m');
    expect(voiceLang('aura-2-hector-fr')).toBe('fr');
    expect(voiceLang('ff_siwis')).toBe('fr');
  });
});
describe('3D', () => {
  it('3D shots get an orbit (roll + sweep) on top of the move', () => {
    const a = cameraAt('push', 0.9, { t: 1, dim3d: true });
    const b = cameraAt('push', 0.9, { t: 1 });
    expect(a.rot).not.toBe(b.rot);
    expect(a.zoom).toBeGreaterThan(b.zoom);
  });
});
