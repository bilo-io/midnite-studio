import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, setReducedMotion, setTheme, shotPath, type MockFixtures } from './shots-helper';

/**
 * Phase 112 Theme H — the numbered chips "open my chat about auth" leaves in
 * the companion panel when several chats match. Light and dark, repos panel
 * closed (the helper seeds it so).
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/p112-h';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to regenerate');
test.setTimeout(120_000);

const NOW = Date.now();
const chat = (id: string, title: string, age: number) => ({
  id,
  title,
  engine: 'claude',
  model: null,
  mode: 'ask',
  repoId: null,
  repoName: 'midnite-studio',
  repoPath: null,
  pinned: false,
  createdAt: NOW - age - 1000,
  updatedAt: NOW - age,
  session: null,
  messages: [{ id: `${id}-m`, role: 'user', text: `About ${title}`, createdAt: NOW - age, status: 'done' }],
});

async function open(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript(() => {
    const noop = () => {};
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (utterance: { onend?: (() => void) | null }) => setTimeout(() => utterance.onend?.(), 0),
        cancel: noop,
        getVoices: () => [],
        addEventListener: noop,
        removeEventListener: noop,
        speaking: false,
        pending: false,
      },
    });
    try {
      const stored = localStorage.getItem('midnite-studio.ui');
      const persisted = stored ? JSON.parse(stored) : { version: 32 };
      persisted.state = { ...persisted.state, companionEnabled: true };
      localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
    } catch {
      /* Unparseable profile — the app discards it too. */
    }
  });
  await installMockBridge(page, {
    ...fixtures,
    chats: {
      seed: [
        chat('c-1', 'Auth rewrite plan', 5_000),
        chat('c-2', 'Auth token bug', 9_000),
        chat('c-3', 'Auth docs pass', 20_000),
      ],
      reply: 'ok',
    },
  } as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await setReducedMotion(page);
  await setTheme(page, theme, { settleMs: 200 });
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(page.getByTestId('companion-state-label')).toHaveText('Ready');
}

for (const theme of ['light', 'dark'] as const) {
  test(`ambiguity chips — ${theme}`, async ({ page }) => {
    await open(page, theme);
    const input = page.getByTestId('companion-input');
    await input.fill('open my chat about auth');
    await input.press('Enter');
    await expect(page.getByTestId('companion-choice')).toBeVisible();
    await page.mouse.move(900, 500);
    await page.getByTestId('companion-panel').screenshot({ path: shotPath(OUT, `chips-${theme}.png`) });
  });
}
