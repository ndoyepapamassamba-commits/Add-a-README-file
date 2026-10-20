import { describe, it, expect } from 'vitest';
import { localSkill, parseNum, LOCAL_SKILLS } from '../../server/jev/local';
import { directAnswer } from '../../server/jev/packet';

const NOW = new Date(2026, 9, 6, 10, 0, 0);
const a = (t: string) => localSkill(t, NOW)?.answer ?? null;

describe('JEV-0 local skills (exact, 0 $)', () => {
  it('parses french / english number formats', () => {
    expect(parseNum('1 500,5')).toBe(1500.5);
    expect(parseNum('1.500')).toBe(1500);
    expect(parseNum('1,500.25')).toBe(1500.25);
    expect(parseNum('3,14')).toBe(3.14);
    expect(parseNum('abc')).toBeNull();
  });
  it('percentages', () => {
    expect(a('20% de 1500')).toMatch(/\*\*300\*\*/);
    expect(a('augmente 1200 de 18%')).toMatch(/\*\*1[\s\u202f\u00a0]416\*\*/);
    expect(a('diminue 200 de 25 %')).toMatch(/\*\*150\*\*/);
    expect(a('30 représente quel pourcentage de 120 ?')).toMatch(/\*\*25 %\*\*/);
    expect(a('variation entre 80 et 100')).toMatch(/\*\*25 %\*\*/);
  });
  it('units, including temperature, and refuses incompatible or unknown units', () => {
    expect(a('12 km en miles')).toMatch(/7,456/);
    expect(a('98,6 F en C')).toMatch(/\*\*37 °C\*\*/);
    expect(a('3 h en min')).toMatch(/\*\*180 min\*\*/);
    expect(a('5 kg en km')).toBeNull();
    expect(a('5 euros en dollars')).toBeNull(); // currency needs live rates: never guessed
  });
  it('dates', () => {
    expect(a('combien de jours entre 2026-01-01 et 2026-03-15')).toMatch(/\*\*73 jour/);
    expect(a('quel jour était le 04/07/2026')).toMatch(/samedi/);
    expect(a('dans 45 jours')).toMatch(/20 novembre 2026/);
    expect(a('quel jour est le 31/02/2026')).toBeNull(); // invalid date
  });
  it('loan and compound interest', () => {
    expect(a('mensualité 10000000 à 8% sur 5 ans')).toMatch(/202[\s\u202f\u00a0]763,94/);
    expect(a('intérêts composés 1000 à 5% sur 10 ans')).toMatch(/1[\s\u202f\u00a0]628,89/);
  });
  it('text stats, bases, json', () => {
    expect(a('combien de mots dans « bonjour tout le monde »')).toMatch(/\*\*4 mots\*\*/);
    expect(a('255 en binaire')).toMatch(/0b11111111/);
    expect(a('0xFF en décimal')).toMatch(/\*\*255\*\*/);
    expect(a('formate ce json {"a":1,"b":[1,2]}')).toMatch(/valide[\s\S]*"b": \[/);
    expect(a('valide ce json {a:1}')).toMatch(/invalide/);
  });
  it('anything with extra context goes to the model (null)', () => {
    expect(a('20% de 1500 pour mon rapport au comité, explique la méthode')).toBeNull();
    expect(a('Analyse ce fichier et calcule 20% de la colonne B')).toBeNull();
    expect(a('')).toBeNull();
  });
  it('is wired into directAnswer and every skill has examples', () => {
    expect(directAnswer('20% de 1500')).toMatch(/300/);
    for (const s of LOCAL_SKILLS) {
      expect(s.examples.length).toBeGreaterThan(0);
      for (const ex of s.examples) {
        const t = ex.startsWith('formate') ? ex : ex;
        expect(localSkill(t, NOW), `${s.id}: ${ex}`).not.toBeNull();
      }
    }
  });
});
