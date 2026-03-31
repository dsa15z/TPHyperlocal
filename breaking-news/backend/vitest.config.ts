import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    hookTimeout: 10000,
    include: ['src/__tests__/**/*.test.ts'],
    reporters: ['verbose'],
  },
});
