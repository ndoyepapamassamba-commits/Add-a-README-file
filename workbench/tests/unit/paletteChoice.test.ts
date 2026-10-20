// v64 — « La palette de couleur choisie n'a pas été reproduite » : le modèle passait un thème « custom » tiré de sa
// mémoire (marine / bleu / lime Ecobank) et l'app le préférait au choix fait dans la galerie (Onyx & Or) ; seul le logo
// suivait. Données synthétiques uniquement.
import { describe, expect, it } from 'vitest';
import { paletteFidelity } from '../../server/services/designGate';
import { buildTheme, contrastOf, customNeutrals, withTheme } from '../../server/services/houseDesign';
import { houseXlsx } from '../../server/services/houseStyle';
import { themeAskedByUser } from '../../server/services/premiumDesigns';

const REMEMBERED = { theme: 'custom', colors: { primary: '#005C83', accent: '#8CC63F', dark: '#00415E', font: 'Segoe UI' } };
const COLS = ['Contrepartie', 'Segment', 'Encours XOF', 'Provision XOF'];
const ROWS = Array.from({ length: 24 }, (_, i) => ({ Contrepartie: `CLIENT ${i + 1}`, Segment: ['A', 'B', 'C'][i % 3], 'Encours XOF': (i + 3) * 1_000_000, 'Provision XOF': (i % 5) * 50_000 }));

describe('le choix de la galerie prime sur le thème que le modèle a retenu', () => {
  it('un thème « custom » de mémoire ne compte pas comme une demande de l’utilisateur', () => {
    expect(themeAskedByUser(REMEMBERED, 'Dans le fichier attaché, donnes moi un fichier excel ultra design analysant le top 20 du segment')).toBe(false);
    expect(themeAskedByUser({ theme: 'onyx' }, 'fais-moi le classeur des impayés')).toBe(false);
  });
  it('il compte quand les mots de l’utilisateur le nomment : un code couleur, le nom du thème, une couleur', () => {
    expect(themeAskedByUser(REMEMBERED, 'refais-le en marine #00415E et lime')).toBe(true);
    expect(themeAskedByUser({ theme: 'onyx' }, 'je veux le style Onyx')).toBe(true);
    expect(themeAskedByUser({ theme: 'emerald' }, 'mets-le en émeraude')).toBe(true);
    expect(themeAskedByUser({ theme: 'custom', colors: { primary: '#7C3AED' } }, 'en violet s’il te plaît')).toBe(true);
  });
});

describe('un thème personnalisé tire ses fonds, filets et textes de sa propre palette', () => {
  const t = buildTheme({ primary: '#7A3FA8', accent: '#F2C94C', dark: '#4A1D66' });
  it('plus de surfaces ni de texte de la maison (F5F9FF, DBE6F7, 0F172A)', () => {
    expect(t.color.panel).not.toBe('F5F9FF');
    expect(t.color.line).not.toBe('DBE6F7');
    expect(t.color.text).not.toBe('0F172A');
    expect(t.color).toMatchObject(customNeutrals('7A3FA8', '4A1D66'));
  });
  it('les textes dérivés restent lisibles (WCAG) : ≥ 12:1 et ≥ 5,5:1 sur blanc, même avec un ton « foncé » clair', () => {
    for (const dark of ['4A1D66', '8899AA', 'C8A951']) {
      const n = customNeutrals('7A3FA8', dark);
      expect(contrastOf(n.text, 'FFFFFF')).toBeGreaterThanOrEqual(12);
      expect(contrastOf(n.text2, 'FFFFFF')).toBeGreaterThanOrEqual(5.5);
    }
  });
});

describe('fidélité à la palette mesurée sur le classeur produit', () => {
  const onyx = buildTheme('onyx');
  const inOnyx = withTheme('onyx', () => houseXlsx(COLS, ROWS, { title: 'Top 20', chart: 'bar' }));
  const inMemory = withTheme(REMEMBERED.colors, () => houseXlsx(COLS, ROWS, { title: 'Top 20', chart: 'bar' }));
  it('le classeur rendu dans le thème choisi y est fidèle (≥ 90 %)', () => {
    const r = paletteFidelity(inOnyx, onyx)!;
    expect(r.coloured).toBeGreaterThan(0);
    expect(r.share).toBeGreaterThanOrEqual(0.9);
  });
  it('le même classeur aux couleurs de mémoire est détecté comme infidèle au choix (< 30 %)', () => {
    expect(paletteFidelity(inMemory, onyx)!.share).toBeLessThan(0.3);
  });
  it('un thème personnalisé n’emporte plus les surfaces maison : fidélité ≥ 90 % à sa propre palette', () => {
    const mine = buildTheme(REMEMBERED.colors);
    expect(paletteFidelity(inMemory, mine)!.share).toBeGreaterThanOrEqual(0.9);
  });
});
