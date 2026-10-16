/**
 * Tests des lèvres : couverture des phonèmes français (API, SAMPA, espeak), transcription de secours, durées,
 * accents, coarticulation (anticipation de l'arrondi, fermetures M/B/P garanties à 25 et 30 i/s, dents F/V),
 * piste discrète à durée minimale, sources de timing, déterminisme.
 */
import { describe, expect, it } from 'vitest';
import { phonemesDepuisTexte, texteVersPhonemes, motVersPhonemes, VOYELLES_API } from '../src/visage/phonetique';
import { pisteParole } from '../src/visage/parole';
import {
  formeCoarticulee,
  infoPhoneme,
  phonemeConnu,
  pisteVisemesDiscrete,
  visemeA,
  visemeDe,
  type SegmentArticule,
} from '../src/visage/visemes';
import { VISEMES, type Replique, type Viseme } from '../src/timeline/types';

/** Inventaire phonologique du français (API), avec le visème attendu. */
const FRANCAIS_API: Record<string, Viseme> = {
  a: 'A',
  ɑ: 'A',
  'ɑ̃': 'A',
  e: 'E',
  ɛ: 'E',
  'ɛ̃': 'E',
  ə: 'E',
  i: 'I',
  j: 'I',
  o: 'O',
  ɔ: 'O',
  'ɔ̃': 'O',
  œ: 'O',
  'œ̃': 'O',
  ø: 'U',
  u: 'U',
  y: 'U',
  w: 'U',
  ɥ: 'U',
  p: 'MBP',
  b: 'MBP',
  m: 'MBP',
  f: 'FV',
  v: 'FV',
  s: 'SZ',
  z: 'SZ',
  ʃ: 'CHJ',
  ʒ: 'CHJ',
  l: 'LR',
  ʁ: 'LR',
  t: 'TDN',
  d: 'TDN',
  n: 'TDN',
  ɲ: 'TDN',
  k: 'KG',
  ɡ: 'KG',
  ŋ: 'KG',
};
/** Notation SAMPA française. */
const FRANCAIS_SAMPA: Record<string, Viseme> = {
  a: 'A',
  A: 'A',
  'a~': 'A',
  e: 'E',
  E: 'E',
  'e~': 'E',
  '@': 'E',
  i: 'I',
  o: 'O',
  O: 'O',
  'o~': 'O',
  '9': 'O',
  '9~': 'O',
  '2': 'U',
  u: 'U',
  y: 'U',
  j: 'I',
  w: 'U',
  H: 'U',
  S: 'CHJ',
  Z: 'CHJ',
  J: 'TDN',
  N: 'KG',
  R: 'LR',
  g: 'KG',
};

describe('table phonème → visème', () => {
  it('couvre tout l’inventaire du français en API, avec le bon visème', () => {
    for (const [ph, v] of Object.entries(FRANCAIS_API)) {
      expect(phonemeConnu(ph), ph).toBe(true);
      expect(visemeDe(ph), ph).toBe(v);
    }
  });
  it('accepte la notation SAMPA, les variantes et les marques d’accent ou de longueur', () => {
    for (const [ph, v] of Object.entries(FRANCAIS_SAMPA)) expect(visemeDe(ph), ph).toBe(v);
    expect(visemeDe('ˈa')).toBe('A');
    expect(visemeDe('aː')).toBe('A');
    expect(visemeDe('a1')).toBe('A');
    expect(visemeDe('r')).toBe('LR');
    expect(visemeDe('ʀ')).toBe('LR');
    expect(visemeDe('dʒ')).toBe('CHJ');
    expect(visemeDe('ã')).toBe('A');
    for (const p of ['sil', 'sp', '_', '', 'pau']) expect(visemeDe(p)).toBe('repos');
  });
  it('chaque visème de la spécification est produit par au moins un phonème', () => {
    const produits = new Set(Object.keys(FRANCAIS_API).map(visemeDe));
    produits.add(visemeDe('sil'));
    for (const v of VISEMES) expect(produits.has(v), v).toBe(true);
  });
  it('voyelles antérieures arrondies : mâchoire fermée, lèvres arrondies', () => {
    const y = infoPhoneme('y').cible;
    const i = infoPhoneme('i').cible;
    expect(y.ouverture).toBeLessThan(0.25);
    expect(y.arrondi).toBeGreaterThan(0.9);
    expect(Math.abs(y.ouverture - i.ouverture)).toBeLessThan(0.1);
  });
});

describe('transcription de secours', () => {
  it('mots usuels', () => {
    expect(motVersPhonemes('Coumba').join(' ')).toBe('k u m b a');
    expect(motVersPhonemes('bonjour').join(' ')).toBe('b ɔ̃ ʒ u ʁ');
    expect(motVersPhonemes('maman').join(' ')).toBe('m a m ɑ̃');
    expect(motVersPhonemes('parler').join(' ')).toBe('p a ʁ l e');
    expect(motVersPhonemes('encore').join(' ')).toBe('ɑ̃ k ɔ ʁ');
    expect(motVersPhonemes('poisson').join(' ')).toBe('p w a s ɔ̃');
    expect(motVersPhonemes('maison').join(' ')).toBe('m ɛ z ɔ̃');
    expect(motVersPhonemes('chapeau').join(' ')).toBe('ʃ a p o');
    expect(motVersPhonemes('attiéké').join(' ')).toBe('a t j e k e');
  });
  it('ne produit que des phonèmes connus, avec pauses et accents de groupe', () => {
    const phrases = [
      "C'est pas vrai ? Maman Brigitte a pris le bus !",
      'Bonjour monsieur, comment ça va aujourd’hui ?',
      'On va manger l’attiéké avec le poisson braisé, wesh.',
      'Les enfants de la cour jouent au foot jusqu’à vingt heures…',
      'Il y a 3 garbas dans le sac, 10 pour toi.',
    ];
    for (const s of phrases) {
      const phs = texteVersPhonemes(s);
      expect(phs.length).toBeGreaterThan(5);
      for (const p of phs) expect(phonemeConnu(p.ph), `${p.ph} dans « ${s} »`).toBe(true);
      expect(phs.some((p) => p.ph === 'sil')).toBe(true);
      const accents = phs.filter((p) => p.accent);
      expect(accents.length).toBeGreaterThanOrEqual(2);
      for (const a of accents) expect(VOYELLES_API.has(a.ph) && a.ph !== 'ə').toBe(true);
    }
  });
  it('durées : remplissent l’intervalle demandé, voyelles accentuées allongées', () => {
    const phs = phonemesDepuisTexte('Quoi encore, Modou ?', 0.1, 1.6);
    expect(phs[0]!.debut).toBeCloseTo(0.1, 9);
    expect(phs[phs.length - 1]!.fin).toBeCloseTo(1.6, 9);
    for (let i = 1; i < phs.length; i++) expect(phs[i]!.debut).toBeCloseTo(phs[i - 1]!.fin, 9);
    const accent = phs.find((p) => p.accent)!;
    const autre = phs.find((p) => !p.accent && VOYELLES_API.has(p.ph) && p.ph !== 'ə')!;
    expect(accent.fin - accent.debut).toBeGreaterThan(autre.fin - autre.debut);
    // Débit naturel sans borne : 10 à 16 phonèmes par seconde.
    const libre = phonemesDepuisTexte('Maman Brigitte a pris le bus de Yopougon');
    const debit = libre.filter((p) => p.ph !== 'sil').length / libre[libre.length - 1]!.fin;
    expect(debit).toBeGreaterThan(9);
    expect(debit).toBeLessThan(17);
  });
});

/** Segments articulés depuis une suite `ph:durée`. */
function segments(desc: string, t0 = 0): SegmentArticule[] {
  let t = t0;
  return desc.split(' ').map((x) => {
    const [ph, d] = x.split(':');
    const s = { debut: t, fin: t + Number(d), info: infoPhoneme(ph!), accent: false };
    t += Number(d);
    return s;
  });
}

describe('coarticulation', () => {
  it('l’arrondi d’une voyelle arrondie est anticipé sur les consonnes qui la précèdent', () => {
    const versU = segments('i:0.12 s:0.08 t:0.06 ʁ:0.06 u:0.14');
    const versI = segments('i:0.12 s:0.08 t:0.06 ʁ:0.06 i:0.14');
    const tT = 0.12 + 0.08 + 0.03; // milieu du t
    expect(formeCoarticulee(versU, tT).arrondi - formeCoarticulee(versI, tT).arrondi).toBeGreaterThan(0.15);
  });
  it('les consonnes transparentes héritent des voyelles voisines', () => {
    const a = formeCoarticulee(segments('a:0.15 t:0.06 a:0.15'), 0.18);
    const i = formeCoarticulee(segments('i:0.15 t:0.06 i:0.15'), 0.18);
    expect(a.ouverture).toBeGreaterThan(i.ouverture + 0.2);
  });
  it('dents sur la lèvre pendant F/V', () => {
    expect(formeCoarticulee(segments('a:0.15 f:0.09 a:0.15'), 0.195).dents).toBeGreaterThan(0.9);
  });
  it('continue (aucun saut) et repos loin de la parole', () => {
    const s = segments('sil:0.1 m:0.07 a:0.2 b:0.05 i:0.1 sil:0.2', 1);
    for (let t = 0; t < 3; t += 0.0013) {
      const a = formeCoarticulee(s, t);
      const b = formeCoarticulee(s, t + 1e-4);
      expect(Math.abs(b.ouverture - a.ouverture)).toBeLessThan(0.01);
      expect(Math.abs(b.arrondi - a.arrondi)).toBeLessThan(0.01);
    }
    expect(formeCoarticulee(s, -2).ouverture).toBeLessThan(0.05);
  });
  it('fermetures M/B/P garanties à 25 et 30 i/s, même brèves', () => {
    const texte = "Maman, Bamba m'a parlé de papa, du bébé et du pompier, pas moi.";
    const r: Replique = { id: 'r', personnage: 'modou', texte, debut: 0.37 };
    const piste = pisteParole(r);
    const mbp = piste.segments.filter((s) => s.info.viseme === 'MBP');
    expect(mbp.length).toBeGreaterThan(12);
    for (const fps of [25, 30]) {
      for (const s of mbp) {
        const c = (s.debut + s.fin) / 2;
        // Au moins une image (bouche en avance de 40 ms) à moins d'une demi-image du centre a la bouche fermée.
        let ferme = false;
        for (let n = Math.floor((c - 0.04 - 2 / fps) * fps); n <= Math.ceil((c - 0.04 + 2 / fps) * fps); n++) {
          const t = n / fps + 0.04;
          if (Math.abs(t - c) <= 0.5 / fps + 1e-9 && formeCoarticulee(piste.segments, t).ouverture < 0.05) ferme = true;
        }
        expect(ferme, `${s.info.api} à ${c.toFixed(3)} s (${fps} i/s)`).toBe(true);
      }
    }
  });
});

describe('piste discrète', () => {
  it('pas de forme de moins de 60 ms hors fermetures, fermetures d’au moins 45 ms', () => {
    const piste = pisteParole({ id: 'r2', personnage: 'modou', texte: 'Quoi ? Tu as mangé tout le garba de Bamba ?', debut: 2 });
    const v = pisteVisemesDiscrete(piste.segments);
    expect(v.length).toBeGreaterThan(5);
    for (const s of v) {
      if (s.viseme === 'MBP') expect(s.fin - s.debut).toBeGreaterThanOrEqual(0.045 - 1e-9);
      else expect(s.fin - s.debut, s.viseme).toBeGreaterThanOrEqual(0.06 - 1e-9);
    }
    expect(visemeA(v, 1.9)).toBe('repos');
  });
});

describe('sources de timing', () => {
  it('visèmes manuels > phonèmes > mots > texte', () => {
    const base: Replique = { id: 'x', personnage: 'modou', texte: 'Coumba !', debut: 1 };
    expect(pisteParole({ ...base, id: 'a' }).source).toBe('texte');
    expect(pisteParole({ ...base, id: 'b', mots: [{ texte: 'Coumba', debut: 0, fin: 0.5 }] }).source).toBe('mots');
    expect(pisteParole({ ...base, id: 'c', phonemes: [{ ph: 'k', debut: 0, fin: 0.1 }] }).source).toBe('phonemes');
    const manuel = pisteParole({
      ...base,
      id: 'd',
      phonemes: [{ ph: 'k', debut: 0, fin: 0.1 }],
      visemes: [
        { t: 0, viseme: 'O' },
        { t: 0.2, viseme: 'MBP', verrouillee: true },
        { t: 0.3, viseme: 'A' },
      ],
      fin: 1.6,
    });
    expect(manuel.source).toBe('visemes');
    expect(visemeA(manuel.visemes, 1.25)).toBe('MBP');
    expect(formeCoarticulee(manuel.segments, 1.25).ouverture).toBeLessThan(0.05);
  });
  it('mots horodatés : chaque mot est articulé dans son intervalle', () => {
    const p = pisteParole({
      id: 'm',
      personnage: 'modou',
      texte: 'Quoi encore',
      debut: 1.2,
      mots: [
        { texte: 'Quoi', debut: 0, fin: 0.3 },
        { texte: 'encore', debut: 0.3, fin: 0.8 },
      ],
    });
    expect(p.segments[0]!.debut).toBeCloseTo(1.2, 9);
    expect(p.segments[p.segments.length - 1]!.fin).toBeCloseTo(2.0, 9);
    expect(p.accents.length).toBeGreaterThanOrEqual(1);
  });
  it('accents des phonèmes : marqués, sinon fins de groupe et voyelles longues', () => {
    const p = pisteParole({
      id: 'acc',
      personnage: 'modou',
      texte: 'Coumba ! Viens.',
      debut: 0,
      phonemes: [
        { ph: 'k', debut: 0, fin: 0.06 },
        { ph: 'u', debut: 0.06, fin: 0.14 },
        { ph: 'm', debut: 0.14, fin: 0.2 },
        { ph: 'b', debut: 0.2, fin: 0.26 },
        { ph: 'a', debut: 0.26, fin: 0.5 },
        { ph: 'sil', debut: 0.5, fin: 0.8 },
        { ph: 'v', debut: 0.8, fin: 0.88 },
        { ph: 'j', debut: 0.88, fin: 0.92 },
        { ph: 'ɛ̃', debut: 0.92, fin: 1.2 },
      ],
    });
    expect(p.accents.map((a) => Math.round(a.t * 100))).toEqual([38, 106]);
  });
});
