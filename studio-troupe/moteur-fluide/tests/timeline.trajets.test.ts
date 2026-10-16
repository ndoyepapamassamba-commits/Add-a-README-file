import { describe, expect, it } from 'vitest';
import { orientationA, positionAuSol, profilMarche, vitesseProfilMarche } from '../src/timeline/trajets';
import { creerProjetVide } from '../src/timeline/projet';
import type { Projet } from '../src/timeline/types';

function projetMarche(): Projet {
  const p = creerProjetVide('marche', 10);
  p.personnages.push({ id: 'modou', nom: 'MODOU', rig: 'modou', tailleM: 1.76 });
  p.plans.push({
    id: 'p',
    debut: 0,
    fin: 10,
    decor: 'maquis',
    cadrage: {},
    personnages: [{ personnage: 'modou', u: 0.3, orientation: 1 }],
  });
  p.pistes.actions.push(
    { personnage: 'modou', action: 'marcher', debut: 1, duree: 2, parametres: { vers: { u: 0.1, v: 0.95 } } },
    { personnage: 'modou', action: 'seTourner', debut: 5, duree: 0.6 },
    { personnage: 'modou', action: 'marcher', debut: 6, duree: 1, parametres: { vers: { u: 0.5, v: 0.95 } } },
  );
  return p;
}

describe('profil de marche', () => {
  it('va de 0 à 1, croissant, vitesse continue et nulle aux bouts', () => {
    expect(profilMarche(0)).toBe(0);
    expect(profilMarche(1)).toBe(1);
    expect(profilMarche(0.5)).toBeCloseTo(0.5, 12);
    let prec = 0;
    for (let s = 0; s <= 1; s += 0.001) {
      const p = profilMarche(s);
      expect(p).toBeGreaterThanOrEqual(prec - 1e-15);
      prec = p;
      const h = 1e-6;
      if (s > h && s < 1 - h) {
        expect(vitesseProfilMarche(s)).toBeCloseTo((profilMarche(s + h) - profilMarche(s - h)) / (2 * h), 5);
      }
    }
    expect(vitesseProfilMarche(0)).toBe(0);
    expect(vitesseProfilMarche(1)).toBe(0);
  });
});

describe('trajets au sol', () => {
  const p = projetMarche();
  const plan = p.plans[0]!;
  const placement = plan.personnages[0]!;

  it('part du placement, enchaîne les marches, continu', () => {
    expect(positionAuSol(p, plan, placement, 0, 0.95).u).toBe(0.3);
    expect(positionAuSol(p, plan, placement, 0, 0.95).v).toBe(0.95);
    expect(positionAuSol(p, plan, placement, 3.5, 0.95).u).toBeCloseTo(0.1, 12);
    expect(positionAuSol(p, plan, placement, 9, 0.95).u).toBeCloseTo(0.5, 12);
    expect(positionAuSol(p, plan, placement, 2, 0.95).enMarche).toBe(true);
    let prec = positionAuSol(p, plan, placement, 0, 0.95);
    for (let t = 0; t < 10; t += 0.005) {
      const q = positionAuSol(p, plan, placement, t, 0.95);
      expect(Math.abs(q.u - prec.u)).toBeLessThan(0.003); // vitesse max 0,5 u/s × 5 ms
      expect(q.distance).toBeGreaterThanOrEqual(prec.distance - 1e-12);
      prec = q;
    }
  });

  it('orientation : vers la destination de la marche, bascule à mi-demi-tour', () => {
    expect(orientationA(p, plan, placement, 0.5)).toBe(1);
    expect(orientationA(p, plan, placement, 1.5)).toBe(-1); // marche vers la gauche
    expect(orientationA(p, plan, placement, 5.2)).toBe(-1);
    expect(orientationA(p, plan, placement, 5.31)).toBe(1); // demi-tour à 5 + 0,3
    expect(orientationA(p, plan, placement, 6.5)).toBe(1); // marche vers la droite
  });
});
