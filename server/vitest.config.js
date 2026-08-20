import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.js'],
    testTimeout: 20000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
