// Navigation of the direct edition, after the redesign (mockup « Cockpit IA / Catalogue LLM / Orchestration /
// Observabilité »): twelve sections in a labelled sidebar; a section that gathers several screens shows them as tabs.
// The AI Film Studio and the 3D video chain (Blender director, local Blender bridge) left the navigation; the WebGL
// sandbox « Studio 3D » stays in « Bac à sable » (their code stays in the repository).
import type { View } from './types';

export type Group =
  | 'cockpit'
  | 'chat'
  | 'agents'
  | 'catalogue'
  | 'orchestration'
  | 'workspace'
  | 'files'
  | 'tools'
  | 'sandbox'
  | 'observability'
  | 'costs'
  | 'settings';

export interface NavGroup {
  id: Group;
  label: string;
  /** One line shown as the tooltip and in « Aide & Docs ». */
  hint: string;
  /** Screens of the section, the first one opens by default. */
  views: { id: View; label: string }[];
}

export const NAV_GROUPS: NavGroup[] = [
  { id: 'cockpit', label: 'Cockpit IA', hint: 'Lancer une mission, suivre agents, sessions, coûts et erreurs en temps réel.', views: [{ id: 'home', label: 'Cockpit' }] },
  { id: 'chat', label: 'Chats', hint: 'Discuter avec l’IA, joindre des fichiers, recevoir les livrables.', views: [{ id: 'chat', label: 'Chat' }] },
  { id: 'agents', label: 'Agents', hint: 'Agents spécialisés : rôle, modèle, outils autorisés.', views: [{ id: 'agents', label: 'Agents' }] },
  {
    id: 'catalogue',
    label: 'Catalogue LLM',
    hint: 'Tous les modèles : prix, contexte, capacités, latence et fiabilité mesurées ; choix du modèle par défaut.',
    views: [
      { id: 'catalogue', label: 'Catalogue' },
      { id: 'models', label: 'Priorités et benchmark' },
    ],
  },
  {
    id: 'orchestration',
    label: 'Orchestration',
    hint: 'Workflows en chaînes exécutables et trace en direct de la dernière session.',
    views: [
      { id: 'orchestration', label: 'Chaînes et trace' },
      { id: 'workflows', label: 'Workflows' },
    ],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    hint: 'Données (tableaux, requêtes), terminal et navigateur intégrés.',
    views: [
      { id: 'data', label: 'Données' },
      { id: 'terminal', label: 'Terminal' },
      { id: 'browser', label: 'Navigateur' },
    ],
  },
  { id: 'files', label: 'Fichiers', hint: 'Fichiers de la session : livrables, pièces jointes, mémoire .ai/.', views: [{ id: 'files', label: 'Fichiers' }] },
  {
    id: 'tools',
    label: 'Outils',
    hint: 'Skills (savoir-faire réutilisable) et plugins (connecteurs, outils).',
    views: [
      { id: 'skills', label: 'Skills' },
      { id: 'plugins', label: 'Plugins' },
    ],
  },
  {
    id: 'sandbox',
    label: 'Bac à sable',
    hint: 'Composer, tester et améliorer un prompt ; générer une scène 3D WebGL avec aperçu en direct et auto-correction.',
    views: [
      { id: 'prompts', label: 'Prompt Studio' },
      { id: 'lab3d', label: 'Studio 3D' },
    ],
  },
  {
    id: 'observability',
    label: 'Observabilité',
    hint: 'Appels, tokens, latences, erreurs ; intelligence de routage et JEV.',
    views: [
      { id: 'observability', label: 'Vue d’ensemble' },
      { id: 'intelligence', label: 'Intelligence' },
      { id: 'jev', label: 'JEV' },
      { id: 'cognitive', label: 'JEV Cognitive OS' },
    ],
  },
  { id: 'costs', label: 'Coûts', hint: 'Fournisseurs, clés, crédits et dépenses par jour et par modèle.', views: [{ id: 'providers', label: 'Fournisseurs & coûts' }] },
  { id: 'settings', label: 'Paramètres', hint: 'Clé OpenRouter, modèle par défaut, budget, thème des exports.', views: [{ id: 'settings', label: 'Paramètres' }] },
];

/** The section a screen belongs to (screens out of the navigation fall back to the cockpit). */
export function groupOf(view: View): NavGroup {
  return NAV_GROUPS.find((g) => g.views.some((v) => v.id === view)) ?? NAV_GROUPS[0]!;
}

/** Screens reachable from the navigation (the AI Film Studio is not). */
export const NAV_VIEWS: View[] = NAV_GROUPS.flatMap((g) => g.views.map((v) => v.id));

/** Flat list kept for older callers: one entry per section, its first screen. */
export const NAV_ITEMS: { id: View; label: string }[] = NAV_GROUPS.map((g) => ({ id: g.views[0]!.id, label: g.label }));
