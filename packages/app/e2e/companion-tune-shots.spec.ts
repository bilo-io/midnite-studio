import { expect, test, type Page } from '@playwright/test';

import { installShotsBridge, setReducedMotion, setTheme, shotPath } from './shots-helper';

/**
 * Phase 109 Theme H — "tune me": Settings ▸ Companion's "Try: …" hints for
 * personality and About me, and the interview in the companion panel — the
 * first question, the read-back with the draft posted below it, and the
 * confirm-tier question before anything is written.
 *
 * Driven through the real input bar, so the grammar, `act()`, the interview
 * machine and the template fallback all run. The harness has no agent CLI
 * (its `companion.ask` answers "No agent CLI…"), so the draft is the
 * template's — the no-CLI path, Decision 6.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, matching every other
 * `*-shots.spec.ts` in this suite.
 */
const OUT = '../../docs/screenshots/p109-h';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to regenerate');
test.setTimeout(240_000);
expect.configure({ timeout: 60_000 });

async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const noop = () => {};
    // A synthesiser that finishes every line at once, so a spoken line never
    // holds the turn open waiting for an `end` event.
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
  await installShotsBridge(page, {});
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await setReducedMotion(page);
  await setTheme(page, 'dark', { settleMs: 200 });
}

async function openPanel(page: Page): Promise<void> {
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(page.getByTestId('companion-panel')).toBeVisible();
}

async function say(page: Page, text: string): Promise<void> {
  const input = page.getByTestId('companion-input');
  await input.fill(text);
  await input.press('Enter');
}

test('Settings ▸ Companion ▸ Personality — "Try: …" for personality and About me', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.mouse.move(900, 400);
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Companion', exact: true })
    .click();
  await expect(page.getByTestId('companion-enable')).toBeVisible();
  await page.getByRole('button', { name: 'Personality', exact: true }).first().click();
  await expect(page.getByTestId('companion-try-companionPersonality')).toBeVisible();
  await page.getByTestId('companion-try-companionAboutUser').scrollIntoViewIfNeeded();
  await page.screenshot({ path: shotPath(OUT, 'companion-tune-try-hints.png') });
});

test('"tune yourself" — the interview, the read-back and the confirm', async ({ page }) => {
  await open(page);
  await openPanel(page);

  await say(page, 'tune yourself');
  await expect(page.getByText(/what tone should I take/)).toBeVisible();
  await page.screenshot({ path: shotPath(OUT, 'companion-tune-first-question.png') });

  await say(page, 'Warm and a bit dry');
  await expect(page.getByText(/How much should I talk/)).toBeVisible();
  await say(page, 'Just the essentials');
  await expect(page.getByText(/How about humour/)).toBeVisible();
  await say(page, 'skip');
  await expect(page.getByText(/anything I should avoid/)).toBeVisible();
  await say(page, 'No jargon');
  await expect(page.getByText(/Want to hear all of it\?/)).toBeVisible();
  await page.screenshot({ path: shotPath(OUT, 'companion-tune-read-back.png') });

  await say(page, 'no');
  await expect(page.getByTestId('companion-pending-action')).toContainText('Replace my personality notes?');
  await page.screenshot({ path: shotPath(OUT, 'companion-tune-confirm.png') });
});
