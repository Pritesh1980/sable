import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dist-sable', 'playwright-report', 'test-results', 'coverage']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Playwright specs run in Node but hand callbacks to the page, so both
    // sets of globals are legitimate here.
    files: ['e2e/**/*.js', 'playwright.config.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    // No React here: Playwright fixtures receive a `use` callback, which the
    // hooks rule mistakes for React's use().
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  {
    // Specs run under Vitest in Node against a jsdom DOM, so they legitimately
    // reach for both sets of globals — `process.env` alongside `document`.
    // Declaring that here beats an `import process from 'node:process'` in each
    // file, which only ever gets added after the lint run fails.
    files: ['src/**/*.{test,spec}.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // Root-level build config is Node, never shipped to the browser.
    files: ['*.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
