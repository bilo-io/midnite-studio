import { expect, test } from '@playwright/test';

import { installShotsBridge, setReducedMotion, setTheme, shotPath } from './shots-helper';

/**
 * Ad hoc: Settings ▸ Accounts' "Add an account" provider picker, brand-
 * coloured (`accounts-page.tsx`'s `ForgeProviderPicker`, `PROVIDER_BRAND_COLOR`
 * in the same file). One frame per theme with GitLab selected — GitLab keeps
 * its dark and light values equal, so the light-mode frame stands in for
 * Bitbucket/Azure DevOps too; the point of the dark-mode frame is GitHub's
 * near-black (#181717) swapping for its light fallback (#f0f6fc) rather than
 * vanishing against the app's dark surface.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, matching every other
 * `*-shots.spec.ts` in this suite. Not part of the visual-regression budget —
 * `scripts/e2e-budget.mjs` excludes every `-shots.spec.ts` file.
 */
const OUT = '../../docs/screenshots/adhoc-forge-provider-colors';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

async function openAccountsPicker(page: import('@playwright/test').Page): Promise<void> {
  await installShotsBridge(page, {});
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await setReducedMotion(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Accounts', exact: true })
    .click();
  await page.getByRole('radiogroup', { name: 'Provider' }).waitFor();
  // GitHub is the default selection; GitLab shows the picker with a
  // non-default provider highlighted too, in one frame.
  await page.getByRole('radio', { name: 'GitLab' }).click();
}

test('Settings ▸ Accounts — provider picker, light', async ({ page }) => {
  await openAccountsPicker(page);
  await setTheme(page, 'light', { settleMs: 150 });
  await page
    .getByRole('radiogroup', { name: 'Provider' })
    .screenshot({ path: shotPath(OUT, 'provider-picker-light.png') });
});

test('Settings ▸ Accounts — provider picker, dark', async ({ page }) => {
  await openAccountsPicker(page);
  await setTheme(page, 'dark', { settleMs: 150 });
  await page
    .getByRole('radiogroup', { name: 'Provider' })
    .screenshot({ path: shotPath(OUT, 'provider-picker-dark.png') });
});
