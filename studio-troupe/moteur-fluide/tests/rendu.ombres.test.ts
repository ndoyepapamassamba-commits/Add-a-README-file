import { describe, expect, it } from 'vitest';
import { composer, echelle as matEchelle, identite, translation } from '../src/noyau/maths2d';
import { ellipsesContact } from '../src/rendu/ombres';
import type { EtatOmbre } from '../src/timeline/types';

const ombre: EtatOmbre = { largeur: 0.1, aplatissement: 0.4, opacite: 0.6, flou: 6 } as EtatOmbre;
// Image 100 px de haut → monde 0,5 ; caméra 1000 px par unité monde.
const W0 = composer(translation(1, 0.9), composer(matEchelle(0.005, 0.005), translation(-50, -100)));
const camera = matEchelle(1000, 1000);
const repos: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 40, y: 100 }, { x: 60, y: 96 }];

describe('ombres de contact', () => {
  it('au repos : une ombre de corps et deux paires (douce + noyau) sous les semelles, chacune sur sa ligne de sol', () => {
    const e = ellipsesContact({ ombre, hauteurMonde: 0.5, piedsRepos: repos, piedsPose: repos, W: W0, W0, camera });
    expect(e.length).toBe(5);
    // Pied du fond (plus haut dans l'image) : ombre plus haute à l'écran que celle du pied avant.
    expect(e[3]!.centre.y).toBeLessThan(e[1]!.centre.y);
    for (const x of e) expect(x.alpha).toBeGreaterThan(0.25);
  });

  it('un pied levé pâlit, un saut ne déplace pas les ombres et les pâlit', () => {
    const leve: typeof repos = [{ x: 40, y: 88 }, repos[1]];
    const e = ellipsesContact({ ombre, hauteurMonde: 0.5, piedsRepos: repos, piedsPose: leve, W: W0, W0, camera });
    const r = ellipsesContact({ ombre, hauteurMonde: 0.5, piedsRepos: repos, piedsPose: repos, W: W0, W0, camera });
    expect(e[1]!.alpha).toBeLessThan(0.6 * r[1]!.alpha);
    expect(e[1]!.centre.y).toBeCloseTo(r[1]!.centre.y, 9);
    const saut = composer(translation(0, -0.1), W0);
    const s = ellipsesContact({ ombre, hauteurMonde: 0.5, piedsRepos: repos, piedsPose: repos, W: saut, W0, camera });
    expect(s[0]!.centre.y).toBeCloseTo(r[0]!.centre.y, 9);
    expect(s[0]!.alpha).toBeLessThan(r[0]!.alpha);
    expect(s[2]!.alpha).toBeLessThan(0.05);
  });

  it('opacité nulle : aucune ombre', () => {
    expect(ellipsesContact({ ombre: { ...ombre, opacite: 0 }, hauteurMonde: 0.5, piedsRepos: repos, piedsPose: repos, W: identite(), W0: identite(), camera })).toEqual([]);
  });
});
