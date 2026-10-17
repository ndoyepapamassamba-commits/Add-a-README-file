import { describe, expect, it } from 'vitest';
import { VIDEO_3D } from '../../navigateur/features';
import { ECRANS } from '../../app/ecrans';

describe('Studio Vidéo : écrans et drapeaux', () => {
  it('la chaîne vidéo 3D Blender reste en retrait (VIDEO_3D) jusqu’à sa reprise', () => {
    expect(VIDEO_3D).toBe(false);
  });
  it('six écrans : film, vidéo IA, réalisation, studio 3D, moteur de la troupe, réglages — chacun une seule fois', () => {
    expect(ECRANS.map((e) => e.label)).toEqual(['Film Autopilot', 'Vidéo IA', 'Réalisation', 'Studio 3D', 'Moteur de la troupe', 'Réglages']);
    expect(new Set(ECRANS.map((e) => e.id)).size).toBe(ECRANS.length);
  });
});
