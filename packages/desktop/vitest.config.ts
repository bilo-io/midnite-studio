import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only electron-free modules are unit-tested here — anything importing
    // `electron` can't run outside the Electron runtime. `scripts/**` picks up
    // the packaging scripts' own electron-free helpers (e.g. verify-dist.mjs's
    // yaml-scalar.mjs, Phase 53 Theme C) — the scripts themselves stay
    // untested here on purpose; they're integration-proven against a real
    // `moon run desktop:dist` build, not unit-proven against a fake one.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    environment: 'node',
  },
});
