import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  prettier,
  ...svelte.configs['flat/prettier'],
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // ponytail: repo has ~100 `as any` today; tracked as debt, not a lint failure
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-unused-expressions': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // runes-era rules; this codebase is legacy syntax ($:, export let, stores) by convention
      'svelte/no-navigation-without-resolve': 'off',
      'svelte/prefer-svelte-reactivity': 'off',
      'svelte/require-each-key': 'warn',
      'svelte/no-immutable-reactive-statements': 'warn',
      'svelte/no-unused-svelte-ignore': 'warn',
      'svelte/no-useless-mustaches': 'warn',
      // real signals, kept visible; baseline has ~10, fix in module passes
      'svelte/infinite-reactive-loop': 'warn',
      'svelte/no-reactive-functions': 'warn',
      'svelte/no-dom-manipulating': 'warn',
      'svelte/no-at-html-tags': 'warn',
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: ts.parser } },
    // typescript-eslint's no-unused-vars crashes on the svelte AST (8.68 / plugin-svelte 3.x);
    // svelte-check already reports unused vars/props in components.
    rules: { '@typescript-eslint/no-unused-vars': 'off' },
  },
  { ignores: ['.svelte-kit/', 'build/', 'node_modules/', 'work/', 'scripts/', 'worker/', 'static/'] }
);
