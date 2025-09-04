import { readFileSync } from 'fs';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// External dependencies that should not be bundled
const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  'zustand/vanilla',
  'zustand/react',
  'immer/dist/immer.cjs.production.min.js',
  'immer/dist/immer.esm.mjs',
];

// Banner for generated files
const banner = `/**
 * @license ${pkg.name} v${pkg.version}
 * Copyright (c) ${new Date().getFullYear()} ${pkg.author}
 * This source code is licensed under the ${pkg.license} license.
 */`;

export default [
  // ES Module build
  {
    input: 'src/index.ts',
    output: [
      {
        file: pkg.module || 'dist/index.mjs',
        format: 'es',
        sourcemap: true,
        banner,
        exports: 'named',
      },
    ],
    external,
    plugins: [
      json(),
      resolve({
        extensions: ['.ts', '.js'],
        preferBuiltins: true,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.build.json',
        declaration: false,
        declarationMap: false,
        outputToFilesystem: true,
      }),
    ],
  },

  // CommonJS build
  {
    input: 'src/index.ts',
    output: [
      {
        file: pkg.main || 'dist/index.js',
        format: 'cjs',
        sourcemap: true,
        banner,
        exports: 'named',
      },
    ],
    external,
    plugins: [
      json(),
      resolve({
        extensions: ['.ts', '.js'],
        preferBuiltins: true,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.build.json',
        declaration: false,
        declarationMap: false,
        outputToFilesystem: true,
      }),
    ],
  },

  // Minified ES Module build
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.min.mjs',
        format: 'es',
        sourcemap: true,
        banner,
        exports: 'named',
      },
    ],
    external,
    plugins: [
      json(),
      resolve({
        extensions: ['.ts', '.js'],
        preferBuiltins: true,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.build.json',
        declaration: false,
        declarationMap: false,
        outputToFilesystem: true,
      }),
      terser({
        format: {
          comments: function (node, comment) {
            // Keep license comments
            return comment.type === 'comment2' && /@license/i.test(comment.value);
          },
        },
        compress: {
          pure_getters: true,
          unsafe: true,
          unsafe_comps: true,
          passes: 2,
        },
      }),
    ],
  },

  // Minified CommonJS build
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.min.js',
        format: 'cjs',
        sourcemap: true,
        banner,
        exports: 'named',
      },
    ],
    external,
    plugins: [
      json(),
      resolve({
        extensions: ['.ts', '.js'],
        preferBuiltins: true,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.build.json',
        declaration: false,
        declarationMap: false,
        outputToFilesystem: true,
      }),
      terser({
        format: {
          comments: function (node, comment) {
            // Keep license comments
            return comment.type === 'comment2' && /@license/i.test(comment.value);
          },
        },
        compress: {
          pure_getters: true,
          unsafe: true,
          unsafe_comps: true,
          passes: 2,
        },
      }),
    ],
  },

  // TypeScript declarations
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.d.ts',
        format: 'es',
      },
    ],
    external,
    plugins: [
      dts({
        respectExternal: true,
      }),
    ],
  },
];
