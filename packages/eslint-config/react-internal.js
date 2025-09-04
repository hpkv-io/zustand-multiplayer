import pluginReactHooks from 'eslint-plugin-react-hooks';
import pluginReact from 'eslint-plugin-react';
import globals from 'globals';
import { config as baseConfig } from './base.js';

/**
 * A custom ESLint configuration for libraries that use React.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const config = [
  ...baseConfig,
  
  // React configuration
  pluginReact.configs.flat.recommended,
  
  {
    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
      },
    },
  },
  
  {
    plugins: {
      'react-hooks': pluginReactHooks,
    },
    settings: { 
      react: { 
        version: 'detect',
      },
    },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
      // React scope no longer necessary with new JSX transform
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off', // We use TypeScript for prop validation
      'react/display-name': 'off',
      'react/jsx-uses-react': 'off',
      'react/jsx-curly-brace-presence': ['error', { props: 'never', children: 'never' }],
      'react/jsx-boolean-value': 'error',
      'react/self-closing-comp': 'error',
      'react/jsx-sort-props': [
        'error',
        {
          callbacksLast: true,
          shorthandFirst: true,
          ignoreCase: true,
          reservedFirst: true,
        },
      ],
    },
  },
  
  // JSX/TSX files
  {
    files: ['**/*.{jsx,tsx}'],
    rules: {
      // Additional React-specific rules for JSX/TSX files
      'react/function-component-definition': [
        'error',
        {
          namedComponents: 'arrow-function',
          unnamedComponents: 'arrow-function',
        },
      ],
    },
  },
];