/**
 * Commande « rendre » : lecture des options, positions (image, secondes, timecode), échantillons, rigs, garde-fous
 * (sortie hors de `sorties/`, plage vide, projet absent) — sans lancer de rendu.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { chargerRigsProjet, choisirEchantillons, lireOptions, lirePosition, principal } from '../src/cli';
import { RACINE_MOTEUR } from '../src/outils/kit';
import { creerProjetVide } from '../src/timeline/projet';

const d = mkdtempSync(join(tmpdir(), 'moteur-fluide-cli-'));
afterAll(() => rmSync(d, { recursive: true, force: true }));

function projetFichier(): string {
  const p = creerProjetVide('essai cli', 2, 30);
  p.plans = [{ id: 'p1', debut: 0, fin: 2, decor: 'decor-inexistant', cadrage: {}, personnages: [] }];
  const f = join(d, 'essai.projet.json');
  writeFileSync(f, JSON.stringify(p));
  return f;
}

describe('options', () => {
  it('positions : image, secondes, timecode', () => {
    expect(lirePosition('45', 30)).toBe(45);
    expect(lirePosition('1.5s', 30)).toBe(45);
    expect(lirePosition('1,5s', 60)).toBe(90);
    expect(lirePosition('00:00:01:15', 30)).toBe(45);
    expect(() => lirePosition('demain', 30)).toThrow(/illisible/);
  });

  it('lecture des options', () => {
    const o = lireOptions(['p.json', '--sortie', 'x.mp4', '--fps', '60', '--flou', '4', '--de', '10', '--a', '2s', '--taille', '540x960', '--rig', 'modou=/tmp/r.json', '--capture', 'png']);
    expect(o).not.toBe('aide');
    if (o === 'aide') return;
    expect(o.fps).toBe(60);
    expect(o.flou).toBe(4);
    expect(o.taille).toEqual({ largeur: 540, hauteur: 960 });
    expect(o.rig).toEqual({ modou: '/tmp/r.json' });
    expect(o.capture).toBe('png');
    expect(o.paralleles).toBe(1);
    expect(lireOptions(['--aide'])).toBe('aide');
    expect(() => lireOptions([])).toThrow(/Projet manquant/);
    expect(() => lireOptions(['p.json', '--taille', '541x960'])).toThrow(/paires/);
    expect(() => lireOptions(['p.json', '--capture', 'gif'])).toThrow(/jpeg/);
    expect(() => lireOptions(['p.json', '--crf', '99'])).toThrow(/crf/);
  });

  it('échantillons : centres répartis, débuts de plans, voisins', () => {
    const e = choisirEchantillons(0, 180, [120], 6);
    expect(e).toContain(15);
    expect(e).toContain(14);
    expect(e).toContain(16);
    expect(e).toContain(121); // première image du plan + 1, avec ses voisines
    expect(e).toContain(120);
    expect(e.every((k) => k >= 0 && k < 180)).toBe(true);
    expect([...e].sort((a, b) => a - b)).toEqual(e);
  });
});

describe('rigs', () => {
  it('rig de secours pour un personnage sans rig, sous l’identifiant déclaré', () => {
    const p = creerProjetVide('rigs');
    p.personnages = [{ id: 'x', nom: 'X', rig: 'personne-inconnue', tailleM: 1.7 }];
    const sans = chargerRigsProjet(p, { dossiers: [join(RACINE_MOTEUR, 'assets-test')], explicites: {} });
    expect(Object.keys(sans.rigs)).toEqual([]);
    expect(sans.avertissements[0]).toMatch(/introuvable/);
    const avec = chargerRigsProjet(p, { dossiers: [join(RACINE_MOTEUR, 'assets-test')], explicites: {}, secours: 'modou-test' });
    expect(avec.rigs['personne-inconnue']!.id).toBe('personne-inconnue');
    expect(avec.rigs['personne-inconnue']!.squelette.os.length).toBeGreaterThan(10);
  }, 60000);
});

describe('garde-fous de la commande', { timeout: 60000 }, () => {
  const silence = (): void => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  };

  it('aide : code 0 ; projet absent : code 1', async () => {
    silence();
    expect(await principal(['--aide'])).toBe(0);
    expect(await principal([join(d, 'absent.json')])).toBe(1);
    vi.restoreAllMocks();
  });

  it('sans --sortie : porte qualité seule, code 0', async () => {
    silence();
    expect(await principal([projetFichier()])).toBe(0);
    vi.restoreAllMocks();
  });

  it('plage vide : code 1', async () => {
    silence();
    expect(await principal([projetFichier(), '--de', '40', '--a', '20'])).toBe(1);
    vi.restoreAllMocks();
  });

  it('sortie dans le dépôt hors de sorties/ : refusée avant tout rendu', async () => {
    silence();
    const interdit = join(RACINE_MOTEUR, 'rendu-interdit.mp4');
    expect(await principal([projetFichier(), '--sortie', interdit])).toBe(1);
    expect(existsSync(interdit)).toBe(false);
    expect(existsSync(join(RACINE_MOTEUR, 'rendu-interdit.travail'))).toBe(false);
    vi.restoreAllMocks();
  });
});
