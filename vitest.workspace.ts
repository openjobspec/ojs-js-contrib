import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/*/vitest.config.ts',
  {
    test: {
      include: ['packages/*/test/**/*.test.ts'],
      environment: 'node',
    },
  },
]);

