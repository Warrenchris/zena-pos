import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

// Note: avoid importing from 'eslint/config' to prevent package subpath export
// issues in some Node/npm setups. Export a config object/array directly.
export default [
  {
    // ignore built assets and unreferenced TypeScript-syntax .js files
    ignores: ['dist', 'src/hooks/reduxHooks.js', 'src/services/auth.js'],
  },
  js.configs.recommended,
  // include react-hooks plugin via plugins mapping and enable recommended rules below
  {
    files: ['**/*.{js,jsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2020,
      // include browser and node globals and jest for test files to reduce false no-undef
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-redeclare': ['error', { builtinGlobals: false }],
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]'}],
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'no-regex-spaces': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]

