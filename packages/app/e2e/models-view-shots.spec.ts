import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';
import { settle, shotPath, SHOT_VIEWPORTS } from './shots-helper';

/**
 * The Phase 96 Theme C Models view screenshots. Not assertions — this is a
 * brand-new view with no "before", matching `video-studio-shots.spec.ts`'s
 * own posture.
 *
 * `window.midniteStudio.ollama` has no entry in the central
 * `test-support/mock-bridge.ts` yet (Theme C is the first consumer) — rather
 * than widen that ~4600-line shared fixture for one view, this file patches
 * `window.midniteStudio.ollama` directly with a second `addInitScript`,
 * registered after `installMockBridge`'s own so it runs second and overrides
 * nothing else the standard bridge already answers (repos, worktrees, the
 * rail itself).
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/phase-96-theme-c-models';
const SETTLE_MS = 300;

async function withOllamaBridge(
  page: Page,
  opts: {
    reachable?: boolean;
    models?: unknown[];
    running?: unknown[];
  } = {},
): Promise<void> {
  const reachable = opts.reachable ?? true;
  await page.addInitScript(
    ({ reachable, models, running }) => {
      const w = window as unknown as { midniteStudio: Record<string, unknown> };
      w.midniteStudio.ollama = {
        status: async () => ({
          reachable,
          version: reachable ? '0.5.0' : null,
          host: 'http://127.0.0.1:11434',
        }),
        list: async () => ({ ok: true, value: { models } }),
        ps: async () => ({ ok: true, value: { models: running } }),
        show: async () => ({ ok: true, value: { capabilities: ['completion', 'tools'] } }),
        pull: async () => ({ ok: true, value: { pullId: 'p1', model: 'qwen3.5:14b' } }),
        pullCancel: async () => ({ ok: true }),
        delete: async () => ({ ok: true }),
        create: async () => ({ ok: true, value: { name: 'model' } }),
        unload: async () => ({ ok: true }),
        onPullProgress: () => () => {},
        settings: {
          get: async () => ({ host: null, defaultModel: null }),
          set: async (req: Record<string, unknown>) => ({ ok: true, value: { host: null, defaultModel: null, ...req } }),
        },
      };
    },
    { reachable, models: opts.models ?? [], running: opts.running ?? [] },
  );
}

async function openModels(
  page: Page,
  ollamaOpts: Parameters<typeof withOllamaBridge>[1],
  data: MockFixtures = fixtures,
): Promise<void> {
  // `installMockBridge` registers its own `addInitScript` first (setting the
  // whole `window.midniteStudio` object); `withOllamaBridge`'s registers
  // second, so it runs after and its `.ollama` patch survives.
  await installMockBridge(page, data);
  await withOllamaBridge(page, ollamaOpts);
  await page.goto('/');
  // A generous timeout on this first wait only: a cold dev server's first
  // compile of the whole module graph can outrun the default 5s, and every
  // later navigation in this file reuses the now-warm server.
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 20_000 });

  // No shared "Models" heading assertion here: the daemon-down state
  // (`DaemonDownState` in `models-view.tsx`) renders no header at all, only
  // the empty state — each test below waits for its own distinguishing text
  // once routed.
  await clickRailLink(page, 'Models');
}

test.describe('models view screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.board });

  test('daemon not running', async ({ page }) => {
    await openModels(page, { reachable: false });
    await page.getByText("Ollama isn't running").waitFor();
    await settle(page, SETTLE_MS);
    await page.screenshot({ path: shotPath(OUT, 'daemon-down.png') });
  });

  test('installed, empty', async ({ page }) => {
    await openModels(page, { reachable: true, models: [] });
    await page.getByText('No models installed yet').waitFor();
    await settle(page, SETTLE_MS);
    await page.screenshot({ path: shotPath(OUT, 'installed-empty.png') });
  });

  test('installed, with a model and a running badge', async ({ page }) => {
    const model = {
      name: 'qwen3.5:14b',
      model: 'qwen3.5:14b',
      modifiedAt: '2026-09-01T00:00:00Z',
      size: 8_500_000_000,
      digest: 'sha256:abc',
      details: { family: 'qwen3', parameterSize: '14B', quantizationLevel: 'Q4_K_M' },
    };
    const running = {
      name: 'qwen3.5:14b',
      model: 'qwen3.5:14b',
      size: 8_500_000_000,
      digest: 'sha256:abc',
      sizeVram: 9_100_000_000,
    };
    await openModels(page, { reachable: true, models: [model], running: [running] });
    await page.getByText('qwen3.5:14b').first().waitFor();
    await settle(page, SETTLE_MS);
    await page.screenshot({ path: shotPath(OUT, 'installed-running.png') });
  });
});
