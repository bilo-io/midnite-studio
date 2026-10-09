import { test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, settle, setTheme } from './shots-helper';

/** Phase 98 Themes F, I — screenshots of the accounts and Ollama pages. Run with MSTUDIO_SHOTS=1. */
test.skip(!process.env.MSTUDIO_SHOTS, 'screenshots only');
const OUT = '../../docs/screenshots/p98-fi';

const accounts = [
  { id: 'github:github.com:ada', kind: 'github', host: 'github.com', login: 'ada', displayName: 'Ada Lovelace', avatarUrl: null, email: 'ada@example.com', addedAt: 1, hasToken: false, delegated: 'gh' },
  { id: 'gitlab:gitlab.com:ada-work', kind: 'gitlab', host: 'gitlab.com', login: 'ada-work', displayName: 'Ada (work)', avatarUrl: null, email: null, addedAt: 2, hasToken: true, delegated: null },
];

for (const theme of ['light', 'dark'] as const) {
  for (const target of ['accounts', 'ollama'] as const) {
    test(`${target} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await installMockBridge(page, { ...fixtures, firstRun: true, forgeAccounts: accounts } as never);
      await page.addInitScript(() => {
        const w = window as unknown as { midniteStudio: Record<string, unknown> };
        w.midniteStudio.ollama = {
          status: async () => ({ reachable: true, version: '0.5.0', host: 'http://127.0.0.1:11434' }),
          list: async () => ({ ok: true, value: { models: [{ name: 'gemma3:4b', model: 'gemma3:4b', modifiedAt: null, size: 3.3e9, digest: 'x' }] } }),
          pull: async ({ model }: { model: string }) => ({ ok: true, value: { pullId: 'p1', model } }),
          onPullProgress: () => () => {},
        };
      });
      await page.goto('/');
      await setTheme(page, theme);
      const overlay = page.getByTestId('setup-overlay');
      await overlay.getByRole('button', { name: 'Begin setup' }).click();
      const id = target;
      for (let i = 0; i < 8 && (await overlay.getAttribute('data-step')) !== id; i += 1) {
        await page.keyboard.press('ArrowRight');
        await settle(page, 400);
      }
      if (target === 'accounts') await page.getByRole('button', { name: /Ada Lovelace/ }).click();
      if (target === 'ollama') {
        await page.getByRole('checkbox', { name: 'Llama 3.2 3B' }).check();
        await page.getByRole('checkbox', { name: 'Qwen3 14B' }).check();
      }
      await settle(page, 1500);
      await page.screenshot({ path: `${OUT}/${target}-${theme}.png` });
    });
  }
}
