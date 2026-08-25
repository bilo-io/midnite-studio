import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Package boundary rules (docs/INITIAL_PLAN.md → "Architecture"):
 *
 *   shared ◀ git-engine ◀ desktop
 *   shared ◀ app
 *   shared ◀ desktop
 *
 * - `shared` is the wire contract: zod only, no workspace imports, no electron.
 * - `git-engine` is plain Node/TS so it stays vitest-testable outside Electron —
 *   it must never import `electron`.
 * - `app` is the renderer: it talks to the main process ONLY through
 *   `window.midniteGit`, so it must never import git-engine, desktop or electron.
 *
 * Enforced with `no-restricted-imports` rather than a boundaries plugin so the
 * rule set stays dependency-free and the message explains the *why* at the
 * point of failure.
 */
const deny = (patterns) => ({ 'no-restricted-imports': ['error', { patterns }] });

const NO_ELECTRON = {
  group: ['electron', 'electron/*'],
  message:
    'This package must stay runnable outside Electron (plain vitest). Move electron-specific code to packages/desktop.',
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/out/**',
      '**/build/**',
      '**/release/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.moon/cache/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // TypeScript/TSX sources — node + browser globals cover both main and renderer.
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Committed code uses the structured logger; bare console is opt-in via an
      // inline disable (main-process boot logging does this deliberately).
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Best-effort cleanup catches (e.g. unlink on a temp file) are intentional.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // --- Boundary: shared ------------------------------------------------------
  {
    files: ['packages/shared/**/*.ts'],
    rules: deny([
      NO_ELECTRON,
      {
        group: ['@midnite/git-*'],
        message:
          'packages/shared is the leaf of the dependency graph — it may depend on zod and nothing else in the workspace.',
      },
    ]),
  },

  // --- Boundary: git-engine --------------------------------------------------
  {
    files: ['packages/git-engine/**/*.ts'],
    rules: deny([
      NO_ELECTRON,
      {
        group: ['@midnite/git-app', '@midnite/git-app/*', '@midnite/git-desktop', '@midnite/git-desktop/*'],
        message: 'git-engine sits below app/desktop in the dependency graph.',
      },
    ]),
  },

  // --- Boundary: app (renderer) ----------------------------------------------
  // Scoped to `src/` — the app's own build configs (vite/vitest/tailwind) run in
  // Node at build time and legitimately use node builtins.
  {
    files: ['packages/app/src/**/*.{ts,tsx}'],
    rules: deny([
      {
        group: ['electron', 'electron/*'],
        message:
          'The renderer has no node integration. Reach the main process through `window.midniteGit` (see packages/shared/src/ipc/bridge.ts).',
      },
      {
        group: [
          '@midnite/git-engine',
          '@midnite/git-engine/*',
          '@midnite/git-desktop',
          '@midnite/git-desktop/*',
        ],
        message:
          'The renderer never imports the git engine directly — git runs in the main process. Add an IPC channel in packages/shared/src/ipc instead.',
      },
      {
        group: ['node:*', 'fs', 'path', 'child_process'],
        message: 'No node builtins in the renderer — contextIsolation is on and nodeIntegration is off.',
      },
    ]),
  },

  // Dependency-free CJS/MJS scripts: require() + console ok.
  {
    files: ['**/*.cjs', '**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off',
    },
  },

  // Smoke/dev scripts print to stdout — console IS their output channel.
  {
    files: ['**/scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  // Keep ESLint out of Prettier's lane (formatting rules disabled).
  prettier,
);
