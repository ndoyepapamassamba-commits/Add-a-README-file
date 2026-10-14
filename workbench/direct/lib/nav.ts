// Main views of the direct edition (ids + labels; icons live in App.tsx).
import { VIDEO_3D } from './features';
import type { View } from './types';

const ALL_NAV_ITEMS: { id: View; label: string }[] = [
  { id: 'home', label: 'Cockpit IA' },
  { id: 'chat', label: 'Chat' },
  { id: 'prompts', label: 'Prompt Studio' },
  { id: 'files', label: 'Fichiers' },
  { id: 'data', label: 'Données' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'browser', label: 'Navigateur' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'agents', label: 'Agents' },
  { id: 'skills', label: 'Skills' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'models', label: 'Modèles' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'jev', label: 'JEV' },
  { id: 'cognitive', label: 'JEV Cognitive OS' },
  { id: 'studio', label: 'AI Film Studio' },
  { id: 'lab3d', label: 'Studio 3D Pro' },
  { id: 'providers', label: 'Fournisseurs & coûts' },
  { id: 'settings', label: 'Réglages' },
];
// The 3D video screens leave the navigation when VIDEO_3D is off (features.ts): a subject of its own.
export const NAV_ITEMS = ALL_NAV_ITEMS.filter((n) => VIDEO_3D || n.id !== 'lab3d');
