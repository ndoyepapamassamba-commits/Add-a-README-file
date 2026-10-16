import { defineConfig } from 'vitest/config';

// Tests du moteur : Node, sans navigateur, au plus 2 fils (d'autres travaux tournent en parallèle).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
    maxWorkers: 2,
    testTimeout: 30000,
  },
});
