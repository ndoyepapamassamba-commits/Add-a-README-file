// Main views of the direct edition (ids + labels; icons live in App.tsx).
import type { View } from './types';

export const NAV_ITEMS: { id: View; label: string }[] = [
  { id: 'home', label: 'Mission Control' },
  { id: 'chat', label: 'Chat' },
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
  { id: 'studio', label: 'AI Visual Studio' },
  { id: 'settings', label: 'Réglages' },
];
