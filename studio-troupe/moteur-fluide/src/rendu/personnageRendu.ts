/**
 * Personnage dans la page : le dessin est un maillage texturé dont les sommets sont recalculés à chaque image
 * (skinning du module `rig/`, champ de déplacement du visage, racine de la pose, placement monde avec la
 * parallaxe du sol, caméra). Le visage est déformé (mâchoire, coins, regard, sourcils) et recouvert, dans l'ordre
 * de dessin du groupe de la tête, par l'intérieur de la bouche et les bandes de lèvres et de paupières prélevées
 * sur la peinture. Ombres de contact sous chaque pied (plus sombres au contact, qui s'effacent quand le pied se
 * lève) et sous le corps. Étalonnage vers le décor et liseré de lumière dans le shader.
 */
import { Container, type Shader, type Texture } from 'pixi.js';
import { calculerFK, deformerSommets, matriceOs, type EtatSquelette } from '../rig';
import { composer } from '../noyau/maths2d';
import { deplacerParallaxe } from '../scene/decor';
import { matriceImageVersMonde, matriceRacine } from '../timeline/projection';
import type { CharacterRig, Couleur, EtatImage, EtatPersonnage, Mat2D, Vec2 } from '../timeline/types';
import { anneauxGaussiens, type EllipseDouce, type MaillageCouleur } from './formes';
import { creerMaillage, creerShader, majTampon, programme, uniformes, type MaillageLibre } from './pixi';
import { FRAGMENT_COULEUR, FRAGMENT_PERSONNAGE, SOMMET_COULEUR, SOMMET_TEXTURE } from './shaders';
import { deplacementsVisage, preparerVisage, recouvrementsVisage, visageAuRepos, type VisagePrepare } from './visage';

/** Géométrie d'une image d'un personnage (calculée sur le processeur). */
export interface GeometriePersonnage {
  visible: boolean;
  sommets: Float32Array;
  ordre: string;
  zones: MaillageCouleur;
  bandes: { positions: Float32Array; uvs: Float32Array; alphas: Float32Array; indices: Uint32Array };
  ombres: MaillageCouleur;
  gain: Couleur;
  decalage: Couleur;
  alpha: number;
  lisereDir: Vec2;
  lisereCouleur: Couleur;
  lisere: number;
}

/** Réglages des ombres de contact. */
export const REGLAGES_OMBRES = Object.freeze({
  couleur: [0.05, 0.035, 0.03] as const,
  corps: 0.62,
  pied: 1,
  largeurPied: 0.42,
});

function appliquerM(m: Mat2D, x: number, y: number): Vec2 {
  return { x: m.a * x + m.c * y + m.tx, y: m.b * x + m.d * y + m.ty };
}

export class PersonnageRendu {
  readonly conteneur = new Container();
  readonly rig: CharacterRig;
  private readonly visage: VisagePrepare | null;
  private readonly corpsAvant: MaillageLibre;
  private readonly corpsApres: MaillageLibre;
  private readonly zones: MaillageLibre;
  private readonly bandes: MaillageLibre;
  readonly ombres: MaillageLibre;
  private readonly shaderCorps: Shader;
  private readonly shaderZones: Shader;
  private ordreCourant = '';
  private readonly tamponVisage: Float32Array;
  private readonly osPieds: { G: string; D: string };

  constructor(rig: CharacterRig, texture: Texture) {
    this.rig = rig;
    const m = rig.maillage;
    const n = m.positions.length / 2;
    const progPerso = programme('personnage', SOMMET_TEXTURE, FRAGMENT_PERSONNAGE);
    this.shaderCorps = creerShader(
      progPerso,
      {
        uGain: { value: [1, 1, 1], type: 'vec3<f32>' },
        uDecalage: { value: [0, 0, 0], type: 'vec3<f32>' },
        uAlpha: { value: 1, type: 'f32' },
        uLisereDir: { value: [0, 0], type: 'vec2<f32>' },
        uLisereCouleur: { value: [1, 1, 1], type: 'vec3<f32>' },
        uLisere: { value: 0, type: 'f32' },
      },
      { uTexture: texture.source },
    );
    const positions = Float32Array.from(m.positions);
    const uvs = Float32Array.from(m.uvs);
    const alphas = new Float32Array(n).fill(1);
    this.corpsAvant = creerMaillage(
      [
        { nom: 'aPosition', composantes: 2, donnees: positions },
        { nom: 'aUV', composantes: 2, donnees: uvs },
        { nom: 'aAlpha', composantes: 1, donnees: alphas },
      ],
      Uint32Array.from(m.indices),
      this.shaderCorps,
    );
    const t = this.corpsAvant.tampons;
    this.corpsApres = creerMaillage(
      [
        { nom: 'aPosition', composantes: 2, donnees: t.aPosition! },
        { nom: 'aUV', composantes: 2, donnees: t.aUV! },
        { nom: 'aAlpha', composantes: 1, donnees: t.aAlpha! },
      ],
      new Uint32Array(3),
      this.shaderCorps,
    );
    const progCouleur = programme('couleur', SOMMET_COULEUR, FRAGMENT_COULEUR);
    this.shaderZones = creerShader(progCouleur, { uAlpha: { value: 1, type: 'f32' } }, {});
    this.zones = creerMaillage(
      [
        { nom: 'aPosition', composantes: 2, donnees: new Float32Array(2) },
        { nom: 'aColor', composantes: 4, donnees: new Float32Array(4) },
      ],
      new Uint32Array(3),
      this.shaderZones,
    );
    this.bandes = creerMaillage(
      [
        { nom: 'aPosition', composantes: 2, donnees: new Float32Array(2) },
        { nom: 'aUV', composantes: 2, donnees: new Float32Array(2) },
        { nom: 'aAlpha', composantes: 1, donnees: new Float32Array(1) },
      ],
      new Uint32Array(3),
      this.shaderCorps,
    );
    this.ombres = creerMaillage(
      [
        { nom: 'aPosition', composantes: 2, donnees: new Float32Array(2) },
        { nom: 'aColor', composantes: 4, donnees: new Float32Array(4) },
      ],
      new Uint32Array(3),
      creerShader(progCouleur, { uAlpha: { value: 1, type: 'f32' } }, {}),
    );
    this.conteneur.addChild(this.corpsAvant.mesh, this.zones.mesh, this.bandes.mesh, this.corpsApres.mesh);
    this.visage = rig.visage ? preparerVisage(rig.visage, m.positions) : null;
    this.tamponVisage = new Float32Array(2 * (this.visage?.sommets.length ?? 0));
    const noms = new Set(rig.squelette.os.map((o) => o.nom));
    const choisir = (...c: string[]) => c.find((x) => noms.has(x)) ?? rig.squelette.racine;
    this.osPieds = { G: choisir('piedG', 'jambeG', 'cuisseG'), D: choisir('piedD', 'jambeD', 'cuisseD') };
  }

  /** Groupes de dessin dans l'ordre (ordre forcé par la pose, sinon celui du rig), coupés au groupe du visage. */
  private indicesOrdonnes(ordreGroupes: Record<string, number> | undefined): { cle: string; avant: Uint32Array; apres: Uint32Array } {
    const groupes = this.rig.groupes.map((g, i) => ({ g, i, o: ordreGroupes?.[g.nom] ?? g.ordre }));
    groupes.sort((a, b) => a.o - b.o || a.i - b.i);
    const cle = groupes.map((x) => x.g.nom).join(',');
    const osTete = this.rig.visage?.osTete ?? 'tete';
    let coupe = groupes.findIndex((x) => x.g.os === osTete || x.g.nom === 'tete');
    if (coupe < 0) coupe = groupes.length - 1;
    const idx = this.rig.maillage.indices;
    const morceau = (liste: typeof groupes): Uint32Array => {
      const r: number[] = [];
      for (const { g } of liste) for (let k = 3 * g.premierTriangle; k < 3 * (g.premierTriangle + g.nombreTriangles); k++) r.push(idx[k]!);
      return Uint32Array.from(r.length > 0 ? r : [0, 0, 0]);
    };
    return { cle, avant: morceau(groupes.slice(0, coupe + 1)), apres: morceau(groupes.slice(coupe + 1)) };
  }

  /** Calcule la géométrie d'une image (processeur seulement). */
  preparerImage(ep: EtatPersonnage, etat: EtatImage, camera: Mat2D, ppu: number): GeometriePersonnage {
    const rig = this.rig;
    const pose = ep.pose;
    const fk: EtatSquelette = calculerFK(rig.squelette, pose);
    const peau = deformerSommets(rig.maillage, rig.squelette, fk);
    // Visage.
    const v = this.visage;
    const mTete = v ? matriceOs(rig.squelette, fk, v.ancres.osTete) : null;
    const actif = !!v && !visageAuRepos(ep.visage);
    if (v && actif && mTete) {
      deplacementsVisage(v, ep.visage, rig.maillage.positions, this.tamponVisage);
      for (let k = 0; k < v.sommets.length; k++) {
        const i = v.sommets[k]!;
        const dx = this.tamponVisage[2 * k]!;
        const dy = this.tamponVisage[2 * k + 1]!;
        peau[2 * i] += mTete.a * dx + mTete.c * dy;
        peau[2 * i + 1] += mTete.b * dx + mTete.d * dy;
      }
    }
    // Placement : parallaxe du sol sous les pieds, puis image → monde → écran.
    const decor = etat.decor;
    let position = ep.position;
    let ech = ep.echelle;
    if (decor) {
      position = deplacerParallaxe(ep.position, ep.profondeur, decor.parallaxe, etat.camera.centre);
      ech = ep.echelle * (1 + (ep.profondeur - decor.parallaxe.profondeurReference) * decor.parallaxe.poussee);
    }
    const racine = matriceRacine(pose.racine, rig.ancrageSol);
    const versMonde = matriceImageVersMonde(position, ech, rig.ancrageSol);
    const M = composer(camera, composer(versMonde, racine));
    const n = peau.length / 2;
    const sommets = new Float32Array(2 * n);
    for (let k = 0; k < n; k++) {
      const x = peau[2 * k]!;
      const y = peau[2 * k + 1]!;
      sommets[2 * k] = M.a * x + M.c * y + M.tx;
      sommets[2 * k + 1] = M.b * x + M.d * y + M.ty;
    }

    // Étalonnage et liseré.
    const e = ep.etalonnage;
    const gain = e.gain;
    const dec = e.decalage;
    const grader = (c: readonly [number, number, number]): [number, number, number] => [
      Math.min(1, Math.max(0, c[0] * gain[0] + dec[0])),
      Math.min(1, Math.max(0, c[1] * gain[1] + dec[1])),
      Math.min(1, Math.max(0, c[2] * gain[2] + dec[2])),
    ];

    // Recouvrements du visage.
    let zones: MaillageCouleur = { positions: new Float32Array(0), couleurs: new Float32Array(0), indices: new Uint32Array(0) };
    let bandes = { positions: new Float32Array(0), uvs: new Float32Array(0), alphas: new Float32Array(0), indices: new Uint32Array(0) };
    if (v && actif && mTete) {
      const Mt = composer(M, mTete);
      const pxImage = 1 / Math.max(1e-6, ech * ppu);
      const rec = recouvrementsVisage(v, ep.visage, pxImage);
      // Zones colorées.
      let nv = 0;
      let ni = 0;
      for (const z of rec.zones) {
        nv += z.positions.length / 2;
        ni += z.indices.length;
      }
      zones = { positions: new Float32Array(2 * nv), couleurs: new Float32Array(4 * nv), indices: new Uint32Array(ni) };
      let bv = 0;
      let bi = 0;
      for (const z of rec.zones) {
        const k0 = bv;
        for (let k = 0; k < z.positions.length / 2; k++) {
          const p = appliquerM(Mt, z.positions[2 * k]!, z.positions[2 * k + 1]!);
          zones.positions[2 * bv] = p.x;
          zones.positions[2 * bv + 1] = p.y;
          const c = grader([z.couleurs[4 * k]!, z.couleurs[4 * k + 1]!, z.couleurs[4 * k + 2]!]);
          zones.couleurs.set([c[0], c[1], c[2], z.couleurs[4 * k + 3]!], 4 * bv);
          bv++;
        }
        for (const i of z.indices) zones.indices[bi++] = k0 + i;
      }
      // Bandes texturées.
      nv = 0;
      ni = 0;
      for (const b of rec.bandes) {
        nv += b.positions.length / 2;
        ni += b.indices.length;
      }
      bandes = { positions: new Float32Array(2 * nv), uvs: new Float32Array(2 * nv), alphas: new Float32Array(nv), indices: new Uint32Array(ni) };
      bv = 0;
      bi = 0;
      const L = rig.image.largeur;
      const H = rig.image.hauteur;
      for (const b of rec.bandes) {
        const k0 = bv;
        for (let k = 0; k < b.positions.length / 2; k++) {
          const p = appliquerM(Mt, b.positions[2 * k]!, b.positions[2 * k + 1]!);
          bandes.positions[2 * bv] = p.x;
          bandes.positions[2 * bv + 1] = p.y;
          bandes.uvs[2 * bv] = b.uvs[2 * k]! / L;
          bandes.uvs[2 * bv + 1] = b.uvs[2 * k + 1]! / H;
          bandes.alphas[bv] = b.alphas[k]!;
          bv++;
        }
        for (const i of b.indices) bandes.indices[bi++] = k0 + i;
      }
    }

    // Ombres de contact : corps (au sol, sous le milieu des pieds) + un noyau sous chaque pied.
    const ombres = this.ombresContact(ep, fk, racine, versMonde, camera, position, ech);

    // Liseré : direction écran → repère de l'image (miroir compris), en coordonnées de texture.
    const l = e.lisere;
    const miroir = pose.racine.flip ? -1 : 1;
    const lisereDir = l
      ? { x: (miroir * l.direction.x * l.largeur) / rig.image.largeur, y: (l.direction.y * l.largeur) / rig.image.hauteur }
      : { x: 0, y: 0 };
    return {
      visible: ep.visible && ep.opacite > 0.001,
      sommets,
      ordre: JSON.stringify(pose.ordreGroupes ?? null),
      zones,
      bandes,
      ombres,
      gain,
      decalage: dec,
      alpha: ep.opacite,
      lisereDir,
      lisereCouleur: l?.couleur ?? [1, 1, 1],
      lisere: l?.intensite ?? 0,
    };
  }

  private ombresContact(
    ep: EtatPersonnage,
    fk: EtatSquelette,
    racine: Mat2D,
    versMonde: Mat2D,
    camera: Mat2D,
    position: Vec2,
    ech: number,
  ): MaillageCouleur {
    const rig = this.rig;
    const o = ep.ombre;
    if (o.opacite <= 0) return anneauxGaussiens([]);
    const hauteurMonde = rig.hauteurPx * ech;
    const W = composer(versMonde, racine);
    const pied = (os: string, p: Vec2): Vec2 => {
      const m = matriceOs(rig.squelette, fk, os);
      return appliquerM(W, m.a * p.x + m.c * p.y + m.tx, m.b * p.x + m.d * p.y + m.ty);
    };
    const pg = rig.pieds ? pied(this.osPieds.G, rig.pieds.gauche) : position;
    const pd = rig.pieds ? pied(this.osPieds.D, rig.pieds.droit) : position;
    const sol = position.y;
    // Hauteur du corps au-dessus du sol (saut) : décalage de la racine.
    const saut = Math.max(0, -ep.pose.racine.decalage.y * ech);
    const facteurSaut = Math.exp(-saut / (0.25 * hauteurMonde));
    const s = Math.hypot(camera.a, camera.b);
    const rot = Math.atan2(camera.b, camera.a);
    const versEcran = (x: number, y: number) => appliquerM(camera, x, y);
    const C = REGLAGES_OMBRES.couleur;
    const ellipses: EllipseDouce[] = [];
    const ecartPieds = Math.abs(pg.x - pd.x);
    const rxCorps = (o.largeur * 1.1 + 0.5 * ecartPieds) * (1 + (0.4 * saut) / hauteurMonde);
    ellipses.push({
      centre: versEcran((pg.x + pd.x) / 2, sol),
      rx: rxCorps * s,
      ry: rxCorps * o.aplatissement * s,
      rotation: rot,
      couleur: C,
      alpha: o.opacite * REGLAGES_OMBRES.corps * facteurSaut,
    });
    for (const p of [pg, pd]) {
      const leve = Math.max(0, sol - p.y);
      const f = Math.exp(-leve / (0.035 * hauteurMonde));
      const rx = o.largeur * REGLAGES_OMBRES.largeurPied;
      ellipses.push({
        centre: versEcran(p.x, sol),
        rx: rx * s * (1 + leve / (0.05 * hauteurMonde)),
        ry: rx * o.aplatissement * 1.2 * s,
        rotation: rot,
        couleur: C,
        alpha: o.opacite * REGLAGES_OMBRES.pied * f,
      });
    }
    return anneauxGaussiens(ellipses);
  }

  /** Envoie la géométrie d'une image. */
  appliquer(g: GeometriePersonnage): void {
    this.conteneur.visible = g.visible;
    this.ombres.mesh.visible = g.visible && g.ombres.indices.length > 0;
    if (!g.visible) return;
    majTampon(this.corpsAvant.tampons.aPosition!, g.sommets);
    if (g.ordre !== this.ordreCourant) {
      const o = this.indicesOrdonnes(JSON.parse(g.ordre) ?? undefined);
      majTampon(this.corpsAvant.indices, o.avant);
      majTampon(this.corpsApres.indices, o.apres);
      this.ordreCourant = g.ordre;
    }
    const u = uniformes(this.shaderCorps);
    u.uGain = [...g.gain];
    u.uDecalage = [...g.decalage];
    u.uAlpha = g.alpha;
    u.uLisereDir = [g.lisereDir.x, g.lisereDir.y];
    u.uLisereCouleur = [...g.lisereCouleur];
    u.uLisere = g.lisere;
    uniformes(this.shaderZones).uAlpha = g.alpha;
    this.zones.mesh.visible = g.zones.indices.length > 0;
    if (g.zones.indices.length > 0) {
      majTampon(this.zones.tampons.aPosition!, g.zones.positions);
      majTampon(this.zones.tampons.aColor!, g.zones.couleurs);
      majTampon(this.zones.indices, g.zones.indices);
    }
    this.bandes.mesh.visible = g.bandes.indices.length > 0;
    if (g.bandes.indices.length > 0) {
      majTampon(this.bandes.tampons.aPosition!, g.bandes.positions);
      majTampon(this.bandes.tampons.aUV!, g.bandes.uvs);
      majTampon(this.bandes.tampons.aAlpha!, g.bandes.alphas);
      majTampon(this.bandes.indices, g.bandes.indices);
    }
    if (g.ombres.indices.length > 0) {
      majTampon(this.ombres.tampons.aPosition!, g.ombres.positions);
      majTampon(this.ombres.tampons.aColor!, g.ombres.couleurs);
      majTampon(this.ombres.indices, g.ombres.indices);
    }
  }
}

/** Écart maximal (px) entre les sommets de deux géométries d'un même personnage. */
export function ecartPersonnage(a: GeometriePersonnage, b: GeometriePersonnage): number {
  let m = 0;
  const x = a.sommets;
  const y = b.sommets;
  for (let i = 0; i < Math.min(x.length, y.length); i += 2) {
    const d = Math.abs(x[i]! - y[i]!) + Math.abs(x[i + 1]! - y[i + 1]!);
    if (d > m) m = d;
  }
  if (a.zones.positions.length !== b.zones.positions.length || a.bandes.positions.length !== b.bandes.positions.length) return Math.max(m, 1e9);
  for (const [p, q] of [
    [a.zones.positions, b.zones.positions],
    [a.bandes.positions, b.bandes.positions],
  ] as const) {
    for (let i = 0; i < p.length; i++) m = Math.max(m, Math.abs(p[i]! - q[i]!));
  }
  return m;
}

