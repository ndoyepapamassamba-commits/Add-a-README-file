/**
 * Piste de parole d'une réplique : segments articulés horodatés (instants absolus), piste discrète de visèmes,
 * accents (prosodie), d'après la meilleure source disponible :
 * 1. clés de visèmes manuelles (`visemes`, corrections éditables) ;
 * 2. phonèmes horodatés (`phonemes`, voix de synthèse ou alignement) ;
 * 3. mots horodatés (`mots`) : transcription de secours mot à mot, répartie dans chaque mot ;
 * 4. texte seul : transcription de secours étalée sur `[debut, finReplique]`.
 * Les pistes sont mémorisées par réplique (objets du projet, jamais modifiés).
 */
import { finReplique, tempsDeJeu } from '../timeline/derives';
import type { Projet, Replique } from '../timeline/types';
import { phonemesDepuisTexte, texteVersPhonemes, VOYELLES_API, type PhonemeEstime } from './phonetique';
import {
  infoPhoneme,
  infoViseme,
  normaliserPhoneme,
  pisteVisemesDiscrete,
  type SegmentArticule,
  type SegmentViseme,
} from './visemes';

/** Accent de la réplique (instant absolu du noyau vocalique). */
export interface Accent {
  t: number;
  /** 1 = fin de groupe, 0,6 = accent secondaire. */
  force: number;
  /** Dernier accent d'une question. */
  question: boolean;
}

/** Piste de parole d'une réplique. */
export interface PisteParole {
  replique: Replique;
  personnage: string;
  /** Instants absolus (s) du début et de la fin de la réplique. */
  debut: number;
  fin: number;
  segments: SegmentArticule[];
  visemes: SegmentViseme[];
  accents: Accent[];
  source: 'visemes' | 'phonemes' | 'mots' | 'texte';
}

const cache = new WeakMap<Replique, PisteParole>();

/** Piste de parole d'une réplique (mémorisée). */
export function pisteParole(r: Replique): PisteParole {
  const deja = cache.get(r);
  if (deja) return deja;
  const p = construire(r);
  cache.set(r, p);
  return p;
}

function construire(r: Replique): PisteParole {
  const debut = r.debut;
  const fin = finReplique(r);
  const duree = Math.max(0.05, fin - debut);
  const question = /\?\s*[»"']?\s*$/.test(r.texte);
  let segments: SegmentArticule[] = [];
  let source: PisteParole['source'];
  let accentsRel: Array<{ t: number; force: number }> = [];

  if (r.visemes && r.visemes.length > 0) {
    source = 'visemes';
    const cles = [...r.visemes].sort((a, b) => a.t - b.t);
    cles.forEach((k, i) => {
      const suivant = cles[i + 1];
      const f = suivant ? suivant.t : Math.max(k.t + 0.08, duree);
      if (f > k.t) segments.push({ debut: debut + k.t, fin: debut + f, info: infoViseme(k.viseme), accent: false });
    });
    accentsRel = accentsDepuisEstimes(phonemesDepuisTexte(r.texte, 0, duree));
  } else if (r.phonemes && r.phonemes.length > 0) {
    source = 'phonemes';
    const phs = [...r.phonemes].sort((a, b) => a.debut - b.debut);
    segments = phs
      .filter((p) => p.fin > p.debut)
      .map((p) => ({ debut: debut + p.debut, fin: debut + p.fin, info: infoPhoneme(p.ph), accent: p.accent === true }));
    accentsRel = accentsDepuisPhonemes(phs);
  } else if (r.mots && r.mots.length > 0) {
    source = 'mots';
    const estimes: PhonemeEstime[] = [];
    const mots = [...r.mots].sort((a, b) => a.debut - b.debut);
    // Accents de groupe calculés sur le texte entier, reportés mot à mot.
    const accentsTexte = texteVersPhonemes(mots.map((m) => m.texte).join(' '));
    const motAccentue = new Set(accentsTexte.filter((p) => p.accent).map((p) => p.mot));
    mots.forEach((m, i) => {
      const phs = phonemesDepuisTexte(m.texte, m.debut, m.fin);
      let derniere = -1;
      phs.forEach((p, j) => {
        p.accent = false;
        if (VOYELLES_API.has(p.ph) && p.ph !== 'ə') derniere = j;
      });
      if (motAccentue.has(i) && derniere >= 0) phs[derniere]!.accent = true;
      estimes.push(...phs);
    });
    segments = estimes.map((p) => ({ debut: debut + p.debut, fin: debut + p.fin, info: infoPhoneme(p.ph), accent: p.accent === true }));
    accentsRel = accentsDepuisEstimes(estimes);
  } else {
    source = 'texte';
    // Petite attaque et petite queue : la voix ne remplit pas toute la durée estimée.
    const a = Math.min(0.04, duree * 0.05);
    const b = Math.max(a + 0.05, duree - Math.min(0.06, duree * 0.06));
    const estimes = phonemesDepuisTexte(r.texte, a, b);
    segments = estimes.map((p) => ({ debut: debut + p.debut, fin: debut + p.fin, info: infoPhoneme(p.ph), accent: p.accent === true }));
    accentsRel = accentsDepuisEstimes(estimes);
  }
  const accents: Accent[] = accentsRel.map((x, i) => ({
    t: debut + x.t,
    force: question && i === accentsRel.length - 1 ? 1 : x.force,
    question: question && i === accentsRel.length - 1,
  }));
  return {
    replique: r,
    personnage: r.personnage,
    debut,
    fin,
    segments,
    visemes: pisteVisemesDiscrete(segments),
    accents,
    source,
  };
}

/** Accents de phonèmes estimés (instant = milieu de la voyelle accentuée). */
function accentsDepuisEstimes(phs: readonly PhonemeEstime[]): Array<{ t: number; force: number }> {
  const acc = phs.filter((p) => p.accent);
  return acc.map((p, i) => {
    const suivant = phs[phs.indexOf(p) + 1];
    const finGroupe = !suivant || suivant.ph === 'sil' || i === acc.length - 1;
    return { t: (p.debut + p.fin) / 2, force: finGroupe ? 1 : 0.6 };
  });
}

/**
 * Accents de phonèmes horodatés : ceux marqués `accent`, sinon la dernière voyelle pleine avant chaque pause
 * (≥ 0,15 s ou `sil`) et les voyelles 1,5 fois plus longues que la médiane.
 */
function accentsDepuisPhonemes(
  phs: ReadonlyArray<{ ph: string; debut: number; fin: number; accent?: boolean }>,
): Array<{ t: number; force: number }> {
  const marques = phs.filter((p) => p.accent);
  if (marques.length > 0) return marques.map((p) => ({ t: (p.debut + p.fin) / 2, force: 1 }));
  const estVoyelle = (p: { ph: string }): boolean => {
    const api = normaliserPhoneme(p.ph);
    return VOYELLES_API.has(api) && api !== 'ə';
  };
  const voyelles = phs.filter(estVoyelle);
  if (voyelles.length === 0) return [];
  const durees = voyelles.map((p) => p.fin - p.debut).sort((a, b) => a - b);
  const mediane = durees[Math.floor(durees.length / 2)]!;
  const r = new Map<number, number>();
  phs.forEach((p, i) => {
    const suivant = phs[i + 1];
    const pause = !suivant || normaliserPhoneme(suivant.ph) === 'sil' || suivant.debut - p.fin >= 0.15;
    if (pause) {
      for (let k = i; k >= 0; k--) {
        const q = phs[k]!;
        if (normaliserPhoneme(q.ph) === 'sil') break;
        if (estVoyelle(q)) {
          r.set(k, 1);
          break;
        }
      }
    }
  });
  phs.forEach((p, i) => {
    if (estVoyelle(p) && p.fin - p.debut > 1.5 * mediane && !r.has(i)) r.set(i, 0.6);
  });
  return [...r.entries()].sort((a, b) => a[0] - b[0]).map(([i, force]) => {
    const p = phs[i]!;
    return { t: (p.debut + p.fin) / 2, force };
  });
}

const cacheProjet = new WeakMap<Projet, Map<string, PisteParole[]>>();

/** Pistes de parole d'un personnage, triées par début (mémorisées par projet). */
export function pistesPersonnage(projet: Projet, personnage: string): PisteParole[] {
  let m = cacheProjet.get(projet);
  if (!m) cacheProjet.set(projet, (m = new Map()));
  let l = m.get(personnage);
  if (!l) {
    l = projet.pistes.dialogue.filter((r) => r.personnage === personnage).map(pisteParole);
    l.sort((a, b) => a.debut - b.debut);
    m.set(personnage, l);
  }
  return l;
}

/**
 * Temps de la parole : l'audio ne s'arrête pas, la bouche suit donc le temps réel `t`, sauf pendant un gel où
 * elle se fige avec le jeu.
 */
export function tempsParole(projet: Projet, t: number): number {
  for (const m of projet.pistes.camera) {
    if (m.type === 'gel' && t >= m.debut && t < m.debut + m.duree) return m.debut;
  }
  return t;
}

/** Instant de jeu d'un instant absolu (gel, ralenti). */
export function versJeu(projet: Projet, t: number): number {
  return tempsDeJeu(projet, t);
}
