import { describe, expect, it } from 'vitest';
import { VIDEO_3D } from '../../navigateur/features';
import { ECRANS } from '../../app/ecrans';

describe('Studio Vidéo : écrans et drapeaux', () => {
  it('la chaîne vidéo 3D Blender reste en retrait (VIDEO_3D) jusqu’à sa reprise', () => {
    expect(VIDEO_3D).toBe(false);
  });
  it('huit écrans : animer mon image (GPU distant, 17/10/2026), film, vidéo IA, réalisation, studio 3D, moteur de la troupe, monétisation (18/10/2026), réglages — chacun une seule fois', () => {
    expect(ECRANS.map((e) => e.label)).toEqual(['Animer mon image', 'Film Autopilot', 'Vidéo IA', 'Réalisation', 'Studio 3D', 'Moteur de la troupe', 'Monétisation', 'Réglages']);
    expect(new Set(ECRANS.map((e) => e.id)).size).toBe(ECRANS.length);
  });
});
