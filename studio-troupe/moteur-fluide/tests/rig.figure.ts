/**
 * Figure synthétique pour les tests du rig : silhouette humanoïde en pose A (capsules), bras écartés du torse,
 * jambes séparées, et ses articulations nommées. Pas un fichier de test (pas de suffixe `.test.ts`).
 */
import type { ImageRGBA } from '../src/rig/maillage';
import type { ArticulationsHumanoide } from '../src/rig/squelette';
import type { Vec2 } from '../src/timeline/types';

type Forme = (x: number, y: number) => number;

function capsule(a: Vec2, b: Vec2, r: number): Forme {
  return (x, y) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - a.x - t * dx, y - a.y - t * dy) - r;
  };
}

const L = 300;
const H = 600;
const mx = (p: Vec2): Vec2 => ({ x: L - p.x, y: p.y });

/** Articulations de la figure (côté G du personnage = droite de l'image). */
export const ARTICULATIONS_FIGURE: ArticulationsHumanoide = {
  bassin: { x: 150, y: 315 },
  taille: { x: 150, y: 285 },
  baseCou: { x: 150, y: 140 },
  baseTete: { x: 150, y: 105 },
  sommetTete: { x: 150, y: 30 },
  epauleD: { x: 108, y: 160 },
  coudeD: { x: 80, y: 250 },
  poignetD: { x: 70, y: 330 },
  boutMainD: { x: 66, y: 368 },
  epauleG: mx({ x: 108, y: 160 }),
  coudeG: mx({ x: 80, y: 250 }),
  poignetG: mx({ x: 70, y: 330 }),
  boutMainG: mx({ x: 66, y: 368 }),
  hancheD: { x: 128, y: 322 },
  genouD: { x: 122, y: 450 },
  chevilleD: { x: 118, y: 565 },
  boutPiedD: { x: 104, y: 590 },
  hancheG: mx({ x: 128, y: 322 }),
  genouG: mx({ x: 122, y: 450 }),
  chevilleG: mx({ x: 118, y: 565 }),
  boutPiedG: mx({ x: 104, y: 590 }),
};

/** Formes de la figure, chacune étiquetée par l'os qui la porte. */
export function formesFigure(): Array<[string, Forme]> {
  const a = ARTICULATIONS_FIGURE;
  const f: Array<[string, Forme]> = [
    ['tete', (x, y) => Math.hypot(x - 150, y - 68) - 40],
    ['cou', capsule({ x: 150, y: 100 }, { x: 150, y: 145 }, 12)],
    ['torse', capsule({ x: 150, y: 165 }, { x: 150, y: 285 }, 42)],
    ['bassin', capsule({ x: 128, y: 315 }, { x: 172, y: 315 }, 32)],
  ];
  for (const c of ['G', 'D'] as const) {
    const k = (n: string): Vec2 => (a as unknown as Record<string, Vec2>)[n + c]!;
    f.push([`epaule${c}`, capsule(k('epaule'), { x: 150 + (k('epaule').x - 150) * 0.5, y: 158 }, 14)]);
    f.push([`bras${c}`, capsule(k('epaule'), k('coude'), 12)]);
    f.push([`avantBras${c}`, capsule(k('coude'), k('poignet'), 10)]);
    f.push([`main${c}`, capsule(k('poignet'), k('boutMain'), 11)]);
    f.push([`cuisse${c}`, capsule(k('hanche'), k('genou'), 19)]);
    f.push([`jambe${c}`, capsule(k('genou'), k('cheville'), 16)]);
    f.push([`pied${c}`, capsule(k('cheville'), k('boutPied'), 10)]);
  }
  return f;
}

/** Image RGBA de la figure (anticrénelée) et carte des parties (canal rouge = index + 1 dans `noms`). */
export function imageFigure(): { image: ImageRGBA; parties: ImageRGBA; noms: string[] } {
  const formes = formesFigure();
  const noms = formes.map(([n]) => n);
  const donnees = new Uint8Array(L * H * 4);
  const parties = new Uint8Array(L * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < L; x++) {
      let dMin = Number.POSITIVE_INFINITY;
      let kMin = -1;
      formes.forEach(([, f], k) => {
        const d = f(x + 0.5, y + 0.5);
        if (d < dMin) {
          dMin = d;
          kMin = k;
        }
      });
      const a = Math.min(1, Math.max(0, 0.5 - dMin));
      const i = 4 * (y * L + x);
      donnees[i] = 120 + ((x * 7) % 50);
      donnees[i + 1] = 90 + ((y * 3) % 60);
      donnees[i + 2] = 60;
      donnees[i + 3] = Math.round(a * 255);
      if (a > 0.5) {
        parties[i] = kMin + 1;
        parties[i + 3] = 255;
      }
    }
  }
  return { image: { largeur: L, hauteur: H, donnees }, parties: { largeur: L, hauteur: H, donnees: parties }, noms };
}
