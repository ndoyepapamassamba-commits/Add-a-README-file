/**
 * Sous-titres incrustés, style TikTok : texte français très gras, blanc cerné de noir, mot en cours en jaune
 * (karaoké, petit « pop »), deux lignes au plus, dans la zone sûre (x 100–860, y 1150–1550 d'une sortie
 * 1080×1920 : au-dessus de la légende, hors de la colonne des boutons). Apparition en douceur.
 * La mise en page est pure (testée dans Node) ; l'affichage utilise les `Text` de PixiJS (rendu canevas, lissé).
 */
import { Container, Text, TextStyle } from 'pixi.js';
import type { SousTitre } from '../timeline/types';
import { decouperLignes } from './miseEnPage';

export { decouperLignes };

/** Style des sous-titres (valeurs pour une sortie de 1920 px de haut ; mises à l'échelle sinon). */
export const STYLE_SOUS_TITRES = Object.freeze({
  police: 'Inter, "Inter Display", "DejaVu Sans", sans-serif',
  graisse: '800' as const,
  taille: 66,
  tailleMin: 46,
  couleur: 0xffffff,
  couleurActive: 0xffd84a,
  contour: 0x101010,
  epaisseurContour: 12,
  interligne: 1.14,
  /** Boîte de la zone sûre (px de sortie 1080×1920). */
  xMin: 100,
  xMax: 860,
  /** Bas du bloc (px) : au-dessus de la légende TikTok, même longue. */
  bas: 1500,
  maxLignes: 2,
});

/** Retour en arrière doux (petit dépassement) pour le « pop ». */
function sortieDos(u: number): number {
  const s = 1.70158;
  const x = u - 1;
  return 1 + (s + 1) * x * x * x + s * x * x;
}

/** Couche des sous-titres. */
export class CoucheSousTitres {
  readonly conteneur = new Container();
  private readonly cache = new Map<string, Text>();
  private utilises = new Set<Text>();

  private texte(mot: string, actif: boolean, taille: number, rang: number): Text {
    // Le rang distingue deux occurrences du même mot dans une ligne (un objet ne s'affiche qu'une fois).
    const cle = `${actif ? 1 : 0}|${taille}|${rang}|${mot}`;
    let t = this.cache.get(cle);
    if (!t) {
      const S = STYLE_SOUS_TITRES;
      t = new Text({
        text: mot,
        style: new TextStyle({
          fontFamily: S.police,
          fontWeight: S.graisse,
          fontSize: taille,
          fill: actif ? S.couleurActive : S.couleur,
          stroke: { color: S.contour, width: Math.round((S.epaisseurContour * taille) / S.taille), join: 'round' },
          dropShadow: { color: 0x000000, alpha: 0.35, blur: Math.round(taille / 10), distance: Math.round(taille / 18), angle: Math.PI / 2 },
          padding: Math.round(taille / 4),
        }),
        resolution: 1,
      });
      t.anchor.set(0.5, 0.5);
      this.cache.set(cle, t);
    }
    return t;
  }

  /** Met à jour la couche pour l'instant `t` (sortie `L × H`). */
  mettreAJour(sousTitres: readonly SousTitre[], t: number, L: number, H: number): void {
    for (const x of this.utilises) x.visible = false;
    this.utilises = new Set();
    this.conteneur.removeChildren();
    const S = STYLE_SOUS_TITRES;
    const k = H / 1920;
    const kx = L / 1080;
    let bas = S.bas * k;
    // Le plus récent en bas, les précédents empilés au-dessus.
    const liste = [...sousTitres].sort((a, b) => b.debut - a.debut);
    for (const st of liste) {
      const mots = st.texte.split(/\s+/).filter((m) => m.length > 0);
      if (mots.length === 0) continue;
      const largeurMax = (S.xMax - S.xMin) * kx;
      let taille = Math.round(S.taille * k);
      let lignes: number[][] = [];
      let textes: Text[] = [];
      for (;;) {
        textes = mots.map((m, i) => this.texte(m, i === st.motActif, taille, i));
        const largeurs = textes.map((x) => {
          x.scale.set(1);
          return x.width;
        });
        lignes = decouperLignes(largeurs, 0.28 * taille, largeurMax, S.maxLignes);
        const tropLarge = lignes.some((l) => l.reduce((s, i) => s + largeurs[i]!, 0) + (l.length - 1) * 0.28 * taille > largeurMax);
        if ((lignes.length <= S.maxLignes && !tropLarge) || taille <= S.tailleMin * k) break;
        taille = Math.max(Math.round(S.tailleMin * k), Math.round(taille * 0.9));
      }
      // Apparition et disparition.
      const entree = Math.min(1, Math.max(0, (t - st.debut) / 0.12));
      const sortie = Math.min(1, Math.max(0, (st.fin - t) / 0.1));
      const alpha = Math.min(entree * 1.6, 1) * sortie;
      const echelleBloc = 0.9 + 0.1 * sortieDos(entree);
      const hLigne = S.interligne * taille;
      const cx = ((S.xMin + S.xMax) / 2) * kx;
      const haut = bas - lignes.length * hLigne;
      lignes.forEach((ligne, li) => {
        const largeurs = ligne.map((i) => {
          textes[i]!.scale.set(1);
          return textes[i]!.width;
        });
        const total = largeurs.reduce((s, w) => s + w, 0) + (ligne.length - 1) * 0.28 * taille;
        let x = cx - (total / 2) * echelleBloc;
        const y = haut + (li + 0.5) * hLigne;
        ligne.forEach((i, j) => {
          const tx = textes[i]!;
          const w = largeurs[j]! * echelleBloc;
          let pop = 1;
          if (i === st.motActif) pop = 1.08;
          tx.position.set(x + w / 2, y);
          tx.scale.set(echelleBloc * pop);
          tx.alpha = alpha;
          tx.visible = true;
          this.conteneur.addChild(tx);
          this.utilises.add(tx);
          x += w + 0.28 * taille * echelleBloc;
        });
      });
      bas = haut - 0.4 * hLigne;
    }
  }
}
