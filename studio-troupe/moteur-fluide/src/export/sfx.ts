/**
 * Bruitages synthétisés EN CODE (gratuits, à nous, déterministes) : whoosh, pop, scratch de disque, « ba-dum-tss »
 * (coup de batterie façon rimshot), coup sourd, boing. Synthèse simple : bruit filtré, oscillateurs à hauteur
 * glissante, enveloppes exponentielles. Aucun échantillon tiers.
 *
 * Dans un projet, un son de la piste `sons` peut viser un bruitage synthétisé au lieu d'un fichier :
 *   `"fichier": "synth:whoosh"` ou `"synth:pop?duree=0.2&hauteur=1.3&graine=4"`.
 * L'export le génère en WAV (48 kHz, 16 bits, stéréo) dans son dossier de travail avant le mixage.
 */
import { creerAleatoire, hashChaine } from '../noyau/aleatoire';
import type { SignalStereo } from './wav';

/** Bruitages disponibles. */
export const SONS_SYNTHETIQUES = ['whoosh', 'pop', 'scratch', 'badumtss', 'coup', 'boing'] as const;
export type NomSonSynthetique = (typeof SONS_SYNTHETIQUES)[number];

/** Réglages d'un bruitage. */
export interface ParametresSynthese {
  /** Durée (s) ; défaut propre à chaque bruitage. */
  duree?: number;
  /** Graine de l'aléa (défaut 1). */
  graine?: number;
  /** Facteur de hauteur (1 = normal, 2 = une octave plus haut). */
  hauteur?: number;
  /** Gain de crête (défaut 0,7 ≈ −3 dBFS). */
  volume?: number;
}

/** Durées par défaut (s). */
export const DUREES_SYNTHESE: Record<NomSonSynthetique, number> = {
  whoosh: 0.5,
  pop: 0.16,
  scratch: 0.7,
  badumtss: 1.1,
  coup: 0.35,
  boing: 0.65,
};

const TAU = 2 * Math.PI;

/** Filtre biquadratique (formules classiques du « cookbook » de R. Bristow-Johnson), coefficients modifiables. */
class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(private readonly fe: number) {}
  regler(type: 'passeBande' | 'passeBas' | 'passeHaut', f: number, q: number): this {
    const w = (TAU * Math.min(f, this.fe * 0.45)) / this.fe;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * Math.max(0.05, q));
    const a0 = 1 + alpha;
    let b0: number;
    let b1: number;
    let b2: number;
    if (type === 'passeBande') {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    } else if (type === 'passeBas') {
      b0 = (1 - cw) / 2;
      b1 = 1 - cw;
      b2 = (1 - cw) / 2;
    } else {
      b0 = (1 + cw) / 2;
      b1 = -(1 + cw);
      b2 = (1 + cw) / 2;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cw) / a0;
    this.a2 = (1 - alpha) / a0;
    return this;
  }
  filtrer(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Tampon stéréo vide. */
function tampon(duree: number, fe: number): SignalStereo {
  const n = Math.max(1, Math.round(duree * fe));
  return { frequence: fe, gauche: new Float32Array(n), droite: new Float32Array(n) };
}

/** Ajoute un signal mono avec un panoramique à puissance constante (−1 gauche … 1 droite). */
function ajouter(s: SignalStereo, i: number, x: number, pan = 0): void {
  if (i < 0 || i >= s.gauche.length) return;
  const a = ((pan + 1) * Math.PI) / 4;
  s.gauche[i]! += x * Math.cos(a);
  s.droite[i]! += x * Math.sin(a);
}

/** Normalise la crête du signal à `crete` et applique de très courts fondus (pas de clic). */
function finaliser(s: SignalStereo, crete: number): SignalStereo {
  let m = 0;
  for (let i = 0; i < s.gauche.length; i++) m = Math.max(m, Math.abs(s.gauche[i]!), Math.abs(s.droite[i]!));
  const g = m > 0 ? crete / m : 0;
  const n = s.gauche.length;
  const bord = Math.min(Math.floor(n / 4), Math.round(0.0005 * s.frequence));
  for (let i = 0; i < n; i++) {
    let f = g;
    if (i < bord) f *= i / bord;
    if (i >= n - bord) f *= (n - 1 - i) / bord;
    s.gauche[i]! *= f;
    s.droite[i]! *= f;
  }
  return s;
}

/** Enveloppe en cloche asymétrique sur [0, 1] : monte jusqu'à `pic`, redescend, nulle aux bords. */
function cloche(u: number, pic: number): number {
  if (u <= 0 || u >= 1) return 0;
  const v = u < pic ? u / pic : (1 - u) / (1 - pic);
  return Math.sin((v * Math.PI) / 2) ** 2;
}

/** Whoosh : bruit filtré en passe-bande dont la fréquence balaie une cloche, passage de gauche à droite. */
function whoosh(p: Required<ParametresSynthese>, fe: number): SignalStereo {
  const s = tampon(p.duree, fe);
  const rnd = creerAleatoire(p.graine);
  const bande = new Biquad(fe);
  const souffle = new Biquad(fe);
  const n = s.gauche.length;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const e = cloche(u, 0.42);
    const f = p.hauteur * (280 * Math.pow(2600 / 280, e));
    if (i % 16 === 0) {
      bande.regler('passeBande', f, 1.6 + 2.5 * e);
      souffle.regler('passeBas', 500 * p.hauteur, 0.7);
    }
    const b = rnd.normal();
    const x = bande.filtrer(b) * e * 1.6 + souffle.filtrer(b) * e * 0.25;
    ajouter(s, i, x, -0.8 + 1.6 * u);
  }
  return finaliser(s, p.volume);
}

/** Pop : sinus à hauteur qui chute très vite (bouchon, bulle), petit clic d'attaque. */
function pop(p: Required<ParametresSynthese>, fe: number): SignalStereo {
  const s = tampon(p.duree, fe);
  const rnd = creerAleatoire(p.graine);
  const clic = new Biquad(fe).regler('passeHaut', 3000, 0.7);
  let phase = 0;
  const n = s.gauche.length;
  const tauF = 0.012;
  const tauA = Math.max(0.02, p.duree * 0.22);
  for (let i = 0; i < n; i++) {
    const t = i / fe;
    const f = p.hauteur * (170 + 780 * Math.exp(-t / tauF));
    phase += (TAU * f) / fe;
    const env = Math.min(1, t / 0.0012) * Math.exp(-t / tauA);
    const bruit = t < 0.003 ? clic.filtrer(rnd.normal()) * (1 - t / 0.003) * 0.5 : 0;
    ajouter(s, i, Math.sin(phase) * env + bruit);
  }
  return finaliser(s, p.volume);
}

/** Interpolation cosinus d'une suite de clés (t, v). */
function cles(t: number, k: ReadonlyArray<readonly [number, number]>): number {
  if (t <= k[0]![0]) return k[0]![1];
  for (let i = 0; i < k.length - 1; i++) {
    const [t0, v0] = k[i]!;
    const [t1, v1] = k[i + 1]!;
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * (1 - Math.cos(Math.PI * u)) / 2;
    }
  }
  return k[k.length - 1]![1];
}

/**
 * Scratch de disque : une « musique » (partiels en dents de scie + souffle) lue à vitesse variable, d'avant en
 * arrière, comme un disque tiré à la main ; le volume suit la vitesse de la main.
 */
function scratch(p: Required<ParametresSynthese>, fe: number): SignalStereo {
  const s = tampon(p.duree, fe);
  const rnd = creerAleatoire(p.graine);
  const bande = new Biquad(fe);
  const n = s.gauche.length;
  const D = p.duree;
  // Vitesse de lecture relative (1 = normale) : allers-retours puis arrêt brutal.
  const vitesse: Array<readonly [number, number]> = [
    [0, 0],
    [0.07 * D, 2.6],
    [0.2 * D, -3.2],
    [0.36 * D, 2.2],
    [0.52 * D, -2.8],
    [0.72 * D, 1.4],
    [0.9 * D, -0.6],
    [D, 0],
  ];
  let position = 0;
  for (let i = 0; i < n; i++) {
    const t = i / fe;
    const v = cles(t, vitesse);
    position += v / fe;
    const f0 = 140 * p.hauteur;
    const ph = position * f0;
    const scie = 2 * (ph - Math.floor(ph + 0.5)) * 0.6 + 2 * (ph * 2.01 - Math.floor(ph * 2.01 + 0.5)) * 0.3;
    if (i % 16 === 0) bande.regler('passeBande', Math.max(150, 900 * Math.abs(v) * p.hauteur), 2.2);
    const x = (scie * 0.7 + bande.filtrer(rnd.normal()) * 2.2) * Math.pow(Math.min(1, Math.abs(v) / 3), 0.7);
    ajouter(s, i, x, 0.15 * Math.sign(v));
  }
  return finaliser(s, p.volume);
}

/** Fût (tom) : sinus à hauteur descendante, décroissance exponentielle. */
function fut(s: SignalStereo, debut: number, f0: number, f1: number, decroissance: number, gain: number, pan: number): void {
  const fe = s.frequence;
  const i0 = Math.round(debut * fe);
  const n = Math.round(decroissance * 7 * fe);
  let phase = 0;
  for (let k = 0; k < n; k++) {
    const t = k / fe;
    const f = f1 + (f0 - f1) * Math.exp(-t / 0.05);
    phase += (TAU * f) / fe;
    const env = Math.min(1, t / 0.001) * Math.exp(-t / decroissance);
    ajouter(s, i0 + k, Math.sin(phase) * env * gain, pan);
  }
}

/** « Ba-dum-tss » : deux fûts, puis caisse claire et cymbale (bruit aigu et partiels métalliques inharmoniques). */
function badumtss(p: Required<ParametresSynthese>, fe: number): SignalStereo {
  const s = tampon(p.duree, fe);
  const rnd = creerAleatoire(p.graine);
  const h = p.hauteur;
  const D = p.duree;
  fut(s, 0, 210 * h, 120 * h, 0.12, 0.9, -0.3);
  fut(s, 0.17 * (D / 1.1), 165 * h, 92 * h, 0.14, 0.9, -0.1);
  const tc = 0.36 * (D / 1.1);
  // Caisse claire : bruit passe-bande + ton bref.
  const caisse = new Biquad(fe).regler('passeBande', 1900 * h, 0.8);
  // Cymbale : bruit passe-haut + six partiels carrés inharmoniques.
  const cymbale = new Biquad(fe).regler('passeHaut', 5200, 0.7);
  const partiels = [3.1, 4.37, 5.83, 7.21, 9.07, 11.3].map((r) => r * 560 * h);
  const i0 = Math.round(tc * fe);
  for (let k = 0; i0 + k < s.gauche.length; k++) {
    const t = k / fe;
    const b = rnd.normal();
    const claire = caisse.filtrer(b) * 2.2 * Math.exp(-t / 0.09) + Math.sin(TAU * 190 * h * t) * 0.5 * Math.exp(-t / 0.05);
    let metal = 0;
    for (const f of partiels) metal += Math.sign(Math.sin(TAU * f * t)) * 0.07;
    const cym = (cymbale.filtrer(b) * 1.1 + cymbale.filtrer(metal) * 0.9) * Math.exp(-t / Math.max(0.15, 0.32 * D)) * Math.min(1, t / 0.002);
    ajouter(s, i0 + k, claire * Math.min(1, t / 0.0008), -0.05);
    ajouter(s, i0 + k, cym * 0.9, 0.35);
  }
  return finaliser(s, p.volume);
}

/** Coup sourd (chute, gifle de dessin animé) : sinus grave qui plonge + bruit étouffé. */
function coup(p: Required<ParametresSynthese>, fe: number): SignalStereo {
  const s = tampon(p.duree, fe);
  const rnd = creerAleatoire(p.graine);
  const etouffe = new Biquad(fe).regler('passeBas', 900 * p.hauteur, 0.9);
  let phase = 0;
  const n = s.gauche.length;
  for (let i = 0; i < n; i++) {
    const t = i / fe;
    const f = p.hauteur * (42 + 110 * Math.exp(-t / 0.04));
    phase += (TAU * f) / fe;
    const corps = Math.sin(phase) * Math.exp(-t / Math.max(0.05, p.duree * 0.3));
    const choc = etouffe.filtrer(rnd.normal()) * Math.exp(-t / 0.025) * 1.4;
    ajouter(s, i, (corps + choc) * Math.min(1, t / 0.0006));
  }
  return finaliser(s, p.volume);
}

/** Boing : ressort de dessin animé, hauteur qui oscille et s'amortit. */
function boing(p: Required<ParametresSynthese>, fe: number): SignalStereo {
  const s = tampon(p.duree, fe);
  let phase = 0;
  const n = s.gauche.length;
  for (let i = 0; i < n; i++) {
    const t = i / fe;
    const f = p.hauteur * 230 * (1 + 0.45 * Math.exp(-t / (p.duree * 0.35)) * Math.sin(TAU * 11 * t)) * (1 + 0.25 * Math.exp(-t / 0.05));
    phase += (TAU * f) / fe;
    const ph = phase / TAU;
    const x = Math.sin(phase) * 0.75 + 2 * (ph - Math.floor(ph + 0.5)) * 0.18;
    ajouter(s, i, x * Math.min(1, t / 0.003) * Math.exp(-t / (p.duree * 0.4)));
  }
  return finaliser(s, p.volume);
}

const RECETTES: Record<NomSonSynthetique, (p: Required<ParametresSynthese>, fe: number) => SignalStereo> = {
  whoosh,
  pop,
  scratch,
  badumtss,
  coup,
  boing,
};

/** Vrai si `nom` est un bruitage synthétisable. */
export function estSonSynthetique(nom: string): nom is NomSonSynthetique {
  return (SONS_SYNTHETIQUES as readonly string[]).includes(nom);
}

/** Synthétise un bruitage (stéréo, `frequence` Hz). Déterministe : mêmes réglages → mêmes échantillons. */
export function synthetiser(nom: NomSonSynthetique, parametres: ParametresSynthese = {}, frequence = 48000): SignalStereo {
  const p: Required<ParametresSynthese> = {
    duree: Math.max(0.03, Math.min(10, parametres.duree ?? DUREES_SYNTHESE[nom])),
    graine: parametres.graine ?? 1,
    hauteur: Math.max(0.25, Math.min(4, parametres.hauteur ?? 1)),
    volume: Math.max(0.01, Math.min(0.98, parametres.volume ?? 0.7)),
  };
  return RECETTES[nom](p, frequence);
}

/**
 * Lit une référence `synth:<nom>[?duree=…&graine=…&hauteur=…&volume=…]`. Renvoie `null` si la chaîne n'est pas une
 * référence de synthèse ; lève une erreur si le nom est inconnu.
 */
export function lireReferenceSynthese(fichier: string): { nom: NomSonSynthetique; parametres: ParametresSynthese; cle: string } | null {
  if (!fichier.startsWith('synth:')) return null;
  const [nom, requete] = fichier.slice(6).split('?') as [string, string | undefined];
  if (!estSonSynthetique(nom)) throw new Error(`Bruitage synthétique inconnu « ${nom} » (connus : ${SONS_SYNTHETIQUES.join(', ')})`);
  const parametres: ParametresSynthese = {};
  for (const [k, v] of new URLSearchParams(requete ?? '')) {
    const x = Number(v);
    if (!Number.isFinite(x)) throw new Error(`Bruitage « ${fichier} » : valeur non numérique pour ${k}`);
    if (k === 'duree' || k === 'graine' || k === 'hauteur' || k === 'volume') parametres[k] = x;
    else throw new Error(`Bruitage « ${fichier} » : réglage inconnu « ${k} » (duree, graine, hauteur, volume)`);
  }
  const cle = `${nom}-${(hashChaine(JSON.stringify([nom, parametres])) >>> 0).toString(16)}`;
  return { nom, parametres, cle };
}
