import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@midnite/studio-module-vanguard/bridge': at('../../packages/modules/vanguard/main/bridge.ts'),
      '@midnite/studio-module-vanguard/main': at('../../packages/modules/vanguard/main/index.ts'),
      '@midnite/studio-module-vanguard/renderer': at('../../packages/modules/vanguard/renderer/index.ts'),
      '@midnite/studio-module-vault/bridge': at('../../packages/modules/vault/main/bridge.ts'),
      '@midnite/studio-module-vault/main': at('../../packages/modules/vault/main/index.ts'),
      '@midnite/studio-module-cleaner/bridge': at('../../packages/modules/cleaner/main/bridge.ts'),
      '@midnite/studio-module-cleaner/main': at('../../packages/modules/cleaner/main/index.ts'),
      '@midnite/studio-module-monitor/bridge': at('../../packages/modules/monitor/main/bridge.ts'),
      '@midnite/studio-module-monitor/main': at('../../packages/modules/monitor/main/index.ts'),
      '@midnite/studio-feature-vault/main': at('../../packages/features/vault/main/index.ts'),
      '@midnite/studio-feature-optimizer/main': at('../../packages/features/optimizer/main/index.ts'),
      '@midnite/studio-feature-monitor/main': at('../../packages/features/monitor/main/index.ts'),
      '@midnite/studio-feature-report/bridge': at('../../packages/features/report/bridge.ts'),
      '@midnite/studio-git-engine': at('../../packages/git-engine/src/index.ts'),
      '@midnite/studio-shared/ipc/channels': at('../../packages/shared/src/ipc/channels.ts'),
      '@midnite/studio-runtime/app-main/bridge-slice': at('../../packages/runtime/src/app-main/bridge-slice.ts'),
      '@midnite/studio-shared': at('../../packages/shared/src/index.ts'),
      '@midnite/studio-feature-report/main': at('../../packages/features/report/main/index.ts'),
      '@midnite/studio-feature-report/renderer': at('../../packages/features/report/renderer/index.ts'),
      '@midnite/studio-frame': at('../../packages/frame/src/index.ts'),
      '@midnite/studio-runtime': at('../../packages/runtime/src/index.ts'),
      '@midnite/studio-feature-vanguard/main': at('../../packages/features/vanguard/main/index.ts'),
      '@midnite/studio-feature-sessions/main': at('../../packages/features/sessions/main/index.ts'),
      '@midnite/studio-feature-vanguard/renderer': at('../../packages/features/vanguard/renderer/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'main/**/*.test.ts'],
    environment: 'jsdom',
  },
});
