/**
 * MODOU de test, dessiné en code : homme ouest-africain mince et dégingandé, cheveux courts, fine moustache et
 * bouc, t-shirt vert délavé, pantalon cargo marron roulé aux chevilles, sandales noires (palette de la bible
 * `troupe/troupe.json`). De face, pose A (bras écartés du corps : un vide net entre bras et torse).
 *
 * C'est un personnage de DÉVELOPPEMENT (en attendant les planches) : il appartient au projet et peut être versé
 * au dépôt. Toutes les mesures (articulations, ancrages du visage, pieds) sortent de la même géométrie que le
 * dessin : le `rig.json` est exact par construction.
 */
import { bruit2D, bruitFractal2D } from '../../noyau/aleatoire';
import type { AncresVisage, Vec2 } from '../../timeline/types';
import type { ArticulationsHumanoide } from '../../rig/squelette';
import type { Calque, Etiquette, Matiere, Rvb } from './peintre';
import {
  auDessous,
  auDessus,
  bezier2,
  boite,
  capsule,
  cercle,
  decaler,
  ellipse,
  inter,
  interDouce,
  miroir,
  moins,
  moinsDouce,
  polygone,
  trait,
  union,
  unionDouce,
  bruiter,
  type Forme,
} from './sdf';

/** Taille de l'image. */
export const LARGEUR = 720;
export const HAUTEUR = 1440;
const CX = LARGEUR / 2;
const mx = (p: Vec2): Vec2 => ({ x: LARGEUR - p.x, y: p.y });
const v = (x: number, y: number): Vec2 => ({ x, y });
const plus = (a: Vec2, b: Vec2, k = 1): Vec2 => ({ x: a.x + k * b.x, y: a.y + k * b.y });

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Géométrie (côté D du personnage = gauche de l'image ; G = miroir)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const EPAULE_D = v(262, 434);
const COUDE_D = v(222, 600);
const POIGNET_D = v(194, 760);
const BOUT_MAIN_D = v(185, 846);
const HANCHE_D = v(312, 806);
const GENOU_D = v(306, 1072);
const CHEVILLE_D = v(302, 1290);
const BOUT_PIED_D = v(298, 1378);
const SEMELLE_Y = 1392;
const REVERS_HAUT = 1246;
const REVERS_BAS = 1294;

/** Articulations nommées (repos). */
export const ARTICULATIONS: ArticulationsHumanoide = {
  bassin: v(CX, 806),
  taille: v(CX, 752),
  baseCou: v(CX, 398),
  baseTete: v(CX, 300),
  sommetTete: v(CX, 46),
  epauleD: EPAULE_D,
  coudeD: COUDE_D,
  poignetD: POIGNET_D,
  boutMainD: BOUT_MAIN_D,
  epauleG: mx(EPAULE_D),
  coudeG: mx(COUDE_D),
  poignetG: mx(POIGNET_D),
  boutMainG: mx(BOUT_MAIN_D),
  hancheD: HANCHE_D,
  genouD: GENOU_D,
  chevilleD: CHEVILLE_D,
  boutPiedD: BOUT_PIED_D,
  hancheG: mx(HANCHE_D),
  genouG: mx(GENOU_D),
  chevilleG: mx(CHEVILLE_D),
  boutPiedG: mx(BOUT_PIED_D),
};

/** Semelles (bas des sandales) et ancrage au sol. */
export const PIEDS = { droit: v(298, SEMELLE_Y), gauche: mx(v(298, SEMELLE_Y)) };

// Visage.
const OEIL_D = v(322, 192);
const OEIL_R = v(24, 21);
const BOUCHE_Y = 287;
const LEVRES: Vec2[] = [v(328, 287.5), v(344, 286), v(CX, 287.5), v(376, 286), v(392, 287.5)];

/** Ancrages du visage (px image). */
export const VISAGE: AncresVisage = {
  osTete: 'tete',
  oeilD: {
    centre: OEIL_D,
    rayon: OEIL_R,
    paupiereHaute: [v(346, 190), v(334, 183), v(322, 181.5), v(310, 183), v(298, 190)],
    paupiereBasse: [v(346, 195), v(334, 209), v(322, 212.5), v(310, 209), v(298, 195)],
    iris: { centre: v(324, 195), rayon: 12.5 },
  },
  oeilG: {
    centre: mx(OEIL_D),
    rayon: OEIL_R,
    paupiereHaute: [v(374, 190), v(386, 183), v(398, 181.5), v(410, 183), v(422, 190)],
    paupiereBasse: [v(374, 195), v(386, 209), v(398, 212.5), v(410, 209), v(422, 195)],
    iris: { centre: v(396, 195), rayon: 12.5 },
  },
  bouche: {
    centre: v(CX, BOUCHE_Y),
    largeur: 64,
    hauteur: 13,
    coinD: LEVRES[0]!,
    coinG: LEVRES[4]!,
    levreHaute: LEVRES,
    levreBasse: LEVRES,
    menton: v(CX, 326),
    interieur: [0.24, 0.07, 0.07],
  },
  sourcilD: { points: [v(343, 147), v(320, 142), v(297, 149)] },
  sourcilG: { points: [v(377, 147), v(400, 142), v(423, 149)] },
  couleurPeau: [0.5, 0.3, 0.2],
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Matières et textures peintes
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const melange = (a: Rvb, b: Rvb, t: number): Rvb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const borne = (t: number): number => Math.min(1, Math.max(0, t));
const fbm = (x: number, y: number, e: number, g: number, o = 4): number => bruitFractal2D(x / e, y / e, g, { octaves: o });

const PEAU: Rvb = [0.52, 0.31, 0.21];
const PEAU_ROUGE: Rvb = [0.58, 0.3, 0.2];
const PEAU_SOMBRE: Rvb = [0.4, 0.23, 0.16];
const CHEVEUX: Rvb = [0.075, 0.06, 0.055];
const VERT: Rvb = [0.4, 0.58, 0.37];
const VERT_DELAVE: Rvb = [0.6, 0.69, 0.49];
const SALISSURE: Rvb = [0.5, 0.47, 0.33];
const BORDURE: Rvb = [0.6, 0.6, 0.43];
const MARRON: Rvb = [0.38, 0.27, 0.19];
const MARRON_USE: Rvb = [0.5, 0.38, 0.27];
const REVERS: Rvb = [0.6, 0.48, 0.32];
const NOIR: Rvb = [0.07, 0.068, 0.075];
const LEVRE: Rvb = [0.41, 0.21, 0.17];

/** Peau : variations douces (pores, rougeurs), joues et nez plus chauds. */
function albedoPeau(x: number, y: number): Rvb {
  let c = melange(PEAU, PEAU_ROUGE, borne(0.5 + 0.6 * fbm(x, y, 40, 11, 3)) * 0.35);
  c = melange(c, PEAU_SOMBRE, borne(0.5 + fbm(x, y, 90, 12, 2)) * 0.18);
  const grain = 0.025 * bruit2D(x / 1.7, y / 1.7, 13);
  return [c[0] * (1 + grain), c[1] * (1 + grain), c[2] * (1 + grain)];
}

const PEAU_M: Matiere = { albedo: albedoPeau, relief: 22, speculaire: 0.16, brillance: 22, enveloppe: 0.35, peau: true, contreJour: 0.35, lisere: 0.18 };

/** T-shirt : vert délavé par plaques, salissures vers l'ourlet, trame fine. */
function albedoTshirt(x: number, y: number): Rvb {
  let c = melange(VERT, VERT_DELAVE, borne(0.4 + 0.8 * fbm(x, y, 120, 21, 3)) * 0.5);
  c = melange(c, SALISSURE, borne((y - 600) / 200) * borne(0.4 + fbm(x, y, 50, 22, 3)) * 0.45);
  const tache = borne(0.6 * fbm(x, y, 26, 23, 3) - 0.2) * 0.18;
  c = melange(c, VERT_DELAVE, tache);
  const trame = 0.035 * bruit2D(x / 1.3, y / 1.3, 24) + 0.02 * Math.sin((x + y) * 1.7);
  return [c[0] * (1 + trame), c[1] * (1 + trame), c[2] * (1 + trame)];
}

/** Pantalon : marron usé aux cuisses et aux genoux, crasse vers le bas, sergé. */
function albedoPantalon(x: number, y: number): Rvb {
  let c = melange(MARRON, MARRON_USE, borne(0.4 + 0.9 * fbm(x, y, 55, 31)) * 0.6);
  const genou = Math.exp(-(((y - 1060) / 70) ** 2));
  c = melange(c, MARRON_USE, genou * 0.35);
  c = melange(c, [0.3, 0.22, 0.16], borne((y - 1150) / 150) * 0.4);
  const serge = 0.03 * Math.sin((x * 0.9 + y * 1.6) * 1.3) + 0.03 * bruit2D(x / 1.5, y / 1.5, 32);
  return [c[0] * (1 + serge), c[1] * (1 + serge), c[2] * (1 + serge)];
}

const TSHIRT_M: Matiere = { albedo: albedoTshirt, relief: 60, speculaire: 0.02, brillance: 6, enveloppe: 0.3, contreJour: 0.3, lisere: 0.2 };
const PANTALON_M: Matiere = { albedo: albedoPantalon, relief: 40, speculaire: 0.02, brillance: 6, enveloppe: 0.25, contreJour: 0.25, lisere: 0.22 };
const CHEVEUX_M: Matiere = {
  albedo: (x, y) => melange(CHEVEUX, [0.15, 0.115, 0.1], borne(0.5 + 0.7 * fbm(x, y, 7, 41, 2)) * 0.45),
  relief: 30,
  speculaire: 0.1,
  brillance: 8,
  contreJour: 0.45,
  lisere: 0.1,
  bosses: (x, y) => 0.32 * Math.abs(bruit2D(x / 4.2, y / 4.2, 42)),
};
const POILS_M: Matiere = { ...CHEVEUX_M, relief: 4, bosses: (x, y) => 0.5 * bruit2D(x / 1.6, y / 1.6, 43) };
const NOIR_M: Matiere = { albedo: NOIR, relief: 9, speculaire: 0.35, brillance: 30, contreJour: 0.45, lisere: 0.05 };
const detail = (c: Rvb, f = 1): Matiere => ({ albedo: c, relief: 0, lisere: 0 * f });

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Formes
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const TOUT = [0, 0, LARGEUR, HAUTEUR] as const;

function bras(cote: 'D' | 'G') {
  const s = (p: Vec2) => (cote === 'D' ? p : mx(p));
  const e = s(EPAULE_D);
  const c = s(COUDE_D);
  const w = s(POIGNET_D);
  const bout = s(BOUT_MAIN_D);
  const haut = capsule(e, c, 21, 17.5);
  const avant = capsule(c, w, 17.5, 14);
  // Main : paume, quatre doigts légèrement repliés vers la cuisse, pouce côté corps.
  const ux = (bout.x - w.x) / Math.hypot(bout.x - w.x, bout.y - w.y);
  const uy = (bout.y - w.y) / Math.hypot(bout.x - w.x, bout.y - w.y);
  const u = v(ux, uy);
  const versCorps = cote === 'D' ? 1 : -1;
  const p = v(-uy * -versCorps, ux * -versCorps); // perpendiculaire orientée vers le corps
  const perp = v(p.x, p.y);
  const paume = ellipse(plus(w, u, 27), 20.5, 27, Math.atan2(uy, ux) - Math.PI / 2);
  const doigts: Forme[] = [];
  const longueurs = [29, 35, 34, 28];
  [-11.5, -3.8, 3.8, 11.5].forEach((k, i) => {
    const base = plus(plus(w, u, 44), perp, k);
    const milieu = plus(plus(base, u, longueurs[i]! * 0.6), perp, 1.5);
    const tip = plus(plus(base, u, longueurs[i]!), perp, 4.5);
    doigts.push(unionDouce(3, capsule(base, milieu, 5.8, 5.3), capsule(milieu, tip, 5.3, 4.6)));
  });
  const pouce = unionDouce(3, capsule(plus(plus(w, u, 14), perp, 12), plus(plus(w, u, 34), perp, 21), 7.5, 6.4), capsule(plus(plus(w, u, 34), perp, 21), plus(plus(w, u, 48), perp, 20), 6.4, 5.4));
  const main = unionDouce(5, paume, unionDouce(2.5, ...doigts), pouce);
  const peau = unionDouce(6, unionDouce(10, haut, avant), main);
  // Plis entre les doigts (traits sombres), ongles.
  const plis: Forme[] = [-7.6, 0, 7.6].map((k) => trait([plus(plus(w, u, 47), perp, k), plus(plus(w, u, 70), perp, k + 2.5)], 1.0, 0.6));
  return { haut, avant, main, peau, plis, e, c, w, bout, u, perp };
}

function jambe(cote: 'D' | 'G') {
  const s = (p: Vec2) => (cote === 'D' ? p : mx(p));
  const h = s(HANCHE_D);
  const g = s(GENOU_D);
  const ch = s(CHEVILLE_D);
  const cuisse = capsule(h, g, 46, 37);
  // Jambe du pantalon coupée net au bas du revers.
  const tibia = interDouce(5, capsule(g, plus(ch, v(0, 30)), 37, 35), auDessus(() => REVERS_BAS - 2, TOUT));
  const jambeF = unionDouce(14, cuisse, tibia);
  // Revers roulé : bourrelet arrondi un peu plus large que la jambe.
  const revers = unionDouce(10, boite(v(ch.x, REVERS_HAUT + 22), 40, 22, 11), capsule(v(ch.x - 34, REVERS_BAS - 8), v(ch.x + 34, REVERS_BAS - 8), 9));
  // Poche cargo côté extérieur.
  const ext = cote === 'D' ? -1 : 1;
  const poche = boite(v(h.x + ext * 34, 935), 21, 46, 6, ext * 0.03);
  const rabat = boite(v(h.x + ext * 34, 896), 23, 10, 4, ext * 0.03);
  // Pied (vue de face) : cheville, cou-de-pied qui s'élargit vers les orteils, orteils posés sur la semelle.
  const cheville = capsule(s(v(302, REVERS_BAS - 14)), s(v(300, 1334)), 16, 18.5);
  const dos = unionDouce(10, ellipse(s(v(299, 1351)), 29, 21), boite(s(v(299, 1366)), 31, 9, 8));
  const orteils: Forme[] = [
    [274.5, 1375, 5.6],
    [284, 1377, 6.1],
    [294, 1378, 6.5],
    [304.5, 1378, 6.9],
    [317, 1376, 8.8],
  ].map(([x, y, r]) => cercle(s(v(x!, y!)), r!));
  const pied = unionDouce(9, cheville, dos, unionDouce(3, ...orteils));
  const semelle = boite(s(v(299, SEMELLE_Y - 8)), 40, 8, 6);
  const sangle = inter(decaler(unionDouce(8, cheville, dos), 3), boite(s(v(299, 1343)), 52, 11, 5));
  const ongles = orteils.map((o, i) => inter(decaler(o, -2.4), auDessous(() => (i === 4 ? 1371 : 1373), TOUT)));
  return { cuisse, tibia, jambeF, revers, poche, rabat, pied, semelle, sangle, cheville, dos, orteils, ongles, h, g, ch };
}

/** Pile de calques du personnage (du fond vers l'avant). */
export function calquesModou(): Calque[] {
  const L: Calque[] = [];
  // ── Tête : formes partagées.
  const crane = ellipse(v(CX, 168), 98, 118);
  const machoire = ellipse(v(CX, 254), 70, 72);
  const tete = unionDouce(46, crane, machoire);
  const oreilleD = ellipse(v(266, 207), 19, 30, 0.12);
  const oreilleG = miroir(oreilleD, CX);
  const cou = capsule(v(CX, 285), v(CX, 412), 23, 25.5);
  const brasD = bras('D');
  const brasG = bras('G');
  const jD = jambe('D');
  const jG = jambe('G');

  // T-shirt.
  const torse = polygone([
    v(330, 384), v(390, 384), v(446, 401), v(468, 434), v(450, 520), v(443, 640), v(452, 762),
    v(268, 762), v(277, 640), v(270, 520), v(252, 434), v(274, 401),
  ]);
  const manche = (cote: 'D' | 'G') => {
    const b = cote === 'D' ? brasD : brasG;
    return capsule(plus(b.e, v(cote === 'D' ? 4 : -4, -10)), plus(b.e, plus(b.c, b.e, -1), 0.53), 33, 27.5);
  };
  const mancheD = manche('D');
  const mancheG = manche('G');
  const encolure = ellipse(v(CX, 383), 33, 19);
  const ourlet = (x: number) => 758 + 1.6 * bruit2D(x / 22, 0, 51);
  let chemise = moinsDouce(6, unionDouce(20, torse, mancheD, mancheG), encolure);
  chemise = inter(chemise, auDessus(ourlet, TOUT));
  // Petite déchirure à l'ourlet.
  chemise = moins(chemise, polygone([v(326, 766), v(333, 748), v(340, 766)]));
  const osTshirt = (x: number, y: number): string => (y < 452 && Math.abs(x - CX) > 66 ? (x < CX ? 'epauleD' : 'epauleG') : 'torse');

  // Pantalon.
  const bassin = boite(v(CX, 792), 99, 53, 30);
  const pantalon = union(unionDouce(22, bassin, jD.jambeF), unionDouce(22, bassin, jG.jambeF));

  // ── 1. Oreilles (derrière la tête).
  for (const o of [oreilleD, oreilleG]) {
    L.push({ nom: 'oreille', forme: o, matiere: { ...PEAU_M, relief: 16 }, os: 'tete' });
  }
  for (const [o, s] of [[oreilleD, 1], [oreilleG, -1]] as const) {
    L.push({ nom: 'creux oreille', forme: ellipse(plus(o === oreilleD ? v(266, 207) : v(454, 207), v(3 * s, 1)), 9, 18, 0.12 * s), matiere: detail([0.62, 0.42, 0.36]), mode: 'multiplier', decoupe: o, flou: 5 });
  }
  // ── 2. Cou.
  L.push({ nom: 'cou', forme: cou, matiere: { ...PEAU_M, relief: 26 }, os: 'cou', ombres: [{ forme: tete, dx: 3, dy: 16, flou: 12, force: 0.6 }] });
  L.push({ nom: 'pomme', forme: ellipse(v(CX, 362), 6, 9), matiere: { ...PEAU_M, relief: 6 }, opacite: 0.35, flou: 3, decoupe: cou });
  // ── 3. Bras (peau).
  for (const [b, cote, manche] of [[brasD, 'D', mancheD], [brasG, 'G', mancheG]] as const) {
    const os: Array<[Forme, Etiquette]> = [[b.haut, `bras${cote}`], [b.avant, `avantBras${cote}`], [b.main, `main${cote}`]];
    L.push({
      nom: `bras ${cote}`,
      forme: b.peau,
      matiere: { ...PEAU_M, relief: 17 },
      os,
      ombres: [{ forme: manche, dx: cote === 'D' ? 1 : -1, dy: 9, flou: 8, force: 0.5 }],
    });
    for (const p of b.plis) L.push({ nom: 'pli doigt', forme: p, matiere: detail([0.45, 0.3, 0.26]), mode: 'multiplier', decoupe: b.main, flou: 1.2 });
    // Creux du coude.
    L.push({ nom: 'coude', forme: trait(bezier2(plus(b.c, b.perp, 6), plus(plus(b.c, b.perp, 10), b.u, 4), plus(plus(b.c, b.perp, 13), b.u, -2), 6), 1.2, 0.6), matiere: detail([0.7, 0.55, 0.5]), mode: 'multiplier', decoupe: b.peau, flou: 2 });
  }
  // ── 4. Pieds et sandales (sous le revers).
  for (const [j, cote] of [[jD, 'D'], [jG, 'G']] as const) {
    L.push({ nom: 'semelle', forme: j.semelle, matiere: { ...NOIR_M, relief: 8 }, os: `pied${cote}` });
    L.push({ nom: 'pied', forme: j.pied, matiere: { ...PEAU_M, relief: 16 }, os: `pied${cote}`, ombres: [{ forme: j.revers, dx: 0, dy: 9, flou: 7, force: 0.6 }, { forme: j.sangle, dx: 0, dy: 4, flou: 4, force: 0.45 }] });
    for (const o of j.ongles) L.push({ nom: 'ongle', forme: o, matiere: { albedo: [0.72, 0.56, 0.48], relief: 3, speculaire: 0.3, brillance: 20 }, opacite: 0.8, flou: 1 });
    L.push({ nom: 'sangle', forme: j.sangle, matiere: NOIR_M, os: `pied${cote}` });
  }
  // ── 5. Pantalon, poches, coutures, revers (par-dessus les chevilles).
  L.push({ nom: 'pantalon', forme: pantalon, matiere: PANTALON_M, os: [[bassin, 'bassin'], [jD.cuisse, 'cuisseD'], [jD.tibia, 'jambeD'], [jG.cuisse, 'cuisseG'], [jG.tibia, 'jambeG']], ombres: [{ forme: chemise, dx: 0, dy: 9, flou: 10, force: 0.42 }] });
  for (const j of [jD, jG]) {
    L.push({ nom: 'poche', forme: j.poche, matiere: { albedo: [0.82, 0.8, 0.78], relief: 0 }, mode: 'multiplier', decoupe: pantalon, flou: 1.5 });
    L.push({ nom: 'poche relief', forme: j.poche, matiere: { ...PANTALON_M, relief: 8 }, opacite: 0.55, decoupe: pantalon, flou: 1.2 });
    L.push({ nom: 'poche couture', forme: moins(j.poche, decaler(j.poche, -2.2)), matiere: detail([0.45, 0.36, 0.3]), mode: 'multiplier', decoupe: pantalon, flou: 1 });
    L.push({ nom: 'rabat', forme: j.rabat, matiere: { ...PANTALON_M, relief: 6 }, decoupe: pantalon, ombres: [] });
    L.push({ nom: 'ombre rabat', forme: boite(plus(j.rabat === jD.rabat ? v(j.h.x - 34, 909) : v(j.h.x + 34, 909), v(0, 0)), 22, 3, 2), matiere: detail([0.55, 0.45, 0.4]), mode: 'multiplier', decoupe: j.poche, flou: 3 });
    // Couture extérieure, plis de genou.
    const ext = j === jD ? -1 : 1;
    L.push({ nom: 'couture', forme: trait([v(j.h.x + ext * 40, 990), v(j.g.x + ext * 33, 1080), v(j.ch.x + ext * 31, 1240)], 0.8), matiere: detail([0.62, 0.5, 0.44]), mode: 'multiplier', decoupe: pantalon, flou: 1.5 });
    for (const k of [0, 1, 2]) {
      const y = 1040 + k * 22;
      L.push({ nom: 'pli genou', forme: trait(bezier2(v(j.g.x - 22, y), v(j.g.x, y + 7 - k * 2), v(j.g.x + 20, y - 3)), 1.6, 0.7), matiere: detail([0.7, 0.6, 0.55]), mode: 'multiplier', decoupe: pantalon, flou: 3 });
    }
  }
  L.push({ nom: 'braguette', forme: trait(bezier2(v(CX + 2, 768), v(CX - 1, 805), v(CX - 10, 836)), 1.0), matiere: detail([0.55, 0.43, 0.36]), mode: 'multiplier', decoupe: pantalon, flou: 1.5 });
  L.push({ nom: 'entrejambe', forme: trait(bezier2(v(CX - 6, 840), v(CX, 852), v(CX + 6, 840)), 3), matiere: detail([0.55, 0.45, 0.4]), mode: 'multiplier', decoupe: pantalon, flou: 4 });
  for (const j of [jD, jG]) {
    L.push({ nom: 'revers', forme: j.revers, matiere: { albedo: (x, y) => melange(REVERS, MARRON_USE, borne(0.5 + fbm(x, y, 20, 61)) * 0.6), relief: 16, speculaire: 0.03, lisere: 0.25 }, os: j === jD ? 'jambeD' : 'jambeG', ombres: [] });
    L.push({ nom: 'revers pli', forme: trait(bezier2(v(j.ch.x - 40, REVERS_BAS - 17), v(j.ch.x, REVERS_BAS - 13), v(j.ch.x + 40, REVERS_BAS - 17)), 1.3), matiere: detail([0.62, 0.5, 0.42]), mode: 'multiplier', decoupe: j.revers, flou: 2 });
    L.push({ nom: 'revers haut', forme: trait([v(j.ch.x - 40, REVERS_HAUT + 1), v(j.ch.x + 40, REVERS_HAUT + 1)], 1.6), matiere: detail([0.55, 0.45, 0.4]), mode: 'multiplier', decoupe: j.revers, flou: 3 });
  }
  // ── 6. T-shirt (par-dessus bras et pantalon), bordures, plis.
  L.push({ nom: 't-shirt', forme: chemise, matiere: TSHIRT_M, os: [[torse, osTshirt], [mancheD, 'brasD'], [mancheG, 'brasG']], ombres: [{ forme: tete, dx: 4, dy: 18, flou: 22, force: 0.35 }] });
  L.push({ nom: 'col', forme: inter(chemise, decaler(encolure, 9)), matiere: { albedo: BORDURE, relief: 6, speculaire: 0.03, lisere: 0.25, bosses: (x, y) => 0.25 * Math.sin(Math.atan2(y - 383, x - CX) * 60) }, os: 'torse' });
  for (const [b, m] of [[brasD, mancheD], [brasG, mancheG]] as const) {
    const fin = plus(b.e, plus(b.c, b.e, -1), 0.53);
    const bande = inter(decaler(m, 1), moins(cercle(fin, 33), cercle(plus(fin, b.u, -10), 30)));
    L.push({ nom: 'ourlet manche', forme: bande, matiere: { albedo: BORDURE, relief: 7, speculaire: 0.03, lisere: 0.2 } });
  }
  const plisTshirt: Array<[Vec2[], number]> = [
    [bezier2(v(286, 470), v(310, 520), v(306, 585)), 2.4],
    [bezier2(v(434, 470), v(410, 520), v(414, 585)), 2.4],
    [bezier2(v(300, 690), v(330, 700), v(345, 745)), 2.0],
    [bezier2(v(420, 680), v(400, 710), v(398, 748)), 2.0],
    [bezier2(v(350, 430), v(345, 470), v(352, 500)), 1.5],
  ];
  for (const [pts, r] of plisTshirt) L.push({ nom: 'pli t-shirt', forme: trait(pts, r * 2.2, r), matiere: detail([0.8, 0.85, 0.78]), mode: 'multiplier', decoupe: chemise, flou: 12, opacite: 0.8 });
  L.push({ nom: 'ourlet', forme: trait([v(266, 748), v(CX, 749), v(454, 748)], 0.9), matiere: detail([0.7, 0.75, 0.66]), mode: 'multiplier', decoupe: chemise, flou: 1.5 });

  // ── 7. Tête : visage, joues, cheveux, sourcils, yeux, nez, bouche, moustache, bouc.
  const nez = ellipse(v(CX, 236), 27, 22);
  const ailes = union(ellipse(v(337, 243), 11, 9), ellipse(v(383, 243), 11, 9));
  const arete = capsule(v(CX, 196), v(CX, 226), 9, 12);
  const nezComplet = unionDouce(8, nez, ailes, arete);
  L.push({
    nom: 'visage',
    forme: tete,
    matiere: { ...PEAU_M, relief: 70 },
    os: 'tete',
    ombres: [
      { forme: nezComplet, dx: 6, dy: 11, flou: 7, force: 0.35 },
      { forme: ellipse(v(CX, 150), 200, 60), dx: 0, dy: 0, flou: 1, force: 0 },
    ],
  });
  // Orbites et cernes (fatigue).
  for (const s of [1, -1]) {
    const c = s === 1 ? OEIL_D : mx(OEIL_D);
    L.push({ nom: 'orbite', forme: ellipse(plus(c, v(0, -3)), 34, 27), matiere: detail([0.8, 0.7, 0.68]), mode: 'multiplier', flou: 12 });
    L.push({ nom: 'cerne', forme: trait(bezier2(plus(c, v(-20 * s, 22)), plus(c, v(0, 33)), plus(c, v(19 * s, 21))), 3, 1.5), matiere: detail([0.8, 0.68, 0.66]), mode: 'multiplier', flou: 4 });
    L.push({ nom: 'joue', forme: ellipse(plus(c, v(-12 * s, 55)), 24, 15), matiere: { albedo: [0.62, 0.3, 0.22], relief: 0 }, opacite: 0.16, flou: 14 });
  }
  // Cheveux courts (casque bosselé au-dessus de la ligne frontale).
  const ligneFront = (x: number) => 112 + 0.0052 * (x - CX) ** 2 + 2 * bruit2D(x / 9, 0, 71);
  const cheveux = bruiter(inter(decaler(crane, 7), auDessus(ligneFront, TOUT)), 1.5, 4, 72);
  L.push({ nom: 'cheveux', forme: cheveux, matiere: CHEVEUX_M, os: 'tete', ombres: [] });
  L.push({ nom: 'ligne cheveux', forme: inter(cheveux, auDessous((x) => ligneFront(x) - 6, TOUT)), matiere: detail([0.75, 0.7, 0.7]), mode: 'multiplier', flou: 4 });
  // Sourcils épais.
  for (const s of [VISAGE.sourcilD, VISAGE.sourcilG]) {
    const [a, m, b] = s.points as [Vec2, Vec2, Vec2];
    L.push({ nom: 'sourcil', forme: bruiter(trait(bezier2(a, plus(m, v(0, -3)), b), 6.5, 3.6), 0.9, 2.5, 73), matiere: POILS_M, os: 'tete' });
  }
  // Yeux : blanc, iris, pupille, reflets, paupières tombantes, cils.
  for (const oeil of [VISAGE.oeilD, VISAGE.oeilG]) {
    const c = oeil.centre;
    const blanc = ellipse(c, OEIL_R.x, OEIL_R.y);
    const ph = oeil.paupiereHaute!;
    const pb = oeil.paupiereBasse!;
    const courbeHaute = (x: number) => {
      // Interpolation linéaire de la ligne de paupière (triée par x).
      const pts = [...ph].sort((p, q) => p.x - q.x);
      if (x <= pts[0]!.x) return pts[0]!.y;
      for (let i = 1; i < pts.length; i++) if (x <= pts[i]!.x) return pts[i - 1]!.y + ((pts[i]!.y - pts[i - 1]!.y) * (x - pts[i - 1]!.x)) / (pts[i]!.x - pts[i - 1]!.x);
      return pts[pts.length - 1]!.y;
    };
    L.push({ nom: 'blanc oeil', forme: blanc, matiere: { albedo: [0.93, 0.91, 0.86], relief: 20, speculaire: 0.25, brillance: 40, lisere: 0.3, contreJour: 0 }, os: 'tete', ombres: [{ forme: auDessus(courbeHaute, TOUT), dx: 0, dy: 5, flou: 4, force: 0.45 }] });
    const iris = oeil.iris!;
    L.push({ nom: 'iris', forme: cercle(iris.centre, iris.rayon), matiere: { albedo: (x, y) => melange([0.36, 0.22, 0.12], [0.16, 0.09, 0.05], borne((Math.hypot(x - iris.centre.x, y - iris.centre.y) - 6) / 7)), relief: 0, emissif: true }, decoupe: blanc, ombres: [] });
    L.push({ nom: 'pupille', forme: cercle(iris.centre, 6), matiere: { albedo: [0.03, 0.025, 0.025], relief: 0, emissif: true }, decoupe: blanc });
    L.push({ nom: 'ombre paupière', forme: auDessus((x) => courbeHaute(x) + 6, TOUT), matiere: detail([0.62, 0.55, 0.52]), mode: 'multiplier', decoupe: blanc, flou: 5 });
    L.push({ nom: 'reflet', forme: cercle(plus(iris.centre, v(-4.5, -4)), 3.3), matiere: { albedo: [1, 1, 0.97], relief: 0, emissif: true }, decoupe: blanc, flou: 1 });
    L.push({ nom: 'reflet2', forme: cercle(plus(iris.centre, v(4, 4.5)), 1.4), matiere: { albedo: [0.95, 0.92, 0.88], relief: 0, emissif: true }, decoupe: blanc, opacite: 0.8, flou: 0.8 });
    // Paupière supérieure (peau), tombante.
    const paupiere = inter(decaler(blanc, 4), auDessus(courbeHaute, TOUT));
    L.push({ nom: 'paupière', forme: paupiere, matiere: { ...PEAU_M, relief: 10 }, os: 'tete' });
    L.push({ nom: 'pli paupière', forme: trait(bezier2(plus(c, v(-22, -8)), plus(c, v(0, -26)), plus(c, v(22, -8))), 1.3, 0.8), matiere: detail([0.62, 0.48, 0.45]), mode: 'multiplier', flou: 2.5 });
    const cils = trait([...ph].sort((p, q) => p.x - q.x), 2.0, 2.0);
    L.push({ nom: 'cils', forme: cils, matiere: { albedo: [0.08, 0.05, 0.04], relief: 0, emissif: true }, os: 'tete', flou: 1.2 });
    // Paupière inférieure : lisere.
    L.push({ nom: 'paupière basse', forme: trait([...pb].sort((p, q) => p.x - q.x), 1.4, 1.4), matiere: detail([0.55, 0.42, 0.38]), mode: 'multiplier', flou: 1.5 });
  }
  // Nez.
  L.push({ nom: 'nez', forme: nezComplet, matiere: { ...PEAU_M, albedo: (x, y) => melange(albedoPeau(x, y), PEAU_ROUGE, 0.35), relief: 24, speculaire: 0.28, brillance: 26 }, os: 'tete', ombres: [] });
  for (const s of [1, -1]) {
    L.push({ nom: 'narine', forme: ellipse(v(CX - 11 * s, 251), 5.5, 3.2, 0.2 * s), matiere: { albedo: [0.18, 0.08, 0.06], relief: 0, emissif: true }, decoupe: nezComplet, flou: 1.4 });
    L.push({ nom: 'aile', forme: trait(bezier2(v(CX - 30 * s, 236), v(CX - 34 * s, 248), v(CX - 24 * s, 253)), 1.2, 0.8), matiere: detail([0.6, 0.45, 0.4]), mode: 'multiplier', flou: 2 });
  }
  // Bouche : lèvres, fente, commissures.
  const levreBas = ellipse(v(CX, 294), 25, 7.5);
  const levreHaut = inter(ellipse(v(CX, 287), 31, 7), auDessus((x) => 287.6 - 0.002 * (x - CX) ** 2, TOUT));
  L.push({ nom: 'lèvre basse', forme: levreBas, matiere: { albedo: LEVRE, relief: 7, speculaire: 0.25, brillance: 24, peau: true, lisere: 0.1 }, os: 'tete', opacite: 0.85, flou: 2 });
  L.push({ nom: 'lèvre haute', forme: levreHaut, matiere: { albedo: [0.36, 0.19, 0.15], relief: 5, peau: true }, os: 'tete', opacite: 0.8, flou: 1.5 });
  L.push({ nom: 'fente bouche', forme: trait(bezier2(LEVRES[0]!, v(CX, 285.5), LEVRES[4]!, 16), 1.6, 1.6), matiere: { albedo: [0.15, 0.06, 0.05], relief: 0, emissif: true }, flou: 1.2 });
  for (const s of [1, -1]) {
    L.push({ nom: 'commissure', forme: trait(bezier2(v(CX - 32 * s, 285), v(CX - 36 * s, 288), v(CX - 35 * s, 293)), 1.2, 0.6), matiere: detail([0.55, 0.4, 0.36]), mode: 'multiplier', flou: 1.5 });
    // Pli nasogénien discret.
    L.push({ nom: 'pli joue', forme: trait(bezier2(v(CX - 36 * s, 250), v(CX - 46 * s, 268), v(CX - 42 * s, 290)), 2.2, 1.0), matiere: detail([0.8, 0.68, 0.64]), mode: 'multiplier', flou: 4 });
  }
  // Fine moustache (deux traits séparés au philtrum) et bouc.
  for (const s of [1, -1]) {
    L.push({ nom: 'moustache', forme: bruiter(trait(bezier2(v(CX - 6 * s, 270), v(CX - 18 * s, 270.5), v(CX - 33 * s, 279)), 3.4, 1.6), 0.5, 2, 74), matiere: POILS_M, os: 'tete', flou: 1.2 });
  }
  const bouc = bruiter(unionDouce(6, ellipse(v(CX, 317), 19, 12), ellipse(v(CX, 302), 6, 4.5)), 1.4, 3, 75);
  L.push({ nom: 'bouc', forme: inter(bouc, decaler(tete, -1)), matiere: POILS_M, os: 'tete', flou: 1.5 });
  return L;
}

/** Noms des os attendus dans la carte des parties (ordre = canal rouge − 1). */
export const PARTIES_OS = [
  'bassin', 'torse', 'cou', 'tete', 'epauleG', 'brasG', 'avantBrasG', 'mainG', 'epauleD', 'brasD', 'avantBrasD', 'mainD',
  'cuisseG', 'jambeG', 'piedG', 'cuisseD', 'jambeD', 'piedD',
] as const;

/** Utilitaires réexportés pour d'autres personnages de test. */
export { auDessous, auDessus, interDouce };
