import { describe, expect, it } from 'vitest';
import { checkPack, mergePacks, packFileName, packText, parsePack, splitDecors, PACK_MAX_BYTES, type PackDecor, type TroupePack } from '../../coeur/videogen/troupePack';

const png = (n: number) => `data:image/png;base64,${'A'.repeat(n)}`;
const decor = (name: string, n = 100): PackDecor => ({ name, src: png(n), depth: png(n / 4), fit: { mH: 2 } });
const pack = (part: number, of: number, decors: PackDecor[], version = 'v1'): TroupePack => ({ kind: 'massamba-troupe', version, part, of, decors });

describe('paquets de décors (app livrée en fichiers de moins de 30 Mo)', () => {
  it('la taille maximale reste sous la limite d’envoi de 30 Mio', () => {
    expect(PACK_MAX_BYTES).toBeLessThan(30 * 1024 * 1024);
    expect(packFileName(3)).toBe('massamba-troupe-3.js');
  });

  it('découpe dans l’ordre, chaque paquet sous le plafond, sans perdre de décor', () => {
    const ds = Array.from({ length: 40 }, (_, i) => decor(`D${i}`, 1000 + i * 37));
    const groups = splitDecors(ds, 8000);
    expect(groups.length).toBeGreaterThan(4);
    expect(groups.flat().map((d) => d.name)).toEqual(ds.map((d) => d.name));
    groups.forEach((g, i) => expect(packText(pack(i + 1, groups.length, g)).length).toBeLessThanOrEqual(8000));
  });

  it('un décor plus gros que le plafond a son propre paquet', () => {
    const groups = splitDecors([decor('A'), decor('Énorme', 20_000), decor('B')], 5000);
    expect(groups.map((g) => g.map((d) => d.name))).toEqual([['A'], ['Énorme'], ['B']]);
  });

  it('aller-retour exact : le fichier écrit par la construction est relu à l’identique', () => {
    const p = pack(2, 3, [decor('Marché'), { name: 'Plage', src: 'data:image/jpeg;base64,/9j/AA==', plate: png(8), plateDepth: png(8), masks: png(8) }]);
    expect(parsePack(packText(p))).toEqual(p);
    expect(parsePack(`\n  ${packText(p)}  \n`)).toEqual(p);
  });

  it('refuse ce qui n’est pas un paquet (lu comme données, jamais exécuté)', () => {
    expect(() => parsePack('alert(1)')).toThrow(/pas un paquet/);
    const t = packText(pack(1, 1, [decor('X')]));
    expect(() => parsePack(t.replace('"kind":"massamba-troupe"', '"kind":"autre"'))).toThrow(/invalide/);
    expect(() => parsePack(t.slice(0, -10) + 'x);')).toThrow();
    // Only embedded PNG/JPEG images: no remote URL, no script, no SVG.
    for (const bad of ['https://exemple.com/a.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGI+']) {
      expect(() => checkPack(pack(1, 1, [{ name: 'X', src: bad }]))).toThrow(/refusée/);
    }
    expect(() => checkPack(pack(4, 3, [decor('X')]))).toThrow(/numéro/);
  });

  it('fusionne les paquets d’une version dans l’ordre et dit ce qui manque', () => {
    const info = { version: 'v1', count: 3, decors: 5 };
    const m = mergePacks([pack(3, 3, [decor('E')]), pack(1, 3, [decor('A'), decor('B')]), pack(2, 3, [decor('Z')], 'v0')], info);
    expect(m.decors.map((d) => d.name)).toEqual(['A', 'B', 'E']);
    expect(m.missing).toEqual([2]);
    expect(m.foreign).toBe(1);
  });
});
