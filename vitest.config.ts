import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    hookTimeout: 30000,
    environment: 'happy-dom',
    setupFiles: ['./tests/test-setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: true,
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});
