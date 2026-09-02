import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    hookTimeout: 30_000,
    testTimeout: 30_000,
    projects: [
      'packages/*/vitest.config.ts',
      {
        test: {
          name: 'workspace',
          include: ['packages/*/test/**/*.test.ts'],
          environment: 'node',
          hookTimeout: 30_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
