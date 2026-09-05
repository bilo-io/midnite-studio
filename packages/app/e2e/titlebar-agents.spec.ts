import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

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
 * One live agent, so `LiveAgentCount` renders and the cluster is at its full
 * width — the specs about shedding that width have nothing to measure against
 * the default fixture, where the count is `null`.
 *
 * **A restored session bound by `hydrate()`, not a terminal typed into.** The
 * first version opened the terminal panel and emitted `pty:agent-changed` on
 * its first pty, which works locally and cannot work on CI: xterm paints
 * through `@xterm/addon-webgl`, the runner has no GPU, and the panel never
 * becomes visible at all — the wall that puts four whole spec files in
 * `playwright.ci.config.ts`'s KNOWN_RED. This needs a *store* with a live
 * agent in it, not a rendered terminal.
 *
 * So the session arrives through the fixture with a `live` pty, and opening the
 * FAB console is what calls `hydrate()` — which binds a live entry straight to
 * `'open'`, the state `sessionPhase` needs. The FAB is opened and shut again
 * rather than left up: it is `surface: 'fab'` sessions that render a pane
 * there, and this one is on the main surface, so nothing mounts an xterm.
 */
const RESTORED_AGENT: MockFixtures['terminalSessions'] = [
  {
    session: {
      id: 'sess-claude',
      kind: 'agent',
      agentId: 'claude',
      title: 'midnite-studio',
      cwd: '/tmp/midnite-studio',
      repoId: 'repo-1',
      createdAt: 1_787_000_000,
    },
    live: { ptyId: 'pty-restored', pid: 4242, cols: 80, rows: 24 },
  },
];

async function openWithAgent(page: Page): Promise<void> {
  await installMockBridge(page, {
    ...fixtures,
    terminalSessions: RESTORED_AGENT,
  } as MockFixtures);
  await page.goto('/');
  await expect(page.getByTestId('status-bar')).toBeVisible();

  const fab = page.getByRole('button', { name: 'Open quick access panel' });
  await fab.click();
  await expect(page.getByRole('button', { name: 'Guard', exact: true })).toBeVisible();
  await expect(page.getByTestId('titlebar-agent-count')).toBeVisible();
  /*
    Shut again — via the statusbar's mini FAB, the toggle that stands in for
    this one while the panel is open. It has to be shut: `fabPanelOpen` is one
    of the three things that expand the launcher strip, so leaving the console
    up would put four glyphs in the cluster and measure a width no resting bar
    ever has.
  */
  await page.getByRole('button', { name: 'Close quick access panel' }).click();
  await expect(page.getByRole('button', { name: 'Guard', exact: true })).toBeHidden();
  await expect(page.getByTestId('fab-launchers')).toHaveAttribute('data-expanded', 'false');
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

/** The header's overflow and the cluster's current step, read together. */
async function barState(
  page: Page,
): Promise<{ over: number; density: 'full' | 'compact' | 'collapsed' }> {
  return page.evaluate(() => {
    const header = document.querySelector('header')!;
    const cluster = document.querySelector('[data-testid="titlebar-agents"]') as HTMLElement;
    return {
      over: header.scrollWidth - header.clientWidth,
      density: cluster.dataset.density as 'full' | 'compact' | 'collapsed',
    };
  });
}

/**
 * The bug this cluster shipped with, and the reason it carries a density at
 * all: `@bilo-io/shell` gives the title bar's slots `shrink-0`, so a bar over
 * budget does not squeeze — it overflows past the right edge and takes
 * `ThemeToggle` out of the window with it. The cluster was 105px of a 1138px
 * demand, which moved the point at which that happens from ~1027px to ~1138px.
 *
 * **Asserted without a single pixel constant.** Density bands are decided from
 * measured text, and measured text depends on the fonts installed — which is
 * why every hard-coded-width spec in this suite carries `@linux-red`. So this
 * walks the viewport down and asserts the *invariant* instead: the cluster must
 * have given way before the bar overflows, and it must give way in order. Both
 * hold whatever the font metrics are, and both fail on the shipped version.
 */
test('the cluster sheds width before the bar can overflow', async ({ page }) => {
  await openWithAgent(page);
  await page.setViewportSize({ width: 1400, height: 800 });
  await expect(page.getByTestId('titlebar-agents')).toHaveAttribute('data-density', 'full');
  /*
    Wait for the breadcrumb's page label to fold away before measuring. It is
    on screen for the first few seconds after a navigation and then collapses
    (`.breadcrumb-page-label` in `styles.css`), which is a change in the bar's
    own width demand — a walk that straddles it is measuring two different
    bars, and could see a narrower step give way to a wider one purely because
    the label went. Waiting on the attribute rather than the duration keeps the
    3s out of this file.
  */
  await expect(page.locator('.breadcrumb-page-label').last()).toHaveAttribute(
    'data-revealed',
    'false',
  );

  const RANK = { full: 2, compact: 1, collapsed: 0 } as const;
  let previous = RANK.full;

  /*
    The floor was 1060px until the title bar gave back the ~120px its wordmark
    and that wordmark's divider used to hold: the cluster now has room to stay
    `full` down to ~960px, and only reaches `collapsed` below that. The number
    is a floor for the walk, not an assertion about any particular width —
    what is asserted is still the invariant at every step, plus `collapsed`
    by the end.
  */
  for (let width = 1400; width >= 900; width -= 40) {
    await page.setViewportSize({ width, height: 800 });

    /*
      Polled, and the poll IS the invariant: overflow is only permissible once
      the cluster has given up everything it can. A plain read here raced the
      `ResizeObserver` callback and React's commit, and reported the density
      from before the resize.
    */
    await expect
      .poll(async () => {
        const { over, density } = await barState(page);
        return over <= 0 || density === 'collapsed';
      }, {
        timeout: 3_000,
        message: `at ${width}px the bar overflows with the cluster not yet collapsed`,
      })
      .toBe(true);

    // Monotonic: narrowing never restores a wider step. `densityFor`'s 24px
    // hysteresis is what makes this safe to assert on a 40px stride.
    const { density } = await barState(page);
    expect(RANK[density]).toBeLessThanOrEqual(previous);
    previous = RANK[density];
  }

  expect(previous).toBe(RANK.collapsed);

  // And it comes back: `collapsed` stops probing the live DOM (`lastWidths`),
  // so a restore that never fires is the specific way this hook breaks.
  await page.setViewportSize({ width: 1400, height: 800 });
  await expect(page.getByTestId('titlebar-agents')).toHaveAttribute('data-density', 'full');
});

/** What each step actually looks like, driven by `data-density` alone. */
test('compact drops the word, collapsed drops the readout', async ({ page }) => {
  await openWithAgent(page);

  const count = page.getByTestId('titlebar-agent-count');
  const word = count.locator('.status-label');
  const cluster = page.getByTestId('titlebar-agents');

  await cluster.evaluate((el) => (el.dataset.density = 'full'));
  await expect(word).toBeVisible();
  await expect(count).toBeVisible();

  await cluster.evaluate((el) => (el.dataset.density = 'compact'));
  await expect(word).toBeHidden();
  await expect(count).toBeVisible();
  // The digit survives; only the word went. Read off its own span, because
  // `toHaveText` on the button would still see the hidden word's text.
  await expect(count.locator('.tabular-nums')).toHaveText('1');

  await cluster.evaluate((el) => (el.dataset.density = 'collapsed'));
  await expect(count).toBeHidden();
  // The strip is how a loop is *started*, so it survives every step.
  await expect(page.getByTestId('fab-launchers-collapsed')).toBeVisible();
});

/**
 * The symptom, named: `ThemeToggle` is the last control in the right cluster,
 * and before the cluster carried a density it left the viewport entirely
 * somewhere around 1138px — a 1000×800 window, well above `@bilo-io/shell`'s
 * own 768px `md:` breakpoint, had an unclickable theme toggle.
 *
 * **The widths are derived, not written down.** `full`'s demand is measured
 * from the running bar and the viewport set relative to it, so this carries no
 * `@linux-red` tag: it holds whatever the runner's font metrics make that
 * number. A hard-coded 1140px did NOT hold — it landed within a couple of
 * pixels of the breakpoint and read `full` where a local measurement had said
 * `compact`, which is the trap `status-bar.spec.ts` documents at length.
 */
test('the theme toggle stays in the window once full no longer fits', async ({ page }) => {
  await openWithAgent(page);

  await page.setViewportSize({ width: 1600, height: 800 });
  await expect(page.getByTestId('titlebar-agents')).toHaveAttribute('data-density', 'full');

  /*
    Probed at a width the bar cannot serve, because `scrollWidth` is floored at
    `clientWidth`: read at 1600px it reports 1600, not the ~1143px the content
    actually wants, and every width derived from it would be comfortably wide.
    Stamping `full` first is the same trick `useTitleBarDensity` uses, and for
    the same reason — the bar has to be asked what it wants at a step it is not
    currently on.
  */
  await page.setViewportSize({ width: 900, height: 800 });
  const fullWidth = await page.evaluate(() => {
    const header = document.querySelector('header')!;
    const cluster = document.querySelector('[data-testid="titlebar-agents"]') as HTMLElement;
    const restore = cluster.dataset.density;
    cluster.dataset.density = 'full';
    const width = header.scrollWidth;
    if (restore) cluster.dataset.density = restore;
    return width;
  });

  // Just inside the range `full` cannot serve, then well past `compact`'s too.
  for (const width of [fullWidth - 20, fullWidth - 60]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.getByTestId('titlebar-agents')).not.toHaveAttribute('data-density', 'full');

    await expect
      .poll(
        () =>
          page
            .getByRole('button', { name: 'Toggle theme' })
            .evaluate((el) => Math.round(el.getBoundingClientRect().right)),
        { message: `the theme toggle is outside a ${width}px window` },
      )
      .toBeLessThanOrEqual(width);
  }
});

/**
 * At rest the strip is one glyph. The launchers are how a loop is *started*, so
 * hiding them until one runs would be circular — but four coloured glyphs in a
 * permanently-visible bar is noise, so it collapses instead. Kept on the move
 * into the title bar, where the corner is the window's highest-attention one.
 */
test('the loop strip rests as one glyph and expands to six on hover', async ({ page }) => {
  await open(page);
  const strip = page.getByTestId('fab-launchers');
  await expect(strip).toHaveAttribute('data-expanded', 'false');
  await expect(page.getByTestId('fab-launchers-collapsed')).toBeVisible();

  await strip.hover();
  await expect(strip).toHaveAttribute('data-expanded', 'true');
  for (const id of ['guard', 'innovate', 'automate', 'watchdog', 'medic', 'overhaul']) {
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
 * start. Starting a loop end to end lives in `fab-loops.spec.ts`, and the first
 * version of this test opened a tab *without* running it — so there was no
 * pulse to kill and it passed with the bug still present. What is being asserted is a cascade outcome, so the honest
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
