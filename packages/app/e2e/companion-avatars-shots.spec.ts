import { expect, test, type Page } from '@playwright/test';
import { installShotsBridge, setReducedMotion, setTheme, shotPath } from './shots-helper';

const OUT = '../../docs/screenshots/companion-avatars';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to regenerate');

async function open(
  page: Page,
  options?: { enabled?: boolean; reducedMotion?: boolean },
): Promise<void> {
  await page.addInitScript(
    (enabled: boolean) => {
      const noop = () => {};
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          speak: noop,
          cancel: noop,
          getVoices: () => [],
          addEventListener: noop,
          removeEventListener: noop,
        },
      });
      try {
        const stored = localStorage.getItem('midnite-studio.ui');
        const persisted = stored ? JSON.parse(stored) : { version: 12 };
        persisted.state = {
          ...persisted.state,
          companionEnabled: enabled,
          forgeAccounts: [
            {
              id: 'acc-1',
              provider: 'github',
              login: 'bilo',
              displayName: 'Bilo Lwabona',
              avatarUrl: null,
            },
          ],
          forgeActiveAccountId: 'acc-1',
        };
        localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
      } catch {
        /* Unparseable profile — the app discards it too. */
      }
    },
    options?.enabled ?? true,
  );
  await installShotsBridge(page, {});
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  if (options?.reducedMotion !== false) await setReducedMotion(page);
}

async function openCompanion(page: Page): Promise<void> {
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(page.getByTestId('companion-panel')).toBeVisible();
}

async function seedTranscript(page: Page): Promise<void> {
  const input = page.getByTestId('companion-input');
  await input.fill('show the latest branch changes');
  await input.press('Enter');
  await expect(page.getByTestId('companion-thread')).toContainText('branch changes');
}

test('companion thread avatars — dark and light', async ({ page }) => {
  await open(page);
  await openCompanion(page);
  await seedTranscript(page);

  const panel = page.getByTestId('companion-panel');
  await expect(panel.getByTestId('companion-user-avatar')).toBeVisible();
  await expect(panel.getByTestId('companion-agent-avatar').first()).toBeVisible();

  await setTheme(page, 'dark', { settleMs: 200 });
  await page.screenshot({ path: shotPath(OUT, 'companion-avatars-dark.png'), clip: (await panel.boundingBox()) ?? undefined });

  await setTheme(page, 'light', { settleMs: 200 });
  await page.screenshot({ path: shotPath(OUT, 'companion-avatars-light.png'), clip: (await panel.boundingBox()) ?? undefined });
});
