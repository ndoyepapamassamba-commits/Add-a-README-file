/**
 * Moteur de rendu de la page (PixiJS v8, WebGL 2, sans boucle d'animation) : dessine des `EtatImage`.
 *
 * Passes d'une image :
 * 1. pour chaque sous-état (flou de bougé exact, `t + k·Δt/N` dans l'obturation) : la scène (décor 2,5D, ombres,
 *    personnages, visages) est dessinée dans une texture de rendu, puis **ajoutée avec le poids 1/N** dans un tampon
 *    d'accumulation en flottants 16 bits (repli 8 bits) ; le filé de la caméra y ajoute un flou directionnel de la
 *    longueur parcourue pendant la sous-obturation (pas de stroboscope sur un panoramique filé) ;
 * 2. passe finale vers le canevas : effets plein cadre (désaturation, vignette, flash, fondu) et tramage ;
 * 3. sous-titres par-dessus (ni flous ni désaturés).
 * Les sous-états identiques à moins de 0,35 px près ne sont dessinés qu'une fois (le résultat est le même).
 */
import { Application, Container, Graphics, RenderTexture, type Shader, type Texture } from 'pixi.js';
import { inverser } from '../noyau/maths2d';
import { matriceCamera } from '../timeline/projection';
import type { CharacterRig, Couleur, EffetsImage, EtatImage, InfoDecor, OptionsPageRendu, Ressources } from '../timeline/types';
import { statsLabImage } from '../scene/couleur';
import { DecorRendu, type GeometrieDecor } from './decorRendu';
import { ecartPersonnage, PersonnageRendu, type GeometriePersonnage } from './personnageRendu';
import { chargerImage, creerMaillage, creerShader, lirePixels, majTampon, programme, textureImage, uniformes, type MaillageLibre } from './pixi';
import { FRAGMENT_ACCUMULATION, FRAGMENT_FINAL, SOMMET_ECRAN } from './shaders';
import { CoucheSousTitres } from './sousTitres';

/** Mesures d'une image rendue (ms). */
export interface MesureImage {
  sousImages: number;
  sousImagesRendues: number;
  /** Écart maximal (px) entre la première et la dernière sous-image. */
  ecartPx: number;
  msPreparation: number;
  msRendu: number;
  msTotal: number;
}

/** Nombre maximal de décors gardés en mémoire (les moins récemment utilisés sont libérés). */
export const DECORS_EN_MEMOIRE = 4;

/** Seuil (px) sous lequel les sous-images sont considérées identiques. */
export const SEUIL_FLOU_PX = 0.35;
/**
 * Lectures maximales du flou directionnel (filé) : par sous-image accumulée, et en passe finale sans
 * accumulation. Au-delà, les lectures s'espacent (le filé reste un trait continu à ces vitesses).
 */
export const TAPS_MAX_ACCUMULATION = 12;
export const TAPS_MAX_FINAL = 24;

interface GeometrieImage {
  etat: EtatImage;
  decor: DecorRendu | null;
  geoDecor: GeometrieDecor | null;
  persos: Array<{
    id: string;
    rendu: PersonnageRendu;
    geo: GeometriePersonnage;
    occultation: { indices: Uint32Array; seuil: number; vPieds: number } | null;
  }>;
}

export class MoteurRendu {
  app: Application | null = null;
  L = 1080;
  H = 1920;
  fond: Couleur = [0, 0, 0];
  ressources: Ressources = { rigs: {}, decors: {} };
  private urlRessources = '';
  private rtScene!: RenderTexture;
  private rtAccum!: RenderTexture;
  /** Décor dessiné une fois par image quand il ne bouge pas entre les sous-images. */
  private rtDecor!: RenderTexture;
  private readonly coucheDecorCache = new Container();
  private shaderCopie!: Shader;
  /** Nombre d'images dont le décor a été mis en cache (diagnostic). */
  decorsEnCache = 0;
  /** Autorise la mise en cache du décor immobile entre sous-images (défaut vrai). */
  cacheDecor = true;
  formatAccumulation: 'rgba16float' | 'rgba8unorm' = 'rgba8unorm';
  private retourne = 0;
  private readonly scene = new Container();
  private readonly coucheDecor = new Container();
  private readonly coucheOmbres = new Container();
  private readonly couchePersos = new Container();
  private accum!: MaillageLibre;
  private final!: MaillageLibre;
  private readonly conteneurAccum = new Container();
  private readonly conteneurFinal = new Container();
  private shaderAccum!: Shader;
  private shaderFinal!: Shader;
  private readonly sousTitres = new CoucheSousTitres();
  private readonly decors = new Map<string, Promise<DecorRendu>>();
  private readonly decorsPrets = new Map<string, DecorRendu>();
  private readonly usageDecors = new Map<string, number>();
  private compteurUsage = 0;
  private readonly textures = new Map<string, Promise<Texture>>();
  private readonly persos = new Map<string, PersonnageRendu>();
  private readonly texturesPretes = new Map<string, Texture>();
  /** Ne dessiner qu'une fois les sous-états identiques (à `SEUIL_FLOU_PX` près). */
  flouAdaptatif = true;
  private readonly pixelSync = new Uint8Array(4);

  get pret(): boolean {
    return this.app !== null;
  }

  url(chemin: string): string {
    return `${this.urlRessources}/${encodeURIComponent(chemin)}`;
  }

  async initialiser(o: OptionsPageRendu): Promise<void> {
    this.L = o.largeur;
    this.H = o.hauteur;
    this.fond = o.fond ?? [0, 0, 0];
    this.ressources = o.ressources ?? { rigs: {}, decors: {} };
    this.urlRessources = o.urlRessources.replace(/\/+$/, '');
    const app = new Application();
    await app.init({
      width: this.L,
      height: this.H,
      autoStart: false,
      sharedTicker: false,
      preserveDrawingBuffer: true,
      antialias: false,
      backgroundAlpha: 1,
      background: 0x000000,
      preference: 'webgl',
      resolution: 1,
      autoDensity: false,
      hello: false,
    });
    app.ticker?.stop();
    document.body.appendChild(app.canvas);
    this.app = app;
    const gl = (app.renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
    const flottant = !!gl && !!gl.getExtension('EXT_color_buffer_float');
    this.formatAccumulation = flottant ? 'rgba16float' : 'rgba8unorm';
    this.rtScene = RenderTexture.create({ width: this.L, height: this.H, antialias: false });
    this.rtAccum = RenderTexture.create({ width: this.L, height: this.H, antialias: false, format: this.formatAccumulation });
    this.rtDecor = RenderTexture.create({ width: this.L, height: this.H, antialias: false });
    this.rtScene.source.style.scaleMode = 'linear';
    this.rtAccum.source.style.scaleMode = 'linear';
    this.rtScene.source.style.addressMode = 'clamp-to-edge';

    // Quadrilatères plein écran.
    const pos = new Float32Array([0, 0, this.L, 0, this.L, this.H, 0, this.H]);
    const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    const idx = new Uint32Array([0, 1, 2, 0, 2, 3]);
    this.shaderAccum = creerShader(
      programme('accumulation', SOMMET_ECRAN, FRAGMENT_ACCUMULATION),
      {
        uFlou: { value: [0, 0], type: 'vec2<f32>' },
        uTaps: { value: 1, type: 'f32' },
        uPoids: { value: 1, type: 'f32' },
        uRetourne: { value: 0, type: 'f32' },
      },
      { uTexture: this.rtScene.source },
    );
    this.accum = creerMaillage(
      [
        { nom: 'aPosition', composantes: 2, donnees: pos },
        { nom: 'aUV', composantes: 2, donnees: uv },
      ],
      idx,
      this.shaderAccum,
    );
    this.accum.mesh.blendMode = 'add';
    this.conteneurAccum.addChild(this.accum.mesh);
    this.shaderFinal = creerShader(
      programme('final', SOMMET_ECRAN, FRAGMENT_FINAL),
      {
        uFlou: { value: [0, 0], type: 'vec2<f32>' },
        uTaps: { value: 1, type: 'f32' },
        uRetourne: { value: 0, type: 'f32' },
        uDesaturation: { value: 0, type: 'f32' },
        uVignette: { value: 0, type: 'f32' },
        uFondu: { value: 0, type: 'f32' },
        uFlash: { value: 0, type: 'f32' },
        uRapport: { value: this.L / this.H, type: 'f32' },
        uFond: { value: [...this.fond], type: 'vec3<f32>' },
        uExposition: { value: 1, type: 'f32' },
      },
      { uTexture: this.rtScene.source },
    );
    this.final = creerMaillage(
      [
        { nom: 'aPosition', composantes: 2, donnees: pos },
        { nom: 'aUV', composantes: 2, donnees: uv },
      ],
      idx,
      this.shaderFinal,
    );
    this.final.mesh.blendMode = 'none';
    this.conteneurFinal.addChild(this.final.mesh);
    // Copie plein écran du décor mis en cache (même programme que l'accumulation, poids 1, sans mélange).
    this.shaderCopie = creerShader(
      programme('accumulation', SOMMET_ECRAN, FRAGMENT_ACCUMULATION),
      {
        uFlou: { value: [0, 0], type: 'vec2<f32>' },
        uTaps: { value: 1, type: 'f32' },
        uPoids: { value: 1, type: 'f32' },
        uRetourne: { value: 0, type: 'f32' },
      },
      { uTexture: this.rtDecor.source },
    );
    const copie = creerMaillage(
      [
        { nom: 'aPosition', composantes: 2, donnees: pos },
        { nom: 'aUV', composantes: 2, donnees: uv },
      ],
      idx,
      this.shaderCopie,
    );
    copie.mesh.blendMode = 'none';
    this.coucheDecorCache.addChild(copie.mesh);
    this.coucheDecorCache.visible = false;
    this.scene.addChild(this.coucheDecor, this.coucheDecorCache, this.coucheOmbres, this.couchePersos);
    this.retourne = this.detecterOrientation();
  }

  /**
   * Sens de lecture des textures de rendu : on dessine une bande rouge en haut, on la relit après la passe finale.
   * Renvoie 1 si la texture est stockée tête en bas par rapport à nos coordonnées.
   */
  private detecterOrientation(): number {
    const app = this.app!;
    const g = new Graphics().rect(0, 0, this.L, this.H / 2).fill(0xff0000).rect(0, this.H / 2, this.L, this.H / 2).fill(0x0000ff);
    const c = new Container();
    c.addChild(g);
    app.renderer.render({ container: c, target: this.rtScene, clear: true, clearColor: [0, 0, 0, 1] });
    uniformes(this.shaderFinal).uRetourne = 0;
    this.shaderFinal.resources.uTexture = this.rtScene.source;
    app.renderer.render({ container: this.conteneurFinal, clear: true });
    const lecture = document.createElement('canvas');
    lecture.width = 4;
    lecture.height = 4;
    const ctx = lecture.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(app.canvas, this.L / 2 - 2, this.H / 4 - 2, 4, 4, 0, 0, 4, 4);
    const p = ctx.getImageData(1, 1, 1, 1).data;
    g.destroy();
    return p[0]! > p[2]! ? 0 : 1;
  }

  /** Ajoute ou remplace des ressources (rigs, décors). */
  ajouterRessources(r: Partial<Ressources>): void {
    this.ressources = {
      rigs: { ...this.ressources.rigs, ...(r.rigs ?? {}) },
      decors: { ...this.ressources.decors, ...(r.decors ?? {}) },
    };
  }

  /** Charge (une fois) un décor du kit. */
  chargerDecor(id: string): Promise<DecorRendu> {
    let p = this.decors.get(id);
    if (!p) {
      const info: InfoDecor | undefined = this.ressources.decors[id];
      if (!info) return Promise.reject(new Error(`Décor absent des ressources : ${id}`));
      p = DecorRendu.charger(info, (c) => this.url(c)).then((d) => {
        this.decorsPrets.set(id, d);
        return d;
      });
      this.decors.set(id, p);
    }
    return p;
  }

  /** Charge (une fois) la texture d'un rig et complète ses statistiques de couleur si besoin. */
  chargerRig(rig: CharacterRig): Promise<Texture> {
    let p = this.textures.get(rig.id);
    if (!p) {
      p = chargerImage(this.url(rig.image.chemin)).then((img) => {
        if (!rig.couleur) {
          const px = lirePixels(img);
          const s = statsLabImage(px.data, px.width, px.height, { pas: 2 });
          const a = (v: readonly number[]): [number, number, number] => [
            Math.round(v[0]! * 1e4) / 1e4,
            Math.round(v[1]! * 1e4) / 1e4,
            Math.round(v[2]! * 1e4) / 1e4,
          ];
          (rig as { couleur?: CharacterRig['couleur'] }).couleur = { moyenne: a(s.moyenne), ecart: a(s.ecart) };
        }
        const t = textureImage(img, true);
        this.texturesPretes.set(rig.id, t);
        return t;
      });
      this.textures.set(rig.id, p);
    }
    return p;
  }

  /** Précharge des décors et des rigs. */
  async precharger(decors: readonly string[], rigs: readonly string[]): Promise<void> {
    await Promise.all([
      ...decors.filter((d) => this.ressources.decors[d]).map((d) => this.chargerDecor(d)),
      ...rigs.filter((r) => this.ressources.rigs[r]).map((r) => this.chargerRig(this.ressources.rigs[r]!)),
    ]);
  }

  private async assurer(etats: readonly EtatImage[]): Promise<void> {
    const decors = new Set<string>();
    const rigs = new Set<string>();
    for (const e of etats) {
      if (e.decor) decors.add(e.decor.id);
      for (const p of e.personnages) rigs.add(p.rig);
    }
    await this.precharger([...decors], [...rigs]);
    for (const d of decors) this.usageDecors.set(d, ++this.compteurUsage);
    // Libère les décors les moins récemment utilisés au-delà de la limite.
    if (this.decorsPrets.size > DECORS_EN_MEMOIRE) {
      const anciens = [...this.decorsPrets.keys()]
        .filter((id) => !decors.has(id))
        .sort((a, b) => (this.usageDecors.get(a) ?? 0) - (this.usageDecors.get(b) ?? 0));
      for (const id of anciens.slice(0, this.decorsPrets.size - DECORS_EN_MEMOIRE)) {
        this.decorsPrets.get(id)!.detruire();
        this.decorsPrets.delete(id);
        this.decors.delete(id);
        this.usageDecors.delete(id);
      }
    }
    for (const e of etats)
      for (const p of e.personnages) {
        const rig = this.ressources.rigs[p.rig];
        const tex = this.texturesPretes.get(p.rig);
        if (!rig || !tex) continue;
        const existant = this.persos.get(p.id);
        if (!existant || existant.rig !== rig) {
          const r = new PersonnageRendu(rig, tex);
          this.persos.set(p.id, r);
        }
      }
  }

  private preparerImage(e: EtatImage): GeometrieImage {
    const cam = matriceCamera(e.camera, this.L, this.H);
    const ppu = e.camera.zoom * this.H;
    const decor = e.decor ? (this.decorsPrets.get(e.decor.id) ?? null) : null;
    const geoDecor = decor && e.decor ? decor.preparerImage(e, cam, ppu) : null;
    const persos: GeometrieImage['persos'] = [];
    const inv = inverser(cam);
    const aspect = decor?.info.aspect ?? 2;
    for (const ep of e.personnages) {
      const rendu = this.persos.get(ep.id);
      if (!rendu) continue;
      const geo = rendu.preparerImage(ep, e, cam, ppu);
      // Occultation par le décor : boîte du personnage ramenée en fractions du décor.
      let occultation: GeometrieImage['persos'][number]['occultation'] = null;
      if (decor && geo.visible && geo.sommets.length >= 2) {
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        const s = geo.sommets;
        for (let k = 0; k < s.length; k += 2) {
          const wx = inv.a * s[k]! + inv.c * s[k + 1]! + inv.tx;
          const wy = inv.b * s[k]! + inv.d * s[k + 1]! + inv.ty;
          if (wx < x0) x0 = wx;
          if (wx > x1) x1 = wx;
          if (wy < y0) y0 = wy;
          if (wy > y1) y1 = wy;
        }
        const o = decor.occultation({ u0: x0 / aspect, u1: x1 / aspect, v0: y0, v1: y1 }, ep.profondeur, ep.position.y);
        if (o) occultation = { ...o, vPieds: ep.position.y };
      }
      persos.push({ id: ep.id, rendu, geo, occultation });
    }
    return { etat: e, decor, geoDecor, persos };
  }

  private appliquer(g: GeometrieImage, decorEnCache = false): void {
    if (!decorEnCache) {
      this.coucheDecor.removeChildren();
      if (g.decor && g.geoDecor) {
        g.decor.appliquer(g.geoDecor);
        this.coucheDecor.addChild(g.decor.conteneur);
      }
    }
    this.coucheOmbres.removeChildren();
    this.couchePersos.removeChildren();
    for (const p of g.persos) {
      p.rendu.appliquer(p.geo);
      this.coucheOmbres.addChild(p.rendu.ombres.mesh);
      this.couchePersos.addChild(p.rendu.conteneur);
      if (p.occultation && g.decor && p.geo.visible) {
        const m = g.decor.occulteur(p.id);
        majTampon(m.indices, p.occultation.indices);
        const u = uniformes(m.mesh.shader!);
        u.uSeuil = p.occultation.seuil;
        u.uVPieds = p.occultation.vPieds;
        this.couchePersos.addChild(m.mesh);
      }
    }
  }

  private static ecart(a: GeometrieImage, b: GeometrieImage): number {
    let m = 0;
    if (a.geoDecor && b.geoDecor) m = Math.max(m, DecorRendu.ecart(a.geoDecor, b.geoDecor));
    else if (!!a.geoDecor !== !!b.geoDecor) return Infinity;
    if (a.persos.length !== b.persos.length) return Infinity;
    for (let i = 0; i < a.persos.length; i++) {
      const pa = a.persos[i]!;
      const pb = b.persos[i]!;
      if (pa.id !== pb.id) return Infinity;
      m = Math.max(m, ecartPersonnage(pa.geo, pb.geo));
    }
    const fa = a.etat.camera.flouBouge;
    const fb = b.etat.camera.flouBouge;
    m = Math.max(m, Math.hypot(fa.x, fa.y), Math.hypot(fb.x, fb.y));
    return m;
  }

  /** Dessine une image : moyenne des sous-états (flou de bougé exact). */
  async dessiner(sousEtats: readonly EtatImage[]): Promise<MesureImage> {
    const app = this.app;
    if (!app) throw new Error('Page de rendu non initialisée');
    if (sousEtats.length === 0) throw new Error('dessiner : aucun état');
    const t0 = performance.now();
    await this.assurer(sousEtats);
    const geos = sousEtats.map((e) => this.preparerImage(e));
    let rendues = geos;
    let ecart = 0;
    if (geos.length > 1) {
      ecart = MoteurRendu.ecart(geos[0]!, geos[geos.length - 1]!);
      if (this.flouAdaptatif && ecart < SEUIL_FLOU_PX) rendues = [geos[0]!];
    }
    const t1 = performance.now();
    const N = rendues.length;
    const r = app.renderer;
    const ua = uniformes(this.shaderAccum);
    const eff = moyenneEffets(sousEtats.map((e) => e.effets));
    const e0 = sousEtats[0]!;
    // Chemin direct : une seule sous-image, sans filé ni effet → la scène va droit au canevas (une passe de moins).
    const f0 = rendues[0]!.etat.camera.flouBouge;
    const exposition = sousEtats.reduce((acc, e) => acc + (e.camera.exposition ?? 1), 0) / sousEtats.length;
    if (N === 1 && Math.hypot(f0.x, f0.y) < 1.5 && eff.desaturation === 0 && eff.vignette === 0 && eff.fondu === 0 && eff.flash === 0 && exposition === 1) {
      this.appliquer(rendues[0]!);
      const fond = this.fond;
      r.render({ container: this.scene, clear: true, clearColor: [fond[0], fond[1], fond[2], 1] });
      this.sousTitres.mettreAJour(e0.sousTitres, e0.t, this.L, this.H);
      this.sousTitres.conteneur.alpha = 1;
      r.render({ container: this.sousTitres.conteneur, clear: false });
      return this.terminer(t0, t1, sousEtats.length, 1, ecart);
    }
    // Décor immobile pendant l'obturation (à SEUIL_FLOU_PX près) : dessiné une seule fois, puis recopié.
    let decorFige = false;
    if (N > 1 && this.cacheDecor) {
      const a = rendues[0]!;
      const b = rendues[N - 1]!;
      const fa = a.etat.camera.flouBouge;
      const fb = b.etat.camera.flouBouge;
      decorFige =
        !!a.geoDecor &&
        !!b.geoDecor &&
        a.decor === b.decor &&
        DecorRendu.ecart(a.geoDecor, b.geoDecor) < SEUIL_FLOU_PX &&
        Math.hypot(fa.x, fa.y) < 1 &&
        Math.hypot(fb.x, fb.y) < 1;
      if (decorFige) {
        this.appliquer(a);
        this.coucheOmbres.visible = false;
        this.couchePersos.visible = false;
        r.render({ container: this.scene, target: this.rtDecor, clear: true, clearColor: [0, 0, 0, 0] });
        this.coucheOmbres.visible = true;
        this.couchePersos.visible = true;
        // Texture de rendu → texture de rendu : même convention, jamais de retournement.
        uniformes(this.shaderCopie).uRetourne = 0;
        this.decorsEnCache++;
      }
    }
    this.coucheDecor.visible = !decorFige;
    this.coucheDecorCache.visible = decorFige;
    for (let k = 0; k < N; k++) {
      const g = rendues[k]!;
      this.appliquer(g, decorFige);
      r.render({ container: this.scene, target: this.rtScene, clear: true, clearColor: [0, 0, 0, 0] });
      if (N > 1) {
        const f = g.etat.camera.flouBouge;
        const lx = f.x / N;
        const ly = f.y / N;
        ua.uFlou = [lx / this.L, ly / this.H];
        ua.uTaps = Math.min(TAPS_MAX_ACCUMULATION, Math.max(1, Math.ceil(Math.hypot(lx, ly) / 1.5)));
        ua.uPoids = 1 / N;
        ua.uRetourne = 0; // texture de rendu → texture de rendu : même convention

        r.render({ container: this.conteneurAccum, target: this.rtAccum, clear: k === 0, clearColor: [0, 0, 0, 0] });
      }
    }
    this.coucheDecor.visible = true;
    this.coucheDecorCache.visible = false;
    // Passe finale.
    const uf = uniformes(this.shaderFinal);
    if (N > 1) {
      this.shaderFinal.resources.uTexture = this.rtAccum.source;
      uf.uFlou = [0, 0];
      uf.uTaps = 1;
    } else {
      this.shaderFinal.resources.uTexture = this.rtScene.source;
      const f = rendues[0]!.etat.camera.flouBouge;
      uf.uFlou = [f.x / this.L, f.y / this.H];
      uf.uTaps = Math.min(TAPS_MAX_FINAL, Math.max(1, Math.ceil(Math.hypot(f.x, f.y) / 1.5)));
    }
    uf.uRetourne = this.retourne;
    uf.uExposition = exposition;
    uf.uDesaturation = eff.desaturation;
    uf.uVignette = eff.vignette;
    uf.uFondu = eff.fondu;
    uf.uFlash = eff.flash;
    r.render({ container: this.conteneurFinal, clear: true, clearColor: [0, 0, 0, 1] });
    this.sousTitres.mettreAJour(e0.sousTitres, e0.t, this.L, this.H);
    this.sousTitres.conteneur.alpha = 1 - eff.fondu;
    r.render({ container: this.sousTitres.conteneur, clear: false });
    return this.terminer(t0, t1, sousEtats.length, N, ecart);
  }

  private terminer(t0: number, t1: number, sousImages: number, rendues: number, ecart: number): MesureImage {
    // Synchronisation réelle (SwiftShader exécute les commandes en différé) : lecture d'un pixel.
    const gl = (this.app!.renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
    if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pixelSync);
    const t2 = performance.now();
    return { sousImages, sousImagesRendues: rendues, ecartPx: ecart, msPreparation: t1 - t0, msRendu: t2 - t1, msTotal: t2 - t0 };
  }

  /** Image courante en data URL. */
  capturer(format: 'jpeg' | 'png', qualite = 0.95): string {
    if (!this.app) throw new Error('Page de rendu non initialisée');
    return this.app.canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg', qualite);
  }

  /** Décor chargé (diagnostic). */
  decorCharge(id: string): DecorRendu | undefined {
    return this.decorsPrets.get(id);
  }
}

function moyenneEffets(liste: readonly EffetsImage[]): EffetsImage {
  const n = liste.length;
  const s = { desaturation: 0, vignette: 0, fondu: 0, flash: 0 };
  for (const e of liste) {
    s.desaturation += e.desaturation / n;
    s.vignette += e.vignette / n;
    s.fondu += e.fondu / n;
    s.flash += e.flash / n;
  }
  return s;
}
