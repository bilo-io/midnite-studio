import { defineConfig, devices } from '@playwright/test';

/**
 * Footage capture for the Midnite Apps promo — NOT a test suite.
 *
 * Runs the renderer (packages/app) in headless chromium against the e2e mock
 * bridge. Expects a Vite dev server already running on :5293:
 *
 *   cd packages/app && pnpm exec vite --port 5293 --strictPort
 *
 * then, from packages/app:
 *
 *   node_modules/.bin/playwright test --config <this file> [-g graph-partial]
 */
const PORT = Number(process.env.CAPTURE_PORT ?? 5293);

export default defineConfig({
  testDir: '.',
  testMatch: /shots\/.*\.cap\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: 'list',
  outputDir: './.pw-out',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    headless: true,
    trace: 'off',
    video: 'off',
    launchOptions: { args: ['--force-color-profile=srgb', '--hide-scrollbars'] },
  },
});
