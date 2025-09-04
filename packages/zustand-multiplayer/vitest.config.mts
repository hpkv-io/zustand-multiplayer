import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    hookTimeout: 60000,
    testTimeout: 60000,
    environment: 'node',
    setupFiles: ['./tests/test-setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**'],
  },
});
