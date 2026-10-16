/**
 * Audio de l'export : bruitages synthétisés (déterministes, non muets, formes attendues), WAV, graphe de mixage,
 * mixage réel (instants exacts à l'échantillon près, durée exacte, sonie −14 LUFS), enveloppe RMS par image.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { collecterSources, enveloppeRms, grapheMixage, mixerAudio, multiplexer, type SourceAudio } from '../src/export/audio';
import { ffmpeg } from '../src/export/processus';
import { DUREES_SYNTHESE, lireReferenceSynthese, SONS_SYNTHETIQUES, synthetiser } from '../src/export/sfx';
import { mesurerSonie, verifierVideo } from '../src/export/verifier';
import { decoderWav, encoderWav, ecrireWav, lireWav, type SignalStereo } from '../src/export/wav';
import { creerProjetVide } from '../src/timeline/projet';

const d = mkdtempSync(join(tmpdir(), 'moteur-fluide-audio-'));
afterAll(() => rmSync(d, { recursive: true, force: true }));

const crete = (s: SignalStereo): number => {
  let m = 0;
  for (let i = 0; i < s.gauche.length; i++) m = Math.max(m, Math.abs(s.gauche[i]!), Math.abs(s.droite[i]!));
  return m;
};
const rms = (x: Float32Array, a = 0, b = x.length): number => {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, b - a));
};
/** Taux de passages par zéro (indice grossier du contenu aigu). */
const passagesZero = (x: Float32Array): number => {
  let n = 0;
  for (let i = 1; i < x.length; i++) if ((x[i]! >= 0) !== (x[i - 1]! >= 0)) n++;
  return n / x.length;
};

describe('bruitages synthétisés', () => {
  it('chaque bruitage : durée, crête normalisée, non muet, déterministe', () => {
    for (const nom of SONS_SYNTHETIQUES) {
      const a = synthetiser(nom, { graine: 5 });
      const b = synthetiser(nom, { graine: 5 });
      expect(a.gauche.length).toBe(Math.round(DUREES_SYNTHESE[nom] * 48000));
      expect(crete(a)).toBeCloseTo(0.7, 2);
      expect(rms(a.gauche)).toBeGreaterThan(0.01);
      expect(a.gauche).toEqual(b.gauche);
      expect(Math.abs(a.gauche[0]!)).toBe(0); // fondu d'attaque : pas de clic
    }
  });

  it('formes attendues : le pop est bref, le whoosh passe de gauche à droite, le ba-dum-tss frappe trois fois', () => {
    const pop = synthetiser('pop');
    const n = pop.gauche.length;
    expect(rms(pop.gauche, 0, n / 4)).toBeGreaterThan(4 * rms(pop.gauche, (3 * n) / 4, n));
    const w = synthetiser('whoosh');
    const m = w.gauche.length;
    expect(rms(w.gauche, 0, m / 2)).toBeGreaterThan(rms(w.droite, 0, m / 2));
    expect(rms(w.droite, m / 2, m)).toBeGreaterThan(rms(w.gauche, m / 2, m));
    expect(passagesZero(w.gauche)).toBeGreaterThan(passagesZero(pop.gauche)); // bruit filtré vs sinus grave
    const bdt = synthetiser('badumtss');
    const fen = (t: number): number => rms(bdt.gauche, Math.round(t * 48000), Math.round((t + 0.03) * 48000));
    expect(fen(0.0)).toBeGreaterThan(2 * fen(0.12)); // ba
    expect(fen(0.18)).toBeGreaterThan(1.8 * fen(0.12)); // dum
    expect(fen(0.36)).toBeGreaterThan(2.5 * fen(0.33)); // tss
    expect(fen(0.9)).toBeLessThan(0.1 * fen(0.36)); // la cymbale s'éteint
  });

  it('références « synth: » et réglages', () => {
    expect(lireReferenceSynthese('musique.wav')).toBeNull();
    const r = lireReferenceSynthese('synth:pop?duree=0.2&hauteur=1.5&graine=4')!;
    expect(r.nom).toBe('pop');
    expect(r.parametres).toEqual({ duree: 0.2, hauteur: 1.5, graine: 4 });
    expect(lireReferenceSynthese('synth:pop?graine=4&duree=0.2&hauteur=1.5')!.cle).not.toBe(lireReferenceSynthese('synth:pop?graine=5&duree=0.2&hauteur=1.5')!.cle);
    expect(() => lireReferenceSynthese('synth:tonnerre')).toThrow(/inconnu/);
    expect(() => lireReferenceSynthese('synth:pop?vitesse=2')).toThrow(/réglage inconnu/);
    expect(synthetiser('pop', { duree: 0.3 }).gauche.length).toBe(14400);
  });

  it('WAV 16 bits : aller-retour', () => {
    const s = synthetiser('boing');
    const b = encoderWav(s);
    expect(b.toString('ascii', 0, 4)).toBe('RIFF');
    const r = decoderWav(b);
    expect(r.frequence).toBe(48000);
    expect(r.gauche.length).toBe(s.gauche.length);
    let ecart = 0;
    for (let i = 0; i < s.gauche.length; i++) ecart = Math.max(ecart, Math.abs(r.gauche[i]! - s.gauche[i]!));
    expect(ecart).toBeLessThan(1 / 16000);
  });
});

describe('mixage', { timeout: 60000 }, () => {
  const src = (id: string, fichier: string, debut: number, duree: number, x: Partial<SourceAudio> = {}): SourceAudio => ({
    id,
    type: 'effet',
    fichier,
    origine: fichier,
    debut,
    dureeFichier: duree,
    volume: 1,
    boucle: false,
    ...x,
  });

  it('graphe : retard à l’échantillon près, coupe en début de plage, boucle bornée', () => {
    const g = grapheMixage([src('a', '/a.wav', 1.5, 0.2), src('b', '/b.wav', 0.5, 2), src('c', '/c.wav', 0, 1, { boucle: true }), src('d', '/d.wav', 9, 1)], 1, 4);
    expect(g.utilisees.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(g.filtre).toContain('adelay=delays=24000S:all=1'); // 0,5 s après le début de la plage
    expect(g.filtre).toContain('atrim=start=0.5:duration=1.5'); // b : déjà jouée 0,5 s
    expect(g.entrees).toEqual(['-i', '/a.wav', '-i', '/b.wav', '-stream_loop', '-1', '-i', '/c.wav']);
    expect(g.filtre).toContain('atrim=start=1:duration=3'); // c en boucle jusqu'à la fin de la plage
    expect(g.filtre).toContain('amix=inputs=3:normalize=0');
    expect(g.filtre).toContain('apad=whole_dur=3,atrim=duration=3[mix]');
    expect(grapheMixage([], 0, 2).filtre).toContain('anullsrc');
  });

  it('mixage réel : instants exacts, durée exacte, −14 LUFS', async () => {
    const pop = join(d, 'pop.wav');
    const coup = join(d, 'coup.wav');
    ecrireWav(pop, synthetiser('pop'));
    ecrireWav(coup, synthetiser('coup'));
    const sortie = join(d, 'mix.wav');
    const r = await mixerAudio({ sources: [src('pop', pop, 1.0, 0.16), src('coup', coup, 2.5, 0.35, { volume: 0.5 })], debut: 0, fin: 4, sortie });
    expect(r.apres).toBeDefined();
    expect(Math.abs(r.apres!.integre - -14)).toBeLessThan(1);
    expect(r.apres!.creteVraie).toBeLessThanOrEqual(-1.4);
    const m = lireWav(sortie);
    expect(m.gauche.length).toBe(4 * 48000);
    const debut = (apres: number): number => {
      let i = Math.round(apres * 48000);
      while (Math.abs(m.gauche[i]!) < 0.01) i++;
      return i / 48000;
    };
    expect(Math.abs(debut(0.9) - 1.0)).toBeLessThan(0.003);
    expect(Math.abs(debut(2.4) - 2.5)).toBeLessThan(0.003);
    const s = await mesurerSonie(sortie);
    expect(Math.abs(s!.integre - -14)).toBeLessThan(1);
  });

  it('plage partielle : le son commencé avant la plage est coupé, pas décalé', async () => {
    const coup = join(d, 'coup2.wav');
    ecrireWav(coup, synthetiser('boing', { duree: 1 }));
    const sortie = join(d, 'partiel.wav');
    await mixerAudio({ sources: [src('b', coup, 0.5, 1)], debut: 1, fin: 2, sortie });
    const m = lireWav(sortie);
    expect(m.gauche.length).toBe(48000);
    expect(rms(m.gauche, 0, 4800)).toBeGreaterThan(0.01); // la fin du boing est là dès le début
  });

  it('silence sans source, puis multiplexage vérifié', async () => {
    const wav = join(d, 'silence.wav');
    const r = await mixerAudio({ sources: [], debut: 0, fin: 2, sortie: wav });
    expect(r.mode).toBe('silence');
    expect(lireWav(wav).gauche.length).toBe(96000);
    const v = join(d, 'v.mp4');
    await ffmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=216x384:rate=30:duration=2', '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-profile:v', 'high', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', v]);
    const sortie = join(d, 'final.mp4');
    await multiplexer({ video: v, audio: wav, sortie, titre: 'essai' });
    const ver = await verifierVideo(sortie, { largeur: 216, hauteur: 384, fps: 30, images: 60, audio: true, audioSilencieux: true });
    expect(ver.controles.filter((c) => !c.ok)).toEqual([]);
  });

  it('collecte : bruitages « synth: » générés, fichiers manquants signalés', async () => {
    const p = creerProjetVide('sons', 3);
    p.pistes.sons = [
      { id: 's1', fichier: 'synth:whoosh?duree=0.4', debut: 0.5, type: 'effet' },
      { id: 's2', fichier: 'introuvable.wav', debut: 1, type: 'musique' },
    ];
    const c = await collecterSources(p, { dossierProjet: d, dossierTravail: d });
    expect(c.sources).toHaveLength(1);
    expect(c.sources[0]!.dureeFichier).toBeCloseTo(0.4, 2);
    expect(c.synthetises).toHaveLength(1);
    expect(c.manquants[0]).toMatch(/son s2 : fichier introuvable/);
  });

  it('enveloppe RMS par image', async () => {
    const f = join(d, 'env.wav');
    const s = synthetiser('pop', { duree: 0.5 });
    const n = s.gauche.length;
    const signal: SignalStereo = { frequence: 48000, gauche: new Float32Array(2 * n), droite: new Float32Array(2 * n) };
    signal.gauche.set(s.gauche, n); // 0,5 s de silence puis le pop
    signal.droite.set(s.droite, n);
    ecrireWav(f, signal);
    const e = await enveloppeRms(f, 30);
    expect(e.length).toBe(30);
    expect(Math.max(...e.slice(0, 14))).toBeLessThan(1e-4);
    expect(e[15]!).toBeGreaterThan(0.05);
  });
});
