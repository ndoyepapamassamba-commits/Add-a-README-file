import { describe, expect, it } from 'vitest';
import { adoucirEpaules, zonesFrontieres } from '../src/outils/affiner/preparer';
import { chargerRig } from '../src/rig/charger';
import type { ImageRGBA } from '../src/rig/maillage';

describe('outils/affiner/preparer', () => {
  it('épaules en fondu : poids toujours normalisés, l’épaule ne garde que la région proche du bras', () => {
    const rig = structuredClone(chargerRig('assets-test/modou-test/rig.json', { cache: false }).rig);
    const os = rig.squelette.os;
    const ie = os.findIndex((o) => o.nom === 'epauleG');
    if (ie < 0) return; // personnage sans os d'épaule : rien à adoucir
    const n = adoucirEpaules(rig);
    expect(n).toBeGreaterThanOrEqual(0);
    const m = rig.maillage;
    const bras = os.find((o) => o.nom === 'brasG')!;
    const L = Math.max(8, os[ie]!.longueur);
    for (let v = 0; v < m.positions.length / 2; v++) {
      let s = 0;
      for (let k = 0; k < 4; k++) if (m.influences[4 * v + k]! >= 0) s += m.poids[4 * v + k]!;
      expect(s).toBeCloseTo(1, 6);
      const d = Math.hypot(m.positions[2 * v]! - bras.pivot.x, m.positions[2 * v + 1]! - bras.pivot.y);
      if (d > 1.45 * L) for (let k = 0; k < 4; k++) if (m.influences[4 * v + k] === ie) expect(m.poids[4 * v + k]!).toBeLessThan(1e-9);
    }
  });

  it('zones de frontière : seulement là où deux chaînes mobiles se touchent', () => {
    // Carte 20×10 : moitié gauche « torse » (2), moitié droite « brasG » (3).
    const L = 20;
    const H = 10;
    const d = new Uint8Array(L * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) d[4 * (y * L + x)] = x < 10 ? 2 : 3;
    const carte: ImageRGBA = { largeur: L, hauteur: H, donnees: d };
    const zones = zonesFrontieres(carte, ['bassin', 'torse', 'brasG'], 1.2, 3);
    expect(zones.length).toBeGreaterThan(0);
    for (const z of zones) expect(Math.abs(z.centre.x - 9.5)).toBeLessThan(1);
    // Une seule partie : aucune frontière.
    for (let i = 0; i < L * H; i++) d[4 * i] = 2;
    expect(zonesFrontieres(carte, ['bassin', 'torse', 'brasG'])).toHaveLength(0);
  });
});
