/**
 * Page de rendu (Chromium, PixiJS v8) : reçoit des `EtatImage` et dessine l'image de sortie en DÉFORMANT les
 * dessins (maillages texturés), jamais en les redessinant. Exposée sur `window.moteurFluide` (`ApiPageRendu`).
 *
 * ÉTAT : ébauche du socle — initialise PixiJS (WebGL, sans boucle d'animation, tampon conservé pour la capture)
 * et efface au fond. Le constructeur du module `rendu/` remplace `dessiner`.
 */
import { Application } from 'pixi.js';
import type { ApiPageRendu, Couleur, EtatImage, OptionsPageRendu } from '../timeline/types';

declare global {
  interface Window {
    moteurFluide?: ApiPageRendu;
  }
}

function enHex(c: Couleur): number {
  const v = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)));
  return (v(c[0]) << 16) | (v(c[1]) << 8) | v(c[2]);
}

let app: Application | null = null;

const api: ApiPageRendu = {
  version: '0.1.0-socle',
  async initialiser(options: OptionsPageRendu): Promise<void> {
    app = new Application();
    await app.init({
      width: options.largeur,
      height: options.hauteur,
      autoStart: false,
      preserveDrawingBuffer: true,
      antialias: false,
      background: enHex(options.fond ?? [0, 0, 0]),
      preference: 'webgl',
    });
    document.body.appendChild(app.canvas);
  },
  async dessiner(sousEtats: EtatImage[]): Promise<void> {
    if (!app) throw new Error('Page de rendu non initialisée');
    if (sousEtats.length === 0) throw new Error('dessiner : aucun état');
    app.renderer.render(app.stage);
  },
  async capturer(format: 'jpeg' | 'png', qualite = 0.95): Promise<string> {
    if (!app) throw new Error('Page de rendu non initialisée');
    return app.canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg', qualite);
  },
};

window.moteurFluide = api;
