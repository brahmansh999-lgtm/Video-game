import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.browser, parserOptions: { project: './tsconfig.json' } },
    plugins: { 'import-x': importX },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'import-x/no-cycle': ['error', { maxDepth: Infinity }],
      'max-lines': ['error', { max: 500, skipBlankLines: false, skipComments: false }],
    },
    settings: { 'import-x/resolver': { node: { extensions: ['.ts'] } } },
  },
);
