import { config } from '@repo/eslint-config/library';
import vitest from '@vitest/eslint-plugin';

export default [
  ...config,

  {
    files: ['tests/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    plugins: {
      vitest,
    },
    rules: {
      ...vitest.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      'no-console': 'off',
    },
  },
];
