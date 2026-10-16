/** Types des rapports de la porte qualité (voir `index.ts`). */

/** Un critère mesuré. */
export interface MesureQualite {
  nom: string;
  valeur: number;
  seuil: string;
  ok: boolean;
  detail?: string;
  /** Personnage concerné (absent : critère global ou caméra). */
  personnage?: string;
  /** Unité de `valeur`. */
  unite?: string;
  /** Faux : critère informatif, son échec donne un avertissement et pas un FAIL (défaut : vrai). */
  bloquant?: boolean;
}

/** Rapport de la porte qualité. */
export interface RapportQualite {
  verdict: 'PASS' | 'FAIL';
  mesures: MesureQualite[];
  /** Portée du rapport (« états du moteur », « pixels du MP4 »). */
  portee?: string;
  /** Nombre d'images examinées et cadence. */
  images?: number;
  fps?: number;
  /** Données détaillées (mesures brutes par personnage, caméra, pixels). */
  details?: Record<string, unknown>;
}
