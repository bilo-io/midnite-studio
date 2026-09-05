import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Package boundary rules (docs/INITIAL_PLAN.md → "Architecture"):
 *
 *   shared ◀ git-engine ◀ desktop
 *   shared ◀ db-engine ◀ desktop
 *   shared ◀ app
 *   shared ◀ desktop
 *
 * - `shared` is the wire contract: zod only, no workspace imports, no electron.
 * - `git-engine` is plain Node/TS so it stays vitest-testable outside Electron —
 *   it must never import `electron`.
 * - `db-engine` (Phase 61) is the same shape as `git-engine`, one dependency
 *   graph level over: plain Node/TS drivers, vitest-testable outside Electron,
 *   never importing `electron`.
 * - `app` is the renderer: it talks to the main process ONLY through
 *   `window.midniteStudio`, so it must never import git-engine, db-engine,
 *   desktop or electron.
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
        group: ['@midnite/studio-*'],
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
        group: ['@midnite/studio-app', '@midnite/studio-app/*', '@midnite/studio-desktop', '@midnite/studio-desktop/*'],
        message: 'git-engine sits below app/desktop in the dependency graph.',
      },
    ]),
  },

  // --- Boundary: db-engine (Phase 61) -----------------------------------------
  // Same shape as the git-engine block above, package name swapped.
  {
    files: ['packages/db-engine/**/*.ts'],
    rules: deny([
      NO_ELECTRON,
      {
        group: ['@midnite/studio-app', '@midnite/studio-app/*', '@midnite/studio-desktop', '@midnite/studio-desktop/*'],
        message: 'db-engine sits below app/desktop in the dependency graph.',
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
          'The renderer has no node integration. Reach the main process through `window.midniteStudio` (see packages/shared/src/ipc/bridge.ts).',
      },
      {
        group: [
          '@midnite/studio-git-engine',
          '@midnite/studio-git-engine/*',
          '@midnite/studio-db-engine',
          '@midnite/studio-db-engine/*',
          '@midnite/studio-desktop',
          '@midnite/studio-desktop/*',
        ],
        message:
          'The renderer never imports the git or database engine directly — both run in the main process. Add an IPC channel in packages/shared/src/ipc instead.',
      },
      {
        group: ['node:*', 'fs', 'path', 'child_process'],
        message: 'No node builtins in the renderer — contextIsolation is on and nodeIntegration is off.',
      },
      {
        group: ['lucide-react', 'lucide-react/*'],
        message: 'Phase 36: import icons from react-icons/<set> instead',
      },
    ]),
  },

  // --- Boundary: broker ------------------------------------------------------
  // The broker is a Node process running under ELECTRON_RUN_AS_NODE and never
  // imports Electron modules.
  {
    files: ['packages/desktop/src/broker/**/*.ts'],
    rules: deny([NO_ELECTRON]),
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

  /*
    The perf suite's output channel is stdout too (Phase 36 Theme H).
    `packages/app/e2e/perf/*` exists to report numbers — "entry chunk 1084.7 KB
    (budget 1250 KB)" printed off a PASSING run is what makes a rebaseline
    possible without re-deriving the measurement. A `console.log` there is the
    deliverable, not a leftover debug line, so it is allowed by directory rather
    than by an inline disable on every one of them.

    Scoped to `e2e/perf/` and not to `e2e/`: the functional specs have no business
    printing, and a stray log in one of those should still fail the gate.
  */
  {
    files: ['**/e2e/perf/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  // Keep ESLint out of Prettier's lane (formatting rules disabled).
  prettier,
);
