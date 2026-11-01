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
  { languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
  {
    files: ['server/**/*.js', 'scripts/**/*.{js,mjs}', 'tests/**/*.{js,mjs}', '**/*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['client/src/**/*.{js,vue}', 'tests/e2e/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['tests/e2e/**/*.js'],
    rules: {
      'no-restricted-properties': [
        'error',
        { property: 'waitForTimeout', message: 'Wait on a condition, not a fixed sleep.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^\\u002F(private|Users|home)\\u002F/]',
          message: 'Use testInfo.outputPath, not an absolute path on one machine.',
        },
        {
          selector: "Literal[value='networkidle']",
          message: 'Wait for a visible element instead of network idle.',
        },
      ],
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
  },
  prettier,
]
