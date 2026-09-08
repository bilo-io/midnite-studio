import { expect, test, type Page } from '@playwright/test';

import { installShotsBridge, setReducedMotion, setTheme, shotPath } from './shots-helper';

/**
 * The committed screenshots for Phase 79 Themes C + H — the companion panel,
 * the quick-access popover with its companion strip, Settings ▸ Companion, and
 * the FAB in each of Theme H's four looks.
 *
 * The FAB shots set `data-companion-state` on the button **directly**, rather
 * than driving the state machine to each value. Three of the four states are
 * only reachable through machinery Themes D–G own (a hand-off, a recorder, a
 * speaker), and what these frames are photographing is the CSS in
 * `styles.css` — the attribute is the whole input to it. React manages that
 * attribute only when the prop changes, and the prop is `undefined` in a
 * resting app, so a manual `setAttribute` survives until something else moves.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, matching every other
 * `*-shots.spec.ts` in this suite.
 */
const OUT = '../../docs/screenshots/p79-ch';

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
        persisted.state = { ...persisted.state, companionEnabled: enabled };
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
  // After `goto`, not before: `setReducedMotion` writes an attribute on a
  // document that has to exist first.
  if (options?.reducedMotion !== false) await setReducedMotion(page);
}

async function openCompanion(page: Page): Promise<void> {
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(page.getByTestId('companion-panel')).toBeVisible();
}

/** A short conversation, through the real input bar rather than the store. */
async function seedTranscript(page: Page): Promise<void> {
  const input = page.getByTestId('companion-input');
  await input.fill('start an adhoc task on the graph lanes');
  await input.press('Enter');
  await expect(page.getByTestId('companion-thread')).toContainText('graph lanes');
}

test('companion panel, light and dark', async ({ page }) => {
  await open(page);
  await openCompanion(page);
  await seedTranscript(page);

  await setTheme(page, 'light', { settleMs: 200 });
  await page.screenshot({ path: shotPath(OUT, 'companion-panel-light.png') });

  await setTheme(page, 'dark', { settleMs: 200 });
  await page.screenshot({ path: shotPath(OUT, 'companion-panel-dark.png') });
});

test('companion beside the Loops panel', async ({ page }) => {
  await open(page);
  await openCompanion(page);
  await seedTranscript(page);
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('l');
  await expect(page.getByRole('button', { name: 'Guard', exact: true })).toBeVisible();

  await setTheme(page, 'dark', { settleMs: 200 });
  await page.screenshot({ path: shotPath(OUT, 'companion-and-loops-dark.png') });
});

test('quick-access popover — companion strip, off and on', async ({ page }) => {
  await open(page, { enabled: false });
  await setTheme(page, 'dark', { settleMs: 200 });
  await page.keyboard.press('Meta+l');
  await expect(page.getByTestId('quick-access-menu')).toBeVisible();
  await page.screenshot({ path: shotPath(OUT, 'popover-companion-off.png') });
});

test('quick-access popover with the companion live', async ({ page }) => {
  await open(page);
  await openCompanion(page);
  await seedTranscript(page);
  await setTheme(page, 'dark', { settleMs: 200 });
  await page.keyboard.press('Meta+l');
  await expect(page.getByTestId('quick-access-menu')).toBeVisible();
  await page.screenshot({ path: shotPath(OUT, 'popover-companion-on.png') });
});

test('Settings ▸ Companion', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Companion', exact: true })
    .click();
  await expect(page.getByTestId('companion-enable')).toBeVisible();
  // Every accordion open, so one frame shows the whole page rather than five
  // collapsed headers.
  for (const title of ['Voice', 'Microphone', 'Hands-free run', 'Personality']) {
    await page.getByRole('button', { name: title, exact: true }).first().click();
  }
  await setTheme(page, 'dark', { settleMs: 200 });
  await page.screenshot({ path: shotPath(OUT, 'settings-companion.png'), fullPage: true });
});

test('the FAB in each companion look', async ({ page }) => {
  // Motion ON here, unlike every other shot in this file: three of the four
  // looks ARE animations, and a reduced-motion frame would photograph the
  // static fallback instead of the thing being added.
  await open(page, { reducedMotion: false });
  await setTheme(page, 'dark', { settleMs: 200 });

  const fab = page.getByTestId('fab-button');
  const box = await fab.boundingBox();
  if (!box) throw new Error('no FAB on screen');
  const clip = {
    x: box.x - 28,
    y: box.y - 28,
    width: box.width + 56,
    height: box.height + 56,
  };

  for (const state of ['listening', 'thinking', 'handoff', 'speaking'] as const) {
    await page.evaluate((next) => {
      const button = document.querySelector('[data-testid="fab-button"]');
      button?.setAttribute('data-companion-state', next);
      // The `speaking` look reads `--companion-level` off the root element,
      // which is exactly how Theme F's speaker will drive it — so the shot
      // sets it the same way, at a mid-word peak.
      document.documentElement.style.setProperty('--companion-level', next === 'speaking' ? '0.8' : '0');
    }, state);
    await page.waitForTimeout(400);
    await page.screenshot({ path: shotPath(OUT, `fab-${state}.png`), clip });
  }

  // And the reduced-motion fallback for the one that moves most, which is what
  // Phase 46's policy actually promises a user who asked for stillness.
  await setReducedMotion(page);
  await page.evaluate(() => {
    document.querySelector('[data-testid="fab-button"]')?.setAttribute(
      'data-companion-state',
      'thinking',
    );
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: shotPath(OUT, 'fab-thinking-reduced-motion.png'), clip });
});

/** Phase 80 Theme D — the companion-names pill editor, three states. */
const P80D_OUT = '../../docs/screenshots/p80-d';

async function openCompanionSettingsPersonality(page: Page): Promise<void> {
  await open(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Companion', exact: true })
    .click();
  await expect(page.getByTestId('companion-enable')).toBeVisible();
  await page.getByRole('button', { name: 'Personality', exact: true }).first().click();
  await expect(page.getByTestId('companion-names-pills')).toBeVisible();
  await setTheme(page, 'dark', { settleMs: 200 });
}

test('Settings ▸ Companion ▸ Personality — name pills, fresh install', async ({ page }) => {
  await openCompanionSettingsPersonality(page);
  // Fresh install: one pill (the pre-existing hardcoded default), empty entry field.
  await page.screenshot({ path: shotPath(P80D_OUT, 'names-empty.png') });
});

test('Settings ▸ Companion ▸ Personality — several pills', async ({ page }) => {
  await openCompanionSettingsPersonality(page);
  const input = page.getByTestId('companion-names-input');
  for (const name of ['Jarvis', 'Kit']) {
    await input.fill(name);
    await input.press('Enter');
  }
  await expect(page.getByTestId('companion-names-pills')).toContainText('Jarvis');
  await page.screenshot({ path: shotPath(P80D_OUT, 'names-several.png') });
});

test('Settings ▸ Companion ▸ Personality — last pill cannot be removed', async ({ page }) => {
  await openCompanionSettingsPersonality(page);
  // Down to the one default pill — its remove control is explained-disabled.
  const remove = page.getByRole('button', { name: 'Remove "Companion"' });
  await remove.hover();
  // `Tooltip`'s own open delay (400ms) — long enough that a sweeping pointer
  // doesn't pop one, so the shot has to wait for it deliberately.
  await page.waitForTimeout(600);
  await page.screenshot({ path: shotPath(P80D_OUT, 'names-last-pill.png') });
});
