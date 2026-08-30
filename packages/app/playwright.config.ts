import { defineConfig, devices } from '@playwright/test';

/**
 * Browser-driven tests for the renderer.
 *
 * These run against the Vite dev server with a *mocked* `window.midniteStudio`
 * (see e2e/mock-bridge.ts) rather than against Electron. The renderer's only
 * route to the main process is that bridge, so replacing it is enough to drive
 * every UI path deterministically — and it keeps the suite runnable in CI
 * without a display server or a packaged app.
 *
 * What this does NOT cover, by design: the preload wiring and the main-process
 * handlers. Those are covered by desktop's own vitest suite and git-engine's
 * integration tests against real repositories.
 */
/**
 * Not 5173 — see the `reuseExistingServer` note below.
 *
 * Overridable because 5273 is contended the same way 5173 is, just less often:
 * two worktrees running the suite at once collide, and `strictPort` correctly
 * turns that into a hard error. `MSTUDIO_E2E_PORT=5274 pnpm e2e` is the way out,
 * rather than either session killing the other's server.
 */
const PORT = Number(process.env.MSTUDIO_E2E_PORT ?? 5273);

export default defineConfig({
  testDir: './e2e',
  // The suite is UI-deterministic — a retry would mask a real race rather than
  // absorb infrastructure flake.
  retries: 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    /**
     * Never reuse a server this config did not start.
     *
     * The dev port (5173) is contended: `moon run app:dev` from the primary
     * checkout and from any `.worktrees/*` copy all want it, and Playwright
     * happily reuses whichever got there first. The suite then passes or fails
     * against a DIFFERENT checkout's source — silently, since the app looks
     * entirely normal. A dedicated port plus `strictPort` turns that collision
     * into a startup error instead of a wrong answer.
     */
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
