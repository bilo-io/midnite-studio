import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@midnite/studio-shared/ipc/channels': at('../../packages/shared/src/ipc/channels.ts'),
      '@midnite/studio-runtime/app-main/bridge-slice': at('../../packages/runtime/src/app-main/bridge-slice.ts'),
      '@midnite/studio-runtime/app-main/suite-preload': at('../../packages/runtime/src/app-main/suite-preload.ts'),
      '@midnite/studio-shared': at('../../packages/shared/src/index.ts'),
      '@midnite/studio-frame/graph': at('../../packages/frame/src/graph/index.ts'),
      '@midnite/studio-frame/diff': at('../../packages/frame/src/diff/index.ts'),
      '@midnite/studio-frame': at('../../packages/frame/src/index.ts'),
      '@midnite/studio-module-coder/renderer': at('../../packages/modules/coder/renderer/index.ts'),
      '@midnite/studio-module-coder/manifest': at('../../packages/modules/coder/manifest.ts'),
      '@midnite/studio-module-coder/main': at('../../packages/modules/coder/main/index.ts'),
      '@midnite/studio-module-coder/bridge': at('../../packages/modules/coder/main/bridge.ts'),
      '@midnite/studio-feature-report/renderer': at('../../packages/features/report/renderer/index.ts'),
      '@midnite/studio-feature-report/main': at('../../packages/features/report/main/index.ts'),
      '@midnite/studio-feature-report/bridge': at('../../packages/features/report/bridge.ts'),
      '@midnite/studio-runtime': at('../../packages/runtime/src/index.ts'),
      '@midnite/studio-git-engine': at('../../packages/git-engine/src/index.ts'),
      // As in the bundle (scripts/bundle-main.mjs): git-engine runs the system git through Coder's shim,
      // so main/git.test.ts proves the read channels against the git Coder actually ships with.
      dugite: at('../../packages/modules/coder/main/system-git.ts'),
      '@midnite/studio-db-engine': at('../../packages/db-engine/src/index.ts'),
      '@midnite/studio-feature-api-client/main': at('../../packages/features/api-client/main/index.ts'),
      '@midnite/studio-feature-api-client/script-runner-worker': at('../../packages/features/api-client/main/script-runner-worker.ts'),
      '@midnite/studio-feature-api-client/renderer/testing': at('../../packages/features/api-client/renderer/testing.ts'),
      '@midnite/studio-feature-api-client/renderer': at('../../packages/features/api-client/renderer/index.ts'),
      '@midnite/studio-feature-database/main': at('../../packages/features/database/main/index.ts'),
      '@midnite/studio-feature-database/renderer/testing': at('../../packages/features/database/renderer/testing.ts'),
      '@midnite/studio-feature-database/renderer': at('../../packages/features/database/renderer/index.ts'),
      '@midnite/studio-feature-forge/main': at('../../packages/features/forge/main/index.ts'),
      '@midnite/studio-feature-forge/renderer': at('../../packages/features/forge/renderer/index.ts'),
      '@midnite/studio-feature-forge/renderer/testing': at('../../packages/features/forge/renderer/testing.ts'),
      '@midnite/studio-feature-sessions/main': at('../../packages/features/sessions/main/index.ts'),
      '@midnite/studio-feature-sessions/renderer': at('../../packages/features/sessions/renderer/index.ts'),
      // Tasks' state entry before its barrel, for the same reason as the frame's.
      '@midnite/studio-feature-tasks/renderer/state': at('../../packages/features/tasks/renderer/state.ts'),
      '@midnite/studio-feature-tasks/renderer': at('../../packages/features/tasks/renderer/index.ts'),
      '@midnite/studio-feature-tests/main': at('../../packages/features/tests/main/index.ts'),
      '@midnite/studio-feature-tests/renderer': at('../../packages/features/tests/renderer/index.ts'),
      '@midnite/studio-feature-tests/renderer/testing': at('../../packages/features/tests/renderer/testing.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'main/**/*.test.ts'],
    environment: 'jsdom',
    // No test can act as the user on GitHub (a stale mock once let the real `gh` open an issue).
    // ...and jsdom gets a ResizeObserver that fires, or the frame's virtualized graph renders no rows.
    setupFiles: ['../../scripts/vitest-isolate-gh.mjs', '../../packages/frame/src/vitest-setup.ts'],
  },
});
