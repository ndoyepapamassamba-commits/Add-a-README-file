import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, NAV_ITEMS, NAV_VIEWS, groupOf } from '../../direct/lib/nav';
import baseline from '../../direct/lib/inventoryBaseline.json';

describe('Navigation (lib/nav.ts)', () => {
  it('la vidéo et la 3D sont parties dans leur propre application (studio-video) : plus de rubrique « Bac à sable »', () => {
    for (const v of ['videogen', 'realize', 'lab3d', 'studio']) expect(NAV_VIEWS).not.toContain(v);
    expect(NAV_GROUPS.map((g) => g.label)).not.toContain('Bac à sable');
    expect(groupOf('prompts').label).toBe('Outils'); // Prompt Studio reste dans Workbench
  });
  it('douze rubriques, dans l’ordre de la maquette (+ Circuit vidéo le 23/10/2026)', () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual([
      'Cockpit IA',
      'Chats',
      'Agents',
      'Catalogue LLM',
      'Orchestration',
      'Workspace',
      'Fichiers',
      'Circuit vidéo',
      'Outils',
      'Observabilité',
      'Coûts',
      'Paramètres',
    ]);
    expect(NAV_ITEMS).toHaveLength(NAV_GROUPS.length);
    expect(groupOf('film').label).toBe('Circuit vidéo');
  });
  it('aucun écran de référence ne disparaît : chacun reste joignable par une rubrique ou un onglet', () => {
    for (const v of (baseline as { views: string[] }).views) expect(NAV_VIEWS).toContain(v);
    expect(groupOf('jev').label).toBe('Observabilité');
    expect(groupOf('terminal').label).toBe('Workspace');
    expect(groupOf('plugins').label).toBe('Outils');
  });
  it('chaque écran n’appartient qu’à une seule rubrique', () => {
    expect(new Set(NAV_VIEWS).size).toBe(NAV_VIEWS.length);
  });
});
