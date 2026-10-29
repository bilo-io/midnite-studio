import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@midnite/studio-shared/ipc/channels': at('../../shared/src/ipc/channels.ts'),
      '@midnite/studio-runtime/app-main/bridge-slice': at('../../runtime/src/app-main/bridge-slice.ts'),
      '@midnite/studio-shared': at('../../shared/src/index.ts'),
      '@midnite/studio-frame/graph': at('../../frame/src/graph/index.ts'),
      '@midnite/studio-frame/diff': at('../../frame/src/diff/index.ts'),
      '@midnite/studio-frame': at('../../frame/src/index.ts'),
      '@midnite/studio-feature-report/renderer': at('../../features/report/renderer/index.ts'),
      '@midnite/studio-feature-report/main': at('../../features/report/main/index.ts'),
      '@midnite/studio-feature-report/bridge': at('../../features/report/bridge.ts'),
      '@midnite/studio-runtime': at('../../runtime/src/index.ts'),
      '@midnite/studio-git-engine': at('../../git-engine/src/index.ts'),
      // As in the bundle (scripts/bundle-main.mjs): git-engine runs the system git through Coder's shim,
      // so main/git.test.ts proves the read channels against the git Coder actually ships with.
      dugite: at('./main/system-git.ts'),
      '@midnite/studio-db-engine': at('../../db-engine/src/index.ts'),
      '@midnite/studio-feature-api-client/main': at('../../features/api-client/main/index.ts'),
      '@midnite/studio-feature-api-client/script-runner-worker': at('../../features/api-client/main/script-runner-worker.ts'),
      '@midnite/studio-feature-api-client/renderer/testing': at('../../features/api-client/renderer/testing.ts'),
      '@midnite/studio-feature-api-client/renderer': at('../../features/api-client/renderer/index.ts'),
      '@midnite/studio-feature-database/main': at('../../features/database/main/index.ts'),
      '@midnite/studio-feature-database/renderer/testing': at('../../features/database/renderer/testing.ts'),
      '@midnite/studio-feature-database/renderer': at('../../features/database/renderer/index.ts'),
      '@midnite/studio-feature-forge/main': at('../../features/forge/main/index.ts'),
      '@midnite/studio-feature-forge/renderer': at('../../features/forge/renderer/index.ts'),
      '@midnite/studio-feature-forge/renderer/testing': at('../../features/forge/renderer/testing.ts'),
      '@midnite/studio-feature-sessions/main': at('../../features/sessions/main/index.ts'),
      '@midnite/studio-feature-sessions/renderer': at('../../features/sessions/renderer/index.ts'),
      // Tasks' state entry before its barrel, for the same reason as the frame's.
      '@midnite/studio-feature-tasks/renderer/state': at('../../features/tasks/renderer/state.ts'),
      '@midnite/studio-feature-tasks/renderer': at('../../features/tasks/renderer/index.ts'),
      '@midnite/studio-feature-tests/main': at('../../features/tests/main/index.ts'),
      '@midnite/studio-feature-tests/renderer': at('../../features/tests/renderer/index.ts'),
      '@midnite/studio-feature-tests/renderer/testing': at('../../features/tests/renderer/testing.ts'),
    },
  },
  test: {
    include: ['renderer/**/*.test.{ts,tsx}', 'main/**/*.test.ts', 'manifest.test.ts'],
    environment: 'jsdom',
    // No test can act as the user on GitHub (a stale mock once let the real `gh` open an issue).
    // ...and jsdom gets a ResizeObserver that fires, or the frame's virtualized graph renders no rows.
    setupFiles: ['../../../scripts/vitest-isolate-gh.mjs', '../../frame/src/vitest-setup.ts'],
  },
});
