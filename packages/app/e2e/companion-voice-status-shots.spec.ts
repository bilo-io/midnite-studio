import { expect, test, type Page } from '@playwright/test';

import { installShotsBridge, setReducedMotion, setTheme, shotPath } from './shots-helper';

/**
 * The committed screenshots for Phase 80 Theme C's follow-up — Settings ▸
 * Companion ▸ Voice's new status block, in the three states a user actually
 * hits: the local voice active, a fallback with its reason, and the one-time
 * download in progress.
 *
 * `mock-bridge.ts`'s default `companion.ttsStatus` answers
 * `'native-module-missing'` (a harness genuinely has none), which is the
 * `download-failed` shot's starting point too — each test monkeypatches
 * `window.midniteStudio.companion.ttsStatus` after `goto`, the same way
 * `companion-shots.spec.ts` patches `window.speechSynthesis`, rather than
 * widening the shared fixture for three specs.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, matching every other
 * `*-shots.spec.ts` in this suite.
 */
const OUT = '../../docs/screenshots/p80-c-voice-ui';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to regenerate');

type TtsStatusValue = {
  engine: 'local' | 'system';
  voice: 'idle' | 'downloading' | 'ready' | 'failed';
  reason: 'native-module-missing' | 'download-failed' | 'synthesis-error' | null;
  message: string | null;
};

async function openVoiceSection(page: Page, status: TtsStatusValue): Promise<void> {
  await installShotsBridge(page, {});
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await setReducedMotion(page);

  await page.evaluate((value: TtsStatusValue) => {
    const bridge = window.midniteStudio;
    if (bridge?.companion) {
      bridge.companion.ttsStatus = () => Promise.resolve({ ok: true, value });
    }
  }, status);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Companion', exact: true })
    .click();
  await expect(page.getByTestId('companion-enable')).toBeVisible();
  // Voice is `defaultOpen` (`companion-page.tsx`), so it's already expanded —
  // clicking its header would toggle it *closed*.
  await expect(page.getByTestId('companion-voice-status')).toBeVisible();
  await setTheme(page, 'dark', { settleMs: 200 });
}

test('Settings ▸ Companion ▸ Voice — local voice active', async ({ page }) => {
  await openVoiceSection(page, {
    engine: 'local',
    voice: 'ready',
    reason: null,
    message: null,
  });
  await expect(page.getByTestId('companion-voice-status')).toContainText(
    'Speaking with the local offline voice',
  );
  await page.screenshot({ path: shotPath(OUT, 'local-voice-active.png'), fullPage: true });
});

test('Settings ▸ Companion ▸ Voice — fallback with reason, and a Retry', async ({ page }) => {
  await openVoiceSection(page, {
    engine: 'system',
    voice: 'failed',
    reason: 'download-failed',
    message: 'HTTP 503',
  });
  await expect(page.getByTestId('companion-voice-status')).toContainText(
    'Could not download the local voice',
  );
  await expect(page.getByTestId('companion-voice-retry')).toBeVisible();
  await page.screenshot({ path: shotPath(OUT, 'fallback-with-reason.png'), fullPage: true });
});

test('Settings ▸ Companion ▸ Voice — downloading the one-time voice', async ({ page }) => {
  await openVoiceSection(page, {
    engine: 'system',
    voice: 'downloading',
    reason: null,
    message: null,
  });
  await expect(page.getByTestId('companion-voice-status')).toContainText(
    'Downloading the local offline voice',
  );
  await page.screenshot({ path: shotPath(OUT, 'downloading.png'), fullPage: true });
});
