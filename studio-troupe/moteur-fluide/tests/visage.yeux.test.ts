/**
 * Tests des yeux et du visage complet : taux et forme des clignements, doublés, clignements forcés et interdits,
 * saccades, regard vers le partenaire, prise de surprise sans clignement, sourcils prosodiques, continuité à
 * 60 i/s du visage entier, gel, déterminisme, contrat (visage neutre sans rig).
 */
import { describe, expect, it } from 'vitest';
import { compilerVisage, fournisseurVisage } from '../src/visage';
import { dureeClignement, genererClignements, genererFixations, paupiereA, regardA } from '../src/visage/yeux';
import { bossesProsodiques, hausseProsodique } from '../src/visage/sourcils';
import { pisteParole } from '../src/visage/parole';
import type { EtatVisage, Replique } from '../src/timeline/types';
import { contexte, projetTest } from './aides/scene';

describe('clignements', () => {
  const repos = genererClignements({ graine: 42, debut: 0, fin: 600, taux: () => 15, bornes: [] });
  it('15 à 20 fermetures par minute au repos, 100 à 300 ms chacune, fermeture plus brève que l’ouverture', () => {
    const parMinute = repos.length / 10;
    expect(parMinute).toBeGreaterThanOrEqual(15);
    expect(parMinute).toBeLessThanOrEqual(20);
    for (const c of repos) {
      expect(dureeClignement(c)).toBeGreaterThanOrEqual(0.1);
      expect(dureeClignement(c)).toBeLessThanOrEqual(0.3);
      expect(c.fermeture).toBeLessThan(c.ouverture);
    }
  });
  it('apériodiques (coefficient de variation ≥ 0,3) avec des doubles clignements', () => {
    const iv = repos.slice(1).map((c, i) => c.t - repos[i]!.t);
    const m = iv.reduce((a, b) => a + b, 0) / iv.length;
    const sd = Math.sqrt(iv.reduce((a, b) => a + (b - m) ** 2, 0) / iv.length);
    expect(sd / m).toBeGreaterThanOrEqual(0.3);
    expect(iv.filter((x) => x < 0.45).length).toBeGreaterThan(3);
  });
  it('taux variable, forcés et interdits respectés', () => {
    const c = genererClignements({
      graine: 7,
      debut: 0,
      fin: 120,
      taux: (t) => (t < 60 ? 21 : 9),
      bornes: [60],
      forces: [30.5],
      interdit: (t) => t > 90 && t < 100,
    });
    const avant = c.filter((x) => x.t < 60).length;
    const apres = c.filter((x) => x.t >= 60).length;
    expect(avant).toBeGreaterThan(apres * 1.6);
    expect(c.some((x) => x.force && Math.abs(x.t - 30.5) < 1e-9)).toBe(true);
    expect(c.filter((x) => !x.force && Math.abs(x.t - 30.5) < 0.4).length).toBe(0);
    expect(c.filter((x) => x.t > 90 && x.t < 100).length).toBe(0);
  });
  it('la paupière se ferme complètement puis se rouvre', () => {
    const c = repos[3]!;
    expect(paupiereA(repos, c.t - 0.01)).toBe(0);
    expect(paupiereA(repos, c.t + c.fermeture + c.ferme / 2)).toBeGreaterThanOrEqual(0.8);
    expect(paupiereA(repos, c.t + dureeClignement(c) + 0.001)).toBeLessThan(0.05);
  });
});

describe('saccades', () => {
  it('durée ≤ 30 + 3·A ms, regard borné, changement de cible suivi', () => {
    const cible = (t: number) => (t < 5 ? { x: 0.8, y: 0 } : { x: -0.8, y: 0.1 });
    const f = genererFixations({ graine: 3, debut: 0, fin: 20, cibleBase: cible, changements: [5], parle: () => false, ecoute: () => true });
    for (const x of f.slice(1)) {
      const A = Math.hypot(x.cible.x - x.depart.x, x.cible.y - x.depart.y) * 30;
      expect(x.duree).toBeLessThanOrEqual(0.03 + 0.003 * A + 1e-9);
    }
    expect(f.some((x) => Math.abs(x.t - 5) < 1e-9)).toBe(true);
    expect(regardA(f, 5.2).x).toBeLessThan(-0.4);
    for (let t = 0; t < 20; t += 0.01) {
      const r = regardA(f, t);
      expect(Math.abs(r.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(r.y)).toBeLessThanOrEqual(1);
    }
  });
});

describe('sourcils prosodiques', () => {
  it('lèvent sur une minorité d’accents et sur la fin des questions, pic 100 ms avant l’accent', () => {
    const p = pisteParole({ id: 'q', personnage: 'modou', texte: 'Tu as vu Bamba hier soir au maquis de Yopougon, non ?', debut: 0 });
    const b = bossesProsodiques(p.accents, 9);
    expect(b.length).toBeLessThanOrEqual(Math.ceil(p.accents.length / 3) + 1);
    const q = p.accents[p.accents.length - 1]!;
    expect(q.question).toBe(true);
    expect(b.some((x) => x.t === q.t)).toBe(true);
    expect(hausseProsodique(b, q.t - 0.1)).toBeGreaterThan(0.5);
  });
});

const DIALOGUE: Replique[] = [
  { id: 'r1', personnage: 'modou', texte: 'Coumba ! Tu as vu le garba de Bamba ?', debut: 0.5, destinataire: 'coumba', emotion: 'mefiance' },
  { id: 'r2', personnage: 'coumba', texte: 'Quoi encore, Modou ? Laisse-moi tranquille !', debut: 3.4, destinataire: 'modou', emotion: 'colere' },
];
const projet = projetTest(
  [
    { action: 'pointer', debut: 1.2, cible: { personnage: 'coumba' } },
    { action: 'surprise', debut: 6.2, cible: { personnage: 'coumba' } },
    { action: 'rire', debut: 7.8 },
  ],
  DIALOGUE,
  11,
  60,
);
projet.pistes.camera = [{ type: 'gel', debut: 9.5, duree: 0.6 }];

const visage = (t: number, id = 'modou'): EtatVisage => fournisseurVisage(contexte(projet, t, id));

describe('visage complet', () => {
  it('le locuteur regarde son destinataire, l’auditeur le locuteur', () => {
    let modou = 0;
    let coumba = 0;
    for (let t = 1; t < 3; t += 0.05) {
      modou += visage(t).regard.x;
      coumba += visage(t, 'coumba').regard.x;
    }
    expect(modou / 40).toBeGreaterThan(0.3);
    expect(coumba / 40).toBeLessThan(-0.3);
  });
  it('la prise de surprise : yeux écarquillés, sourcils au plus haut, bouche ouverte, aucun clignement', () => {
    const v = visage(6.45);
    expect(v.ecarquillement).toBeGreaterThan(0.8);
    expect(v.sourcilG.hauteur).toBeGreaterThan(0.8);
    expect(v.ouvertureBouche).toBeGreaterThan(0.35);
    for (let t = 6.35; t < 7; t += 1 / 60) expect(visage(t).paupiereG).toBeLessThan(0.3);
  });
  it('le rire plisse les yeux et ouvre grand la bouche en saccades', () => {
    const o: number[] = [];
    for (let t = 8.2; t < 9; t += 1 / 60) o.push(visage(t).ouvertureBouche);
    expect(Math.max(...o)).toBeGreaterThan(0.55);
    expect(Math.max(...o) - Math.min(...o)).toBeGreaterThan(0.1);
    expect(visage(8.5).paupiereG).toBeGreaterThan(0.4);
    expect(visage(8.5).sourire).toBeGreaterThan(0.6);
  });
  it('les émotions des répliques se lisent sur le visage (méfiance asymétrique, colère froncée)', () => {
    const m = visage(2);
    expect(m.sourcilG.hauteur - m.sourcilD.hauteur).toBeGreaterThan(0.3);
    const c = visage(4.6, 'coumba');
    expect(c.sourcilG.froncement).toBeGreaterThan(0.6);
    expect(c.sourire).toBeLessThan(-0.3);
  });
  it('continu à 60 i/s : aucun saut, toutes valeurs finies et bornées', () => {
    const champs = (v: EtatVisage): number[] => [
      v.ouvertureBouche,
      v.largeur,
      v.arrondi,
      v.dents,
      v.langue,
      v.sourire,
      v.paupiereG,
      v.paupiereD,
      v.ecarquillement,
      v.regard.x,
      v.regard.y,
      v.sourcilG.hauteur,
      v.sourcilG.froncement,
      v.sourcilG.inclinaison,
      v.sourcilD.hauteur,
    ];
    // Vitesse maximale admise (unités/s) : une discontinuité donnerait un saut fini sur un pas de 0,1 ms.
    // (Les saccades et clignements sont rapides mais continus : < 80 unités/s.)
    const VMAX = 80;
    for (const id of ['modou', 'coumba']) {
      for (let n = 0; n < 11 * 60; n++) {
        const t = n / 60;
        const a = champs(visage(t, id));
        const b = champs(visage(t + 1e-4, id));
        a.forEach((x, i) => {
          expect(Number.isFinite(x)).toBe(true);
          expect(Math.abs(x)).toBeLessThanOrEqual(1);
          expect(Math.abs(b[i]! - x), `${id} champ ${i} à ${t.toFixed(3)} s`).toBeLessThan(VMAX * 1e-4);
        });
      }
    }
  });
  it('gel : le visage est figé pendant le gel', () => {
    const a = visage(9.6);
    const b = visage(10);
    expect(b).toEqual(a);
  });
  it('déterministe quel que soit l’ordre d’évaluation', () => {
    const instants = Array.from({ length: 200 }, (_, i) => (i * 11) / 200);
    const avant = instants.map((t) => JSON.stringify(visage(t)));
    const ordre = [...instants.keys()].sort((a, b) => ((a * 7919) % 200) - ((b * 7919) % 200));
    for (const i of ordre) expect(JSON.stringify(visage(instants[i]!))).toBe(avant[i]);
  });
  it('contrat : visage neutre sans rig ; compilation mémorisée par plan', () => {
    const v = fournisseurVisage(contexte(projet, 2, 'modou', null));
    expect(v.viseme).toBe('repos');
    expect(v.ouvertureBouche).toBe(0);
    expect(compilerVisage(contexte(projet, 1))).toBe(compilerVisage(contexte(projet, 5)));
  });
});
