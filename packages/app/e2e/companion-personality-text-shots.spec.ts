import { expect, test, type Page } from '@playwright/test';

import { installShotsBridge, setReducedMotion, setTheme, shotPath } from './shots-helper';

/**
 * Ad Hoc: Settings ▸ Companion ▸ Personality's two new free-text fields —
 * "Personality" ("About the companion") and "About me" — sitting beside the
 * "What you call it"/"What it calls you" pill fields, and the
 * gradient-border-on-focus halo `TextArea`'s new `gradient` prop puts on
 * them (matching `notes-modal.tsx`'s composer).
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, matching every other
 * `*-shots.spec.ts` in this suite.
 */
const OUT = '../../docs/screenshots/adhoc-companion-personality';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to regenerate');

async function open(page: Page): Promise<void> {
  // Companion on, so the two new fields render enabled rather than
  // greyed-out — same trick `companion-shots.spec.ts`'s own `open()` uses.
  await page.addInitScript(() => {
    try {
      const stored = localStorage.getItem('midnite-studio.ui');
      const persisted = stored ? JSON.parse(stored) : { version: 17 };
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
}

async function openPersonality(page: Page): Promise<void> {
  await open(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Companion', exact: true })
    .click();
  await expect(page.getByTestId('companion-enable')).toBeVisible();
  await page.getByRole('button', { name: 'Personality', exact: true }).first().click();
  // Not `getByLabel`: the accordion region carries the identical
  // `aria-label="Personality"` its trigger button does, so a label query
  // alone is ambiguous between it and the textarea. The textbox role narrows
  // to the one control that actually has that name.
  await expect(page.getByRole('textbox', { name: 'Personality' })).toBeVisible();
  await setTheme(page, 'dark', { settleMs: 200 });
}

test('Settings ▸ Companion ▸ Personality — the two free-text fields, empty', async ({ page }) => {
  await openPersonality(page);
  // The settings page scrolls its own inner pane rather than the document,
  // so `fullPage` alone would still crop below the fold — scroll "About me"
  // into view so one frame shows both new fields, not just "Personality".
  await page.getByRole('textbox', { name: 'About me' }).scrollIntoViewIfNeeded();
  // Fresh install: both fields empty, disabled=false since companion is on.
  await page.screenshot({ path: shotPath(OUT, 'personality-text-fields-empty.png') });
});

test('Settings ▸ Companion ▸ Personality — "About the companion" focused, gradient border', async ({
  page,
}) => {
  await openPersonality(page);
  const personality = page.getByRole('textbox', { name: 'Personality' });
  await personality.fill('Dry, terse, never uses an exclamation point.');
  await personality.focus();
  await page.screenshot({ path: shotPath(OUT, 'personality-text-field-focused.png') });
});
