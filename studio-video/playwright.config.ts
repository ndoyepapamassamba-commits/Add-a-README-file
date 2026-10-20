import { defineConfig } from '@playwright/test';

// Tests de bout en bout sur l'app construite (npm run build:simple ou npm run build), contre le faux serveur OpenRouter
// du socle : déterministes et sans coût.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { headless: true, viewport: { width: 1440, height: 900 } },
});
