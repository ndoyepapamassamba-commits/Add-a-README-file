import { describe, expect, it } from 'vitest';
import { PROGRAMMES, lisBilan, progression, totaux, type Bilan } from '../../navigateur/monetisation';

const tiktok = PROGRAMMES.find((p) => p.plateforme === 'tiktok')!;
const youtube = PROGRAMMES.find((p) => p.plateforme === 'youtube')!;

describe('Monétisation (18/10/2026)', () => {
  it('quatre plateformes, chacune avec l’endroit où vérifier la règle à jour', () => {
    expect(PROGRAMMES.map((p) => p.plateforme)).toEqual(['tiktok', 'youtube', 'facebook', 'instagram']);
    for (const p of PROGRAMMES) expect(p.verifier.length).toBeGreaterThan(5);
  });
  it('TikTok : vidéos de plus d’une minute et compte public rappelés, seuils mesurés', () => {
    expect(tiktok.regles.join(' ')).toMatch(/plus d’une minute/i);
    expect(tiktok.regles.join(' ')).toMatch(/compte public/);
    const b: Bilan = { date: '2026-10-18', plateformes: { tiktok: { connecte: true, abonnes: 12_000, vues_30j: 50_000 } } };
    const v = progression(tiktok, b)[0]!;
    expect(v.voie.map((e) => e.ok)).toEqual([true, false]);
    expect(v.voie[1]!.part).toBeCloseTo(0.5);
    expect(v.eligible).toBe(false);
  });
  it('YouTube : deux voies (Shorts ou heures), l’une suffit', () => {
    const b: Bilan = { date: '2026-10-18', plateformes: { youtube: { connecte: true, abonnes: 1_500, vues_shorts_90j: 11_000_000 } } };
    const pr = progression(youtube, b);
    expect(pr).toHaveLength(2);
    expect(pr[0]!.eligible).toBe(true);
    expect(pr[1]!.eligible).toBe(false);
  });
  it('sans bilan : rien n’est inventé (valeurs absentes, aucune voie atteinte)', () => {
    const v = progression(tiktok, null)[0]!;
    expect(v.voie.every((e) => e.valeur === null && !e.ok)).toBe(true);
  });
  it('un bilan qui contient un jeton est refusé', () => {
    expect(() => lisBilan(JSON.stringify({ date: 'x', plateformes: {}, access_token: 'abc' }))).toThrow(/jetons/);
    expect(lisBilan(JSON.stringify({ date: 'x', plateformes: {} })).date).toBe('x');
  });
  it('revenus additionnés par plateforme et devise', () => {
    expect(totaux([
      { mois: '2026-10', plateforme: 'tiktok', montant: 10, devise: 'EUR' },
      { mois: '2026-11', plateforme: 'tiktok', montant: 5.5, devise: 'EUR' },
      { mois: '2026-11', plateforme: 'youtube', montant: 3, devise: 'USD' },
    ])).toEqual({ 'tiktok EUR': 15.5, 'youtube USD': 3 });
  });
});
