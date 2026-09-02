import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * The title bar's agent cluster — the live-agent count and the four loop
 * launchers, `components/title-bar-agents.tsx`.
 *
 * Both readouts were `STATUS_SEGMENTS` entries in the status bar's left zone
 * until they moved up here, ahead of the date/weather pill and the rest of the
 * right cluster. The behavioural specs for the launcher strip moved with them
 * out of `shortcut-rail.spec.ts`, which is about the rail's five toggles and no
 * longer has anything to say about loops.
 *
 * What is worth asserting end to end is the part a refactor breaks silently:
 * *where* the cluster is, that it is not still down in the bar as well, and
 * that its trailing hairline survives the state in which half of it renders
 * nothing.
 */
async function open(page: Page): Promise<void> {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await expect(page.getByTestId('status-bar')).toBeVisible();
}

/**
 * The move itself. Asserted through `closest('header')` rather than a
 * coordinate comparison: the bar is `position: fixed` at `top: 0` and the
 * status bar is at the other end of the window, so a y-ordering assertion would
 * pass just as well with the cluster loose in the content area.
 */
test('the agent cluster lives inside the title bar, not the status bar', async ({ page }) => {
  await open(page);

  const cluster = page.getByTestId('titlebar-agents');
  await expect(cluster).toBeVisible();
  expect(await cluster.evaluate((el) => el.closest('header') !== null)).toBe(true);

  const bar = page.getByTestId('status-bar');
  await expect(bar.locator('[data-testid="fab-launchers"]')).toHaveCount(0);
  await expect(bar.locator('[data-testid="titlebar-agent-count"]')).toHaveCount(0);
});

/** "Before the other right-hand elements" — the date/weather pill leads the rest. */
test('the cluster precedes the status pill, and its hairline sits between them', async ({
  page,
}) => {
  await open(page);
  await expect(page.getByTestId('titlebar-status-pill')).toBeVisible();

  const order = await page.evaluate(() => {
    const ids = ['titlebar-agents', 'titlebar-agents-sep', 'titlebar-status-pill'];
    const nodes = ids.map((id) => document.querySelector(`[data-testid="${id}"]`));
    if (nodes.some((node) => node === null)) return null;
    // DOCUMENT_POSITION_FOLLOWING === 4: each node comes after the one before it.
    return nodes
      .slice(0, -1)
      .every((node, i) => (node!.compareDocumentPosition(nodes[i + 1]!) & 4) !== 0);
  });
  expect(order).toBe(true);
});

/**
 * `LiveAgentCount` returns `null` with nothing running — the default fixture's
 * state — which is exactly why the hairline is the cluster's own and not one
 * `chrome` draws when the count appears. The strip's collapsed glyph is what
 * keeps the cluster non-empty, so the rule always has something on its left.
 */
test('the hairline holds with no agents running', async ({ page }) => {
  await open(page);

  await expect(page.getByTestId('titlebar-agent-count')).toHaveCount(0);
  await expect(page.getByTestId('fab-launchers-collapsed')).toBeVisible();
  await expect(page.getByTestId('titlebar-agents-sep')).toBeVisible();
});

/**
 * At rest the strip is one glyph. The launchers are how a loop is *started*, so
 * hiding them until one runs would be circular — but four coloured glyphs in a
 * permanently-visible bar is noise, so it collapses instead. Kept on the move
 * into the title bar, where the corner is the window's highest-attention one.
 */
test('the loop strip rests as one glyph and expands to four on hover', async ({ page }) => {
  await open(page);
  const strip = page.getByTestId('fab-launchers');
  await expect(strip).toHaveAttribute('data-expanded', 'false');
  await expect(page.getByTestId('fab-launchers-collapsed')).toBeVisible();

  await strip.hover();
  await expect(strip).toHaveAttribute('data-expanded', 'true');
  for (const id of ['innovate', 'automate', 'watchdog', 'medic']) {
    await expect(page.getByTestId(`loop-launcher-${id}`)).toBeVisible();
  }
});

test('a launcher opens the FAB console on its own tab', async ({ page }) => {
  await open(page);
  await page.getByTestId('fab-launchers').hover();
  await page.getByTestId('loop-launcher-watchdog').click();
  await expect(page.getByRole('button', { name: 'Patrol', exact: true })).toBeVisible();
  await expect(page.getByTestId('loop-launcher-watchdog')).toHaveAttribute(
    'data-loop-open',
    'true',
  );
});

test('clicking the open tab’s launcher closes the panel', async ({ page }) => {
  await open(page);
  await page.getByTestId('fab-launchers').hover();
  const medic = page.getByTestId('loop-launcher-medic');
  await medic.click();
  await expect(medic).toHaveAttribute('data-loop-open', 'true');
  await medic.click();
  await expect(medic).not.toHaveAttribute('data-loop-open', 'true');
});

/**
 * Finding from the self-review of the phase that added the rule: the first
 * version of it could never fire.
 *
 * `html[data-motion='reduced'] .loop-launcher` is (0,2,1) and LOSES to
 * `.loop-launcher.is-running.is-pulsing` at (0,3,0). It looked correct only
 * because `@bilo-io/shell` forces `animation-duration: 0.001ms !important` under
 * reduced motion, pinning the pulse to a final frame whose `opacity: 1` happens
 * to be harmless — the exact accident `styles.css`'s Phase 30 comment warns
 * about.
 *
 * **The class combination is applied directly**, not driven through a real loop
 * start. Starting a loop end to end lives in `fab-loops.spec.ts` (currently in
 * `KNOWN_RED` on the pty seam), and the first version of this test opened a tab
 * *without* running it — so there was no pulse to kill and it passed with the
 * bug still present. What is being asserted is a cascade outcome, so the honest
 * way to assert it is to put the element in the state and read the computed
 * value: Phase 35 Theme H's method. `animation-name: none`, read through the
 * cascade rather than out of the stylesheet, and not a paused play-state — a
 * paused animation still holds a compositor layer.
 */
test('reduced motion resolves a running launcher pulse to animation-name: none', async ({
  page,
}) => {
  await open(page);
  await page.getByTestId('fab-launchers').hover();
  const launcher = page.getByTestId('loop-launcher-watchdog');
  await expect(launcher).toBeVisible();

  await launcher.evaluate((el) => el.classList.add('is-running', 'is-pulsing'));
  // Guard against the vacuous version of this test: the pulse must be ON first.
  await expect(launcher).toHaveCSS('animation-name', 'loop-launcher-pulse');

  await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'reduced'));
  await expect(launcher).toHaveCSS('animation-name', 'none');
});

/** Reduced motion removes the motion, not the state: the glow has to survive. */
test('reduced motion keeps a running launcher glow and full opacity', async ({ page }) => {
  await open(page);
  await page.getByTestId('fab-launchers').hover();
  const launcher = page.getByTestId('loop-launcher-watchdog');
  await launcher.evaluate((el) => el.classList.add('is-running', 'is-pulsing'));
  await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'reduced'));

  await expect(launcher).toHaveCSS('opacity', '1');
  const shadow = await launcher.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).not.toBe('none');
  // Patrol is yellow-500 — the glow is the loop's own colour, not a generic one.
  expect(shadow).toContain('234, 179, 8');
});
