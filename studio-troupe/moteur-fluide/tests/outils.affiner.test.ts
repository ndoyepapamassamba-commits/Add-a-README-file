import { describe, expect, it } from 'vitest';
import { agrandirBicubique, alphaNet, facteurPixels, flouAlpha, imageVide, partBlocsIdentiques, reduireBoite, remplirSousAlpha } from '../src/outils/affiner/texture';

/** Image de test : dégradé opaque au centre, transparent autour. */
function dessin(L: number, H: number): ReturnType<typeof imageVide> {
  const img = imageVide(L, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < L; x++) {
      const i = 4 * (y * L + x);
      const dedans = x >= L / 4 && x < (3 * L) / 4 && y >= H / 4 && y < (3 * H) / 4;
      img.donnees.set([(x * 37) % 256, (y * 53) % 256, (x * y) % 256, dedans ? 255 : 0], i);
    }
  return img;
}

/** Agrandissement ×2 au plus proche voisin. */
function ppv2(img: ReturnType<typeof imageVide>): ReturnType<typeof imageVide> {
  const r = imageVide(img.largeur * 2, img.hauteur * 2);
  for (let y = 0; y < r.hauteur; y++)
    for (let x = 0; x < r.largeur; x++) {
      const s = 4 * ((y >> 1) * img.largeur + (x >> 1));
      r.donnees.set(img.donnees.subarray(s, s + 4), 4 * (y * r.largeur + x));
    }
  return r;
}

describe('affinage de texture', () => {
  it('détecte un dessin agrandi ×2 au plus proche voisin, pas un dessin natif', () => {
    const natif = dessin(40, 40);
    expect(partBlocsIdentiques(natif)).toBeLessThan(0.1);
    expect(facteurPixels(natif)).toBe(1);
    expect(facteurPixels(ppv2(natif))).toBe(2);
    // Le retour à la définition native redonne exactement le dessin.
    const retour = reduireBoite(ppv2(natif), 2);
    expect(Array.from(retour.donnees)).toEqual(Array.from(natif.donnees));
  });

  it('remplissage sous l’alpha : pixels opaques inchangés, couleur propagée sans noir au bord', () => {
    const img = imageVide(16, 16);
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) img.donnees.set([200, 120, 40, 255], 4 * (y * 16 + x));
    const r = remplirSousAlpha(img);
    expect(Array.from(r.donnees.subarray(4 * (8 * 16 + 8), 4 * (8 * 16 + 8) + 4))).toEqual([200, 120, 40, 255]);
    const coin = Array.from(r.donnees.subarray(0, 4));
    expect(coin[0]).toBeGreaterThan(150);
    expect(coin[3]).toBe(0);
  });

  it('bicubique : une couleur unie reste unie, l’alpha net reste dans [0, 1], le flou ne touche pas la couleur', () => {
    const img = imageVide(8, 8);
    for (let i = 0; i < 64; i++) img.donnees.set([90, 140, 210, i % 8 < 4 ? 255 : 0], 4 * i);
    const g = agrandirBicubique(img, 32, 32);
    for (let i = 0; i < 32 * 32; i++) {
      if (g.donnees[4 * i + 3]! < 30) continue;
      expect(Math.abs(g.donnees[4 * i]! - 90)).toBeLessThanOrEqual(1);
      expect(Math.abs(g.donnees[4 * i + 2]! - 210)).toBeLessThanOrEqual(1);
    }
    const n = alphaNet(flouAlpha(g, 2));
    for (let i = 0; i < 32 * 32; i++) {
      expect(n.donnees[4 * i]).toBe(g.donnees[4 * i]);
      expect(n.donnees[4 * i + 3]).toBeGreaterThanOrEqual(0);
      expect(n.donnees[4 * i + 3]).toBeLessThanOrEqual(255);
    }
  });
});
