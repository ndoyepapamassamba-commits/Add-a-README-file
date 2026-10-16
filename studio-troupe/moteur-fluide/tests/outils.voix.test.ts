import { describe, expect, it } from 'vitest';
import { fusionnerVoix, motsHorodates, recalerSurEnergie, regrouperDurees, preparerEntree } from '../src/outils/voix/dire';
import { texteVersPhonemes } from '../src/visage/phonetique';

// Table d'identifiants minimale (symboles du modèle Piper → id), suffisante pour les essais.
const TABLE: Record<string, number[]> = Object.fromEntries(
  ['_', '^', '$', ' ', ',', '!', 'ˈ', 'a', 'l', 'w', 'j', 's', 'ɛ', 'p', 'm', 'k', 'i', 'ɑ', '̃', 'ʒ', 'e', 'ə', 'u'].map((s, i) => [s, [i]]),
);

describe('outils/voix : fusion dans le projet', () => {
  it('ne change que audio, phonèmes et mots de la réplique visée', () => {
    const projet = {
      format: 'moteur-fluide/projet@1',
      decors: { 'rue-des-maquis-marcory': { mH: 3 } },
      plans: [{ id: 'p1', personnages: [{ personnage: 'modou', u: 0.5, v: 0.93 }] }],
      champInconnu: { garde: true },
      pistes: {
        actions: [{ personnage: 'modou', action: 'rire', debut: 5 }],
        dialogue: [
          { id: 'r1', personnage: 'modou', texte: 'Walay !', debut: 1.6, fin: 5.05, emotion: 'malice' },
          { id: 'r2', personnage: 'modou', texte: 'Hein ?', debut: 6 },
        ],
      },
    };
    const sortie = JSON.parse(
      fusionnerVoix(JSON.stringify(projet), 'r1', { audio: '../voix/r1.wav', phonemes: [{ ph: 'w', debut: 0, fin: 0.1 }], mots: [{ texte: 'Walay', debut: 0, fin: 0.3 }] }),
    );
    expect(sortie.decors).toEqual(projet.decors);
    expect(sortie.plans).toEqual(projet.plans);
    expect(sortie.champInconnu).toEqual(projet.champInconnu);
    expect(sortie.pistes.actions).toEqual(projet.pistes.actions);
    expect(sortie.pistes.dialogue[1]).toEqual(projet.pistes.dialogue[1]);
    const r1 = sortie.pistes.dialogue[0];
    expect(r1).toMatchObject({ id: 'r1', texte: 'Walay !', debut: 1.6, fin: 5.05, emotion: 'malice', audio: '../voix/r1.wav' });
    expect(r1.phonemes).toHaveLength(1);
    expect(r1.mots).toHaveLength(1);
  });

  it('refuse une réplique absente', () => {
    expect(() => fusionnerVoix('{"pistes":{"dialogue":[]}}', 'r9', { audio: 'x.wav', phonemes: [], mots: [] })).toThrow(/r9/);
  });
});

describe('outils/voix : durées et pauses', () => {
  it('regroupe les durées par phonème, sans trou ni chevauchement, et rend les fins silencieuses au silence', () => {
    const texte = "Walay, c'est pas moi !";
    const { phones, elements } = preparerEntree(texte, TABLE);
    expect(elements[0]!.role).toBe('debut');
    expect(elements.some((e) => e.role === 'accent')).toBe(true);
    const durees = elements.map(() => 0.03);
    const ph = regrouperDurees(phones, elements, durees);
    for (let k = 1; k < ph.length; k++) expect(ph[k]!.debut).toBeCloseTo(ph[k - 1]!.fin, 6);
    expect(ph.map((p) => p.ph).filter((p) => p !== 'sil')).toEqual(texteVersPhonemes(texte).map((p) => p.ph).filter((p) => p !== 'sil'));
    // Énergie : forte partout sauf entre 0,30 et 0,50 s.
    const fin = ph[ph.length - 1]!.fin;
    const rms = Array.from({ length: Math.ceil(fin / 0.01) }, (_, i) => (i >= 30 && i < 50 ? 0 : 0.1));
    const avant = ph.find((p) => p.debut < 0.3 && p.fin > 0.36 && p.ph !== 'sil');
    const recale = recalerSurEnergie(ph, rms);
    if (avant) expect(recale.some((p) => p.ph === 'sil' && p.debut <= 0.31 && p.fin > 0.36)).toBe(true);
    for (let k = 1; k < recale.length; k++) expect(recale[k]!.debut).toBeCloseTo(recale[k - 1]!.fin, 6);
  });

  it('horodate les mots selon la découpe du texte aux espaces (celle des sous-titres)', () => {
    const texte = "c'est pas moi !";
    const { phones, elements } = preparerEntree(texte, TABLE);
    const ph = regrouperDurees(phones, elements, elements.map(() => 0.02));
    const decalage = phones.map((p) => {
      if (p.ph === 'sil') return -1;
      const n = phones.slice(0, phones.indexOf(p) + 1).filter((q) => q.ph !== 'sil').length;
      let c = 0;
      return ph.findIndex((q) => q.ph !== 'sil' && ++c === n);
    });
    const mots = motsHorodates(texte, phones, ph, decalage);
    expect(mots.map((m) => m.texte)).toEqual(["c'est", 'pas', 'moi', '!']);
    for (let k = 1; k < mots.length; k++) expect(mots[k]!.debut).toBeGreaterThanOrEqual(mots[k - 1]!.debut);
  });
});
