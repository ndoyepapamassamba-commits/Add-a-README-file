// Navigation de Studio Vidéo : une barre d'écrans (pas d'onglets). Les anciens noms d'écrans de Workbench restent compris.
import type { Page } from '@playwright/test';

const NOMS: Record<string, string> = {
  'Vidéo IA': 'Vidéo IA',
  Réalisation: 'Réalisation',
  'Studio 3D': 'Studio 3D',
  'AI Film Studio': 'Film Autopilot',
  'Film Autopilot': 'Film Autopilot',
  'Moteur de la troupe': 'Moteur de la troupe',
  Réglages: 'Réglages',
};

export async function openView(page: Page, name: string): Promise<void> {
  await page.getByTestId('main-nav').getByRole('button', { name: NOMS[name] ?? name, exact: true }).click();
}
