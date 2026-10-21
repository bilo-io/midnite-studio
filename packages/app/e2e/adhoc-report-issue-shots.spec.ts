import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, setTheme, settle } from './shots-helper';

/**
 * Ad hoc screenshots of the report-an-issue dialog opened the new way — `app.reportIssue` from the
 * command palette — with `gh` signed in and without it, for the PR body. Run with
 * `MSTUDIO_SHOTS=1`; skipped otherwise.
 *
 * `report.bundle` is patched in a second `addInitScript` so the diagnostics block shows a realistic,
 * already-redacted log tail instead of the mock's empty string.
 */
const OUT = '../../docs/screenshots/adhoc-report-issue';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 60_000 });

async function openFromPalette(page: Page, cli: 'ready' | 'not-installed'): Promise<void> {
  await installMockBridge(page, {
    ...fixtures,
    forge: { cli: { reason: cli, hint: cli === 'ready' ? '' : 'The GitHub CLI (gh) is not installed.' } },
  });
  await page.addInitScript(() => {
    const w = window as unknown as { midniteStudio: { report: Record<string, unknown> } };
    w.midniteStudio.report = {
      ...w.midniteStudio.report,
      bundle: async () => ({
        text: [
          'midnite-studio 0.0.3 (darwin arm64, electron 39)',
          '2026-10-21T09:40:12.031Z INFO agents: roster ready (claude, codex)',
          '2026-10-21T09:40:15.442Z ERROR chat: Could not run Claude. The command is no longer on disk.',
        ].join('\n'),
      }),
    };
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('banner', { name: 'Window title bar' })).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Meta+k');
  const palette = page.getByRole('dialog', { name: 'Command Palette' });
  await palette.getByRole('combobox', { name: 'Command palette search' }).fill('Report an Issue');
  await expect(palette.getByRole('option', { name: /Report an Issue/ })).toBeVisible();
  await page.keyboard.press('Enter');
  const dialog = page.getByTestId('report-issue-dialog');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByLabel('Title').fill('[bug] Agents: chat says Claude is no longer on disk');
  await dialog
    .getByLabel('What happened?')
    .fill('Opened Midnite Agents from the launcher and sent a chat to Claude. It failed straight away.');
  await expect(page.getByTestId('report-issue-diagnostics')).toBeVisible();
}

test('gh signed in (dark)', async ({ page }) => {
  await openFromPalette(page, 'ready');
  await setTheme(page, 'dark', { settleMs: 200 });
  await settle(page);
  await page.getByTestId('report-issue-dialog').screenshot({ path: `${OUT}/gh-ready-dark.png` });
});

test('no gh — Continue on GitHub (light)', async ({ page }) => {
  await openFromPalette(page, 'not-installed');
  await setTheme(page, 'light', { settleMs: 200 });
  await settle(page);
  await page.getByTestId('report-issue-dialog').screenshot({ path: `${OUT}/no-gh-light.png` });
});
