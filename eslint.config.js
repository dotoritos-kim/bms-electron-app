// @ts-check
import tsParser from '@typescript-eslint/parser';
import noHardcodedKorean from './scripts/eslint-no-hardcoded-korean.cjs';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      local: { rules: { 'no-hardcoded-korean': noHardcodedKorean } },
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'local/no-hardcoded-korean': 'error',
    },
  },
];
