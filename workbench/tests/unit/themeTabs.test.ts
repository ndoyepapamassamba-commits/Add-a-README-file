import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { THEMES, buildTheme, withTheme, type ThemeId } from '../../server/services/houseDesign';
import { exampleData, exampleDossier } from '../../server/services/dossier/exemple';
import { dossierXlsx } from '../../server/services/dossier/dossierXlsx';

// Consigne du 15/10/2026 : le nouveau style sort partout avec adaptation du thème — jusqu'aux onglets des feuilles.
const tabsOf = (bytes: Uint8Array) => {
  const z = unzipSync(bytes, { filter: (e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name) });
  return Object.values(z).map((x) => /<tabColor rgb="FF([0-9A-F]{6})"/.exec(strFromU8(x))?.[1]).filter(Boolean) as string[];
};

describe('couleurs d’onglet du classeur comité selon le thème', () => {
  it('chaque onglet prend une couleur de la palette du thème (le vert du plan d’actions mis à part)', () => {
    const plan = buildTheme(null).xlsx.tabColor.plan;
    for (const t of ['comite', 'extraordinaire', 'house-sahel', 'onyx', 'house-g-140-t', 'swiss'] as ThemeId[]) {
      const pal = new Set(Object.values(buildTheme(t).color).map((c) => String(c).toUpperCase()));
      const tabs = withTheme(t, () => tabsOf(dossierXlsx(exampleDossier(), { data: exampleData() })));
      expect(tabs.length).toBeGreaterThan(8);
      // Technical sheets (data, lists, calculations) stay neutral grey.
      for (const c of tabs) expect(c === plan || c === 'A6A6A6' || pal.has(c), `${t} : onglet ${c}`).toBe(true);
    }
  });

  it('aucun bleu de la maison sur les onglets d’un autre thème, y compris un thème personnalisé', () => {
    for (const t of (Object.keys(THEMES) as ThemeId[]).filter((x) => x !== 'house')) {
      const tabs = new Set(Object.values(buildTheme(t).xlsx.tabColor));
      const own = new Set(Object.values(buildTheme(t).color).map(String));
      for (const house of ['001B4D', '003DA5']) if (!own.has(house)) expect(tabs.has(house), `${t}`).toBe(false);
    }
    const custom = buildTheme({ primary: '7C3AED', accent: 'F59E0B' });
    expect(custom.xlsx.tabColor.detail).toBe('7C3AED');
    expect(custom.xlsx.tabColor.summary).toBe('F59E0B');
  });
});
