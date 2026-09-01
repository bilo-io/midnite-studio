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
  await expect(page.getByRole('button', { name: 'Innovate', exact: true })).toBeVisible();
  if (tab) await page.getByRole('button', { name: tab, exact: true }).click();
  await page.waitForTimeout(SETTLE_WAIT_MS);
}

/** The reveal tween's own duration (`REVEAL_MS` in `use-reveal.ts`), plus slack. */
const SETTLE_WAIT_MS = 300;

/** What the app asked the (fake) main process to record about its runs. */
const loopRuns = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __mstudioLoopRuns: () => Array<Record<string, unknown>> }
    ).__mstudioLoopRuns(),
  );

/** Say that main's activity detector changed its guess for the newest pty. */
async function emitActivity(
  page: Page,
  activity: 'thinking' | 'waiting' | 'idle' | null,
  ptyId: string,
): Promise<void> {
  const delivered = await page.evaluate(
    ({ id, act }) =>
      (
        window as unknown as {
          __mstudioPtyActivity: (p: string, a: typeof act) => boolean;
        }
      ).__mstudioPtyActivity(id, act),
    { id: ptyId, act: activity },
  );
  expect(delivered, `pty:activity was not delivered to ${ptyId}`).toBe(true);
}

test.describe('FAB loop console', () => {
  test('renders the four loops from the registry, with no session spawned on mount', async ({
    page,
  }) => {
    await open(page);
    await openFab(page);

    for (const label of ['Innovate', 'Automate', 'Watchdog', 'Medic']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    // The eager-spawn bug: four panes used to appear before anything was pressed.
    await expect(page.locator('.xterm-screen')).toHaveCount(0);
    expect(await loopRuns(page)).toEqual([]);
  });

  test('a loop tab offers its declared modifiers and an extras field', async ({ page }) => {
    await open(page);
    await openFab(page, 'Watchdog');

    const composer = page.getByTestId('loop-composer-watchdog');
    await expect(composer.getByLabel('Watch dependabot PRs')).toBeVisible();
    await expect(composer.getByLabel('Triage only')).toBeVisible();
    await expect(composer.getByPlaceholder('Extra instructions…')).toBeVisible();
  });

  test('Start composes the prompt from the checked modifiers and the extras', async ({ page }) => {
    await open(page);
    await openFab(page, 'Watchdog');

    const composer = page.getByTestId('loop-composer-watchdog');
    await composer.getByLabel('Watch dependabot PRs').check();
    await composer.getByPlaceholder('Extra instructions…').fill('Skip drafts.');
    await composer.getByTestId('loop-start').click();

    await expect.poll(async () => (await loopRuns(page)).length).toBe(1);
    const [run] = await loopRuns(page);
    expect(run?.['loopId']).toBe('watchdog');
    expect(run?.['composedPrompt']).toBe(
      '/loop /midnite-address-issue Also watch for dependabot PRs and handle them. Skip drafts.',
    );
    // Only the checked one — the unchecked "Triage only" fragment must not ride along.
    expect(run?.['checkedModifierIds']).toEqual(['dependabot']);
  });

  test('the loop session never appears in the main terminal housing', async ({ page }) => {
    await open(page);
    await openFab(page);
    await page.getByTestId('loop-composer-innovate').getByTestId('loop-start').click();
    await expect(page.getByTestId('loop-composer-innovate').getByTestId('loop-stop')).toBeVisible();

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
    await expect(rows(page).filter({ hasText: 'Innovate' })).toHaveCount(0);
    // Whatever the panel opened for itself, the FAB's pane still has its own.
    await expect(page.getByTestId('loop-composer-innovate').getByTestId('loop-stop')).toBeVisible();
  });

  test('starting a loop does not open the main terminal panel', async ({ page }) => {
    await open(page);
    await openFab(page, 'Automate');
    await page.getByTestId('loop-composer-automate').getByTestId('loop-start').click();
    await expect(page.getByTestId('loop-composer-automate').getByTestId('loop-stop')).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
  });

  test('Start swaps to a glowing Stop, and the composer collapses to chips', async ({ page }) => {
    await open(page);
    await openFab(page, 'Medic');

    const composer = page.getByTestId('loop-composer-medic');
    await composer.getByLabel('Auto-approve passing PRs').check();
    await composer.getByTestId('loop-start').click();

    const stop = composer.getByTestId('loop-stop');
    await expect(stop).toBeVisible();
    await expect(stop).toHaveClass(/loop-run-glow/);
    // Collapsed: the inputs are gone, the checked modifier survives as a chip.
    await expect(composer.getByPlaceholder('Extra instructions…')).toHaveCount(0);
    await expect(composer.getByText('Auto-approve passing PRs')).toBeVisible();
  });

  test('a waiting loop turns its tab dot and the FAB dot amber', async ({ page }) => {
    await open(page);
    await openFab(page);
    await page.getByTestId('loop-composer-innovate').getByTestId('loop-start').click();
    await expect(page.getByTestId('loop-composer-innovate').getByTestId('loop-stop')).toBeVisible();

    await expect(page.getByTestId('loop-dot-innovate')).toHaveClass(/text-blue-500/);
    await emitActivity(page, 'waiting', 'pty-1');
    await expect(page.getByTestId('loop-dot-innovate')).toHaveClass(/bg-amber-500/);
    await expect(page.getByTestId('fab-loop-dot-innovate')).toHaveClass(/bg-amber-500/);
  });

  test('the collapsed FAB shows a dot per live loop and none when idle', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('fab-loop-dots')).toHaveCount(0);

    await openFab(page);
    await page.getByTestId('loop-composer-innovate').getByTestId('loop-start').click();
    await page.getByRole('button', { name: 'Automate', exact: true }).click();
    await page.waitForTimeout(SETTLE_WAIT_MS);
    await page.getByTestId('loop-composer-automate').getByTestId('loop-start').click();

    await expect(page.getByTestId('fab-loop-dot-innovate')).toBeVisible();
    await expect(page.getByTestId('fab-loop-dot-automate')).toBeVisible();
    await expect(page.getByTestId('fab-loop-dot-watchdog')).toHaveCount(0);
  });

  test('Stop finalises the run and the history records what it carried', async ({ page }) => {
    await open(page);
    await openFab(page);
    const composer = page.getByTestId('loop-composer-innovate');
    await composer.getByLabel('Prefer small phases').check();
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

/** Kill a pty the way the world does — nothing in the app asked for this. */
async function exitPty(page: Page, ptyId: string, exitCode = 0): Promise<void> {
  const delivered = await page.evaluate(
    ({ id, code }) =>
      (
        window as unknown as {
          __mstudioPtyExit: (p: string, c: number) => boolean;
        }
      ).__mstudioPtyExit(id, code),
    { id: ptyId, code: exitCode },
  );
  expect(delivered, `pty:exit was not delivered to ${ptyId}`).toBe(true);
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

  test('an exited loop drops the glow and its dots', async ({ page }) => {
    await open(page);
    await openFab(page);
    const composer = page.getByTestId('loop-composer-innovate');
    await composer.getByTestId('loop-start').click();
    await expect(composer.getByTestId('loop-stop')).toHaveClass(/loop-run-glow/);
    await expect(page.getByTestId('fab-loop-dot-innovate')).toBeVisible();

    await exitPty(page, 'pty-1');

    await expect(composer.getByTestId('loop-start')).not.toHaveClass(/loop-run-glow/);
    await expect(page.getByTestId('fab-loop-dot-innovate')).toHaveCount(0);
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

    // Away from the loop's own tab, and out of the panel entirely — the case
    // the notice exists for is a loop that went quiet while you were elsewhere.
    await page.getByRole('button', { name: 'Automate', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(SETTLE_WAIT_MS);

    await emitActivity(page, 'waiting', 'pty-1');

    await page.getByTestId('notification-bell').click();
    const notice = page.getByText('Innovate is waiting for input.');
    await expect(notice).toBeVisible();

    await page.getByRole('button', { name: 'Open Innovate' }).click();
    /*
      The panel reopens on the loop that asked, not on whichever tab was last.
      Visibility rather than presence: all four tabs stay MOUNTED (each pane
      owns an xterm that must not be torn down every time you switch), and the
      inactive ones are hidden with `invisible` — so a count assertion here
      would pass no matter which tab the action landed on.
    */
    await expect(page.getByTestId('loop-composer-innovate')).toBeVisible();
    await expect(page.getByTestId('loop-composer-automate')).not.toBeVisible();
  });

  test('the notice is debounced by transition, not by time', async ({ page }) => {
    await open(page);
    await openFab(page);
    await page.getByTestId('loop-composer-innovate').getByTestId('loop-start').click();
    await expect(page.getByTestId('loop-composer-innovate').getByTestId('loop-stop')).toBeVisible();

    const notices = () => page.getByText('Innovate is waiting for input.');

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

    await emitActivity(page, 'thinking', 'pty-1');
    expect(await animationName(page)).toBe('loop-glow-spin, loop-glow-pulse');

    await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'reduced'));
    expect(await animationName(page)).toBe('none');
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
        title: 'Innovate',
        cwd: '/tmp/midnite-studio',
        repoId: 'repo-1',
        createdAt: 1_787_000_000,
        surface: 'fab',
      },
      scrollback: '$ claude /loop /midnite-brainstorm\r\nPhase 37 candidates:\r\n',
      // No `live`: the pty did not survive the quit, which is the whole point.
    },
  ];

  async function openRestored(page: Page): Promise<void> {
    await installMockBridge(page, { ...fixtures, terminalSessions: SLEPT } as MockFixtures);
    /*
      Registered AFTER `installMockBridge`, so it merges onto the profile that
      one seeds rather than being overwritten by it — init scripts run in the
      order they were added.
    */
    await page.addInitScript(() => {
      try {
        const stored = localStorage.getItem('midnite-studio.ui');
        const persisted = stored ? JSON.parse(stored) : { version: 5 };
        persisted.state = { ...persisted.state, fabSessions: { innovate: 'sess-fab-innovate' } };
        localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
      } catch {
        /* Same tolerance as the seeder above: an unparseable profile is discarded. */
      }
    });
    await page.goto('/');
    await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  }

  test('a persisted FAB session comes back asleep, in its own tab, with its transcript', async ({
    page,
  }) => {
    await openRestored(page);
    await openFab(page);

    const composer = page.getByTestId('loop-composer-innovate');
    // Asleep, not live: Start is the button, and the placeholder that stands
    // in for "no session yet" is gone because there IS a session.
    await expect(composer.getByTestId('loop-start')).toBeVisible();
    await expect(composer.getByTestId('loop-stop')).toHaveCount(0);
    await expect(page.getByText('Press Start to run Innovate')).toHaveCount(0);

    // The transcript is mounted, and no process was spawned to show it.
    await expect(page.locator('.xterm-screen')).toHaveCount(1);
    expect(await ptyCreates(page)).toEqual([]);
  });

  test('a restored FAB session still never reaches the main terminal housing', async ({ page }) => {
    await openRestored(page);

    await page.keyboard.press('Control+`');
    await expect(panel(page)).toBeVisible();
    await expect(rows(page).filter({ hasText: 'Innovate' })).toHaveCount(0);
  });

  test('a fabSessions entry whose session is gone reads as idle, and Start still works', async ({
    page,
  }) => {
    /*
      The failure mode the two-halves split invites: `terminals.json` forgot
      the session (pruned, or the write lost) while localStorage still points
      at it. `useLoopStatus` returns IDLE for a missing row, so the tab must
      offer a fresh run rather than a tab wired to nothing.
    */
    await installMockBridge(page, { ...fixtures } as MockFixtures);
    await page.addInitScript(() => {
      try {
        const stored = localStorage.getItem('midnite-studio.ui');
        const persisted = stored ? JSON.parse(stored) : { version: 5 };
        persisted.state = { ...persisted.state, fabSessions: { innovate: 'sess-long-gone' } };
        localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
      } catch {
        /* As above. */
      }
    });
    await page.goto('/');
    await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
    await openFab(page);

    const composer = page.getByTestId('loop-composer-innovate');
    await expect(composer.getByTestId('loop-start')).toBeVisible();
    await expect(page.getByText('Press Start to run Innovate')).toBeVisible();

    await composer.getByTestId('loop-start').click();
    await expect(composer.getByTestId('loop-stop')).toBeVisible();
    expect(await ptyCreates(page)).toHaveLength(1);
  });
});
