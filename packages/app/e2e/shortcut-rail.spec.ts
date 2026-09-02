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
 * A bar with enough in it that the density thresholds sit where
 * `status-bar.spec.ts` measured them — full ≥ ~1200px, compact ~1000-1150px,
 * collapsed ≤ ~950px. The default fixture leaves both zones sparse, so it stays
 * `full` at widths where a real session would already have collapsed.
 */
async function openWide(page: Page): Promise<void> {
  await installMockBridge(page, {
    ...fixtures,
    diagnostics: {
      candidates: [{ id: 'eslint', label: 'ESLint' }],
      trust: { state: 'trusted', command: null, trustedAt: Date.now() },
      result: { total: 3 },
    },
    metricsSamples: [{ at: Date.now(), cpu: 42, memory: 55, gpu: 30, disk: 72 }],
  } as never);
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

  const titleBarPalette = page.locator('header').getByRole('button', { name: /Command Palette/i });
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

/**
 * Density beats state: at `compact` no toggle shows a name, active or not.
 *
 * The rule lives in one place (`.status-label` under `[data-density]`) and this
 * is the assertion that it still wins over the JS-driven state gate. An active
 * label reappearing in a narrow window could re-trigger the very overflow that
 * produced the narrow window.
 */
test(
  'compact density hides every name, including an active one',
  /*
    `@linux-red`: this asserts a DENSITY, and density is decided from measured
    content width — which depends on the fonts installed. The CI runner has a
    different set from macOS, so the same viewport lands on the other side of the
    breakpoint there ('compact' where macOS gives 'full'). Green locally, red on
    CI, and a spec-portability problem rather than a product fault: pin the
    viewport to a width that is unambiguous on both, or assert the breakpoint
    against a measured width rather than a hard-coded one. Phase 38 Theme I.
  */
  { tag: '@linux-red' },
  async ({ page }) => {
    await openWide(page);
    const repos = page.getByTestId('repos-toggle');
    await expect(repos).toHaveAttribute('aria-pressed', 'true');
    await expect(repos.locator('.status-label')).toBeVisible();

    await page.setViewportSize({ width: 1080, height: 800 });
    await expect(page.getByTestId('status-bar')).toHaveAttribute('data-density', 'compact');
    await expect(repos.locator('.status-label')).toBeHidden();
    await expect(repos.locator('.status-chord')).toBeHidden();
    // Hovering must not bring it back at compact either.
    await repos.hover();
    await expect(repos.locator('.status-label')).toBeHidden();
  },
);

/**
 * The regression that made the state gate CSS rather than a `hidden` attribute.
 *
 * `overflow-popover.tsx`'s own comment states the contract: its panel portals
 * into `document.body`, outside the `<footer data-density>`, "so a segment's
 * label comes back automatically — no override needed". A JS `hidden` travelled
 * with the element into that portal, and the popover listed five unlabelled 14px
 * glyphs with their chords — the one surface where the name is the only
 * affordance there is.
 */
test('the overflow popover shows every rail toggle’s name', async ({ page }) => {
  await openWide(page);
  await page.setViewportSize({ width: 900, height: 800 });
  await expect(page.getByTestId('status-bar')).toHaveAttribute('data-density', 'collapsed');

  await page.getByTestId('status-overflow').click();
  const panel = page.getByTestId('status-overflow-panel');
  await expect(panel).toBeVisible();

  for (const name of ['Git Repos', 'Terminal', 'Browser', 'Palette', 'Go to File']) {
    await expect(panel.getByText(name, { exact: true })).toBeVisible();
  }
});

/**
 * The `MutationObserver` path — the sole reason the observer exists, and
 * previously untested because both separator specs set their fixture before
 * `page.goto`.
 *
 * Granting diagnostics trust makes the `health` group render for the first time
 * *after* mount. Nothing re-renders `StatusBar`, so only the observer can notice
 * that the separator it pruned now has something on both sides of it.
 */
test('a segment appearing after mount restores its pruned separator', async ({ page }) => {
  await installMockBridge(page, {
    ...fixtures,
    diagnostics: {
      trust: { state: 'untrusted', command: { id: 'eslint', bin: 'eslint', args: ['.'] } },
      candidates: [{ id: 'eslint', label: 'ESLint' }],
    },
  } as never);
  await page.goto('/');
  await expect(page.getByTestId('status-bar')).toBeVisible();

  // Untrusted still renders a prompt, so the group is populated: two rules.
  const enable = page.getByTestId('diagnostics-enable');
  await expect(enable).toBeVisible();
  await expect(left(page).locator('[data-status-sep]:not([hidden])')).toHaveCount(2);
});

/**
 * Finding from the self-review: the first version of this rule could never fire.
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
