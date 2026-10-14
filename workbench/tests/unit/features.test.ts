import { describe, expect, it } from 'vitest';
import { VIDEO_3D } from '../../direct/lib/features';
import { NAV_GROUPS, NAV_ITEMS, NAV_VIEWS, groupOf } from '../../direct/lib/nav';
import baseline from '../../direct/lib/inventoryBaseline.json';

describe('Drapeaux de fonctionnalités et navigation (lib/features.ts, lib/nav.ts)', () => {
  it('la vidéo 3D est hors de l’app (sujet à part) ; le bac à sable WebGL « Studio 3D » reste dans « Bac à sable »', () => {
    expect(VIDEO_3D).toBe(false);
    expect(groupOf('lab3d').label).toBe('Bac à sable');
  });
  it('refonte : AI Film Studio retiré de la navigation, douze rubriques comme sur la maquette', () => {
    expect(NAV_VIEWS).not.toContain('studio');
    expect(NAV_GROUPS.map((g) => g.label)).toEqual([
      'Cockpit IA',
      'Chats',
      'Agents',
      'Catalogue LLM',
      'Orchestration',
      'Workspace',
      'Fichiers',
      'Outils',
      'Bac à sable',
      'Observabilité',
      'Coûts',
      'Paramètres',
    ]);
    expect(NAV_ITEMS).toHaveLength(NAV_GROUPS.length);
  });
  it('aucun écran de référence ne disparaît : chacun reste joignable par une rubrique ou un onglet', () => {
    for (const v of (baseline as { views: string[] }).views) expect(NAV_VIEWS).toContain(v);
    expect(groupOf('jev').label).toBe('Observabilité');
    expect(groupOf('terminal').label).toBe('Workspace');
    expect(groupOf('plugins').label).toBe('Outils');
    expect(groupOf('studio').label).toBe('Cockpit IA'); // hors navigation → retour au cockpit
  });
  it('chaque écran n’appartient qu’à une seule rubrique', () => {
    expect(new Set(NAV_VIEWS).size).toBe(NAV_VIEWS.length);
  });
});
