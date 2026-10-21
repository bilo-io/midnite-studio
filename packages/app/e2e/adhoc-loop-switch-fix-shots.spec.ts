import { expect, test, type Page } from '@playwright/test';

import { fixtures, installMockBridge, type MockFixtures, setReducedMotion, setTheme } from './shots-helper';

/**
 * PR-body screenshots for the single tab-bar "Loop" switch: on (default) the
 * composed prompt starts with `/loop`, off it is a once-off run without it.
 * The composed prompt is not shown by the product, so each shot pins the
 * recorded `composedPrompt` as a caption in the page.
 *
 * Not assertions (`fab-loops.spec.ts` carries those). `MSTUDIO_SHOTS=1` to run.
 */
const OUT = '../../docs/screenshots/adhoc-loop-switch-fix';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.use({ viewport: { width: 1280, height: 900 } });

async function shoot(page: Page, theme: 'light' | 'dark', on: boolean): Promise<void> {
  await installMockBridge(page, fixtures as MockFixtures, { reposOpen: false });
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await setTheme(page, theme);
  await setReducedMotion(page);
  await page.getByRole('button', { name: 'Open quick access panel' }).click();
  await page.keyboard.press('l');
  await page.getByRole('button', { name: 'Patrol', exact: true }).click();
  const composer = page.getByTestId('loop-composer-watchdog');
  await expect(composer).toBeVisible();
  const toggle = page.getByRole('switch', { name: 'Loop' });
  if (on) await expect(toggle).toBeChecked();
  else await toggle.uncheck();
  await composer.getByTestId('loop-extras-send').click();
  const runs = () =>
    page.evaluate(() =>
      (
        window as unknown as { __mstudioLoopRuns: () => Array<Record<string, unknown>> }
      ).__mstudioLoopRuns(),
    );
  await expect.poll(async () => (await runs()).length).toBe(1);
  const prompt = String((await runs())[0]?.['composedPrompt'] ?? '').slice(0, 90);
  await page.evaluate((text) => {
    const caption = document.createElement('pre');
    caption.textContent = `composedPrompt: ${text}…`;
    caption.style.cssText =
      'position:fixed;left:16px;bottom:16px;z-index:99999;margin:0;padding:8px 12px;border-radius:6px;font:12px ui-monospace,monospace;background:#111;color:#e5e5e5;max-width:560px;white-space:pre-wrap';
    document.body.appendChild(caption);
  }, prompt);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/loop-${on ? 'on' : 'off'}-${theme}.png` });
}

for (const theme of ['light', 'dark'] as const) {
  test(`Loop switch on — ${theme}`, async ({ page }) => shoot(page, theme, true));
  test(`Loop switch off — ${theme}`, async ({ page }) => shoot(page, theme, false));
}
