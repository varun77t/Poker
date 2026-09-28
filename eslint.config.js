import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const ENGINE_PURITY_MESSAGE =
  'The poker engine must stay pure: no I/O, timers, sockets, randomness or imports from outside engine/ and @poker/shared (see CLAUDE.md).';

export default defineConfig([
  globalIgnores(['**/dist/**', '**/node_modules/**', '**/coverage/**', 'playwright-report/**', 'test-results/**']),

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always'],
    },
  },

  {
    files: ['server/**/*.ts', 'shared/**/*.ts', '*.js', 'client/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['client/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Enforce the engine purity rule from CLAUDE.md.
  {
    files: ['server/src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:*',
                'crypto',
                'fs',
                'path',
                'timers',
                'events',
                'express',
                'socket.io',
                'socket.io-client',
                'drizzle-orm',
                // engine/ is flat, so any parent-relative import leaves the engine.
                '../**',
              ],
              message: ENGINE_PURITY_MESSAGE,
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...['setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'fetch', 'process', 'crypto'].map(
          (name) => ({ name, message: ENGINE_PURITY_MESSAGE }),
        ),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: ENGINE_PURITY_MESSAGE },
        { object: 'Date', property: 'now', message: ENGINE_PURITY_MESSAGE },
      ],
    },
  },
]);
