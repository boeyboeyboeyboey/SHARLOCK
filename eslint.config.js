import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.cache/**',
      '.local/**',
      '.local-handover/**',
    ],
  },
  js.configs.recommended,
  ...vue.configs['flat/recommended'],
  { languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node } },
  {
    files: ['client/src/**/*.{js,vue}', 'tests/e2e/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
  },
  prettier,
]
