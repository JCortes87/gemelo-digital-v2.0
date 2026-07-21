import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // 'dist*' cubre también copias viejas de builds ("dist - copia", "dist 1 Marzo"):
  // son JS minificado que generaba ~400 falsos errores de lint.
  globalIgnores(['dist', 'dist*/**']),
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
      // caughtErrorsIgnorePattern: el patrón `catch (_e)` es intencional en el código
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', caughtErrorsIgnorePattern: '^_' }],
      // react-hooks/exhaustive-deps ya viene activo (warn) via reactHooks.configs.flat.recommended;
      // lo dejamos explícito para que no se pierda si cambia el preset.
      'react-hooks/exhaustive-deps': 'warn',
      // Reglas de bajo ruido que evitan bugs comunes:
      'no-var': 'error',
      'prefer-const': ['warn', { destructuring: 'all' }],
      eqeqeq: ['warn', 'smart'],
    },
  },
  {
    // Archivos de configuración corren en Node, no en el navegador
    files: ['vite.config.js', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
])
