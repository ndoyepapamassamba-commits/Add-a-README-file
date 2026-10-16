import { describe, expect, it } from 'vitest';
import { construireRig, FORMAT_SOURCE_RIG, type SourceRig } from '../src/rig/construire';
import { deformer } from '../src/rig';
import { calculerFK } from '../src/rig/fk';
import { indexerSquelette, membreDe } from '../src/rig/squelette';
import type { CharacterRig, Pose } from '../src/timeline/types';
import { ARTICULATIONS_FIGURE, imageFigure } from './rig.figure';

const racine = { decalage: { x: 0, y: 0 }, rotation: 0, echelle: { x: 1, y: 1 }, flip: false };
const visage = {
  osTete: 'tete',
  oeilG: { centre: { x: 165, y: 62 }, rayon: { x: 7, y: 6 } },
  oeilD: { centre: { x: 135, y: 62 }, rayon: { x: 7, y: 6 } },
  bouche: {
    centre: { x: 150, y: 88 },
    largeur: 22,
    hauteur: 4,
    coinG: { x: 161, y: 88 },
    coinD: { x: 139, y: 88 },
    levreHaute: [{ x: 139, y: 88 }, { x: 150, y: 87 }, { x: 161, y: 88 }],
    levreBasse: [{ x: 139, y: 88 }, { x: 150, y: 90 }, { x: 161, y: 88 }],
    menton: { x: 150, y: 104 },
  },
  sourcilG: { points: [{ x: 158, y: 50 }, { x: 172, y: 50 }] },
  sourcilD: { points: [{ x: 142, y: 50 }, { x: 128, y: 50 }] },
};

function source(): SourceRig {
  return {
    format: FORMAT_SOURCE_RIG,
    id: 'figure',
    nom: 'Figure de test',
    image: 'figure.png',
    orientationDessin: 0,
    articulations: ARTICULATIONS_FIGURE,
    visage,
    maillage: { pas: 9 },
  };
}

const { image, parties, noms } = imageFigure();
const avecCarte = construireRig({ ...source(), parties: { image: 'p.png', os: noms } }, image, { cheminImage: 'figure.png', parties });
const automatique = construireRig(source(), image, { cheminImage: 'figure.png' });

function sommePoids(rig: CharacterRig): { ecartMax: number; min: number; max: number } {
  const m = rig.maillage;
  let ecartMax = 0;
  let min = 1;
  let max = 0;
  for (let v = 0; v < m.positions.length / 2; v++) {
    let s = 0;
    for (let k = 0; k < 4; k++) {
      if (m.influences[4 * v + k]! >= 0) {
        const w = m.poids[4 * v + k]!;
        s += w;
        min = Math.min(min, w);
        max = Math.max(max, w);
      }
    }
    ecartMax = Math.max(ecartMax, Math.abs(s - 1));
  }
  return { ecartMax, min, max };
}

describe.each([
  ['carte des parties', avecCarte],
  ['étiquetage automatique', automatique],
])('rig de la figure (%s)', (_nom, { rig, rapport }) => {
  const idx = indexerSquelette(rig.squelette);

  it('couvre le masque sans triangle dehors', () => {
    expect(rapport.couverture).toBeGreaterThan(0.97);
    expect(rapport.trianglesDehors).toBe(0);
    expect(rapport.maillage.segmentsManquants).toBe(0);
  });

  it('a des poids qui somment à 1, dans [0, 1], au plus 4 par sommet', () => {
    const s = sommePoids(rig);
    expect(s.ecartMax).toBeLessThan(1e-9);
    expect(s.min).toBeGreaterThanOrEqual(0);
    expect(s.max).toBeLessThanOrEqual(1 + 1e-12);
    expect(rig.maillage.influences.length).toBe(2 * rig.maillage.positions.length);
  });

  it('a des groupes de dessin qui couvrent tous les triangles, triés', () => {
    const total = rig.groupes.reduce((a, g) => a + g.nombreTriangles, 0);
    expect(total).toBe(rig.maillage.indices.length / 3);
    let attendu = 0;
    for (const g of rig.groupes) {
      expect(g.premierTriangle).toBe(attendu);
      attendu += g.nombreTriangles;
    }
    expect(rig.groupes.map((g) => g.nom).sort()).toEqual(['brasD', 'brasG', 'corps', 'jambeD', 'jambeG', 'tete']);
  });

  it('se déforme en identité au repos (LBS et CoR)', () => {
    const pose: Pose = { os: {}, racine };
    for (const methode of ['lbs', 'cor'] as const) {
      const d = deformer(rig, pose, { methode });
      let ecart = 0;
      for (let i = 0; i < d.length; i++) ecart = Math.max(ecart, Math.abs(d[i]! - rig.maillage.positions[i]!));
      expect(ecart).toBeLessThan(1e-4); // précision Float32 sur des coordonnées de ~600 px
    }
  });

  it('tourner l’avant-bras ne déplace que les sommets du bras', () => {
    const pose: Pose = { os: { avantBrasG: { rotation: 1.2, translation: { x: 0, y: 0 }, echelle: { x: 1, y: 1 } } }, racine };
    for (const methode of ['lbs', 'cor'] as const) {
      const d = deformer(rig, pose, { methode });
      const m = rig.maillage;
      let bougesHorsBras = 0;
      let bougesMain = 0;
      for (let v = 0; v < m.positions.length / 2; v++) {
        const dep = Math.hypot(d[2 * v]! - m.positions[2 * v]!, d[2 * v + 1]! - m.positions[2 * v + 1]!);
        const membre = membreDe(rig.squelette, m.partie![v]!);
        if (membre !== 'brasG' && dep > 1e-3) bougesHorsBras++;
        if (rig.squelette.os[m.partie![v]!]!.nom === 'mainG' && dep > 20) bougesMain++;
      }
      expect(bougesHorsBras).toBe(0);
      expect(bougesMain).toBeGreaterThan(5);
    }
  });

  it('ne laisse aucune influence du bras sur le flanc du torse', () => {
    const m = rig.maillage;
    const iTorse = idx.index.get('torse')!;
    let fuites = 0;
    let flanc = 0;
    for (let v = 0; v < m.positions.length / 2; v++) {
      if (m.partie![v] !== iTorse) continue;
      const y = m.positions[2 * v + 1]!;
      if (y < 200) continue; // sous l'aisselle
      flanc++;
      for (let k = 0; k < 4; k++) {
        const j = m.influences[4 * v + k]!;
        if (j >= 0 && membreDe(rig.squelette, j).startsWith('bras') && m.poids[4 * v + k]! > 0) fuites++;
      }
    }
    expect(flanc).toBeGreaterThan(20);
    expect(fuites).toBe(0);
  });

  it('plie le coude à 120° en gardant le rayon extérieur (CoR ≥ 85 %)', () => {
    const iCoude = ARTICULATIONS_FIGURE.coudeD;
    const pose: Pose = { os: { avantBrasD: { rotation: -2.09, translation: { x: 0, y: 0 }, echelle: { x: 1, y: 1 } } }, racine };
    const etat = calculerFK(rig.squelette, pose, { limites: false });
    const coudePose = etat.pivots[idx.index.get('avantBrasD')!]!;
    const ratio = (methode: 'lbs' | 'cor'): number => {
      const d = deformer(rig, pose, { methode, limites: false });
      const m = rig.maillage;
      let min = Infinity;
      for (const v of m.contour ?? []) {
        const x = m.positions[2 * v]!;
        const y = m.positions[2 * v + 1]!;
        const r0 = Math.hypot(x - iCoude.x, y - iCoude.y);
        if (r0 > 16 || x > iCoude.x) continue; // côté extérieur (gauche de l'image), près du coude
        const r1 = Math.hypot(d[2 * v]! - coudePose.x, d[2 * v + 1]! - coudePose.y);
        min = Math.min(min, r1 / r0);
      }
      return min;
    };
    expect(ratio('cor')).toBeGreaterThan(0.85);
  });

  it('a des centres de rotation pour les sommets des bandes seulement', () => {
    const m = rig.maillage;
    let multi = 0;
    let avecCentre = 0;
    for (let v = 0; v < m.positions.length / 2; v++) {
      const nb = [0, 1, 2, 3].filter((k) => m.influences[4 * v + k]! >= 0).length;
      const c = m.centresRotation![2 * v]!;
      if (nb > 1) multi++;
      if (Number.isFinite(c)) {
        avecCentre++;
        expect(nb).toBeGreaterThan(1);
      }
    }
    expect(multi).toBeGreaterThan(20);
    expect(avecCentre).toBe(multi);
  });
});

describe('construction du rig', () => {
  it('est déterministe', () => {
    const a = construireRig(source(), image, { cheminImage: 'figure.png' }).rig;
    expect(JSON.stringify(a.maillage)).toBe(JSON.stringify(automatique.rig.maillage));
  });

  it('coupe les ponts entre parties non voisines', () => {
    // La main touche la cuisse : on ajoute un pont de pixels entre la main droite et la cuisse droite.
    const img = { ...image, donnees: Uint8Array.from(image.donnees) };
    for (let y = 340; y < 352; y++) for (let x = 60; x < 125; x++) img.donnees[4 * (y * img.largeur + x) + 3] = 255;
    const r = construireRig({ ...source(), parties: { image: 'p.png', os: noms } }, img, { cheminImage: 'x', parties });
    expect(r.rapport.poids.pontsRetires).toBeGreaterThan(0);
    const pose: Pose = { os: { brasD: { rotation: 0.6, translation: { x: 0, y: 0 }, echelle: { x: 1, y: 1 } } }, racine };
    const d = deformer(r.rig, pose);
    const m = r.rig.maillage;
    const iCuisse = indexerSquelette(r.rig.squelette).index.get('cuisseD')!;
    for (let v = 0; v < m.positions.length / 2; v++) {
      if (m.partie![v] !== iCuisse) continue;
      expect(Math.hypot(d[2 * v]! - m.positions[2 * v]!, d[2 * v + 1]! - m.positions[2 * v + 1]!)).toBeLessThan(1e-3);
    }
  });
});
