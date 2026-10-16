import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { deformer } from '../src/rig';
import { chargerRig, ecrireRigComplet, lirePNG, validerRig } from '../src/rig/charger';
import { calculerFK } from '../src/rig/fk';
import { appliquerIK } from '../src/rig/ik';
import { couvertureMasque, masqueAlpha } from '../src/rig/maillage';
import { indexerSquelette, membreDe } from '../src/rig/squelette';
import type { Pose, TransformOs } from '../src/timeline/types';

const CHEMIN = new URL('../assets-test/modou-test/rig.json', import.meta.url).pathname;
const { rig, rapport } = chargerRig(CHEMIN, { cache: false });
const racine = { decalage: { x: 0, y: 0 }, rotation: 0, echelle: { x: 1, y: 1 }, flip: false };
const r = (rotation: number): TransformOs => ({ rotation, translation: { x: 0, y: 0 }, echelle: { x: 1, y: 1 } });
const temporaire = mkdtempSync(join(tmpdir(), 'rig-'));
afterAll(() => rmSync(temporaire, { recursive: true, force: true }));

describe('personnage de test MODOU (assets-test)', () => {
  it('se charge, se valide et porte les 18 os standard', () => {
    expect(validerRig(rig)).toEqual([]);
    expect(rig.squelette.os.length).toBe(18);
    expect(rig.image.largeur).toBe(720);
    expect(rig.visage?.bouche.largeur).toBeGreaterThan(40);
    expect(rig.ik?.map((d) => d.nom).sort()).toEqual(['brasD', 'brasG', 'jambeD', 'jambeG']);
    expect(rapport?.poids.etiquetage).toBe('carte');
  });

  it('couvre le masque (> 0,97) sans triangle dehors', () => {
    const image = lirePNG(rig.image.chemin);
    const c = couvertureMasque(rig.maillage.positions, rig.maillage.indices, masqueAlpha(image, 12), image.largeur, image.hauteur, undefined, 3.5);
    expect(c.couverture).toBeGreaterThan(0.97);
    expect(c.trianglesDehors).toBe(0);
    expect(rapport!.maillage.segmentsManquants).toBe(0);
    expect(rapport!.maillage.angleMinP5).toBeGreaterThan(20);
  });

  it('a des poids qui somment à 1', () => {
    const m = rig.maillage;
    for (let v = 0; v < m.positions.length / 2; v++) {
      let s = 0;
      for (let k = 0; k < 4; k++) if (m.influences[4 * v + k]! >= 0) s += m.poids[4 * v + k]!;
      expect(Math.abs(s - 1)).toBeLessThan(1e-9);
    }
  });

  it('se déforme en identité au repos', () => {
    const d = deformer(rig, { os: {}, racine });
    let ecart = 0;
    for (let i = 0; i < d.length; i++) ecart = Math.max(ecart, Math.abs(d[i]! - rig.maillage.positions[i]!));
    expect(ecart).toBeLessThan(2e-4);
  });

  it('tourner l’avant-bras droit ne déplace que le bras droit', () => {
    const d = deformer(rig, { os: { avantBrasD: r(-1.4) }, racine });
    const m = rig.maillage;
    let horsBras = 0;
    let main = 0;
    for (let v = 0; v < m.positions.length / 2; v++) {
      const dep = Math.hypot(d[2 * v]! - m.positions[2 * v]!, d[2 * v + 1]! - m.positions[2 * v + 1]!);
      if (membreDe(rig.squelette, m.partie![v]!) !== 'brasD' && dep > 1e-3) horsBras++;
      if (rig.squelette.os[m.partie![v]!]!.nom === 'mainD' && dep > 50) main++;
    }
    expect(horsBras).toBe(0);
    expect(main).toBeGreaterThan(20);
  });

  it('IK : la main atteint une cible atteignable, les pieds restent au sol en flexion', () => {
    const idx = indexerSquelette(rig.squelette);
    const brasG = rig.ik!.find((d) => d.nom === 'brasG')!;
    const cible = { x: 600, y: 330 };
    const res = appliquerIK(rig.squelette, { os: {}, racine }, brasG, cible, { douceur: 0, limites: false });
    const e = calculerFK(rig.squelette, res.pose, { limites: false });
    const main = e.pivots[idx.index.get('mainG')!]!;
    expect(Math.hypot(main.x - cible.x, main.y - cible.y)).toBeLessThan(1e-6);
    // Flexion : bassin abaissé de 60 px, pieds verrouillés par IK.
    let pose: Pose = { os: { bassin: { rotation: 0, translation: { x: 0, y: 60 }, echelle: { x: 1, y: 1 } } }, racine };
    const repos = calculerFK(rig.squelette, { os: {}, racine });
    for (const nom of ['jambeG', 'jambeD']) {
      const def = rig.ik!.find((d) => d.nom === nom)!;
      const i = idx.index.get(def.effecteur!)!;
      pose = appliquerIK(rig.squelette, pose, def, repos.pivots[i]!, { angleEffecteur: rig.squelette.os[i]!.angleRepos }).pose;
    }
    const d = deformer(rig, pose);
    // Les semelles (sommets les plus bas) ne bougent presque pas.
    const m = rig.maillage;
    let maxDep = 0;
    for (let v = 0; v < m.positions.length / 2; v++) {
      if (m.positions[2 * v + 1]! < rig.ancrageSol.y - 12) continue;
      maxDep = Math.max(maxDep, Math.hypot(d[2 * v]! - m.positions[2 * v]!, d[2 * v + 1]! - m.positions[2 * v + 1]!));
    }
    expect(maxDep).toBeLessThan(1.5);
  });

  it('s’écrit en rig complet et se relit à l’identique (centres NaN → null → rigides)', () => {
    const fichier = join(temporaire, 'modou-test.rig.json');
    ecrireRigComplet({ ...rig, image: { ...rig.image } }, fichier);
    const relu = chargerRig(fichier, { cache: false }).rig;
    expect(validerRig(relu)).toEqual([]);
    const pose: Pose = { os: { avantBrasG: r(1.1), tete: r(0.2), brasD: r(0.4) }, racine };
    const a = deformer(rig, pose);
    const b = deformer(relu, pose);
    let ecart = 0;
    for (let i = 0; i < a.length; i++) ecart = Math.max(ecart, Math.abs(a[i]! - b[i]!));
    expect(ecart).toBeLessThan(0.01);
  });

  it('est rapide : déformation CoR de ~3 000 sommets en moins de 2 ms', () => {
    const pose: Pose = { os: { avantBrasG: r(1.1), brasG: r(-0.8), tete: r(0.2), avantBrasD: r(-0.9) }, racine };
    const sortie = new Float32Array(rig.maillage.positions.length);
    for (let i = 0; i < 20; i++) deformer(rig, pose, { sortie });
    const n = 200;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) deformer(rig, pose, { sortie });
    const ms = (performance.now() - t0) / n;
    expect(ms).toBeLessThan(2);
  });
});
