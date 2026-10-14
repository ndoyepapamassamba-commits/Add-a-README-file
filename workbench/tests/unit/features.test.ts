import { describe, expect, it } from 'vitest';
import { VIDEO_3D } from '../../direct/lib/features';
import { NAV_ITEMS } from '../../direct/lib/nav';

describe('Drapeaux de fonctionnalités (lib/features.ts)', () => {
  it('la vidéo 3D est hors de l’app (sujet à part) : Studio 3D Pro quitte la navigation, rien n’est supprimé', () => {
    expect(VIDEO_3D).toBe(false);
    expect(NAV_ITEMS.some((n) => n.id === 'lab3d')).toBe(false);
    expect(NAV_ITEMS.some((n) => n.id === 'studio')).toBe(true); // the 2D film studio stays
  });
});
