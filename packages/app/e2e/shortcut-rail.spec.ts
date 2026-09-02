import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * The status bar's shortcut rail (Phase 39 Themes A–F).
 *
 * The end-to-end proof for a change whose whole point is what the bar *looks
 * like at rest*: five toggles showing chords and no names, three clusters
 * separated by rules that appear only where there is something on both sides
 * of them, and four loop launchers that open the FAB console.
 *
 * Deliberately not a screenshot suite — the density × state matrix belongs to
 * Theme G, which is not in this PR. These are the behavioural assertions that
 * would break silently under a refactor.
 */
const left = (page: Page) => page.getByTestId('status-bar-left');

async function open(page: Page): Promise<void> {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await expect(page.getByTestId('status-bar')).toBeVisible();
}

/**
 * At rest the rail teaches chords, not names. This is the phase's premise, and
 * the one thing a well-meaning refactor back to an always-visible label would
 * undo without failing anything else.
 *
 * Asserted against `aria-pressed` rather than "no toggle has a name": the
 * repositories panel is open on a fresh profile, so `repos-toggle` *is* active
 * and legitimately shows "Git Repos". The rule being tested is that the name
 * tracks the surface, not that the bar is always bare.
 */
test('a toggle shows its chord always, and its name only while its surface is open', async ({
  page,
}) => {
  await open(page);
  for (const [testId, name] of [
    ['repos-toggle', 'Git Repos'],
    ['terminal-toggle', 'Terminal'],
    ['browser-toggle', 'Browser'],
    ['palette-toggle', 'Palette'],
    ['files-toggle', 'Go to File'],
  ] as const) {
    const toggle = page.getByTestId(testId);
    await expect(toggle).toBeVisible();
    await expect(toggle.locator('.status-chord')).toBeVisible();

    /*
      Visibility, not `toContainText`. The name lives in a `hidden` span rather
      than being conditionally unmounted — one node, two independent gates (the
      state rule in JS and `.status-label`'s density rule in CSS) — and
      `textContent` includes hidden text, so a text assertion would pass in
      both states and prove nothing.
    */
    const label = toggle.locator('.status-label');
    await expect(label).toHaveText(name);
    const surfaceOpen = (await toggle.getAttribute('aria-pressed')) === 'true';
    if (surfaceOpen) await expect(label).toBeVisible();
    else await expect(label).toBeHidden();
  }
});

test('toggling a surface on reveals that button’s name, and only that one', async ({ page }) => {
  await open(page);
  const terminal = page.getByTestId('terminal-toggle');
  await expect(terminal.locator('.status-label')).toBeHidden();
  await terminal.click();
  await expect(terminal).toHaveAttribute('aria-pressed', 'true');
  await expect(terminal.locator('.status-label')).toBeVisible();
  // The pointer is over `terminal` after the click, so the one neighbour
  // checked is a button it is definitely not hovering.
  await expect(page.getByTestId('browser-toggle').locator('.status-label')).toBeHidden();
});

test('hovering reveals a name without changing the surface', async ({ page }) => {
  await open(page);
  const browser = page.getByTestId('browser-toggle');
  await browser.hover();
  await expect(browser.locator('.status-label')).toBeVisible();
  await expect(browser).toHaveAttribute('aria-pressed', 'false');
});

/**
 * The two controls Theme C moved out of the title bar. Asserting the title bar
 * no longer has them is half the point — one control, one home.
 */
test('the palette and Go-to-File live only on the rail', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('palette-toggle')).toBeVisible();
  await expect(page.getByTestId('files-toggle')).toBeVisible();
  await expect(left(page).locator('[data-testid="palette-toggle"]')).toHaveCount(1);

  const titleBarPalette = page
    .locator('header')
    .getByRole('button', { name: /Command Palette/i });
  await expect(titleBarPalette).toHaveCount(0);
});

/**
 * The lit state is real, not decorative — it follows `palette-store`'s `isOpen`
 * and `mode`.
 *
 * Closing is asserted with Escape rather than a second click: the open palette
 * is a modal and its overlay covers the rail, so a click on the toggle behind
 * it cannot land — which is correct app behaviour, not a bug in the toggle. The
 * un-press path itself is covered directly in `palette-toggle.test.tsx`.
 */
test('the palette toggle lights while the palette is open', async ({ page }) => {
  await open(page);
  const palette = page.getByTestId('palette-toggle');
  await expect(palette).toHaveAttribute('aria-pressed', 'false');
  await palette.click();
  await expect(palette).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(palette).toHaveAttribute('aria-pressed', 'false');
});

/**
 * Separators are derived from group boundaries and then pruned against the DOM.
 * With no diagnostics to report, the `health` group renders nothing, so the two
 * rules that would have bracketed it must collapse to exactly one — the
 * `shortcuts` | `live` boundary.
 */
test('an empty health group leaves exactly one separator, not two', async ({ page }) => {
  /*
    A repo with no linter is the only state in which the health group renders
    *nothing*: every other arm still offers an "Enable diagnostics" prompt,
    which is a rendered segment and correctly keeps both of its separators. That
    distinction is exactly why the pruning reads the DOM rather than the
    registry — `STATUS_SEGMENTS` cannot tell these two cases apart.
  */
  await installMockBridge(page, {
    ...fixtures,
    diagnostics: {
      trust: { state: 'no-command', command: null, trustedAt: null },
      candidates: [],
    },
  });
  await page.goto('/');
  await expect(page.getByTestId('status-bar')).toBeVisible();
  await expect(page.getByTestId('diagnostics-segment')).toHaveCount(0);
  await expect(page.getByTestId('diagnostics-enable')).toHaveCount(0);

  const separators = left(page).locator('[data-status-sep]');
  await expect(separators).toHaveCount(2);
  await expect(left(page).locator('[data-status-sep]:not([hidden])')).toHaveCount(1);
});

test('a populated health group is bracketed by two separators', async ({ page }) => {
  await installMockBridge(page, {
    ...fixtures,
    diagnostics: { trust: { state: 'trusted', command: null, trustedAt: Date.now() } },
  });
  await page.goto('/');
  await expect(page.getByTestId('diagnostics-segment')).toBeVisible();
  await expect(left(page).locator('[data-status-sep]:not([hidden])')).toHaveCount(2);
});

/** Diagnostics is a fact about the checkout, and Theme D moved it accordingly. */
test('diagnostics sits in the left zone, not the right', async ({ page }) => {
  await installMockBridge(page, {
    ...fixtures,
    diagnostics: { trust: { state: 'trusted', command: null, trustedAt: Date.now() } },
  });
  await page.goto('/');
  await expect(left(page).locator('[data-testid="diagnostics-segment"]')).toHaveCount(1);
  await expect(
    page.getByTestId('status-bar-right').locator('[data-testid="diagnostics-segment"]'),
  ).toHaveCount(0);
});

/**
 * At rest the strip is one glyph. The launchers are how a loop is *started*, so
 * hiding them until one runs would be circular — but four coloured glyphs in a
 * permanently-visible bar is noise, so it collapses instead.
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
  await expect(page.getByRole('button', { name: 'Watchdog', exact: true })).toBeVisible();
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

/** Render order and collapse order agree — the priority inversion Theme B fixed. */
test('the rail renders repos, terminal, browser, palette, files in that order', async ({
  page,
}) => {
  await open(page);
  const ids = await left(page).evaluate((el) =>
    Array.from(el.children)
      .map((child) => child.getAttribute('data-testid'))
      .filter((id): id is string => id !== null),
  );
  expect(ids.slice(0, 5)).toEqual([
    'repos-toggle',
    'terminal-toggle',
    'browser-toggle',
    'palette-toggle',
    'files-toggle',
  ]);
});
