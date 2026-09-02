import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';
import { densityViewportWidths } from './status-bar-density';

/**
 * The status bar's shortcut rail (Phase 39 Themes A–F).
 *
 * The end-to-end proof for a change whose whole point is what the bar *looks
 * like at rest*: five toggles showing chords and no names, and clusters
 * separated by rules that appear only where there is something on both sides
 * of them.
 *
 * The four loop launchers used to be here too. They moved to the title bar's
 * agent cluster with the live-agent count, and their specs went with them to
 * `titlebar-agents.spec.ts`.
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
 * A bar with enough in it that its density thresholds sit at a realistic
 * width, matching `status-bar.spec.ts`'s own fixture. The default fixture
 * leaves both zones sparse, so it stays `full` at widths where a real session
 * would already have collapsed — which is fine for most specs here, but not
 * for the one below that actually narrows the bar.
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
 * The left zone declares two — `shortcuts` | `health` and `health` | `live` —
 * and with no diagnostics to report the `health` group between them renders
 * nothing, so BOTH must be pruned.
 *
 * It used to be one rather than none: `live` still held the loop-launcher
 * strip, which never returns `null`, so the `shortcuts` | `live` boundary had
 * something on both sides of it. Since that strip and the agent count moved to
 * the title bar, `live` is `ReattachedNote` alone — a dismissible one-shot
 * notice — and the ordinary resting state of the zone is `shortcuts` and
 * nothing after it. Same mechanism, one group further along.
 */
test('an empty health group prunes both of the zone’s separators', async ({ page }) => {
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
  await expect(left(page).locator('[data-status-sep]:not([hidden])')).toHaveCount(0);
});

/**
 * The other half of the pair: with diagnostics reporting, the
 * `shortcuts` | `health` rule has content on both sides and survives, while the
 * `health` | `live` one behind it is still stranded and still pruned. One
 * fixture change, one separator's worth of difference — which is the whole
 * assertion.
 */
test('a populated health group earns exactly one separator', async ({ page }) => {
  await installMockBridge(page, {
    ...fixtures,
    diagnostics: { trust: { state: 'trusted', command: null, trustedAt: Date.now() } },
  });
  await page.goto('/');
  await expect(page.getByTestId('diagnostics-segment')).toBeVisible();
  await expect(left(page).locator('[data-status-sep]:not([hidden])')).toHaveCount(1);
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

/** Render order and collapse order agree — the priority inversion Theme B fixed. */
test('the rail renders repos, terminal, explorer, browser, palette, files in that order', async ({
  page,
}) => {
  await open(page);
  const ids = await left(page).evaluate((el) =>
    Array.from(el.children)
      .map((child) => child.getAttribute('data-testid'))
      .filter((id): id is string => id !== null),
  );
  expect(ids.slice(0, 6)).toEqual([
    'repos-toggle',
    'terminal-toggle',
    'explorer-toggle',
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
test('compact density hides every name, including an active one', async ({ page }) => {
  await openWide(page);
  const repos = page.getByTestId('repos-toggle');
  await expect(repos).toHaveAttribute('aria-pressed', 'true');
  await expect(repos.locator('.status-label')).toBeVisible();

  const { compact } = await densityViewportWidths(page);
  await page.setViewportSize({ width: compact, height: 800 });
  await expect(page.getByTestId('status-bar')).toHaveAttribute('data-density', 'compact');
  await expect(repos.locator('.status-label')).toBeHidden();
  await expect(repos.locator('.status-chord')).toBeHidden();
  // Hovering must not bring it back at compact either.
  await repos.hover();
  await expect(repos.locator('.status-label')).toBeHidden();
});

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

  // Untrusted still renders a prompt, so the group is populated and its leading
  // rule comes back. Its trailing one stays pruned: `live` is empty in this
  // fixture, as it is in every ordinary session now that the agent cluster has
  // moved to the title bar.
  const enable = page.getByTestId('diagnostics-enable');
  await expect(enable).toBeVisible();
  await expect(left(page).locator('[data-status-sep]:not([hidden])')).toHaveCount(1);
});

