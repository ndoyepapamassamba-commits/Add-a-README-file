// Navigation helper of the redesigned direct edition: twelve sections in the sidebar, some with tabs.
// Old screen names (before the redesign) are mapped to « section › tab ».
import type { Page } from '@playwright/test';

const MAP: Record<string, [string, string?]> = {
  'Cockpit IA': ['Cockpit IA'],
  Chat: ['Chats'],
  Chats: ['Chats'],
  Agents: ['Agents'],
  'Catalogue LLM': ['Catalogue LLM', 'Catalogue'],
  Modèles: ['Catalogue LLM', 'Priorités et benchmark'],
  Orchestration: ['Orchestration', 'Chaînes et trace'],
  Workflows: ['Orchestration', 'Workflows'],
  Données: ['Workspace', 'Données'],
  Terminal: ['Workspace', 'Terminal'],
  Navigateur: ['Workspace', 'Navigateur'],
  Fichiers: ['Fichiers'],
  Skills: ['Outils', 'Skills'],
  Plugins: ['Outils', 'Plugins'],
  Réalisation: ['Bac à sable', 'Réalisation'],
  'Prompt Studio': ['Bac à sable', 'Prompt Studio'],
  'Studio 3D': ['Bac à sable', 'Studio 3D'],
  Observabilité: ['Observabilité', 'Vue d’ensemble'],
  Intelligence: ['Observabilité', 'Intelligence'],
  JEV: ['Observabilité', 'JEV'],
  'JEV Cognitive OS': ['Observabilité', 'JEV Cognitive OS'],
  Coûts: ['Coûts'],
  'Fournisseurs & coûts': ['Coûts'],
  Réglages: ['Paramètres'],
  Paramètres: ['Paramètres'],
};

export async function openView(page: Page, name: string): Promise<void> {
  const [section, tab] = MAP[name] ?? [name];
  await page.getByTestId('main-nav').getByRole('button', { name: section, exact: true }).click();
  if (tab) await page.getByTestId('view-tabs').getByRole('tab', { name: tab, exact: true }).click();
}
