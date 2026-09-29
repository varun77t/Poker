import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const ENGINE_PURITY_MESSAGE =
  'The poker engine must stay pure: no I/O, timers, sockets, randomness or imports from outside engine/ and @poker/shared (see CLAUDE.md).';
const BOTS_PURITY_MESSAGE =
  'Bots follow the engine purity rules: no I/O, timers, sockets or Math.random (inject the RNG), and imports only from bots/, engine/ and @poker/shared.';

/** Node and network modules the pure layers (engine/, bots/) may not import. */
const IMPURE_MODULES = [
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
];
const IMPURE_GLOBALS = ['setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'fetch', 'process', 'crypto'];

/** no-restricted-* rules shared by engine/ and bots/. */
function purityRules(message, allowedParents) {
  return {
    'no-restricted-imports': [
      'error',
      { patterns: [{ group: [...IMPURE_MODULES, '../**', ...allowedParents.map((p) => `!${p}`)], message }] },
    ],
    'no-restricted-globals': ['error', ...IMPURE_GLOBALS.map((name) => ({ name, message }))],
    'no-restricted-properties': [
      'error',
      { object: 'Math', property: 'random', message },
      { object: 'Date', property: 'now', message },
    ],
  };
}

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

  // Enforce the engine purity rule from CLAUDE.md. engine/ is flat, so any parent-relative import leaves it.
  { files: ['server/src/engine/**/*.ts'], rules: purityRules(ENGINE_PURITY_MESSAGE, []) },

  // Bots (Phase 7) follow the same rules; they may use the engine (evaluator, deck) and nothing else outside bots/.
  { files: ['server/src/bots/**/*.ts'], rules: purityRules(BOTS_PURITY_MESSAGE, ['../engine', '../engine/**']) },
]);
