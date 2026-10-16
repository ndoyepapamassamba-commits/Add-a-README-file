/**
 * Décor 2,5D dans la page : maillages en grille déplacés par la profondeur (parallaxe), en quatre couches.
 *
 * 1. **plaque** (sans figurants, profondeur de la plaque), dessinée seulement sous les personnes : c'est elle qui
 *    apparaît derrière un figurant qui bouge ou que la parallaxe décale (pas de déchirure ni de « fantôme ») ;
 * 2. **peinture** (image source, deux fois plus fine que la plaque), alpha = 1 − masque des personnes ;
 * 3. **ciel** (masque vert) : copie de la peinture prolongée sous les toits (push-pull), qui dérive en boucle ; les
 *    détails fins devant le ciel (fils, ampoules) restent fixes ;
 * 4. **figurants** (peinture, alpha = masque rouge adouci, profondeur avec les personnes) : respiration,
 *    balancement et tête vivante par cellule de personne, phases différentes ;
 * plus des **halos** additifs sur les taches de lumière (ampoules, néons) qui scintillent doucement.
 *
 * Immobile, l'empilement redonne exactement la peinture source. Les images sont lues sur place (URL servies par
 * l'appelant), jamais copiées.
 */
import { Container, Shader } from 'pixi.js';
import type { EtatImage, InfoDecor, Mat2D } from '../timeline/types';
import { REGLAGES_DECOR } from '../scene/decor';
import { analyserPixelsDecor } from '../scene/analyse-pixels';
import {
  canal,
  carteAuxSommets,
  cellulesCouvertes,
  creerGrille,
  deplacementsFigurants,
  detecterFigurants,
  detecterLumieres,
  flouBoite,
  indicesGrille,
  intensiteHalo,
  projeterGrille,
  remplirPushPull,
  vieAuxSommets,
  type Carte,
  type GrilleDecor,
  type TacheLumiere,
  type VieFigurants,
} from './geometrie';
import { chargerImage, creerMaillage, creerShader, lirePixels, majTampon, programme, textureImage, texturePixels, uniformes, type MaillageLibre } from './pixi';
import { FRAGMENT_CIEL, FRAGMENT_COULEUR, FRAGMENT_DECOR, FRAGMENT_OCCULTATION, SOMMET_COULEUR, SOMMET_TEXTURE } from './shaders';
import { anneauxGaussiens, type MaillageCouleur } from './formes';

/** Géométrie d'une image du décor (calculée sur le processeur, puis envoyée). */
export interface GeometrieDecor {
  fond: Float32Array;
  avant: Float32Array;
  halos: MaillageCouleur;
  cielPhase: number;
  cielActif: boolean;
  figurantsActifs: boolean;
}

/** Réglages de la grille et des couches. */
export const REGLAGES_RENDU_DECOR = Object.freeze({
  lignes: 64,
  /** Rayon du flou des cartes de profondeur (px de la carte 512) : déformation douce, sans marches. */
  flouProfondeur: 2,
  /** Intensité des halos (additifs). */
  halo: 0.3,
  /** Rayon des halos, en rayons de tache, et rayon maximal (fraction de la hauteur de sortie). */
  rayonHalo: 2.8,
  rayonHaloMax: 0.035,
  /** Nombre maximal de halos. */
  halosMax: 24,
  /** Occultation : marge de profondeur au-delà du sol sous les pieds, et largeur de la transition. */
  occultationMarge: 0.07,
  occultationDouceur: 0.05,
});

export class DecorRendu {
  readonly conteneur = new Container();
  readonly info: InfoDecor;
  private grille!: GrilleDecor;
  private dFond!: Float32Array;
  private dAvant!: Float32Array;
  private vie: VieFigurants | null = null;
  private taches: Array<TacheLumiere & { d: number }> = [];
  private plaque!: MaillageLibre;
  private peinture!: MaillageLibre;
  private peintureOpaque!: MaillageLibre;
  private ciel: MaillageLibre | null = null;
  private figurants: MaillageLibre | null = null;
  private halos!: MaillageLibre;
  private shaderCiel: Shader | null = null;
  private vieTampon!: Float32Array;
  private maxProfCellule!: Float32Array;
  private texSource: import('pixi.js').Texture | null = null;
  private texProfondeur: import('pixi.js').Texture | null = null;
  private readonly occulteurs = new Map<string, MaillageLibre>();
  private imgSrc: HTMLImageElement | null = null;
  private imgProf: HTMLImageElement | null = null;
  /** Durée du chargement (ms). */
  dureeChargement = 0;

  private constructor(info: InfoDecor) {
    this.info = info;
  }

  /** Charge un décor : images, cartes, textures préparées, maillages. */
  static async charger(info: InfoDecor, url: (chemin: string) => string): Promise<DecorRendu> {
    const t0 = performance.now();
    const d = new DecorRendu(info);
    const f = info.fichiers;
    const [src, plate, depth, plateDepth, masks, people] = await Promise.all([
      chargerImage(url(f.src)),
      chargerImage(url(f.plate)),
      chargerImage(url(f.depth)),
      chargerImage(url(f.plateDepth)),
      chargerImage(url(f.masks)),
      f.people ? chargerImage(url(f.people)) : Promise.resolve(null),
    ]);
    await d.preparer(src, plate, depth, plateDepth, masks, people);
    d.dureeChargement = performance.now() - t0;
    return d;
  }

  private async preparer(
    src: HTMLImageElement,
    plate: HTMLImageElement,
    depth: HTMLImageElement,
    plateDepth: HTMLImageElement,
    masks: HTMLImageElement,
    people: HTMLImageElement | null,
  ): Promise<void> {
    const info = this.info;
    const aspect = info.aspect;
    const LM = 512;
    const HM = Math.round(LM / aspect);
    // Cartes (512 de large).
    const pMasques = lirePixels(masks, LM, HM);
    const figurantsRouge = canal(pMasques.data, LM, HM, 0);
    const cielVert = canal(pMasques.data, LM, HM, 1);
    const personnes = people ? canal(lirePixels(people, LM, HM).data, LM, HM, 0) : figurantsRouge;
    const personnesDoux = flouBoite(personnes, 2, 2);
    const rougeDoux = flouBoite(figurantsRouge, 2, 2);
    const cielDoux = flouBoite(cielVert, 1, 2);
    const pPlateDepth = lirePixels(plateDepth, LM, HM);
    const profFond = flouBoite(canal(pPlateDepth.data, LM, HM, 0), REGLAGES_RENDU_DECOR.flouProfondeur, 2);
    const profAvant = flouBoite(canal(lirePixels(depth, LM, HM).data, LM, HM, 0), REGLAGES_RENDU_DECOR.flouProfondeur, 2);

    // Analyse (si l'appelant ne l'a pas fournie) : utile au placement et à la caméra (même algorithme que Node).
    if (!info.analyse) {
      const pPlaque = lirePixels(plate, 256);
      const pm = lirePixels(masks, 256, pPlaque.height);
      const pd = lirePixels(plateDepth, 256, pPlaque.height);
      (info as { analyse?: InfoDecor['analyse'] }).analyse = analyserPixelsDecor(
        { largeur: pPlaque.width, hauteur: pPlaque.height, donnees: pPlaque.data },
        { largeur: pm.width, hauteur: pm.height, donnees: pm.data },
        { largeur: pd.width, hauteur: pd.height, donnees: pd.data },
        info.fit,
      );
    }

    // Grille.
    const lignes = REGLAGES_RENDU_DECOR.lignes;
    const colonnes = Math.round(lignes * aspect);
    const g = creerGrille(aspect, colonnes, lignes, 0.03);
    this.grille = g;
    this.dFond = carteAuxSommets(profFond, g);
    this.dAvant = carteAuxSommets(profAvant, g);
    // Occultation : profondeur maximale (plaque, non floutée) par cellule de la grille.
    this.maxProfCellule = maxParCellule(canal(pPlateDepth.data, LM, HM, 0), g);
    this.imgSrc = src;
    this.imgProf = plateDepth;
    this.vieTampon = new Float32Array(2 * g.nx * g.ny);

    // Textures : peinture (alpha = 1 − personnes), figurants (alpha = rouge adouci), plaque.
    const LS = src.width;
    const HS = src.height;
    const pSrc = lirePixels(src);
    const masquePersonnesHaut = agrandirCarte(personnesDoux, LS, HS);
    const masqueRougeHaut = agrandirCarte(rougeDoux, LS, HS);
    const peintureFond = new Uint8ClampedArray(pSrc.data);
    const peintureFigurants = new Uint8ClampedArray(pSrc.data);
    for (let i = 0; i < LS * HS; i++) {
      peintureFond[4 * i + 3] = Math.round(255 * (1 - Math.min(1, masquePersonnesHaut[i]! * 1.15)));
      peintureFigurants[4 * i + 3] = Math.round(255 * Math.min(1, masqueRougeHaut[i]! * 1.2));
    }
    const tPeinture = texturePixels(peintureFond, LS, HS);
    const tFigurants = texturePixels(peintureFigurants, LS, HS);
    const tPlaque = textureImage(plate);

    const progDecor = programme('decor', SOMMET_TEXTURE, FRAGMENT_DECOR);
    const uvs = g.uvs;
    const alphas = new Float32Array(g.nx * g.ny).fill(1);
    const fond = new Float32Array(2 * g.nx * g.ny);
    const avant = new Float32Array(2 * g.nx * g.ny);
    const shader = (t: { source: import('pixi.js').TextureSource }) =>
      creerShader(progDecor, { uAlpha: { value: 1, type: 'f32' } }, { uTexture: t.source });
    // Les couches partagent les tampons de positions (fond / avant) et de coordonnées de texture.
    this.plaque = creerMaillage(
      [
        { nom: 'aPosition', composantes: 2, donnees: fond },
        { nom: 'aUV', composantes: 2, donnees: uvs },
        { nom: 'aAlpha', composantes: 1, donnees: alphas },
      ],
      indicesGrille(g, cellulesCouvertes(personnesDoux, g, 0.02, 1)),
      shader(tPlaque),
    );
    // Les autres couches du fond partagent les tampons de la plaque (une seule mise à jour par image).
    const tf = this.plaque.tampons;
    const attributsFond = () => [
      { nom: 'aPosition', composantes: 2 as const, donnees: tf.aPosition! },
      { nom: 'aUV', composantes: 2 as const, donnees: tf.aUV! },
      { nom: 'aAlpha', composantes: 1 as const, donnees: tf.aAlpha! },
    ];
    // La peinture est opaque hors des personnes : ces cellules sont dessinées sans mélange (moins cher sous
    // SwiftShader), les autres avec le mélange normal par-dessus la plaque.
    const sousPersonnes = cellulesCouvertes(personnesDoux, g, 0.004, 1);
    const shaderPeinture = shader(tPeinture);
    this.peintureOpaque = creerMaillage(attributsFond(), indicesGrille(g, (i, j) => !sousPersonnes(i, j)), shaderPeinture);
    this.peintureOpaque.mesh.blendMode = 'none';
    this.peinture = creerMaillage(attributsFond(), indicesGrille(g, sousPersonnes), shaderPeinture);
    this.conteneur.addChild(this.peintureOpaque.mesh, this.plaque.mesh, this.peinture.mesh);

    // Ciel : peinture réduite, prolongée sous les toits, et masque fixe sans les détails fins.
    const partCiel = info.analyse?.ciel ?? 0;
    if (partCiel > 0.004) {
      const LC = 1024;
      const HC = Math.round(LC / aspect);
      const pC = lirePixels(src, LC, HC);
      const cielHaut = agrandirCarte(cielVert, LC, HC);
      const connu = new Float32Array(LC * HC);
      for (let i = 0; i < LC * HC; i++) connu[i] = cielHaut[i]! > 0.5 ? 1 : 0;
      const rempli = remplirPushPull(pC.data, LC, HC, connu);
      const tCiel = texturePixels(rempli, LC, HC);
      // Masque : ciel adouci × (1 − détails). Détails = gradient de luminance local (fils, ampoules, branches).
      const lum = new Float32Array(LC * HC);
      for (let i = 0; i < LC * HC; i++) lum[i] = (0.3 * pC.data[4 * i]! + 0.59 * pC.data[4 * i + 1]! + 0.11 * pC.data[4 * i + 2]!) / 255;
      const grad = new Float32Array(LC * HC);
      for (let y = 1; y < HC - 1; y++)
        for (let x = 1; x < LC - 1; x++) {
          const i = y * LC + x;
          grad[i] = Math.hypot(lum[i + 1]! - lum[i - 1]!, lum[i + LC]! - lum[i - LC]!);
        }
      const details = flouBoite({ largeur: LC, hauteur: HC, valeurs: grad }, 2, 2);
      const cielHautDoux = agrandirCarte(cielDoux, LC, HC);
      const masque = new Uint8ClampedArray(4 * LC * HC);
      for (let i = 0; i < LC * HC; i++) {
        const d = Math.min(1, Math.max(0, (details.valeurs[i]! - 0.02) / 0.05));
        const m = Math.round(255 * Math.min(1, Math.max(0, (cielHautDoux[i]! - 0.15) / 0.7)) * (1 - d));
        masque[4 * i] = m;
        masque[4 * i + 1] = m;
        masque[4 * i + 2] = m;
        masque[4 * i + 3] = 255;
      }
      const tMasque = texturePixels(masque, LC, HC);
      const progCiel = programme('ciel', SOMMET_TEXTURE, FRAGMENT_CIEL);
      this.shaderCiel = creerShader(
        progCiel,
        {
          uPhase: { value: 0, type: 'f32' },
          uDerive: { value: REGLAGES_DECOR.cielDerive, type: 'f32' },
          uAlpha: { value: 1, type: 'f32' },
        },
        { uTexture: tCiel.source, uMasque: tMasque.source },
      );
      this.ciel = creerMaillage(attributsFond(), indicesGrille(g, cellulesCouvertes(cielDoux, g, 0.1, 0)), this.shaderCiel);
      this.conteneur.addChild(this.ciel.mesh);
    }

    // Figurants.
    if ((info.analyse?.figurants ?? 1) > 0.001) {
      const graine = hashTexte(info.id);
      const { cellules, etiquettes } = detecterFigurants(personnes, info.fit, graine);
      this.vie = vieAuxSommets(g, cellules, etiquettes, personnesDoux, LM, HM);
      this.figurants = creerMaillage(
        [
          { nom: 'aPosition', composantes: 2, donnees: avant },
          { nom: 'aUV', composantes: 2, donnees: tf.aUV! },
          { nom: 'aAlpha', composantes: 1, donnees: tf.aAlpha! },
        ],
        // Seules les cellules des personnes (et leur voisinage) sont redessinées : ailleurs, la couche est identique
        // à la peinture déjà posée.
        indicesGrille(g, cellulesCouvertes(personnesDoux, g, 0.02, 1)),
        shader(tFigurants),
      );
      this.conteneur.addChild(this.figurants.mesh);
    }

    // Halos des lumières (taches détectées sur la peinture réduite), avec leur profondeur.
    const pL = lirePixels(src, LM, HM);
    this.taches = detecterLumieres(pL.data, LM, HM, hashTexte(info.id) ^ 0x51ed, { max: REGLAGES_RENDU_DECOR.halosMax }).map((t) => ({
      ...t,
      d: lireProfondeur(profAvant, t.u, t.v),
    }));
    const progCouleur = programme('couleur', SOMMET_COULEUR, FRAGMENT_COULEUR);
    this.halos = creerMaillage(
      [
        { nom: 'aPosition', composantes: 2, donnees: new Float32Array(2) },
        { nom: 'aColor', composantes: 4, donnees: new Float32Array(4) },
      ],
      new Uint32Array(3),
      creerShader(progCouleur, { uAlpha: { value: 1, type: 'f32' } }, {}),
    );
    this.halos.mesh.blendMode = 'add';
    this.conteneur.addChild(this.halos.mesh);
  }

  /** Calcule la géométrie d'une image (processeur seulement). */
  preparerImage(etat: EtatImage, camera: Mat2D, ppu: number): GeometrieDecor {
    const g = this.grille;
    const decor = etat.decor!;
    const centre = etat.camera.centre;
    const fond = new Float32Array(2 * g.nx * g.ny);
    const avant = new Float32Array(2 * g.nx * g.ny);
    projeterGrille(g.repos, this.dFond, decor.parallaxe, centre, camera, fond);
    const figurantsActifs = !!this.vie && decor.figurants.actifs && decor.figurants.amplitude > 0;
    if (figurantsActifs) {
      deplacementsFigurants(g, this.vie!, decor.figurants.temps, decor.figurants.amplitude, this.vieTampon);
      projeterGrille(g.repos, this.dAvant, decor.parallaxe, centre, camera, avant, this.vieTampon);
    } else {
      projeterGrille(g.repos, this.dAvant, decor.parallaxe, centre, camera, avant);
    }
    // Halos.
    const centresHalos: Array<{ x: number; y: number; r: number; couleur: [number, number, number]; a: number }> = [];
    const amp = decor.lumieres.amplitude;
    if (amp > 0) {
      for (const t of this.taches) {
        const e = t.d - decor.parallaxe.profondeurReference;
        const s = 1 + e * decor.parallaxe.poussee;
        const wx = t.u * this.info.aspect;
        const wy = t.v;
        const px = centre.x + (wx - centre.x) * s + e * decor.parallaxe.decalage.x;
        const py = centre.y + (wy - centre.y) * s + e * decor.parallaxe.decalage.y;
        const x = camera.a * px + camera.c * py + camera.tx;
        const y = camera.b * px + camera.d * py + camera.ty;
        const r = Math.min(REGLAGES_RENDU_DECOR.rayonHaloMax * ppu / Math.max(1, etat.camera.zoom), Math.max(3, t.rayon * REGLAGES_RENDU_DECOR.rayonHalo * ppu));
        const a = REGLAGES_RENDU_DECOR.halo * amp * intensiteHalo(t, decor.lumieres.temps);
        centresHalos.push({ x, y, r, couleur: t.couleur, a });
      }
    }
    const halos = anneauxGaussiens(centresHalos.map((h) => ({ centre: { x: h.x, y: h.y }, rx: h.r, ry: h.r, couleur: h.couleur, alpha: h.a })));
    const cielPhase = (((decor.ciel.temps / REGLAGES_DECOR.cielPeriode) % 1) + 1) % 1;
    return { fond, avant, halos, cielPhase, cielActif: decor.ciel.actif, figurantsActifs };
  }

  /**
   * Indices des cellules qui peuvent occulter un personnage : cellules de la boîte `uv` (fractions du décor) dont la
   * profondeur maximale dépasse le seuil, au-dessus de ses pieds. `null` si rien ne l'occulte. Renvoie aussi le
   * seuil (profondeur du sol sous les pieds + marge).
   */
  occultation(boite: { u0: number; u1: number; v0: number; v1: number }, dSol: number, vPieds: number): { indices: Uint32Array; seuil: number } | null {
    const g = this.grille;
    // La profondeur du sol sous les pieds vient de l'ajustement de la carte (robuste aux objets posés devant) ;
    // sans ajustement fiable, pas d'occultation (l'échelle des profondeurs serait incohérente).
    const sol = this.info.analyse?.sol;
    if (!sol || sol.r2 < 0.5 || sol.a <= 0) return null;
    const seuil = dSol + REGLAGES_RENDU_DECOR.occultationMarge;
    const u0 = g.uvLibres[0]!;
    const du = g.uvLibres[2]! - u0;
    const v0 = g.uvLibres[1]!;
    const dv = g.uvLibres[2 * g.nx + 1]! - v0;
    const cx = g.nx - 1;
    const cy = g.ny - 1;
    const i0 = Math.max(0, Math.floor((boite.u0 - u0) / du) - 1);
    const i1 = Math.min(cx - 1, Math.floor((boite.u1 - u0) / du) + 1);
    const j0 = Math.max(0, Math.floor((boite.v0 - v0) / dv) - 1);
    const j1 = Math.min(cy - 1, Math.floor((Math.min(boite.v1, vPieds) - v0) / dv) + 1);
    const idx: number[] = [];
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        if (this.maxProfCellule[j * cx + i]! <= seuil) continue;
        const a = j * g.nx + i;
        idx.push(a, a + 1, a + g.nx + 1, a, a + g.nx + 1, a + g.nx);
      }
    return idx.length > 0 ? { indices: Uint32Array.from(idx), seuil } : null;
  }

  /** Maillage d'occultation d'un personnage (créé à la demande, partage les sommets du fond). */
  occulteur(id: string): MaillageLibre {
    let m = this.occulteurs.get(id);
    if (!m) {
      if (!this.texSource) this.texSource = textureImage(this.imgSrc!);
      if (!this.texProfondeur) this.texProfondeur = textureImage(this.imgProf!);
      const tf = this.plaque.tampons;
      m = creerMaillage(
        [
          { nom: 'aPosition', composantes: 2, donnees: tf.aPosition! },
          { nom: 'aUV', composantes: 2, donnees: tf.aUV! },
          { nom: 'aAlpha', composantes: 1, donnees: tf.aAlpha! },
        ],
        new Uint32Array(3),
        creerShader(
          programme('occultation', SOMMET_TEXTURE, FRAGMENT_OCCULTATION),
          {
            uSeuil: { value: 1, type: 'f32' },
            uDouceur: { value: REGLAGES_RENDU_DECOR.occultationDouceur, type: 'f32' },
            uVPieds: { value: 1, type: 'f32' },
          },
          { uTexture: this.texSource.source, uProfondeur: this.texProfondeur.source },
        ),
      );
      this.occulteurs.set(id, m);
    }
    return m;
  }

  /** Libère les textures et maillages du décor. */
  detruire(): void {
    this.conteneur.destroy({ children: true, texture: true, textureSource: true });
    for (const m of this.occulteurs.values()) m.mesh.destroy();
    this.texSource?.destroy(true);
    this.texProfondeur?.destroy(true);
    this.occulteurs.clear();
  }

  /** Envoie la géométrie d'une image. */
  appliquer(geo: GeometrieDecor): void {
    majTampon(this.plaque.tampons.aPosition!, geo.fond);
    if (this.figurants) majTampon(this.figurants.tampons.aPosition!, geo.avant);
    if (this.ciel && this.shaderCiel) {
      this.ciel.mesh.visible = geo.cielActif;
      uniformes(this.shaderCiel).uPhase = geo.cielPhase;
    }
    const h = geo.halos;
    this.halos.mesh.visible = h.indices.length > 0;
    if (h.indices.length > 0) {
      majTampon(this.halos.tampons.aPosition!, h.positions);
      majTampon(this.halos.tampons.aColor!, h.couleurs);
      majTampon(this.halos.indices, h.indices);
    }
  }

  /** Positions écran de la grille du fond et de l'avant (pour la mesure du mouvement entre sous-images). */
  static ecart(a: GeometrieDecor, b: GeometrieDecor): number {
    let m = 0;
    for (const [x, y] of [
      [a.fond, b.fond],
      [a.avant, b.avant],
    ] as const) {
      for (let i = 0; i < x.length; i += 2) {
        const d = Math.abs(x[i]! - y[i]!) + Math.abs(x[i + 1]! - y[i + 1]!);
        if (d > m) m = d;
      }
    }
    return m;
  }
}

/** Agrandit une carte (bilinéaire) à `L × H`. */
function agrandirCarte(c: Carte, L: number, H: number): Float32Array {
  const r = new Float32Array(L * H);
  const sx = c.largeur / L;
  const sy = c.hauteur / H;
  for (let y = 0; y < H; y++) {
    const fy = Math.min(c.hauteur - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(c.hauteur - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < L; x++) {
      const fx = Math.min(c.largeur - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(c.largeur - 1, x0 + 1);
      const tx = fx - x0;
      const v = c.valeurs;
      const W = c.largeur;
      r[y * L + x] = (v[y0 * W + x0]! * (1 - tx) + v[y0 * W + x1]! * tx) * (1 - ty) + (v[y1 * W + x0]! * (1 - tx) + v[y1 * W + x1]! * tx) * ty;
    }
  }
  return r;
}

function lireProfondeur(c: Carte, u: number, v: number): number {
  const x = Math.min(c.largeur - 1, Math.max(0, Math.floor(u * c.largeur)));
  const y = Math.min(c.hauteur - 1, Math.max(0, Math.floor(v * c.hauteur)));
  return c.valeurs[y * c.largeur + x]!;
}

function hashTexte(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Profondeur maximale de la carte dans chaque cellule de la grille. */
function maxParCellule(c: Carte, g: GrilleDecor): Float32Array {
  const cx = g.nx - 1;
  const cy = g.ny - 1;
  const r = new Float32Array(cx * cy);
  const u0 = g.uvLibres[0]!;
  const uL = g.uvLibres[2 * (g.nx - 1)]! - u0;
  const v0 = g.uvLibres[1]!;
  const vL = g.uvLibres[2 * g.nx * (g.ny - 1) + 1]! - v0;
  for (let y = 0; y < c.hauteur; y++) {
    const v = (y + 0.5) / c.hauteur;
    const j = Math.min(cy - 1, Math.max(0, Math.floor(((v - v0) / vL) * cy)));
    for (let x = 0; x < c.largeur; x++) {
      const u = (x + 0.5) / c.largeur;
      const i = Math.min(cx - 1, Math.max(0, Math.floor(((u - u0) / uL) * cx)));
      const k = j * cx + i;
      const d = c.valeurs[y * c.largeur + x]!;
      if (d > r[k]!) r[k] = d;
    }
  }
  return r;
}
