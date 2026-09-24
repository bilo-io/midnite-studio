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
    searchItems?: unknown[];
    cloudModels?: unknown[];
    signedIn?: boolean;
    hasApiKey?: boolean;
  } = {},
): Promise<void> {
  const reachable = opts.reachable ?? true;
  await page.addInitScript(
    ({ reachable, models, running, searchItems, cloudModels, signedIn, hasApiKey }) => {
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
        // Phase 96 Themes D, F — Discover/Cloud tab screenshots.
        search: async () => ({
          ok: true,
          value: { items: searchItems ?? [], stale: false, updatedAt: new Date().toISOString() },
        }),
        cloudList: async () => ({ ok: true, value: { models: cloudModels ?? [] } }),
        signInStatus: async () => ({ signedIn: signedIn ?? false }),
      };
      const existingSecrets = (w.midniteStudio.secrets ?? {}) as Record<string, unknown>;
      w.midniteStudio.secrets = {
        ...existingSecrets,
        has: async () => ({ hasKey: hasApiKey ?? false }),
      };
    },
    {
      reachable,
      models: opts.models ?? [],
      running: opts.running ?? [],
      searchItems: opts.searchItems ?? [],
      cloudModels: opts.cloudModels ?? [],
      signedIn: opts.signedIn ?? false,
      hasApiKey: opts.hasApiKey ?? false,
    },
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

  test('discover, with search results', async ({ page }) => {
    const searchItems = [
      {
        name: 'llama3.1',
        description: 'Llama 3.1 is a new state-of-the-art model from Meta.',
        capabilities: ['tools'],
        variants: ['8b', '70b', '405b'],
        pulls: '119.8M',
        updatedAt: '1 year ago',
      },
      {
        name: 'qwen3.5',
        description: 'Qwen 3.5 is a family of open-source multimodal models.',
        capabilities: ['vision', 'tools', 'thinking'],
        variants: ['0.8b', '2b', '4b'],
        pulls: '20.9M',
        updatedAt: '2 months ago',
        cloud: true,
      },
    ];
    await openModels(page, { reachable: true, searchItems });
    await page.getByRole('tab', { name: 'Discover' }).click();
    await page.getByPlaceholder(/search ollama.com/i).fill('llama');
    await page.getByText('llama3.1').waitFor();
    await settle(page, SETTLE_MS);
    await page.screenshot({ path: shotPath(OUT, 'discover-results.png') });
  });

  test('cloud, signed in with a catalogue', async ({ page }) => {
    const cloudModels = [
      {
        name: 'qwen3.5',
        model: 'qwen3.5',
        modifiedAt: null,
        size: 0,
        digest: 'sha256:cloud1',
        details: { parameterSize: '235B' },
      },
      {
        name: 'gpt-oss:120b',
        model: 'gpt-oss:120b',
        modifiedAt: null,
        size: 0,
        digest: 'sha256:cloud2',
        details: { parameterSize: '120B' },
      },
    ];
    await openModels(page, { reachable: true, signedIn: true, cloudModels });
    await page.getByRole('tab', { name: 'Cloud' }).click();
    await page.getByText('qwen3.5').waitFor();
    await settle(page, SETTLE_MS);
    await page.screenshot({ path: shotPath(OUT, 'cloud-catalogue.png') });
  });

  test('cloud, signed out with no key', async ({ page }) => {
    await openModels(page, { reachable: true, signedIn: false, hasApiKey: false });
    await page.getByRole('tab', { name: 'Cloud' }).click();
    await page.getByText(/not signed in to ollama.com/i).waitFor();
    await settle(page, SETTLE_MS);
    await page.screenshot({ path: shotPath(OUT, 'cloud-signed-out.png') });
  });
});
