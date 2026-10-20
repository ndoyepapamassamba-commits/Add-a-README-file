import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const ici = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  resolve: {
    alias: {
      '@workbench': ici('../workbench'),
      '@shared': ici('../workbench/shared'),
      '@web': ici('../workbench/web'),
      'virtual:three-iife': ici('./tests/helpers/threeStub.ts'),
      'virtual:house-kit': ici('../workbench/tests/helpers/houseKitStub.ts'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    execArgv: ['--disable-warning=ExperimentalWarning'],
  },
});
