import { test, expect, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Phase 35 screenshots — the FAB loop console in its three states.
 *
 * Not assertions (`fab-loops.spec.ts` carries those); these produce the PNGs
 * the phase's PR embeds, from the same mocked bridge the suite uses so the
 * picture is reproducible.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/p35-abcde';
/** Themes F–I's own shot, kept apart so a rerun of one slice does not rewrite the other's. */
const OUT_FGHI = '../../docs/screenshots/p35-fghi';
/** Phase 37's own shots, kept apart for the same reason. */
const OUT_P37 = '../../docs/screenshots/p37-fab-tab-glow';
/** The ad hoc rim rework of the Phase 37 inner glow — before/after pairs. */
const OUT_GLOW = '../../docs/screenshots/adhoc-fab-glow-edges';
/** The ad hoc dim-and-thicken pass over that rim — before/after pairs. */
const OUT_DIM = '../../docs/screenshots/adhoc-fab-glow-dim';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

async function open(page: Page): Promise<void> {
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

async function openFab(page: Page, tab?: string): Promise<void> {
  await page.getByRole('button', { name: 'Open quick access panel' }).click();
  await expect(page.getByRole('button', { name: 'Ideate', exact: true })).toBeVisible();
  if (tab) await page.getByRole('button', { name: tab, exact: true }).click();
  await page.waitForTimeout(400);
}

test('the composer, idle', async ({ page }) => {
  await open(page);
  await openFab(page, 'Patrol');
  await page.getByTestId('loop-composer-watchdog').getByRole('checkbox', { name: 'Answer feedback' }).check();
  await page.screenshot({ path: `${OUT}/composer-idle.png` });
});

test('a running loop — slim strip, glowing Stop, live dots', async ({ page }) => {
  await open(page);
  await openFab(page, 'Patrol');
  const composer = page.getByTestId('loop-composer-watchdog');
  await composer.getByRole('checkbox', { name: 'Answer feedback' }).check();
  await composer.getByPlaceholder('Extra instructions…').fill('Skip drafts.');
  await composer.getByTestId('loop-start').click();
  await expect(composer.getByTestId('loop-stop')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/loop-running.png` });
});

test('run history, expanded', async ({ page }) => {
  await open(page);
  await openFab(page, 'Patrol');
  const composer = page.getByTestId('loop-composer-watchdog');
  await composer.getByRole('checkbox', { name: 'Answer feedback' }).check();
  await composer.getByTestId('loop-start').click();
  await composer.getByTestId('loop-stop').click();

  const history = page.getByTestId('loop-history').nth(2);
  await history.getByRole('button', { name: /History \(1\)/ }).click();
  await history.getByRole('button', { name: /stopped/ }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/loop-history.png` });
});

test('Settings — the Loops section', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('navigation', { name: 'Settings pages' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Agent' })
    .click();
  await page.getByRole('button', { name: 'Loops' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/settings-loops.png` });
});

/**
 * Themes F–I ship no new UI, so there is no before/after to take. The one
 * surface they touch that has never been photographed is the waiting notice:
 * `useLoopAttention` pushes it into `toast-store` and the status bar's
 * `NotificationBell` is what renders it, so this is what "the loop is waiting
 * for you" actually looks like when the panel is shut.
 */
test('the waiting notice, in the bell', async ({ page }) => {
  await open(page);
  await openFab(page);
  await page.getByTestId('loop-composer-innovate').getByTestId('loop-start').click();
  await expect(page.getByTestId('loop-composer-innovate').getByTestId('loop-stop')).toBeVisible();

  // Left open deliberately: the shot is more use showing the glowing Stop and
  // the amber tab dot alongside the notice than showing the notice alone.

  await page.evaluate(() => {
    (
      window as unknown as {
        __mstudioPtyActivity: (p: string, a: string) => boolean;
      }
    ).__mstudioPtyActivity('pty-1', 'waiting');
  });

  await page.getByTestId('notification-bell').click();
  await expect(page.getByText('Ideate is waiting for input.')).toBeVisible();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT_FGHI}/waiting-notice.png` });
});

/**
 * Phase 37 — the tab-reactive inner glow, one shot per tab, in both themes.
 *
 * `900ms` clears the 0.5s arc sweep and lands the pulse partway through a
 * cycle rather than at a keyframe boundary, so the glow reads as it actually
 * looks rather than at a frame the animation happens to start on.
 */
for (const mode of ['light', 'dark'] as const) {
  test(`the FAB panel glow, per tab (${mode})`, async ({ page }) => {
    await open(page);
    if (mode === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'));
    await openFab(page);

    const panel = page.locator('.fab-panel-gradient');
    for (const tab of ['Ideate', 'Create', 'Patrol', 'Medic']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(900);
      await panel.screenshot({ path: `${OUT_P37}/${mode}-${tab.toLowerCase()}.png` });
    }
  });
}

test('the collapsed FAB carries the tab arc, and a waiting loop overrides it', async ({ page }) => {
  await open(page);
  await openFab(page, 'Medic');
  await page.getByTestId('loop-composer-medic').getByTestId('loop-start').click();
  await expect(page.getByTestId('loop-composer-medic').getByTestId('loop-stop')).toBeVisible();

  await page.getByRole('button', { name: 'Open quick access panel' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Open quick access panel' }).screenshot({
    path: `${OUT_P37}/collapsed-medic-running.png`,
  });

  await page.evaluate(() => {
    (window as unknown as { __mstudioPtyActivity: (p: string, a: string) => boolean }).__mstudioPtyActivity(
      'pty-1',
      'waiting',
    );
  });
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Open quick access panel' }).screenshot({
    path: `${OUT_P37}/collapsed-medic-waiting.png`,
  });
});

/**
 * Ad hoc — the inner glow as an even rim, before and after.
 *
 * "Before" is the shipped Phase 37 pseudo re-applied over the new one by an
 * injected stylesheet, rather than a checkout of the old tree: the single
 * radial mask whose first lit stop sat at 62%, at `z-index: 0` behind the
 * panel's children, with no stacking context on the host. Two states matter.
 * Idle shows the *shape* — corner smudges against an even rim — and running
 * shows the *stacking*: the opaque xterm that fills the pane covered the old
 * glow outright, where the rim now paints over it.
 */
const BEFORE_CSS = `
  .fab-panel-gradient { isolation: auto !important; }
  .fab-panel-gradient::before {
    z-index: 0 !important;
    opacity: 0.55 !important;
    animation: fab-panel-spin 4s linear infinite !important;
    mask-image: radial-gradient(ellipse 100% 100% at 50% 50%, transparent 0%, transparent 62%, rgba(0, 0, 0, 0.55) 82%, #000 100%) !important;
    -webkit-mask-image: radial-gradient(ellipse 100% 100% at 50% 50%, transparent 0%, transparent 62%, rgba(0, 0, 0, 0.55) 82%, #000 100%) !important;
  }
`;

for (const mode of ['light', 'dark'] as const) {
  for (const variant of ['before', 'after'] as const) {
    test(`the inner glow rim, ${variant} (${mode})`, async ({ page }) => {
      await open(page);
      if (mode === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'));
      if (variant === 'before') await page.addStyleTag({ content: BEFORE_CSS });
      await openFab(page, 'Ideate');
      const panel = page.locator('.fab-panel-gradient');

      await page.waitForTimeout(900);
      await panel.screenshot({ path: `${OUT_GLOW}/${mode}-idle-${variant}.png` });

      await page.getByRole('button', { name: 'Patrol', exact: true }).click();
      const composer = page.getByTestId('loop-composer-watchdog');
      await composer.getByRole('checkbox', { name: 'Answer feedback' }).check();
      await composer.getByTestId('loop-start').click();
      await expect(composer.getByTestId('loop-stop')).toBeVisible();
      await page.waitForTimeout(900);
      await panel.screenshot({ path: `${OUT_GLOW}/${mode}-running-${variant}.png` });
    });
  }
}

/**
 * Ad hoc — the rim dimmed by 40% and the ring thickened, before and after.
 *
 * "Before" is the pair of numbers this change replaces, re-applied over the
 * new ones by an injected stylesheet: `border-width: 1.5px` and the
 * `0.62 -> 0.92` pulse. Both shots are taken under `data-motion='reduced'`,
 * which stops the pulse *and* the rotation, so each pair differs only in the
 * two numbers under test rather than in whichever frame the two animations
 * happened to be on — the rim rests at its own base opacity (0.62 before,
 * 0.37 after) and the arc rests at the same angle in both.
 */
const BEFORE_DIM_CSS = `
  .fab-panel-gradient { border-width: 1.5px !important; }
  .fab-panel-gradient::before { opacity: 0.62 !important; }
`;

for (const mode of ['light', 'dark'] as const) {
  for (const variant of ['before', 'after'] as const) {
    test(`the dimmed rim and thicker ring, ${variant} (${mode})`, async ({ page }) => {
      await open(page);
      if (mode === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'));
      if (variant === 'before') await page.addStyleTag({ content: BEFORE_DIM_CSS });
      await openFab(page, 'Ideate');
      await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'reduced'));
      await page.waitForTimeout(300);

      const panel = page.locator('.fab-panel-gradient');
      await panel.screenshot({ path: `${OUT_DIM}/${mode}-idle-${variant}.png` });
    });
  }
}
