import { expect, test, type Page } from '@playwright/test';

import { installShotsBridge, setReducedMotion, setTheme, shotPath } from './shots-helper';

/**
 * Phase 109 Theme G: Settings ▸ Companion ▸ Profiles — three saved persona
 * profiles, Narrator active and modified (what it calls you was edited after
 * it was saved), in light and dark, plus the delete confirm.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, matching every other
 * `*-shots.spec.ts` in this suite. The repos panel is closed by
 * `installMockBridge`'s shots default.
 */
const OUT = '../../docs/screenshots/p109-g';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to regenerate');

const PROFILES = [
  {
    id: 'p-narrator',
    name: 'Narrator',
    voices: { local: 'bm_george', system: null },
    personality: 'Measured and warm, a little theatrical — reads a commit log like a bedtime story.',
    honorifics: ['friend'],
    createdAt: '2026-10-08T09:00:00.000Z',
  },
  {
    id: 'p-pirate',
    name: 'Pirate Captain',
    voices: { local: 'am_adam', system: null },
    personality: 'Arr. Every merge is plunder.',
    honorifics: ['matey'],
    createdAt: '2026-10-09T09:00:00.000Z',
  },
  {
    id: 'p-owl',
    name: 'Night Owl',
    voices: { local: 'bf_emma', system: null },
    personality: 'Quiet and brief after ten.',
    honorifics: [],
    createdAt: '2026-10-10T09:00:00.000Z',
  },
];

async function openProfiles(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((profiles) => {
    try {
      const stored = localStorage.getItem('midnite-studio.ui');
      const persisted = stored ? JSON.parse(stored) : { version: 32 };
      persisted.version = 32;
      persisted.state = {
        ...persisted.state,
        companionEnabled: true,
        companionProfiles: profiles,
        companionActiveProfile: 'p-narrator',
        companionVoices: { local: 'bm_george', system: null },
        companionPersonality: profiles[0]?.personality ?? '',
        // Edited after Narrator was saved — the modified dot.
        companionHonorifics: ['friend', 'boss'],
      };
      localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
    } catch {
      /* Unparseable profile — the app discards it too. */
    }
  }, PROFILES);
  await installShotsBridge(page, {});
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await setReducedMotion(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  // Hovering the rail expands it over the settings nav; move off it first.
  await page.mouse.move(900, 500);
  await page.waitForTimeout(300);
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Companion', exact: true })
    .click();
  await expect(page.getByTestId('companion-enable')).toBeVisible();
  await page.getByRole('button', { name: 'Profiles', exact: true }).first().click();
  await expect(page.getByTestId('companion-profiles-list')).toBeVisible();
  await page.getByTestId('companion-try-profiles').scrollIntoViewIfNeeded();
  await setTheme(page, theme, { settleMs: 250 });
}

for (const theme of ['light', 'dark'] as const) {
  test(`Settings ▸ Companion ▸ Profiles — the list, ${theme}`, async ({ page }) => {
    await openProfiles(page, theme);
    await expect(page.getByTestId('companion-profile-modified')).toBeVisible();
    await page.screenshot({ path: shotPath(OUT, `profiles-section-${theme}.png`) });
  });
}

test('Settings ▸ Companion ▸ Profiles — Delete asks first', async ({ page }) => {
  await openProfiles(page, 'dark');
  await page.getByTestId('companion-profile-delete-p-pirate').click();
  await expect(page.getByText('Delete the Pirate Captain profile?')).toBeVisible();
  await page.screenshot({ path: shotPath(OUT, 'profiles-delete-confirm-dark.png') });
});
