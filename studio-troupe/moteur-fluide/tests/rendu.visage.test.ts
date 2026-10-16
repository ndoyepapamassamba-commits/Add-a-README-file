/**
 * Déformation du visage au rendu (`rendu/visage`) : nulle au repos, mâchoire qui descend sans bouger les coins,
 * menton qui suit, cou qui s'éteint, regard (l'iris glisse, le contour reste), sourcils, recouvrements.
 * Ancrages du personnage de test MODOU (`assets-test/modou-test/rig.json`).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { visageNeutre } from '../src/timeline/neutres';
import type { AncresVisage, EtatVisage } from '../src/timeline/types';
import { champVisage, deplacementsVisage, estSousLevres, ouvertureMachoire, preparerVisage, recouvrementsVisage, visageAuRepos } from '../src/rendu/visage';

const source = JSON.parse(readFileSync(new URL('../assets-test/modou-test/rig.json', import.meta.url), 'utf8')) as { visage: AncresVisage };
const ancres = source.visage;

// Grille de points de repos autour du visage (pas de 4 px).
const points: number[] = [];
for (let y = 100; y < 420; y += 4) for (let x = 240; x < 480; x += 4) points.push(x, y);
const prep = preparerVisage(ancres, points);

function etat(partiel: Partial<EtatVisage>): EtatVisage {
  return { ...visageNeutre(), ...partiel };
}

describe('visage au rendu', () => {
  it('au repos : aucun déplacement', () => {
    const e = visageNeutre();
    expect(visageAuRepos(e)).toBe(true);
    const sortie = new Float32Array(2 * prep.sommets.length);
    deplacementsVisage(prep, e, points, sortie);
    expect(Math.max(...Array.from(sortie).map(Math.abs))).toBe(0);
    const r = recouvrementsVisage(prep, e);
    expect(r.zones.length + r.bandes.length).toBe(0);
  });

  it('bouche ouverte : la lèvre basse et le menton descendent, les coins restent, le cou s’éteint', () => {
    const e = etat({ ouvertureBouche: 0.8 });
    const D = ouvertureMachoire(prep, e);
    expect(D).toBeGreaterThan(15);
    const b = ancres.bouche;
    const sousCentre = champVisage(prep, e, { x: b.centre.x, y: b.centre.y + 2 }, 'bas');
    expect(sousCentre.y).toBeGreaterThan(0.9 * D);
    const surCentre = champVisage(prep, e, { x: b.centre.x, y: b.centre.y - 2 }, 'haut');
    expect(surCentre.y).toBeLessThan(0);
    expect(Math.abs(surCentre.y)).toBeLessThan(0.2 * D);
    for (const coin of [b.coinG, b.coinD]) {
      const d = champVisage(prep, e, { x: coin.x, y: coin.y + 1 }, 'bas');
      expect(Math.hypot(d.x, d.y)).toBeLessThan(0.15 * D);
    }
    const menton = champVisage(prep, e, b.menton!, 'bas');
    expect(menton.y).toBeGreaterThan(0.8 * D);
    const cou = champVisage(prep, e, { x: b.menton!.x, y: b.menton!.y + 2.2 * (b.menton!.y - b.centre.y) }, 'bas');
    expect(Math.abs(cou.y)).toBeLessThan(0.05 * D);
  });

  it('le champ est continu de chaque côté de la ligne des lèvres', () => {
    const e = etat({ ouvertureBouche: 0.7, sourire: 0.5 });
    let saut = 0;
    for (let k = 0; k < points.length / 2; k++) {
      const p = { x: points[2 * k]!, y: points[2 * k + 1]! };
      const q = { x: p.x + 0.25, y: p.y + 0.25 };
      if (estSousLevres(prep.bouche, p) !== estSousLevres(prep.bouche, q)) continue;
      const cote = estSousLevres(prep.bouche, p) ? 'bas' : 'haut';
      const a = champVisage(prep, e, p, cote);
      const c = champVisage(prep, e, q, cote);
      saut = Math.max(saut, Math.hypot(a.x - c.x, a.y - c.y));
    }
    expect(saut).toBeLessThan(1.5);
  });

  it('sourire : coins relevés, symétriques', () => {
    const e = etat({ sourire: 1 });
    const b = ancres.bouche;
    const g = champVisage(prep, e, b.coinG, 'haut');
    const d = champVisage(prep, e, b.coinD, 'haut');
    expect(g.y).toBeLessThan(-2);
    expect(d.y).toBeLessThan(-2);
    expect(g.y).toBeCloseTo(d.y, 1);
    expect(Math.sign(g.x)).toBe(-Math.sign(d.x) || Math.sign(g.x));
  });

  it('regard : l’iris glisse, le contour de l’œil reste', () => {
    const e = etat({ regard: { x: 1, y: 0 } });
    const o = ancres.oeilG;
    const centre = champVisage(prep, e, o.centre, 'haut');
    expect(centre.x).toBeGreaterThan(0.3 * o.rayon.x);
    const bord = champVisage(prep, e, { x: o.centre.x, y: o.centre.y - o.rayon.y }, 'haut');
    expect(Math.abs(bord.x)).toBeLessThan(0.05 * o.rayon.x);
  });

  it('sourcils levés : le sourcil monte, l’œil bouge à peine', () => {
    const s = { hauteur: 1, froncement: 0, inclinaison: 0 };
    const e = etat({ sourcilG: s, sourcilD: s });
    const p = ancres.sourcilG.points[1]!;
    expect(champVisage(prep, e, p, 'haut').y).toBeLessThan(-5);
    const oeil = champVisage(prep, e, ancres.oeilG.centre, 'haut');
    expect(Math.abs(oeil.y)).toBeLessThan(1);
  });

  it('recouvrements : intérieur, dents, lèvres quand la bouche s’ouvre ; paupières quand l’œil se ferme', () => {
    const r = recouvrementsVisage(prep, etat({ ouvertureBouche: 0.7, paupiereG: 1 }));
    const noms = [...r.zones.map((z) => z.nom), ...r.bandes.map((b) => b.nom)];
    expect(noms).toContain('interieur');
    expect(noms).toContain('dents');
    expect(noms).toContain('levreHaute');
    expect(noms).toContain('levreBasse');
    expect(noms).toContain('paupiereG');
    expect(noms).not.toContain('paupiereD');
    // L'intérieur s'étend entre la lèvre haute et la lèvre basse.
    const int = r.zones.find((z) => z.nom === 'interieur')!;
    const n = int.positions.length / 4;
    const milieu = Math.floor(n / 2);
    const yHaut = int.positions[2 * milieu + 1]!;
    const yBas = int.positions[2 * (n + milieu) + 1]!;
    expect(yBas - yHaut).toBeGreaterThan(10);
    // Paupière fermée : la ligne des cils descend jusqu'à la paupière basse.
    const pau = r.bandes.find((b) => b.nom === 'paupiereG')!;
    const k = pau.positions.length / 2 / 4;
    const cils = pau.positions[2 * (2 * k + Math.floor(k / 2)) + 1]!;
    expect(cils).toBeGreaterThan(ancres.oeilG.centre.y + 0.5 * ancres.oeilG.rayon.y);
    // Les alphas des bandes sont dans [0, 1] et les indices valides.
    for (const b of r.bandes) {
      expect(Math.min(...b.alphas)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...b.alphas)).toBeLessThanOrEqual(1);
      expect(Math.max(...b.indices)).toBeLessThan(b.positions.length / 2);
    }
  });
});
