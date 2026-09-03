import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The FAB loop console (Phase 35).
 *
 * Two of these assertions are the bug this phase exists to fix, stated in the
 * terms it actually broke in: the ad-hoc panel spawned a session per tab *on
 * mount* and piled all four into the main terminal housing, then latched every
 * tab onto whichever session happened to be last in a pre-call closure
 * snapshot. So the spec asserts "nothing is created until Start" and "what
 * Start creates never appears in the main session list" rather than
 * screenshotting a panel and hoping.
 */

const rows = (page: Page) => page.locator('[data-session-row]');
const panel = (page: Page) => page.locator('[data-terminal-panel]');

async function open(page: Page, over: Partial<MockFixtures> = {}): Promise<void> {
  await installMockBridge(page, { ...fixtures, ...over } as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

/**
 * Open the FAB panel and let its reveal tween settle — the panel slides in
 * over `REVEAL_MS`, and a click landing mid-slide is rejected as "not stable".
 */
async function openFab(page: Page, tab?: string): Promise<void> {
  await page.getByRole('button', { name: 'Open quick access panel' }).click();
  await expect(page.getByRole('button', { name: 'Ideate', exact: true })).toBeVisible();
  if (tab) await page.getByRole('button', { name: tab, exact: true }).click();
  await page.waitForTimeout(SETTLE_WAIT_MS);
}

/** The reveal tween's own duration (`REVEAL_MS` in `use-reveal.ts`), plus slack. */
const SETTLE_WAIT_MS = 300;

/**
 * Every colour-stop position in a computed conic-gradient, in degrees.
 *
 * Chromium clamps a conic stop's position to `[0deg, 360deg]` rather than
 * wrapping it, so an arc mask written with a negative stop (`#000 -90deg`)
 * renders a different — smaller — arc than it says. Medic's `-90deg → 90deg`
 * half-ring came out as the top-right quarter alone for exactly this reason,
 * so the arc masks are written wrap-safe (the arc's start folded into `from`,
 * the leading fade at `330deg → 360deg`), and this is what a test can hold
 * them to: computed values have `var()` and `calc()` already resolved, so a
 * stop that would clamp shows up here as a literal negative number.
 */
const conicStopAngles = (mask: string): number[] =>
  [...mask.matchAll(/rgba?\([^)]*\)\s+(-?[\d.]+)deg/g)].map((m) => Number(m[1]));

/** What the app asked the (fake) main process to record about its runs. */
const loopRuns = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __mstudioLoopRuns: () => Array<Record<string, unknown>> }
    ).__mstudioLoopRuns(),
  );

/**
 * Say that main's activity detector changed its guess for the newest pty.
 *
 * Polled rather than asserted once: the mock's `ptySessions` map only gains
 * `ptyId` once TerminalView's lazy chunk (Phase 36 Theme C) has mounted and
 * called `pty.create`, which can land a moment after Start rather than in the
 * same tick. Every call site *also* waits on `.xterm-screen` first, but that
 * wait belongs at the call site by convention, not by necessity — this poll
 * is what actually makes a forgotten one fail loud instead of flaky.
 */
async function emitActivity(
  page: Page,
  activity: 'thinking' | 'waiting' | 'idle' | null,
  ptyId: string,
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ id, act }) =>
            (
              window as unknown as {
                __mstudioPtyActivity: (p: string, a: typeof act) => boolean;
              }
            ).__mstudioPtyActivity(id, act),
          { id: ptyId, act: activity },
        ),
      `pty:activity was not delivered to ${ptyId}`,
    )
    .toBe(true);
}

test.describe('FAB loop console', () => {
  test('renders the four loops from the registry, with no session spawned on mount', async ({
    page,
  }) => {
    await open(page);
    await openFab(page);

    for (const label of ['Ideate', 'Create', 'Patrol', 'Medic']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    // The eager-spawn bug: four panes used to appear before anything was pressed.
    await expect(page.locator('.xterm-screen')).toHaveCount(0);
    expect(await loopRuns(page)).toEqual([]);
  });

  test('a loop tab draws each setting as the control its answer wants', async ({ page }) => {
    await open(page);
    await openFab(page, 'Patrol');

    const composer = page.getByTestId('loop-composer-watchdog');
    // Additive jobs are boxes…
    await expect(composer.getByRole('checkbox', { name: 'Review PRs' })).toBeVisible();
    await expect(composer.getByRole('checkbox', { name: 'Answer feedback' })).toBeVisible();
    await expect(composer.getByRole('checkbox', { name: 'Security review' })).toBeVisible();
    // …standing policies are switches…
    await expect(composer.getByRole('switch', { name: 'Triage only' })).toBeVisible();
    await expect(composer.getByRole('switch', { name: 'Auto-approve clean PRs' })).toBeVisible();
    // …and contradictory answers are radios.
    await expect(composer.getByRole('radiogroup', { name: 'Which PRs' })).toBeVisible();
    await expect(composer.getByRole('radio', { name: 'Recommended' })).toBeVisible();
    await expect(composer.getByPlaceholder('Extra instructions…')).toBeVisible();
  });

  test('every tab offers the autonomy radio, a model and a schedule', async ({ page }) => {
    await open(page);
    await openFab(page, 'Medic');

    const composer = page.getByTestId('loop-composer-medic');
    await expect(composer.getByRole('checkbox', { name: 'Dependabot PRs' })).toBeVisible();
    await expect(composer.getByRole('checkbox', { name: 'Renovate PRs' })).toBeVisible();
    await expect(composer.getByRole('switch', { name: 'Triage only' })).toBeVisible();

    // The run settings are the thing every tab carries, so they are asserted on
    // the tabs that declare nothing else in common with Medic. The panel is
    // already open, so switching tabs is a click on the tab — `openFab` would
    // toggle the panel shut.
    for (const [tab, id] of [
      ['Ideate', 'innovate'],
      ['Create', 'automate'],
      ['Medic', 'medic'],
    ] as const) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      const other = page.getByTestId(`loop-composer-${id}`);
      await expect(other.getByRole('radio', { name: 'Ask me' })).toBeChecked();
      await expect(other.getByRole('radio', { name: 'Opus 5' })).toBeVisible();
      await expect(other.getByRole('switch', { name: 'Window' })).not.toBeChecked();
    }
  });

  test('Patrol will not start with every box unchecked — its base names no skill', async ({
    page,
  }) => {
    await open(page);
    await openFab(page, 'Patrol');

    const composer = page.getByTestId('loop-composer-watchdog');
    const start = composer.getByTestId('loop-start');
    await expect(start).toBeEnabled();

    // Unticking the only checked box leaves a bare `/loop` — an agent launched
    // and told nothing — so Start goes away rather than sending it.
    await composer.getByRole('checkbox', { name: 'Review PRs' }).uncheck();
    await expect(start).toBeDisabled();
    await expect(start).toHaveAttribute('title', /Pick a task/);

    // A standing rule is not a task: the autonomy radio does not satisfy it.
    await composer.getByRole('radio', { name: 'Recommended' }).check();
    await expect(start).toBeDisabled();

    // Any control that names a skill does — the Triage only switch included.
    await composer.getByRole('switch', { name: 'Triage only' }).check();
    await expect(start).toBeEnabled();
  });

  test('Start composes the prompt from every control, in group order', async ({ page }) => {
    await open(page);
    await openFab(page, 'Patrol');

    const composer = page.getByTestId('loop-composer-watchdog');
    // "Review PRs" is `defaultOn`, so it arrives checked; feedback is the extra pass.
    await expect(composer.getByRole('checkbox', { name: 'Review PRs' })).toBeChecked();
    await composer.getByRole('checkbox', { name: 'Answer feedback' }).check();
    await composer.getByRole('radio', { name: 'Ready only' }).check();
    await composer.getByRole('radio', { name: 'Recommended' }).check();
    await composer.getByRole('switch', { name: 'Window' }).check();
    await composer.getByLabel('Run Patrol from').fill('09:00');
    await composer.getByLabel('Run Patrol until').fill('17:00');
    await composer.getByRole('radio', { name: 'Opus 5' }).check();
    await composer.getByPlaceholder('Extra instructions…').fill('Skip drafts.');
    await composer.getByTestId('loop-start').click();

    await expect.poll(async () => (await loopRuns(page)).length).toBe(1);
    const [run] = await loopRuns(page);
    expect(run?.['loopId']).toBe('watchdog');
    // Tasks, then scope, then the standing rules, then the window, extras last.
    expect(run?.['composedPrompt']).toBe(
      '/loop /pr-review /pr-feedback Look only at PRs that are ready for review — skip drafts. ' +
        'Do every piece of work in its own git worktree — never edit the primary checkout. ' +
        'Never stop to ask: keep advancing and always take the recommended option. ' +
        'Work only between 09:00 and 17:00 local time — outside that window, idle and wait rather than starting new work. ' +
        'Skip drafts.',
    );
    // Only what is on — the unflipped "Triage only" fragment must not ride along.
    expect(run?.['checkedModifierIds']).toEqual(['pr-review', 'pr-feedback', 'worktree-only']);
    // The model is a `--model` flag, so the ledger records it beside the line.
    expect(run?.['model']).toBe('opus-5');
  });

  test('the loop session never appears in the main terminal housing', async ({ page }) => {
      await open(page);
      await openFab(page);
      await page.getByTestId('loop-composer-innovate').getByTestId('loop-start').click();
      await expect(
        page.getByTestId('loop-composer-innovate').getByTestId('loop-stop'),
      ).toBeVisible();

      // The FAB's own pane has a terminal…
      await expect(page.locator('.xterm-screen')).toHaveCount(1);

      /*
        …and the main panel, opened afterwards, does not list or render it. The
        assertion is about the LOOP's row specifically, not the row count: the
        panel auto-opens a shell of its own when it comes up to an empty list,
        so counting rows would race that effect rather than state the intent.
      */
      await page.keyboard.press('Control+`');
      await expect(panel(page)).toBeVisible();
      await expect(rows(page).filter({ hasText: 'Ideate' })).toHaveCount(0);
      // Whatever the panel opened for itself, the FAB's pane still has its own.
      await expect(
        page.getByTestId('loop-composer-innovate').getByTestId('loop-stop'),
      ).toBeVisible();
    },
  );

  test('starting a loop does not open the main terminal panel', async ({ page }) => {
    await open(page);
    await openFab(page, 'Create');
    await page.getByTestId('loop-composer-automate').getByTestId('loop-start').click();
    await expect(page.getByTestId('loop-composer-automate').getByTestId('loop-stop')).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
  });

  test('Start swaps to a glowing Stop, and the composer collapses to chips', async ({ page }) => {
    await open(page);
    await openFab(page, 'Medic');

    const composer = page.getByTestId('loop-composer-medic');
    await composer.getByRole('checkbox', { name: 'Dependabot PRs' }).check();
    await composer.getByTestId('loop-start').click();

    const stop = composer.getByTestId('loop-stop');
    await expect(stop).toBeVisible();
    await expect(stop).toHaveClass(/loop-run-glow/);
    // Collapsed: the inputs are gone, the checked modifier survives as a chip.
    await expect(composer.getByPlaceholder('Extra instructions…')).toHaveCount(0);
    await expect(composer.getByText('Dependabot PRs')).toBeVisible();
  });

  test('a waiting loop turns its tab dot and the FAB halo amber', async ({ page }) => {
    await open(page);
    await openFab(page);
    await page.getByTestId('loop-composer-innovate').getByTestId('loop-start').click();
    await expect(page.getByTestId('loop-composer-innovate').getByTestId('loop-stop')).toBeVisible();
    // The pty behind the tab is created once TerminalView's lazy chunk mounts
    // (Phase 36 Theme C) — a moment after Stop appears, not the same tick.
    await expect(page.locator('.xterm-screen')).toHaveCount(1);

    await expect(page.getByTestId('loop-dot-innovate')).toHaveClass(/text-blue-500/);
    await emitActivity(page, 'waiting', 'pty-1');
    await expect(page.getByTestId('loop-dot-innovate')).toHaveClass(/bg-amber-500/);
    await expect(page.getByTestId('fab-loop-halo')).toHaveClass(/is-waiting/);
  });

  /**
   * The halo is the panel's rim seen from outside: ONE span while anything is
   * live, none when idle, wearing the ACTIVE TAB's arc — not the running
   * loop's. It carries `data-fab-tab` itself (the arc properties are
   * `inherits: false`, so an ancestor's would never reach it) and so resolves
   * the same two angles the button's ring does, cut from the same
   * `--loop-glow-angle`.
   */
  test('the collapsed FAB wears one halo in the active tab arc while any loop is live', async ({
    page,
  }) => {
    await open(page);
    await expect(page.getByTestId('fab-loop-halo')).toHaveCount(0);

    await openFab(page);
    await page.getByTestId('loop-composer-innovate').getByTestId('loop-start').click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.waitForTimeout(SETTLE_WAIT_MS);
    await page.getByTestId('loop-composer-automate').getByTestId('loop-start').click();

    const halo = page.getByTestId('fab-loop-halo');
    await expect(halo).toHaveCount(1);
    await expect(halo).toHaveAttribute('data-fab-tab', 'automate');

    const arcs = await page.evaluate(() => {
      const read = (el: Element) => {
        const cs = getComputedStyle(el);
        return {
          from: cs.getPropertyValue('--fab-arc-from').trim(),
          to: cs.getPropertyValue('--fab-arc-to').trim(),
        };
      };
      const halo = document.querySelector('[data-testid="fab-loop-halo"]')!;
      const button = document.querySelector('[aria-label="Open quick access panel"]')!;
      return { halo: read(halo), button: read(button), mask: getComputedStyle(halo).maskImage };
    });
    // Create's row of the tab table, on both — see the Phase 37 describe below.
    expect(arcs.halo).toEqual({ from: '30deg', to: '210deg' });
    expect(arcs.button).toEqual(arcs.halo);
    expect(arcs.mask).toContain('conic-gradient');

    // Medic is the row with a negative start, the one Chromium's stop clamp
    // used to cut to a quarter: on the halo AND the ring every stop sits in
    // [0, 360] — the arc's start lives in `from`, never in a stop.
    await page.getByRole('button', { name: 'Medic', exact: true }).click();
    await expect(halo).toHaveAttribute('data-fab-tab', 'medic');
    await page.waitForTimeout(600); // the 0.5s arc sweep
    const masks = await page.evaluate(() => ({
      halo: getComputedStyle(document.querySelector('[data-testid="fab-loop-halo"]')!).maskImage,
      ring: getComputedStyle(document.querySelector('[aria-label="Open quick access panel"]')!)
        .maskImage,
    }));
    for (const mask of [masks.halo, masks.ring]) {
      const stops = conicStopAngles(mask);
      expect(stops.length).toBeGreaterThan(0);
      expect(stops.every((deg) => deg >= 0 && deg <= 360)).toBe(true);
    }

    // Back to Ideate: the halo follows the tab, not the two loops still running.
    await page.getByRole('button', { name: 'Ideate', exact: true }).click();
    await expect(halo).toHaveAttribute('data-fab-tab', 'innovate');
  });

  test('Stop finalises the run and the history records what it carried', async ({ page }) => {
    await open(page);
    await openFab(page);
    const composer = page.getByTestId('loop-composer-innovate');
    await composer.getByRole('radio', { name: 'PR-sized' }).check();
    await composer.getByTestId('loop-start').click();
    await composer.getByTestId('loop-stop').click();

    await expect.poll(async () => (await loopRuns(page))[0]?.['status']).toBe('stopped');

    const history = page.getByTestId('loop-history').first();
    await expect(history.getByRole('button', { name: /History \(1\)/ })).toBeVisible();
    await history.getByRole('button', { name: /History \(1\)/ }).click();
    await expect(history.getByText('stopped')).toBeVisible();
  });
});

/**
 * Phase 35 Themes F–I: the four verification items the phase shipped as
 * `◐ PARTIAL`, stated as assertions rather than as intentions.
 *
 * Each one was left partial for the same reason — the half that a spec could
 * reach was covered and the half that needed a *process* was not. F needed a
 * pty to die without the app asking (now `__mstudioPtyExit`), G needed the
 * notification to be opened and clicked rather than merely pushed, H needed
 * the reduced-motion rule read through the cascade rather than out of the
 * stylesheet, and I needed a launch that starts with a FAB session already on
 * disk.
 */

/**
 * Kill a pty the way the world does — nothing in the app asked for this.
 *
 * Polled for the same reason `emitActivity` is: `ptyId` only exists in the
 * mock's bookkeeping once the lazy TerminalView chunk has mounted.
 */
async function exitPty(page: Page, ptyId: string, exitCode = 0): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ id, code }) =>
            (
              window as unknown as {
                __mstudioPtyExit: (p: string, c: number) => boolean;
              }
            ).__mstudioPtyExit(id, code),
          { id: ptyId, code: exitCode },
        ),
      `pty:exit was not delivered to ${ptyId}`,
    )
    .toBe(true);
}

/** What the app asked the (fake) main process to spawn. */
const ptyCreates = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __mstudioPty: { creates: Array<{ sessionId: string }> };
        }
      ).__mstudioPty.creates,
  );

test.describe('FAB loop console — lifecycle (Theme F)', () => {
  test('a loop that exits on its own flips Stop back to Start, and history says exited', async ({
    page,
  }) => {
    await open(page);
    await openFab(page);
    const composer = page.getByTestId('loop-composer-innovate');
    await composer.getByTestId('loop-start').click();
    await expect(composer.getByTestId('loop-stop')).toBeVisible();
    // The pty behind the tab is created once TerminalView's lazy chunk mounts
    // (Phase 36 Theme C) — a moment after Stop appears, not the same tick.
    await expect(page.locator('.xterm-screen')).toHaveCount(1);

    /*
      The distinction this test exists for: Stop is the app killing the pty,
      and that path was already covered. Here the loop simply finishes — the
      renderer is *told* about an exit it did not ask for, which is the case
      the checklist doubted, because the button state is derived from
      `sessionPhase` rather than written down by whoever pressed Stop.
    */
    await exitPty(page, 'pty-1');

    await expect(composer.getByTestId('loop-start')).toBeVisible();
    await expect(composer.getByTestId('loop-stop')).toHaveCount(0);
    // And the run ends as `exited`, not `stopped` — main finalises off the
    // pty's own exit (`loop-runs.ts`'s `noteSessionExit`), so history can tell
    // "it finished" from "you stopped it".
    await expect.poll(async () => (await loopRuns(page))[0]?.['status']).toBe('exited');
  });

  test('an exited loop drops the glow and the halo', async ({ page }) => {
    await open(page);
    await openFab(page);
    const composer = page.getByTestId('loop-composer-innovate');
    await composer.getByTestId('loop-start').click();
    await expect(composer.getByTestId('loop-stop')).toHaveClass(/loop-run-glow/);
    await expect(page.getByTestId('fab-loop-halo')).toBeAttached();
    // The pty behind the tab is created once TerminalView's lazy chunk mounts
    // (Phase 36 Theme C) — a moment after Stop appears, not the same tick.
    await expect(page.locator('.xterm-screen')).toHaveCount(1);

    await exitPty(page, 'pty-1');

    await expect(composer.getByTestId('loop-start')).not.toHaveClass(/loop-run-glow/);
    await expect(page.getByTestId('fab-loop-halo')).toHaveCount(0);
  });

  test('Stop keeps the transcript, and the next Start is a fresh session', async ({ page }) => {
    await open(page);
    await openFab(page);
    const composer = page.getByTestId('loop-composer-innovate');

    await composer.getByTestId('loop-start').click();
    await composer.getByTestId('loop-stop').click();
    await expect(composer.getByTestId('loop-start')).toBeVisible();

    /*
      Stop sleeps rather than closes (the phase's own resolved decision), so
      the pane and everything written into it are still there to read. A
      closed session would take the `.xterm-screen` with it.
    */
    await expect(page.locator('.xterm-screen')).toHaveCount(1);

    await composer.getByTestId('loop-start').click();
    await expect(composer.getByTestId('loop-stop')).toBeVisible();

    /*
      Fresh, not revived: two ptys against two different session ids. A Start
      that resumed the slept session would show one create here, and the run
      would append to a transcript that already carried the last run's answers.
    */
    const creates = await ptyCreates(page);
    expect(creates).toHaveLength(2);
    expect(creates[0]?.sessionId).not.toBe(creates[1]?.sessionId);

    const runs = await loopRuns(page);
    expect(runs).toHaveLength(2);
    expect(runs[0]?.['status']).toBe('stopped');
    expect(runs[1]?.['status']).toBe('running');
    expect(runs[0]?.['sessionId']).not.toBe(runs[1]?.['sessionId']);
  });
});

test.describe('FAB loop console — the waiting notice (Theme G)', () => {
  /**
   * There is no floating toast: `useLoopAttention` pushes into `toast-store`
   * and the status bar's `NotificationBell` is what renders it. That is the
   * shipped surface, so it is the one asserted — including the click-through,
   * which is the half a dot on a tab cannot do.
   */
  test('a waiting loop raises one notification whose action opens its tab', async ({ page }) => {
    await open(page);
    await openFab(page);
    await page.getByTestId('loop-composer-innovate').getByTestId('loop-start').click();
    await expect(page.getByTestId('loop-composer-innovate').getByTestId('loop-stop')).toBeVisible();
    // The pty behind the tab is created once TerminalView's lazy chunk mounts
    // (Phase 36 Theme C) — a moment after Stop appears, not the same tick.
    // The tab-switch and panel-close below happen to buy enough wall-clock
    // time for this on an idle machine, but that is incidental, not a wait.
    await expect(page.locator('.xterm-screen')).toHaveCount(1);

    /*
      Away from the loop's own tab, and then out of the panel entirely — the
      case the notice exists for is a loop that went quiet while you were
      looking at something else. The FAB button is a toggle, so pressing it
      again is what shuts the console; `FabPanel` returns null when closed,
      which is why the composers vanish rather than merely hiding here.
    */
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByRole('button', { name: 'Open quick access panel' }).click();
    await expect(page.getByTestId('loop-composer-innovate')).toHaveCount(0);

    await emitActivity(page, 'waiting', 'pty-1');

    await page.getByTestId('notification-bell').click();
    const notice = page.getByText('Ideate is waiting for input.');
    await expect(notice).toBeVisible();

    await page.getByRole('button', { name: 'Open Ideate' }).click();
    /*
      The panel reopens on the loop that asked, not on Create, which is
      where it was left. Visibility rather than presence for the negative: all
      four tabs mount together once the panel is open (each pane owns an xterm
      that must not be torn down on every tab switch) and the inactive ones are
      hidden with `invisible`, so a count assertion would pass no matter which
      tab the action had landed on.
    */
    await expect(page.getByTestId('loop-composer-innovate')).toBeVisible();
    await expect(page.getByTestId('loop-composer-automate')).not.toBeVisible();
  });

  test('the notice is debounced by transition, not by time', async ({ page }) => {
    await open(page);
    await openFab(page);
    await page.getByTestId('loop-composer-innovate').getByTestId('loop-start').click();
    await expect(page.getByTestId('loop-composer-innovate').getByTestId('loop-stop')).toBeVisible();
    // The pty behind the tab is created once TerminalView's lazy chunk mounts
    // (Phase 36 Theme C) — a moment after Stop appears, not the same tick.
    await expect(page.locator('.xterm-screen')).toHaveCount(1);

    const notices = () => page.getByText('Ideate is waiting for input.');

    // A run that sits at one prompt for ten minutes is one notification, and
    // repeating the same activity is not a new question.
    await emitActivity(page, 'waiting', 'pty-1');
    await emitActivity(page, 'waiting', 'pty-1');
    await page.getByTestId('notification-bell').click();
    await expect(notices()).toHaveCount(1);
    await page.keyboard.press('Escape');

    // Going not-waiting rearms it: a second question is a second notice.
    await emitActivity(page, 'thinking', 'pty-1');
    await emitActivity(page, 'waiting', 'pty-1');
    await page.getByTestId('notification-bell').click();
    await expect(notices()).toHaveCount(2);
  });
});

test.describe('FAB loop console — reduced motion (Theme H)', () => {
  /**
   * Read through the cascade, not out of the stylesheet. A test that greps
   * `styles.css` for the `html[data-motion='reduced']` block passes even when
   * a later, more specific rule has quietly out-ranked it — and
   * `.loop-run-glow.is-thinking`, which sets two animations, is exactly the
   * kind of rule that could.
   */
  const animationName = (page: Page) =>
    page
      .getByTestId('loop-composer-innovate')
      .getByTestId('loop-stop')
      .evaluate((el) => getComputedStyle(el).animationName);

  test("data-motion='reduced' stops the running glow", async ({ page }) => {
    await open(page);
    await openFab(page);
    await page.getByTestId('loop-composer-innovate').getByTestId('loop-start').click();
    await expect(page.getByTestId('loop-composer-innovate').getByTestId('loop-stop')).toBeVisible();

    // The control: a live loop with no activity guess yet wears the plain
    // spinning ring. (`.is-waiting` sets `animation: none` on its own, so
    // asserting the opt-out against a waiting loop would prove nothing.)
    expect(await animationName(page)).toBe('loop-glow-spin');

    await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'reduced'));
    expect(await animationName(page)).toBe('none');

    // And it is the attribute doing it, not a coincidence of state.
    await page.evaluate(() => document.documentElement.removeAttribute('data-motion'));
    expect(await animationName(page)).toBe('loop-glow-spin');
  });

  test("data-motion='reduced' also stops the thinking pulse", async ({ page }) => {
    await open(page);
    await openFab(page);
    await page.getByTestId('loop-composer-innovate').getByTestId('loop-start').click();
    await expect(page.getByTestId('loop-composer-innovate').getByTestId('loop-stop')).toBeVisible();
    // The pty behind the tab is created once TerminalView's lazy chunk mounts
    // (Phase 36 Theme C) — a moment after Stop appears, not the same tick.
    await expect(page.locator('.xterm-screen')).toHaveCount(1);

    await emitActivity(page, 'thinking', 'pty-1');
    expect(await animationName(page)).toBe('loop-glow-spin, loop-glow-pulse');

    await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'reduced'));
    expect(await animationName(page)).toBe('none');
  });
});

test.describe('FAB panel — the tab glow (Phase 37)', () => {
  /**
   * The computed custom properties are the testable seam here — the rendered
   * gradient/mask pixels are not. Every row matches `styles.css`'s arc table:
   * `anchor - 90deg` to `anchor + 90deg` against each tab's own ramp anchor,
   * never each tab's angles individually wrapped into `[0deg, 360deg)`.
   */
  const ARCS: Record<string, { from: string; to: string }> = {
    Medic: { from: '-90deg', to: '90deg' },
    Patrol: { from: '-30deg', to: '150deg' },
    Create: { from: '30deg', to: '210deg' },
    Ideate: { from: '90deg', to: '270deg' },
  };

  const gradient = (page: Page) => page.locator('.fab-panel-gradient');

  const arcOf = (locator: ReturnType<typeof gradient>) =>
    locator.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        from: cs.getPropertyValue('--fab-arc-from').trim(),
        to: cs.getPropertyValue('--fab-arc-to').trim(),
      };
    });

  for (const [tab, arc] of Object.entries(ARCS)) {
    test(`${tab}'s arc matches its row of the table`, async ({ page }) => {
      await open(page);
      await openFab(page, tab);
      await expect.poll(() => arcOf(gradient(page))).toEqual(arc);
    });
  }

  test('the collapsed FAB carries the same arc as the open panel', async ({ page }) => {
    await open(page);
    await openFab(page, 'Medic');
    await page.getByTestId('loop-composer-medic').getByTestId('loop-start').click();
    await expect(page.getByTestId('loop-composer-medic').getByTestId('loop-stop')).toBeVisible();

    // Collapse — the button, not the panel, is what Theme D has to agree with.
    await page.getByRole('button', { name: 'Open quick access panel' }).click();
    const button = page.getByRole('button', { name: 'Open quick access panel' });
    await expect(button).toHaveAttribute('data-fab-tab', 'medic');
    await expect.poll(() => arcOf(button)).toEqual(ARCS['Medic']);
  });

  test("Start/Stop inside a tab's own pane inherits that tab's arc for free", async ({ page }) => {
    await open(page);
    await openFab(page, 'Create');
    await page.getByTestId('loop-composer-automate').getByTestId('loop-start').click();
    const stop = page.getByTestId('loop-composer-automate').getByTestId('loop-stop');
    await expect(stop).toBeVisible();
    await expect.poll(() => arcOf(stop)).toEqual(ARCS['Create']);
  });

  test('data-loop-state tracks the active tab: idle, running, then waiting', async ({ page }) => {
    await open(page);
    await openFab(page, 'Patrol');
    await expect(gradient(page)).toHaveAttribute('data-loop-state', 'idle');

    await page.getByTestId('loop-composer-watchdog').getByTestId('loop-start').click();
    await expect(page.getByTestId('loop-composer-watchdog').getByTestId('loop-stop')).toBeVisible();
    await expect(gradient(page)).toHaveAttribute('data-loop-state', 'running');
    // The pty behind the tab is created once TerminalView's lazy chunk mounts
    // (Phase 36 Theme C) — a moment after Stop appears, not the same tick.
    await expect(page.locator('.xterm-screen')).toHaveCount(1);

    await emitActivity(page, 'waiting', 'pty-1');
    await expect(gradient(page)).toHaveAttribute('data-loop-state', 'waiting');
  });

  /**
   * Amber outranks the arc (decision 6), and it outranks it with a FULL
   * ring — the mask that narrows the BORDER to a tab's 180° is built for the
   * rainbow it otherwise wears, and would misread a one-colour amber ring as a
   * half-lit one if it stayed applied. (The inner glow has no arc mask to
   * drop: it is a full-perimeter rim in every state.)
   */
  test('a waiting loop drops the arc mask and stops rotation and pulse', async ({ page }) => {
    await open(page);
    await openFab(page, 'Medic');
    await page.getByTestId('loop-composer-medic').getByTestId('loop-start').click();
    await expect(page.getByTestId('loop-composer-medic').getByTestId('loop-stop')).toBeVisible();
    // The pty behind the tab is created once TerminalView's lazy chunk mounts
    // (Phase 36 Theme C) — a moment after Stop appears, not the same tick.
    await expect(page.locator('.xterm-screen')).toHaveCount(1);

    await emitActivity(page, 'waiting', 'pty-1');
    await expect(gradient(page)).toHaveAttribute('data-loop-state', 'waiting');

    const info = await gradient(page).evaluate((el) => ({
      borderMask: getComputedStyle(el).maskImage,
      beforeAnimation: getComputedStyle(el, '::before').animationName,
      ownAnimation: getComputedStyle(el).animationName,
    }));
    expect(info.borderMask).toBe('none');
    expect(info.beforeAnimation).toBe('none');
    expect(info.ownAnimation).toBe('none');
  });

  /**
   * The inner glow is an EVEN rim, and it sits IN FRONT of the pane.
   *
   * Both halves are load-bearing and both were broken in ways a screenshot of
   * an idle panel hid. The mask used to be one centred `radial-gradient`
   * ellipse whose first non-transparent stop was at 62%: a mid-edge pixel's
   * normalised radius is 0.5 and a corner's is ~0.707, so only the corners
   * ever cleared it and the glow could not touch the middle of an edge at any
   * opacity. And at `z-index: 0` the pseudo painted before the panel's own
   * children, so the opaque xterm that fills the pane the moment a loop runs
   * covered the glow completely.
   *
   * So this asserts the *shape* of the mask rather than pixels: four linear
   * ramps, one per side, each ending transparent at the same length — which is
   * what "evenly along the edges" means in CSS and what a percentage band on a
   * 320x900 panel could not be — plus a positive z-index and the `isolation`
   * on the host that keeps it local.
   *
   * And, since the rim took the ring's arc, a fifth layer AHEAD of those four:
   * the same conic arc the border wears, intersected with the ramps' union.
   * Two things about it are asserted because both were once silently wrong.
   * The arc has to resolve to the ACTIVE tab's angles on the pseudo itself —
   * `--fab-arc-from`/`--fab-arc-to` are `inherits: false`, and an earlier
   * version of this layer read the registered initial `0deg`/`360deg` (a full
   * ring, so the intersect masked nothing) because nothing set them on
   * `::before`. And the composite list has to put `intersect` on the arc and
   * `add` on the ramps, in that order: mask layers composite bottom-up, so the
   * arc last would cut one ramp to the arc and union the other three back in.
   */
  test('the inner glow is a four-sided rim of equal width, cut to the tab arc, over the pane', async ({
    page,
  }) => {
    await open(page);
    // Medic, not Ideate: its arc starts below zero, which is the case the
    // stop-angle guard below exists for. Ideate is the default tab, so this is
    // a tab CHANGE, and the pseudo's two angles ease over 0.5s — read nothing
    // until they have landed.
    await openFab(page, 'Medic');
    await expect
      .poll(() =>
        gradient(page).evaluate((el) => {
          const before = getComputedStyle(el, '::before');
          return {
            from: before.getPropertyValue('--fab-arc-from').trim(),
            to: before.getPropertyValue('--fab-arc-to').trim(),
          };
        }),
      )
      .toEqual(ARCS['Medic']);

    const glow = await gradient(page).evaluate((el) => {
      const before = getComputedStyle(el, '::before');
      return {
        mask: before.maskImage,
        composite: before.maskComposite,
        arc: {
          from: before.getPropertyValue('--fab-arc-from').trim(),
          to: before.getPropertyValue('--fab-arc-to').trim(),
        },
        zIndex: before.zIndex,
        isolation: getComputedStyle(el).isolation,
        borderMask: getComputedStyle(el).maskImage,
      };
    });

    // The arc, then one layer per side, and no sixth.
    const layers = glow.mask.split(/\), (?=(?:linear|conic)-gradient)/);
    expect(layers).toHaveLength(5);
    expect(layers[0]).toContain('conic-gradient');
    expect(glow.mask).not.toContain('radial-gradient');

    // The arc is the active tab's, resolved ON the pseudo — not the registered
    // initial full ring.
    expect(glow.arc).toEqual(ARCS['Medic']);
    expect(glow.composite).toBe('intersect, add, add, add, add');

    // ...and written so it renders as that arc: no stop below 0deg on the
    // rim's arc layer or on the host's border mask (see `conicStopAngles`).
    for (const mask of [layers[0], glow.borderMask]) {
      const stops = conicStopAngles(mask);
      expect(stops.length).toBeGreaterThan(0);
      expect(stops.every((deg) => deg >= 0 && deg <= 360)).toBe(true);
    }

    // `to bottom` computes to a bare `linear-gradient(...)`; the other three
    // keep their keyword. One per side, no side twice.
    const ramps = layers.slice(1);
    expect(ramps[0]).not.toContain('to ');
    expect(ramps[1]).toContain('to top');
    expect(ramps[2]).toContain('to right');
    expect(ramps[3]).toContain('to left');

    // Every side fades out at the same length — the "evenly" of the ask.
    const ends = ramps.map((layer) => /rgba\(0, 0, 0, 0\)\s+([\d.]+)px/.exec(layer)?.[1]);
    expect(ends.every((end) => end !== undefined)).toBe(true);
    expect(new Set(ends).size).toBe(1);

    // In front of the children, in a stacking context of the panel's own.
    expect(Number(glow.zIndex)).toBeGreaterThan(0);
    expect(glow.isolation).toBe('isolate');
  });

  /**
   * The rim's arc moves WITH the ring's. Switching tabs eases the host's two
   * angles over 0.5s; the pseudo has its own copy of both (see the tab table
   * in styles.css) and its own identical transition, so at the far end they
   * agree again — and in the `waiting` state, where the ring goes full amber
   * with no arc, the rim's composite list goes back to a plain union so the
   * still frame is a full ring too rather than a top edge cut to its corners.
   */
  test('the rim sweeps to the new tab with the ring, and waiting unions the ramps again', async ({
    page,
  }) => {
    await open(page);
    await openFab(page, 'Medic');

    const pseudoArc = () =>
      gradient(page).evaluate((el) => {
        const before = getComputedStyle(el, '::before');
        return {
          from: before.getPropertyValue('--fab-arc-from').trim(),
          to: before.getPropertyValue('--fab-arc-to').trim(),
        };
      });

    await expect.poll(pseudoArc).toEqual(ARCS['Medic']);
    await page.getByRole('button', { name: 'Patrol', exact: true }).click();
    await expect.poll(pseudoArc).toEqual(ARCS['Patrol']);
    await expect.poll(() => arcOf(gradient(page))).toEqual(ARCS['Patrol']);

    const composer = page.getByTestId('loop-composer-watchdog');
    await composer.getByTestId('loop-start').click();
    await expect(composer.getByTestId('loop-stop')).toBeVisible();
    await expect(page.locator('.xterm-screen')).toHaveCount(1);
    await emitActivity(page, 'waiting', 'pty-1');
    await expect(gradient(page)).toHaveAttribute('data-loop-state', 'waiting');

    const waiting = await gradient(page).evaluate((el) => {
      const before = getComputedStyle(el, '::before');
      return { mask: before.maskImage, composite: before.maskComposite };
    });
    expect(waiting.mask).not.toContain('conic-gradient');
    expect(waiting.composite).toBe('add, add, add, add');
  });

  /*
   * The ring is thicker than the app's other gradient borders, and the rim is
   * dimmer than the frame it first shipped at.
   *
   * The border is worth asserting at all because `.fab-panel-gradient` shares
   * its element with Tailwind's own `border` utility (1px) at the same
   * specificity — one class each — so which of the two wins is a
   * stylesheet-order question, not one to take on trust.
   *
   * It is asserted as `>= 2px` rather than `2.5px` because a *used* border
   * width is snapped to whole device pixels: this suite runs at
   * `deviceScaleFactor: 1`, where 2.5px is painted (and reported) as 2px, and
   * on the retina display the app ships to it stays 2.5px. Either way it
   * clears 2, and the 1.5px it replaced could not — that one reported 1px
   * here, which is the same snapping and worth knowing about.
   *
   * The rim's opacity is read under reduced motion, where `fab-glow-pulse` is
   * gone and the pseudo rests at its own base value instead of whichever
   * frame the pulse happened to be mid-way through.
   */
  test('the ring is thicker than 2px and the rim rests at the dimmed trough', async ({
    page,
  }) => {
    await open(page);
    await openFab(page, 'Ideate');
    await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'reduced'));

    const style = await gradient(page).evaluate((el) => ({
      border: getComputedStyle(el).borderTopWidth,
      glow: getComputedStyle(el, '::before').opacity,
    }));

    expect(Number.parseFloat(style.border)).toBeGreaterThanOrEqual(2);
    expect(Number(style.glow)).toBeCloseTo(0.5, 2);
  });

  test("data-motion='reduced' stops the panel's rotation, pulse and arc sweep", async ({
    page,
  }) => {
    await open(page);
    await openFab(page, 'Ideate');
    const before = () =>
      gradient(page).evaluate((el) => getComputedStyle(el, '::before').animationName);

    expect(await before()).toBe('fab-panel-spin, fab-glow-pulse');

    await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'reduced'));
    expect(await before()).toBe('none');

    const transitions = await gradient(page).evaluate((el) => ({
      own: getComputedStyle(el).transitionProperty,
      before: getComputedStyle(el, '::before').transitionProperty,
    }));
    expect(transitions.own).toBe('none');
    expect(transitions.before).toBe('none');

    // The colour survives even though the motion doesn't: still Ideate's
    // arc, resting rather than mid-sweep.
    await expect.poll(() => arcOf(gradient(page))).toEqual(ARCS['Ideate']);

    await page.evaluate(() => document.documentElement.removeAttribute('data-motion'));
    expect(await before()).toBe('fab-panel-spin, fab-glow-pulse');
  });

  /**
   * Blur pauses the ring's rotation as well as the rim's. Each runs its own
   * `fab-panel-spin`, and they agree only because they start on the same frame
   * and tick at the same rate — pause one and not the other and the rim's arc
   * would sit some tens of degrees behind the ring's after every blur.
   */
  test("data-window-focused='false' pauses the ring and the rim together", async ({ page }) => {
    await open(page);
    await openFab(page, 'Ideate');
    // A play-state list is reported as declared, not expanded per animation:
    // the pseudo's two animations under one `paused` read back as `paused`,
    // so each value in the list is checked rather than the list's shape.
    const states = () =>
      gradient(page).evaluate((el) => ({
        own: getComputedStyle(el).animationPlayState.split(', '),
        before: getComputedStyle(el, '::before').animationPlayState.split(', '),
      }));
    const all = (want: string) => async () => {
      const s = await states();
      return [...s.own, ...s.before].every((v) => v === want);
    };

    expect(await all('running')()).toBe(true);

    await page.evaluate(() => document.documentElement.setAttribute('data-window-focused', 'false'));
    expect(await all('paused')()).toBe(true);

    await page.evaluate(() => document.documentElement.removeAttribute('data-window-focused'));
    expect(await all('running')()).toBe(true);
  });
});

test.describe('FAB loop console — rehydration (Theme I)', () => {
  /**
   * A launch that starts with a loop already on disk.
   *
   * Two persisted halves have to agree for this to work, and they are stored
   * apart: the session itself lives in main's `terminals.json` (carrying
   * `surface: 'fab'`), while the loop→session map lives in the renderer's own
   * `fabSessions` slice in localStorage. Seeding both is what a real relaunch
   * hands the app; the packaged version of this check stays on the phase's
   * verification list because only a real quit proves the pty died with it.
   */
  const SLEPT: MockFixtures['terminalSessions'] = [
    {
      session: {
        id: 'sess-fab-innovate',
        kind: 'agent',
        agentId: 'claude',
        title: 'Ideate',
        cwd: '/tmp/midnite-studio',
        repoId: 'repo-1',
        createdAt: 1_787_000_000,
        surface: 'fab',
      },
      scrollback: '$ claude /loop /midnite-brainstorm\r\nPhase 37 candidates:\r\n',
      // No `live`: the pty did not survive the quit, which is the whole point.
    },
  ];

  /**
   * A launch whose renderer already remembers which session belongs to which
   * loop — `fabSessions`, in ui-store's own persisted slice.
   *
   * The init script is registered AFTER `installMockBridge`, so it merges onto
   * the profile that one seeds rather than being overwritten by it: init
   * scripts run in the order they were added.
   */
  async function openRestored(
    page: Page,
    over: Partial<MockFixtures>,
    fabSessions: Record<string, string>,
  ): Promise<void> {
    await installMockBridge(page, { ...fixtures, ...over } as MockFixtures);
    await page.addInitScript((map: Record<string, string>) => {
      try {
        const stored = localStorage.getItem('midnite-studio.ui');
        const persisted = stored ? JSON.parse(stored) : { version: 5 };
        persisted.state = { ...persisted.state, fabSessions: map };
        localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
      } catch {
        /* Same tolerance as the seeder it merges onto: an unparseable profile is discarded. */
      }
    }, fabSessions);
    await page.goto('/');
    await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  }

  test('a persisted FAB session comes back asleep, in its own tab, with its transcript', async ({
    page,
  }) => {
    await openRestored(page, { terminalSessions: SLEPT }, { innovate: 'sess-fab-innovate' });
    await openFab(page);

    const composer = page.getByTestId('loop-composer-innovate');
    // Asleep, not live: Start is the button, and the placeholder that stands
    // in for "no session yet" is gone because there IS a session.
    await expect(composer.getByTestId('loop-start')).toBeVisible();
    await expect(composer.getByTestId('loop-stop')).toHaveCount(0);
    await expect(page.getByText('Press Start to run Ideate')).toHaveCount(0);

    // The transcript is mounted, and no process was spawned to show it.
    await expect(page.locator('.xterm-screen')).toHaveCount(1);
    expect(await ptyCreates(page)).toEqual([]);
  });

  test('a restored FAB session still never reaches the main terminal housing', async ({ page }) => {
      await openRestored(page, { terminalSessions: SLEPT }, { innovate: 'sess-fab-innovate' });

      await page.keyboard.press('Control+`');
      await expect(panel(page)).toBeVisible();
      await expect(rows(page).filter({ hasText: 'Ideate' })).toHaveCount(0);
    },
  );

  test('a fabSessions entry whose session is gone reads as idle, and Start still works', async ({
    page,
  }) => {
    /*
      The failure mode the two-halves split invites: `terminals.json` forgot
      the session (pruned, or the write lost) while localStorage still points
      at it. `useLoopStatus` returns IDLE for a missing row, so the tab must
      offer a fresh run rather than a tab wired to nothing.
    */
    await openRestored(page, {}, { innovate: 'sess-long-gone' });
    await openFab(page);

    const composer = page.getByTestId('loop-composer-innovate');
    await expect(composer.getByTestId('loop-start')).toBeVisible();
    await expect(page.getByText('Press Start to run Ideate')).toBeVisible();

    await composer.getByTestId('loop-start').click();
    await expect(composer.getByTestId('loop-stop')).toBeVisible();
    // The pty behind the tab is created once TerminalView's lazy chunk mounts
    // (Phase 36 Theme C) — a moment after Stop appears, not the same tick.
    await expect(page.locator('.xterm-screen')).toHaveCount(1);
    expect(await ptyCreates(page)).toHaveLength(1);
  });

  test('a sleeping FAB session ignores a focus report — switching tabs does not revive it', async ({
    page,
  }) => {
    /*
      An exited pane stays mounted (it's covered by an "ended" strip, not
      unmounted), and its xterm instance can still have DEC focus-tracking
      latched on from whatever ran before — Claude's own Ink-based TUI
      enables it and nothing ever turns it off on exit. Switching FAB tabs
      moves real DOM focus off this tab's hidden textarea and onto the next
      one, which used to be read as "the user typed something" and silently
      spawned a brand-new, empty session.
    */
    const withFocusTracking: MockFixtures['terminalSessions'] = [
      { ...SLEPT[0], scrollback: `${SLEPT[0].scrollback}\x1b[?1004h` },
    ];
    await openRestored(page, { terminalSessions: withFocusTracking }, { innovate: 'sess-fab-innovate' });
    await openFab(page, 'Ideate');
    expect(await ptyCreates(page)).toEqual([]);

    // Focus follows selection, so the tab's xterm already holds DOM focus.
    // Blurring it and refocusing it is what a tab switch, a window blur, or
    // Cmd-Tab does — with focus tracking armed, xterm turns that into an
    // `ESC[O`/`ESC[I` pair on the very `onData` stream real keystrokes use.
    const textarea = page.locator('.xterm-helper-textarea').first();
    await expect(textarea).toBeFocused();
    await textarea.evaluate((el) => (el as HTMLTextAreaElement).blur());
    await textarea.focus();

    expect(await ptyCreates(page)).toEqual([]);
    // Still asleep, not revived: Start is still the button on offer.
    await expect(page.getByTestId('loop-composer-innovate').getByTestId('loop-start')).toBeVisible();
  });
});
