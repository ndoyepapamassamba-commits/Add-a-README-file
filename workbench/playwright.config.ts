import { defineConfig } from '@playwright/test';

// End-to-end tests run the production build (npm run build) against a mock
// OpenRouter server, so they are deterministic and cost nothing.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { headless: true, viewport: { width: 1440, height: 900 } },
});
