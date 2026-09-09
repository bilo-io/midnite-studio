import { expect, test, type Page } from '@playwright/test';

import { installShotsBridge, setReducedMotion, setTheme, shotPath } from './shots-helper';

/**
 * The committed screenshots for Ad Hoc: the microphone must work with no
 * API key. Settings ▸ Companion ▸ Microphone's new default — the key-free
 * offline engine, its own status block in the three states a user actually
 * hits — plus the opt-in cloud provider it replaced as the default.
 *
 * Mirrors `companion-voice-status-shots.spec.ts`'s own shape exactly: each
 * test monkeypatches `window.midniteStudio.companion.sttStatus` after
 * `goto`, rather than widening the shared mock bridge for four specs.
 */
const OUT = '../../docs/screenshots/adhoc-companion-stt';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to regenerate');

type LocalModelStatus = {
  state: 'idle' | 'downloading' | 'ready' | 'failed';
  reason: 'native-module-missing' | 'download-failed' | 'recognition-error' | null;
  message: string | null;
};

async function openMicrophoneSection(page: Page, localModel: LocalModelStatus): Promise<void> {
  // The provider picker and Test are gated on `companionEnabled` — seeded
  // here the same way `companion-shots.spec.ts`'s own `open()` does, since
  // this spec never opens the companion panel to flip it another way.
  await page.addInitScript(() => {
    try {
      const stored = localStorage.getItem('midnite-studio.ui');
      const persisted = stored ? JSON.parse(stored) : { version: 12 };
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

  await page.evaluate((value: LocalModelStatus) => {
    const bridge = window.midniteStudio;
    if (bridge?.companion) {
      bridge.companion.sttStatus = () =>
        Promise.resolve({
          configured: [],
          encryptionAvailable: true,
          implemented: ['whisper-local', 'openai-whisper'],
          localModel: value,
        });
    }
  }, localModel);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Companion', exact: true })
    .click();
  await expect(page.getByTestId('companion-enable')).toBeVisible();
  await page.getByRole('button', { name: 'Microphone', exact: true }).click();
  const localStatus = page.getByTestId('companion-stt-local-status');
  await expect(localStatus).toBeVisible();
  // The Microphone accordion sits below the fold in an internally-scrolling
  // pane, not the document body — `fullPage` screenshots only capture the
  // latter, so this scrolls the status block itself into view instead.
  await localStatus.scrollIntoViewIfNeeded();
  await setTheme(page, 'dark', { settleMs: 200 });
}

test('Settings ▸ Companion ▸ Microphone — the offline engine ready, no key at all', async ({
  page,
}) => {
  await openMicrophoneSection(page, { state: 'ready', reason: null, message: null });
  await expect(page.getByTestId('companion-stt-local-status')).toContainText(
    'transcribes entirely on this machine',
  );
  await page.screenshot({ path: shotPath(OUT, 'local-engine-ready.png') });
});

test('Settings ▸ Companion ▸ Microphone — downloading the one-time offline model', async ({
  page,
}) => {
  await openMicrophoneSection(page, { state: 'downloading', reason: null, message: null });
  await expect(page.getByTestId('companion-stt-local-status')).toContainText('Downloading');
  await page.screenshot({ path: shotPath(OUT, 'local-engine-downloading.png') });
});

test('Settings ▸ Companion ▸ Microphone — a failed download, with Retry', async ({ page }) => {
  await openMicrophoneSection(page, {
    state: 'failed',
    reason: 'download-failed',
    message: 'HTTP 503',
  });
  await expect(page.getByTestId('companion-stt-local-status')).toContainText(
    'Could not download',
  );
  await expect(page.getByTestId('companion-stt-local-retry')).toBeVisible();
  await page.screenshot({ path: shotPath(OUT, 'local-engine-download-failed.png') });
});

test('Settings ▸ Companion ▸ Microphone — switched to the opt-in cloud provider', async ({
  page,
}) => {
  await openMicrophoneSection(page, { state: 'ready', reason: null, message: null });
  await page.getByTestId('companion-stt-provider').selectOption('openai-whisper');
  await expect(page.getByTestId('companion-stt-key')).toBeVisible();
  await page.screenshot({ path: shotPath(OUT, 'cloud-provider-opt-in.png') });
});
