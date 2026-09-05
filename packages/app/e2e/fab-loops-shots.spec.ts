import { test, expect, type Page } from '@playwright/test';

import {
  fixtures,
  installMockBridge,
  type MockFixtures,
  setReducedMotion,
  setTheme,
  shotPath,
} from './shots-helper';

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
/** The ad hoc pass that cut the rim to the ring's arc — before/after pairs. */
const OUT_ARC = '../../docs/screenshots/adhoc-fab-glow-arc';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

async function open(page: Page): Promise<void> {
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

async function openFab(page: Page, tab?: string): Promise<void> {
  // The FAB opens the quick-access menu (Phase 58 Theme E); its `L` row opens
  // the Loops panel this helper is actually after.
  await page.getByRole('button', { name: 'Open quick access panel' }).click();
  await page.keyboard.press('l');
  await expect(page.getByRole('button', { name: 'Guard', exact: true })).toBeVisible();
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
  await expect(page.getByText('Concepts is waiting for input.')).toBeVisible();
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
    if (mode === 'dark') await setTheme(page, 'dark');
    await openFab(page);

    const panel = page.locator('.fab-panel-gradient');
    for (const tab of ['Guard', 'Concepts', 'Develop', 'Patrol', 'Medic', 'Overhaul']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(900);
      await panel.screenshot({ path: shotPath(OUT_P37, `${mode}-${tab.toLowerCase()}.png`) });
    }
  });
}

test('the collapsed FAB carries the tab arc, and a waiting loop overrides it', async ({ page }) => {
  await open(page);
  await openFab(page, 'Medic');
  await page.getByTestId('loop-composer-medic').getByTestId('loop-start').click();
  await expect(page.getByTestId('loop-composer-medic').getByTestId('loop-stop')).toBeVisible();

  await page.getByRole('button', { name: 'Close quick access panel' }).click();
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
      if (mode === 'dark') await setTheme(page, 'dark');
      if (variant === 'before') await page.addStyleTag({ content: BEFORE_CSS });
      await openFab(page, 'Guard');
      const panel = page.locator('.fab-panel-gradient');

      await page.waitForTimeout(900);
      await panel.screenshot({ path: shotPath(OUT_GLOW, `${mode}-idle-${variant}.png`) });

      await page.getByRole('button', { name: 'Patrol', exact: true }).click();
      const composer = page.getByTestId('loop-composer-watchdog');
      await composer.getByRole('checkbox', { name: 'Answer feedback' }).check();
      await composer.getByTestId('loop-start').click();
      await expect(composer.getByTestId('loop-stop')).toBeVisible();
      await page.waitForTimeout(900);
      await panel.screenshot({ path: shotPath(OUT_GLOW, `${mode}-running-${variant}.png`) });
    });
  }
}

/**
 * Ad hoc — the rim dimmed and narrowed, the ring thickened; before and after.
 *
 * "Before" is the three numbers this change replaces, re-applied over the new
 * ones by an injected stylesheet: `border-width: 1.5px`, the pulse's `0.62`
 * trough, and the 40px band it rested at. Both shots are taken under
 * `data-motion='reduced'`, which stops the pulse *and* the rotation, so each
 * pair differs only in those numbers rather than in whichever frame the two
 * animations happened to be on — the rim rests at its own base opacity
 * (0.62 before, 0.50 after) and its resting width (40px before, 30px after),
 * and the arc rests at the same angle in both.
 */
const BEFORE_DIM_CSS = `
  .fab-panel-gradient { border-width: 1.5px !important; }
  .fab-panel-gradient::before {
    opacity: 0.62 !important;
    --fab-glow-edge: 40px !important;
  }
`;

for (const mode of ['light', 'dark'] as const) {
  for (const variant of ['before', 'after'] as const) {
    test(`the dimmed rim and thicker ring, ${variant} (${mode})`, async ({ page }) => {
      await open(page);
      if (mode === 'dark') await setTheme(page, 'dark');
      if (variant === 'before') await page.addStyleTag({ content: BEFORE_DIM_CSS });
      await openFab(page, 'Guard');
      await setReducedMotion(page);
      await page.waitForTimeout(300);

      const panel = page.locator('.fab-panel-gradient');
      await panel.screenshot({ path: shotPath(OUT_DIM, `${mode}-idle-${variant}.png`) });
    });
  }
}

/**
 * Ad hoc — the rim cut to the ring's arc, before and after.
 *
 * "Before" is the pseudo's arc forced back to the registered initial full
 * ring (`0deg`/`360deg`) — which is exactly what it resolved to before the tab
 * table named `::before` — so the intersect masks nothing and the rim is the
 * full wash that shipped in #32. Reduced motion again, so the ring and rim
 * rest at the same angle in every frame and the pair differs only in the
 * mask. One shot per tab in dark, one tab in light: it is the *relationship*
 * to the ring that changed, and that is the same in every theme.
 */
const BEFORE_ARC_CSS = `
  .fab-panel-gradient::before {
    --fab-arc-from: 0deg !important;
    --fab-arc-to: 360deg !important;
  }
`;

for (const variant of ['before', 'after'] as const) {
  test(`the rim cut to the tab arc, ${variant} (dark, per tab)`, async ({ page }) => {
    await open(page);
    await setTheme(page, 'dark');
    if (variant === 'before') await page.addStyleTag({ content: BEFORE_ARC_CSS });
    await openFab(page);
    await setReducedMotion(page);

    const panel = page.locator('.fab-panel-gradient');
    for (const tab of ['Guard', 'Concepts', 'Develop', 'Patrol', 'Medic', 'Overhaul']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(300);
      await panel.screenshot({ path: shotPath(OUT_ARC, `dark-${tab.toLowerCase()}-${variant}.png`) });
    }
  });

  test(`the rim cut to the tab arc, ${variant} (light)`, async ({ page }) => {
    await open(page);
    if (variant === 'before') await page.addStyleTag({ content: BEFORE_ARC_CSS });
    await openFab(page, 'Guard');
    await setReducedMotion(page);
    await page.waitForTimeout(300);
    await page.locator('.fab-panel-gradient').screenshot({ path: shotPath(OUT_ARC, `light-guard-${variant}.png`) });
  });
}
