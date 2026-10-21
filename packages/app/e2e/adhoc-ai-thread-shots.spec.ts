import { expect, test, type Page } from '@playwright/test';

import { installShotsBridge, shotPath } from './shots-helper';

/**
 * Shared AI thread frame (ad hoc) — the Companion's thread wearing the Loops
 * arc glow while a turn is in flight. Needs a real browser: the glow is a
 * blurred conic gradient, i.e. paint jsdom does not do. The class toggle itself
 * is a vitest (`components/ai-thread/ai-thread.test.tsx`); here the loading
 * attributes are forced on the frame so the CSS can be photographed.
 *
 * Run with `MSTUDIO_SHOTS=1`.
 */
const OUT = '../../docs/screenshots/adhoc-ai-thread';
test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const noop = () => {};
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak: noop, cancel: noop, pause: noop, resume: noop, getVoices: () => [], addEventListener: noop, removeEventListener: noop, speaking: false, pending: false, paused: false },
    });
    const stored = localStorage.getItem('midnite-studio.ui');
    const persisted = stored ? JSON.parse(stored) : { version: 12 };
    persisted.state = { ...persisted.state, companionEnabled: true };
    localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
  });
  await installShotsBridge(page, {});
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-motion', 'full');
  });
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(page.getByTestId('companion-panel')).toBeVisible();
}

test('companion thread frame while loading', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  await page.evaluate(() => {
    const frame = document.querySelector('[data-testid="companion-thread-frame"]')!;
    frame.classList.add('gradient-frame');
    frame.setAttribute('data-loops-running', 'true');
    frame.setAttribute('data-loop-state', 'thinking');
  });
  await page.waitForTimeout(600);
  await page.getByTestId('companion-panel').screenshot({ path: shotPath(OUT, 'companion-thread-loading.png') });
});
