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
 *   shared ◀ knowledge ◀ desktop
 *   shared ◀ app
 *   shared ◀ desktop
 *
 * - `shared` is the wire contract: zod only, no workspace imports, no electron.
 * - `git-engine` is plain Node/TS so it stays vitest-testable outside Electron —
 *   it must never import `electron`.
 * - `db-engine` (Phase 61) is the same shape as `git-engine`, one dependency
 *   graph level over: plain Node/TS drivers, vitest-testable outside Electron,
 *   never importing `electron`.
 * - `knowledge` (Phase 87) is the third instance of the same shape: a plain
 *   Node/TS graphify reader/layout engine, vitest-testable outside Electron,
 *   never importing `electron` — including its `worker_threads` entry point,
 *   which runs inside a plain Node worker, not an Electron utility process.
 * - `app` is the renderer: it talks to the main process ONLY through
 *   `window.midniteStudio`, so it must never import git-engine, db-engine,
 *   knowledge, desktop or electron.
 *
 * Enforced with `no-restricted-imports` rather than a boundaries plugin so the
 * rule set stays dependency-free and the message explains the *why* at the
 * point of failure.
 *
 * Phase 113 Theme C adds the app-suite layers (docs/APPS.md):
 *
 *   shared ◀ runtime ◀ feature main half ◀ desktop (the Studio composer, main side)
 *   shared ◀ frame ◀ feature renderer half ◀ app (the Studio composer, renderer side)
 *
 * - An app may import features and the frame.
 * - A feature may import the frame (renderer half) or the runtime (main half),
 *   and shared — never an app, and never another feature.
 * - The frame never imports a feature, an app or the runtime.
 * - The runtime never imports a feature, the frame, an app or desktop.
 *
 * Flat config does not MERGE `no-restricted-imports` across blocks — the last
 * block matching a file replaces the rule wholesale — so each layer's block
 * below spells out its complete pattern list. `scripts/layer-boundaries.test.mjs`
 * lints one fixture per rule and fails if any of them stops firing.
 */
const APP_PATTERNS = [
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
        '@midnite/studio-knowledge',
        '@midnite/studio-knowledge/*',
        '@midnite/studio-desktop',
        '@midnite/studio-desktop/*',
      ],
      message:
        'The renderer never imports the git/database/knowledge engine directly — all run in the main process. Add an IPC channel in packages/shared/src/ipc instead.',
    },
    {
      group: ['node:*', 'fs', 'path', 'child_process'],
      message: 'No node builtins in the renderer — contextIsolation is on and nodeIntegration is off.',
    },
    {
      group: ['lucide-react', 'lucide-react/*'],
      message: 'Phase 36: import icons from react-icons/<set> instead',
    },
];

/** Phase 108 Theme A: MapLibre is a lazy chunk — only `map-canvas.tsx` may import it. */
const MAPLIBRE_LAZY = {
  group: ['maplibre-gl', 'maplibre-gl/*'],
  message: 'MapLibre loads lazily — import it only in map-canvas.tsx',
};

const deny = (patterns) => ({ 'no-restricted-imports': ['error', { patterns }] });

const NO_ELECTRON = {
  group: ['electron', 'electron/*'],
  message:
    'This package must stay runnable outside Electron (plain vitest). Move electron-specific code to packages/desktop.',
};

/*
  Phase 113 Theme C — the layer patterns. Each names a layer by package and,
  where a relative path could reach around the package name, by path.
*/
const LAYER_APP = {
  group: ['@midnite/studio-app', '@midnite/studio-app/*', '@midnite/app-*', '@midnite/launcher', '@midnite/launcher/*', '**/app/src/**', '**/apps/**'],
  message:
    'Nothing below an app imports one (docs/APPS.md): an app composes features and the frame, never the other way round. If an app owns something a lower layer needs, move it down — into the frame, a feature, or shared.',
};
const LAYER_FEATURE_FROM_FRAME = {
  group: ['@midnite/studio-feature-*', '@midnite/studio-feature-*/**', '**/features/*/renderer/**', '**/features/*/main/**', '**/features/*/manifest'],
  message:
    'The frame never imports a feature: every app wears the frame, so a feature in it would be in every app. Give the frame a seam (a port, a slot, a prop) and let the composing app plug the feature in.',
};
const LAYER_OTHER_FEATURE = [
  {
    group: ['@midnite/studio-feature-*', '@midnite/studio-feature-*/**'],
    message:
      'A feature never imports another feature (docs/APPS.md) — each must install without the others. Hand off through the link router or shared ids; if both need the code, it belongs in the frame or shared.',
  },
  {
    // A relative climb out of this package into a sibling: `../../notes/renderer/…`.
    regex: '^(\\.\\./)+[a-z0-9-]+/(renderer|main)(/|$)',
    message: 'A feature never imports another feature, by package name or by relative path.',
  },
];
const LAYER_RUNTIME_FROM_RENDERER = {
  group: ['@midnite/studio-runtime', '@midnite/studio-runtime/*'],
  message:
    'The runtime is main-process only. The renderer reaches it through `window.midniteStudio` (the bridge), never by import.',
};
const LAYER_FRAME_FROM_MAIN = {
  group: ['@midnite/studio-frame', '@midnite/studio-frame/*', 'react', 'react-dom', 'react/*', 'react-dom/*'],
  message: 'A main-process module has no renderer: the frame and React belong to the renderer half.',
};
const LAYER_DESKTOP = {
  group: ['@midnite/studio-desktop', '@midnite/studio-desktop/*', '**/desktop/src/**'],
  message:
    'Desktop is Studio\'s main-side composer, above every feature and the runtime. What a lower layer needs from it belongs in the runtime (Theme D) or behind the feature\'s services port.',
};
/*
  Phase 113 Theme E (Decision 6) — the launcher owns updates. A composed app is the frame, its
  features and the runtime library; its stub runs the same Electron framework as the launcher,
  so an updater pulled in by any of those layers would run once per open app, each racing the
  launcher to replace bundles under it. `apps/launcher/src/main/updater.ts` is the suite's one;
  Studio's `packages/desktop/src/main/update-service.ts` stays as the legacy fallback for installs without
  the launcher (Theme G3 — it defers to the launcher once that is installed).
  `scripts/single-updater.test.mjs` pins that list of two.
*/
const NO_APP_UPDATER = {
  group: ['electron-updater', 'electron-updater/*'],
  message:
    'No app runs its own updater (Phase 113 Decision 6): the launcher updates the runtime and every installed bundle from catalog.json — apps/launcher/src/main/updater.ts and bundles/updates.ts.',
};
/* Phase 113 Theme G — the one seam each of Studio's entries (`apps/studio/entry/`) hands over through. */
const STUDIO_RENDERER_SEAM =
  "Studio's renderer entry mounts its shell through `@midnite/studio-app/boot` and nothing deeper, and never imports another app. What else it needs belongs behind that seam.";
const STUDIO_MAIN_SEAM =
  "Studio's main entry starts its main process through `@midnite/studio-desktop/main` and nothing deeper, and never imports another app. What else it needs belongs behind that seam.";
/** App-only extras: the main half of a feature and the runtime are main-process code. */
const APP_LAYER_PATTERNS = [
  LAYER_RUNTIME_FROM_RENDERER,
  {
    group: ['@midnite/studio-feature-*/main', '@midnite/studio-feature-*/main/*'],
    message: "A feature's main half runs in the main process — the renderer composes `@midnite/studio-feature-<name>/renderer`.",
  },
];
/** Outside tests, an app composes a feature through `/renderer` only. */
const APP_FEATURE_TESTING = {
  group: ['@midnite/studio-feature-*/renderer/testing'],
  message:
    "A feature's `/renderer/testing` entry exposes internals for composition tests only. Production code composes through `/renderer`.",
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
      // Phase 99 Theme D — the Setup Video scaffold, a user's Remotion app, not workspace source.
      'templates/media-video/**',
      // The repo's own video workspace (a copy of midnite-videos) — a Remotion app, not workspace source.
      '.midnite/media/**',
      // Phase 107 — vendored game engine runtimes and templates, not workspace source.
      'packages/desktop/resources/game-engines/**',
      'templates/media-game/**',
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

  // --- Boundary: knowledge (Phase 87) -----------------------------------------
  // Same shape as the git-engine/db-engine blocks above, package name swapped.
  {
    files: ['packages/knowledge/**/*.ts'],
    rules: deny([
      NO_ELECTRON,
      {
        group: ['@midnite/studio-app', '@midnite/studio-app/*', '@midnite/studio-desktop', '@midnite/studio-desktop/*'],
        message: 'knowledge sits below app/desktop in the dependency graph.',
      },
    ]),
  },

  // --- Boundary: app (renderer) ----------------------------------------------
  // Scoped to `src/` — the app's own build configs (vite/vitest/tailwind) run in
  // Node at build time and legitimately use node builtins.
  {
    files: ['packages/app/src/**/*.{ts,tsx}'],
    rules: deny([
      ...APP_PATTERNS,
      ...APP_LAYER_PATTERNS,
      APP_FEATURE_TESTING,
      MAPLIBRE_LAZY,
    ]),
  },
  // Studio's composition tests may reach a feature's internals (Phase 113 Theme C).
  {
    files: ['packages/app/src/**/*.test.{ts,tsx}'],
    rules: deny([...APP_PATTERNS, ...APP_LAYER_PATTERNS, MAPLIBRE_LAZY]),
  },

  // --- Boundary: frame (Phase 113 Theme C) ------------------------------------
  // The renderer chrome every app wears. Renderer rules (bridge-only), and it
  // sits below every feature and app.
  {
    files: ['packages/frame/src/**/*.{ts,tsx}'],
    rules: deny([
      NO_APP_UPDATER,
      ...APP_PATTERNS,
      MAPLIBRE_LAZY,
      LAYER_APP,
      LAYER_FEATURE_FROM_FRAME,
      LAYER_RUNTIME_FROM_RENDERER,
    ]),
  },

  // --- Boundary: feature renderer half (Phase 113 Theme C) --------------------
  // Compiled into whichever app composes it, so renderer rules apply in full;
  // above the frame and shared, below every app, beside every other feature.
  {
    files: ['packages/features/*/renderer/**/*.{ts,tsx}'],
    rules: deny([
      NO_APP_UPDATER,
      ...APP_PATTERNS,
      MAPLIBRE_LAZY,
      LAYER_APP,
      ...LAYER_OTHER_FEATURE,
      LAYER_RUNTIME_FROM_RENDERER,
      {
        regex: '^(\\.\\./)+main(/|$)',
        message: "The renderer half never imports its own main half — that runs in another process. Share data through `manifest.ts` or shared.",
      },
    ]),
  },

  // map-canvas.tsx is the one file allowed to import MapLibre (Phase 108 Theme A; it moved into the
  // media-map package with Phase 113 Theme S, and the rule is the feature renderer block minus MAPLIBRE_LAZY).
  {
    files: ['packages/features/media-map/renderer/map-canvas.tsx', 'packages/features/media-map/renderer/map-canvas.test.tsx'],
    rules: deny([
      NO_APP_UPDATER,
      ...APP_PATTERNS,
      LAYER_APP,
      ...LAYER_OTHER_FEATURE,
      LAYER_RUNTIME_FROM_RENDERER,
    ]),
  },

  // --- Boundary: feature main half (Phase 113 Theme C) ------------------------
  // Registers against the runtime's FeatureMainContext; never imports electron
  // itself, so it runs under bare vitest like git-engine.
  {
    files: ['packages/features/*/main/**/*.ts'],
    rules: deny([
      NO_APP_UPDATER,
      {
        group: ['electron', 'electron/*'],
        message:
          "A feature's main half reaches Electron only through the FeatureMainContext its composer hands it (`@midnite/studio-runtime`), so it stays testable under plain vitest.",
      },
      LAYER_APP,
      ...LAYER_OTHER_FEATURE,
      LAYER_FRAME_FROM_MAIN,
      LAYER_DESKTOP,
      {
        regex: '^(\\.\\./)+renderer(/|$)',
        message: 'The main half never imports its own renderer half. Share data through `manifest.ts` or shared.',
      },
    ]),
  },

  // --- Boundary: feature manifest (Phase 113 Theme C) -------------------------
  // Pure data both halves read: shared, and nothing else.
  {
    files: ['packages/features/*/manifest.ts'],
    rules: deny([
      {
        regex: '^(?!@midnite/studio-shared$)',
        message: "A feature manifest is pure data both halves read — it imports `@midnite/studio-shared` and nothing else.",
      },
    ]),
  },

  // --- Boundary: runtime (Phase 113 Theme C) ----------------------------------
  // Main-only (electron allowed), beneath every feature and app.
  {
    files: ['packages/runtime/src/**/*.ts'],
    rules: deny([
      NO_APP_UPDATER,
      LAYER_APP,
      {
        ...LAYER_FEATURE_FROM_FRAME,
        message: 'The runtime never imports a feature: features register against it (FeatureMainContext), not the other way round.',
      },
      LAYER_FRAME_FROM_MAIN,
      LAYER_DESKTOP,
      // Phase 113 Theme D: the runtime holds the broker *client*. node-pty is
      // a native module built against one ABI and loaded only by the broker
      // process desktop bundles and spawns; the runtime speaks its socket.
      {
        group: ['node-pty', 'node-pty/*'],
        message:
          "The runtime never loads node-pty: it loads only in the broker process (desktop/src/broker/), which the runtime's broker client reaches over its socket.",
      },
    ]),
  },

  // --- Boundary: desktop's layer edges (Phase 113 Theme C) --------------------
  // Studio's main-side composer may take the runtime and a feature's main half
  // and manifest — never the frame or a feature's renderer half.
  {
    files: ['packages/desktop/src/**/*.ts'],
    rules: deny([
      {
        group: ['@midnite/studio-frame', '@midnite/studio-frame/*', '@midnite/studio-feature-*/renderer', '@midnite/studio-feature-*/renderer/*'],
        message: 'The main process never imports renderer code: the frame and a feature\'s renderer half run in the window. Compose the feature\'s `/main` half.',
      },
    ]),
  },

  // --- Boundary: website (the public marketing site) --------------------------
  // The site is built and deployed entirely on its own — a static tree published
  // to a public host, from a DIFFERENT repository than this private one (see
  // `docs/WEBSITE.md` for the targets) — so it has no business importing
  // anything from this one. It is not "app, but public": it shares no runtime,
  // no IPC bridge and no build. An import of a workspace package here would
  // compile, and then either drag Electron-shaped code into a browser bundle or
  // couple a marketing page to the app's internals, which is the coupling that
  // makes a site impossible to move out of the monorepo later.
  //
  // Scoped to `src/` for the same reason the app's block is: vite/vitest/tailwind
  // config runs in Node at build time and legitimately reads node builtins.
  //
  // `@midnite/studio-shared` is the one deliberate exception — it is zod-only and
  // browser-safe, and the site may want a constant from it (`BUILTIN_AGENTS`, the
  // version helpers) rather than retyping one. Everything else is denied.
  {
    files: ['packages/website/src/**/*.{ts,tsx}'],
    rules: deny([
      {
        group: ['electron', 'electron/*'],
        message: 'The marketing site is a static web page. It has no Electron, and never will.',
      },
      {
        group: [
          '@midnite/studio-app',
          '@midnite/studio-app/*',
          '@midnite/studio-git-engine',
          '@midnite/studio-git-engine/*',
          '@midnite/studio-db-engine',
          '@midnite/studio-db-engine/*',
          '@midnite/studio-knowledge',
          '@midnite/studio-knowledge/*',
          '@midnite/studio-desktop',
          '@midnite/studio-desktop/*',
        ],
        message:
          'The website shares no runtime with the app. Copy the constant, or move it into @midnite/studio-shared (zod-only, browser-safe) if both genuinely need it.',
      },
      {
        group: ['node:*', 'fs', 'path', 'child_process'],
        message: 'No node builtins in a static site bundle.',
      },
      {
        group: ['lucide-react', 'lucide-react/*'],
        message: 'react-icons is the only icon family here too — import from react-icons/lu.',
      },
    ]),
  },

  // --- Boundary: launcher (apps/launcher — the Midnite Apps launcher) ---------
  // Its own Electron app, off the Studio graph the same way the website is: it
  // reaches Studio only through `midnite-studio://` links and the public
  // midnite-apps feed, never through a workspace import. From `shared` it takes
  // single source files by path (`@midnite/studio-shared/studio-link`, and
  // type-only `domain/view` / `media`) — never the barrel, which would bundle
  // every zod schema in the wire contract into a launcher that needs none.
  {
    files: ['apps/launcher/src/**/*.{ts,tsx}'],
    rules: deny([
      {
        group: [
          '@midnite/studio-app',
          '@midnite/studio-app/*',
          '@midnite/studio-git-engine',
          '@midnite/studio-git-engine/*',
          '@midnite/studio-db-engine',
          '@midnite/studio-db-engine/*',
          '@midnite/studio-knowledge',
          '@midnite/studio-knowledge/*',
          '@midnite/studio-desktop',
          '@midnite/studio-desktop/*',
        ],
        message:
          'The launcher shares no runtime with Studio. Open Studio with a midnite-studio:// link (shared/src/studio-link.ts) instead.',
      },
      {
        regex: '^@midnite/studio-shared$',
        message: 'Import the one shared file you need by path (@midnite/studio-shared/studio-link), not the barrel.',
      },
      {
        group: ['lucide-react', 'lucide-react/*'],
        message: 'react-icons is the only icon family here too — import from react-icons/lu.',
      },
    ]),
  },
  // The launcher's renderer is sandboxed: everything goes through `window.midniteLauncher`.
  {
    files: ['apps/launcher/src/renderer/**/*.{ts,tsx}'],
    ignores: ['apps/launcher/src/renderer/**/*.test.{ts,tsx}'],
    rules: deny([
      {
        group: ['electron', 'electron/*'],
        message: 'The launcher renderer is sandboxed. Reach main through window.midniteLauncher (src/common/bridge.ts).',
      },
      {
        group: ['node:*', 'fs', 'path', 'child_process', '**/main/*', '**/preload/*'],
        message: 'No node builtins or main-process modules in the launcher renderer.',
      },
      {
        regex: '^@midnite/studio-shared$',
        message: 'Import the one shared file you need by path, not the barrel.',
      },
      {
        group: ['lucide-react', 'lucide-react/*'],
        message: 'react-icons is the only icon family here too — import from react-icons/lu.',
      },
    ]),
  },

  // --- Boundary: suite apps (Phase 113 Theme L: apps/browser, etc.) ----------
  // An installable suite app composes features and the frame:
  // - May import `@midnite/studio-frame`, `@midnite/studio-shared`, and features.
  // - May NOT import another app (@midnite/studio-app, @midnite/launcher, other apps).
  // - May NOT import the runtime directly in renderer code.
  // - May NOT import desktop.
  // - May NOT import a feature's main half (renderer code composes /renderer).
  {
    files: ['apps/!(launcher)/src/**/*.{ts,tsx}'],
    rules: deny([
      NO_APP_UPDATER,
      ...APP_PATTERNS,
      ...APP_LAYER_PATTERNS,
      APP_FEATURE_TESTING,
      {
        group: ['@midnite/studio-app', '@midnite/studio-app/*', '@midnite/launcher', '@midnite/launcher/*'],
        message: 'An app never imports another app: compose from features, the frame and shared.',
      },
    ]),
  },
  {
    files: ['apps/!(launcher)/src/**/*.test.{ts,tsx}'],
    rules: deny([
      NO_APP_UPDATER,
      ...APP_PATTERNS,
      ...APP_LAYER_PATTERNS,
      {
        group: ['@midnite/studio-app', '@midnite/studio-app/*', '@midnite/launcher', '@midnite/launcher/*'],
        message: 'An app never imports another app: compose from features, the frame and shared.',
      },
    ]),
  },

  // --- Boundary: a suite app's main side (apps/<id>/main) ---------------------
  // The Electron half of an installable app. It may use `electron`, the runtime and a feature's
  // main half (it is the composer), and nothing renderer-side or Studio-side.
  {
    files: ['apps/!(launcher)/main/**/*.ts'],
    rules: deny([
      NO_APP_UPDATER,
      LAYER_FRAME_FROM_MAIN,
      LAYER_DESKTOP,
      {
        group: ['@midnite/studio-app', '@midnite/studio-app/*', '@midnite/launcher', '@midnite/launcher/*', '@midnite/app-*', '**/apps/**'],
        message: 'An app never imports another app: compose from features, the runtime and shared.',
      },
    ]),
  },

  // --- Boundary: Studio's two entries (Phase 113 Theme G) --------------------
  // Studio is the superset app, and its shell is not features over the frame:
  // it is `packages/app` (renderer) and `packages/desktop` (main), Studio's own
  // internals rather than another app. `apps/studio/entry/` is where the app
  // hands over to them — one file per process, each allowed exactly one seam
  // (`@midnite/studio-app/boot`, `@midnite/studio-desktop/main`) and nothing
  // deeper, by name or by path. `apps/studio/src/` (the composition) stays under
  // the suite-app rules above, unchanged.
  {
    files: ['apps/studio/entry/renderer.ts'],
    rules: deny([
      NO_APP_UPDATER,
      ...APP_PATTERNS,
      ...APP_LAYER_PATTERNS,
      APP_FEATURE_TESTING,
      {
        // A regex, not a group: gitignore-style negation cannot re-include `/boot` under an excluded parent.
        regex: '^@midnite/studio-app(?!/boot$)(/.*)?$',
        message: STUDIO_RENDERER_SEAM,
      },
      {
        group: ['**/app/src/**', '@midnite/launcher', '@midnite/launcher/*', '@midnite/app-*', '**/apps/**'],
        message: STUDIO_RENDERER_SEAM,
      },
    ]),
  },
  {
    files: ['apps/studio/entry/main.ts'],
    rules: deny([
      NO_APP_UPDATER,
      LAYER_FRAME_FROM_MAIN,
      {
        regex: '^@midnite/studio-desktop(?!/main$)(/.*)?$',
        message: STUDIO_MAIN_SEAM,
      },
      {
        group: ['**/desktop/src/**', '@midnite/studio-app', '@midnite/studio-app/*', '@midnite/launcher', '@midnite/launcher/*', '@midnite/app-*', '**/apps/**'],
        message: STUDIO_MAIN_SEAM,
      },
    ]),
  },

  // --- Boundary: broker ------------------------------------------------------
  // The broker is a Node process running under ELECTRON_RUN_AS_NODE and never
  // imports Electron modules.
  {
    files: ['packages/desktop/src/broker/**/*.ts'],
    rules: deny([
      NO_ELECTRON,
      {
        group: ['@midnite/studio-frame', '@midnite/studio-frame/*', '@midnite/studio-feature-*', '@midnite/studio-feature-*/**'],
        message: 'The broker is a bare Node process; it composes nothing from the app layers.',
      },
    ]),
  },

  // --- Subprocess locale pin (Phase 85 Theme A) ------------------------------
  // Subprocesses whose output is parsed must set env: parseableProcessEnv()
  // so numeric outputs (like %CPU) aren't broken by comma locales.
  {
    files: ['packages/desktop/src/main/**/*.ts', 'packages/git-engine/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.name=/^(execFile|execFileSync|spawn|spawnSync)$/] > ObjectExpression:not(:has(Property[key.name='env']))",
          message:
            'A parsed subprocess must pass env: parseableProcessEnv() — see shared/src/process-env.ts. Interactive ptys are exempt; add the file to the allowlist below with a reason.',
        },
      ],
    },
  },

  // Phase 76 Theme E — IPC registration goes through ipc/handle.ts helpers only.
  {
    files: ['packages/desktop/src/main/**/*.ts'],
    ignores: ['packages/desktop/src/main/ipc/handle.ts', 'packages/desktop/src/main/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.name='ipcMain'][property.name=/^(on|handle)$/]",
          message:
            'Register IPC through handle(), handleSend(), handleBare(), handleBareFromSender(), handleFromSender() or handleSendFromSender() in ipc/handle.ts — raw ipcMain.on/handle bypass validation.',
        },
      ],
    },
  },

  // Interactive ptys and carve-outs exempt from the locale pin guard:
  // - inproc-pty.ts: terminal shells keep the user's ambient locale.
  // - broker-client.ts: spawns the broker that hosts interactive terminals.
  // - login-shell.ts: runs commands in the user's login shell with their ambient locale.
  // - shell-path.ts: probes PATH in the user's login shell.
  // - process-runner.ts: streams to sinks rather than parses numeric tables.
  // - video/studio-service.ts: streams Remotion studio output to sinks.
  // - companion/tts-broker.ts: utilityProcess.fork, not child_process.
  {
    files: [
      'packages/desktop/src/main/inproc-pty.ts',
      'packages/desktop/src/main/broker-client.ts',
      'packages/desktop/src/main/login-shell.ts',
      'packages/desktop/src/main/shell-path.ts',
      'packages/desktop/src/main/process-runner.ts',
      'packages/desktop/src/main/video/studio-service.ts',
      'packages/desktop/src/main/companion/tts-broker.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
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
