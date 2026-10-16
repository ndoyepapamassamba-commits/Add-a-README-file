/**
 * Formes colorées sans crénelage (pas de MSAA sous SwiftShader) : ellipses à dégradé gaussien construites en
 * anneaux (alpha par sommet, nul au bord). Servent aux ombres de contact (dessous des pieds) et aux halos de
 * lumière (mélange additif). Pures.
 */
import type { Vec2 } from '../timeline/types';

/** Géométrie colorée : positions (px, 2V), couleurs RVBA non prémultipliées (4V), indices. */
export interface MaillageCouleur {
  positions: Float32Array;
  couleurs: Float32Array;
  indices: Uint32Array;
}

/** Une ellipse gaussienne. */
export interface EllipseDouce {
  centre: Vec2;
  /** Demi-axes (px) à 2,5 écarts-types : l'alpha y tombe à ≈ 4 % puis à 0 au bord. */
  rx: number;
  ry: number;
  /** Rotation (rad). */
  rotation?: number;
  couleur: readonly [number, number, number];
  alpha: number;
}

const ANNEAUX = [0, 0.25, 0.5, 0.75, 1];
const SEGMENTS = 28;

/** Assemble des ellipses gaussiennes en un seul maillage (vide si aucune). */
export function anneauxGaussiens(ellipses: readonly EllipseDouce[]): MaillageCouleur {
  const utiles = ellipses.filter((e) => e.alpha > 1e-4 && e.rx > 0.2 && e.ry > 0.2);
  const parEllipse = 1 + (ANNEAUX.length - 1) * SEGMENTS;
  const positions = new Float32Array(2 * parEllipse * utiles.length);
  const couleurs = new Float32Array(4 * parEllipse * utiles.length);
  const indices: number[] = [];
  let v = 0;
  for (const e of utiles) {
    const base = v;
    const c = Math.cos(e.rotation ?? 0);
    const s = Math.sin(e.rotation ?? 0);
    const poser = (x: number, y: number, a: number) => {
      positions[2 * v] = e.centre.x + c * x - s * y;
      positions[2 * v + 1] = e.centre.y + s * x + c * y;
      couleurs[4 * v] = e.couleur[0];
      couleurs[4 * v + 1] = e.couleur[1];
      couleurs[4 * v + 2] = e.couleur[2];
      couleurs[4 * v + 3] = a;
      v++;
    };
    poser(0, 0, e.alpha);
    for (let r = 1; r < ANNEAUX.length; r++) {
      const rr = ANNEAUX[r]!;
      // Gaussienne à σ = 0,4 du rayon, ramenée à 0 au bord.
      const g = Math.exp(-(rr * rr) / (2 * 0.4 * 0.4));
      const bord = Math.exp(-1 / (2 * 0.4 * 0.4));
      const a = e.alpha * Math.max(0, (g - bord) / (1 - bord));
      for (let k = 0; k < SEGMENTS; k++) {
        const t = (2 * Math.PI * k) / SEGMENTS;
        poser(rr * e.rx * Math.cos(t), rr * e.ry * Math.sin(t), a);
      }
    }
    // Triangles : éventail central puis bandes entre anneaux.
    for (let k = 0; k < SEGMENTS; k++) indices.push(base, base + 1 + k, base + 1 + ((k + 1) % SEGMENTS));
    for (let r = 1; r < ANNEAUX.length - 1; r++) {
      const a0 = base + 1 + (r - 1) * SEGMENTS;
      const a1 = base + 1 + r * SEGMENTS;
      for (let k = 0; k < SEGMENTS; k++) {
        const k1 = (k + 1) % SEGMENTS;
        indices.push(a0 + k, a1 + k, a1 + k1, a0 + k, a1 + k1, a0 + k1);
      }
    }
  }
  return { positions, couleurs, indices: Uint32Array.from(indices) };
}
