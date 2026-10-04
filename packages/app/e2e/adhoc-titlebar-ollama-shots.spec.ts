import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';
import { setTheme, settle } from './shots-helper';

/**
 * Ad hoc screenshots of the title bar's Ollama menu (`TitleBarOllama`) in its
 * three states — running with a model loaded, stopped, and not installed —
 * for the PR body. Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 *
 * `window.midniteStudio.ollama` and `.setup` are patched in a second
 * `addInitScript`, after `installMockBridge`'s own, the same way
 * `models-view-shots.spec.ts` does it.
 */
const OUT = '../../docs/screenshots/adhoc-titlebar-ollama';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 60_000 });

async function open(page: Page, opts: { reachable: boolean; installed: boolean }): Promise<void> {
  await installMockBridge(page, fixtures);
  await page.addInitScript(
    ({ reachable, installed }) => {
      const w = window as unknown as { midniteStudio: Record<string, unknown> };
      const existingOllama = (w.midniteStudio.ollama ?? {}) as Record<string, unknown>;
      w.midniteStudio.ollama = {
        ...existingOllama,
        status: async () => ({
          reachable,
          version: reachable ? '0.12.3' : null,
          host: 'http://127.0.0.1:11434',
        }),
        ps: async () => ({
          ok: true,
          value: {
            models: reachable
              ? [{ name: 'qwen3:14b', model: 'qwen3:14b', size: 9_663_676_416, sizeVram: 9_663_676_416 }]
              : [],
          },
        }),
      };
      const existingSetup = (w.midniteStudio.setup ?? {}) as Record<string, unknown>;
      w.midniteStudio.setup = {
        ...existingSetup,
        probe: async () => ({
          results: [
            {
              id: 'ollama',
              installed,
              version: installed ? 'ollama version is 0.12.3' : null,
              path: installed ? '/opt/homebrew/bin/ollama' : null,
            },
          ],
        }),
      };
    },
    opts,
  );
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.goto('/');
  await expect(page.getByTestId('titlebar-ollama')).toBeVisible({ timeout: 30_000 });
}

const CLIP = { x: 760, y: 0, width: 640, height: 320 };

for (const theme of ['dark', 'light'] as const) {
  test(`running, menu open (${theme})`, async ({ page }) => {
    await open(page, { reachable: true, installed: true });
    await setTheme(page, theme, { settleMs: 200 });
    await page.getByTestId('titlebar-ollama').click();
    await expect(page.getByTestId('titlebar-ollama-status-badge')).toHaveText(/Running/);
    await expect(page.getByText('qwen3:14b')).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${OUT}/running-${theme}.png`, clip: CLIP });
  });
}

test('stopped, menu open (dark)', async ({ page }) => {
  await open(page, { reachable: false, installed: true });
  await setTheme(page, 'dark', { settleMs: 200 });
  await page.getByTestId('titlebar-ollama').click();
  await expect(page.getByTestId('titlebar-ollama-status-badge')).toHaveText(/Stopped/);
  await settle(page);
  await page.screenshot({ path: `${OUT}/stopped-dark.png`, clip: CLIP });
});

test('not installed (dark)', async ({ page }) => {
  await open(page, { reachable: false, installed: false });
  await setTheme(page, 'dark', { settleMs: 200 });
  await expect(page.locator('[data-testid="titlebar-ollama"][data-installed="false"]')).toBeVisible();
  await page.getByTestId('titlebar-ollama').hover();
  await settle(page, 600);
  await page.screenshot({ path: `${OUT}/not-installed-dark.png`, clip: { ...CLIP, height: 120 } });
});
