import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Phase 15's verification pass, as far as a browser can take it.
 *
 * The panel is driven against the mocked bridge's fake pty — which writes a
 * prompt, echoes keystrokes and answers a short transcript — so the things
 * being asserted here are the renderer's: how many panes exist, which one is
 * live, which side the list docks to, and what order the rows are in. What a
 * browser genuinely cannot reach is noted at the bottom of the phase doc rather
 * than faked here: a real relaunch, and `ps` proving no shell outlived it.
 */

const session = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  kind: 'shell',
  title: 'midnite-git',
  cwd: '/tmp/midnite-git',
  repoId: 'repo-1',
  createdAt: 1_787_000_000,
  ...over,
});

/** Two restored shells and one restored Claude agent — the manual case, seeded. */
const RESTORED: MockFixtures['terminalSessions'] = [
  { session: session('s-1', { title: 'midnite-git' }), scrollback: '$ git status\r\nOn branch main\r\n' },
  { session: session('s-2', { title: 'other-repo', cwd: '/tmp/other-repo' }), scrollback: '$ ls\r\ndocs\r\n' },
  {
    session: session('s-3', { kind: 'agent', agentId: 'claude', title: 'midnite-git' }),
    scrollback: '[38;2;217;119;87m✻[0m Welcome to Claude Code\r\n',
  },
];

async function open(page: Page, over: Partial<MockFixtures> = {}): Promise<void> {
  await installMockBridge(page, { ...fixtures, ...over } as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

/** `Ctrl+\`` on every platform — macOS reserves Cmd+\` for window cycling. */
async function toggleTerminal(page: Page): Promise<void> {
  await page.keyboard.press('Control+`');
}

const panel = (page: Page) => page.locator('[data-terminal-panel]');
/** The session list's rows. `IconButton` renders its label twice, so count these. */
const rows = (page: Page) => page.locator('[data-session-row]');

/**
 * What crossed the bridge.
 *
 * xterm paints through the WebGL addon, so a terminal's contents are canvas
 * pixels and no DOM query can read them. The pty's traffic is both reachable
 * and the more precise thing to assert: "the shell survived hiding the panel"
 * IS "no kill was sent and no second create followed", stated in the terms the
 * contract is written in rather than inferred from a screenful of text.
 */
const ptyCalls = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as {
        __mgitPty: {
          creates: { ptyId: string; sessionId: string }[];
          inputs: { ptyId: string; data: string }[];
          kills: string[];
        };
      }).__mgitPty,
  );

test.describe('terminal panel', () => {
  test('opens on Ctrl+` and starts one shell for the selected worktree', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('button', { name: 'New terminal or agent' })).toHaveCount(0);

    await toggleTerminal(page);
    await expect(page.getByRole('button', { name: 'New terminal or agent' })).toBeVisible();

    // One pane, and one pty behind it. A create that came back without the
    // `ok: true` discriminant would leave the panel in its "unavailable" state
    // with no pane at all — which is what the mock used to produce silently.
    await expect(page.locator('.xterm-screen')).toBeVisible();
    await expect
      .poll(async () => (await ptyCalls(page)).creates.length)
      .toBe(1);

    // And it closes again on the same chord, with the terminal focused — the
    // chord has to escape xterm's own key handling via the global allow-list,
    // which is the easiest thing in this phase to break silently.
    await page.locator('.xterm-screen').click();
    await toggleTerminal(page);
    await expect(page.getByRole('button', { name: 'New terminal or agent' })).toHaveCount(0);
  });

  test('a second terminal gets its own pane and a session list', async ({ page }) => {
    await open(page);
    await toggleTerminal(page);

    // One session is chrome that explains nothing, so the list only appears
    // past the first.
    await expect(rows(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'New terminal or agent' }).click();
    await page.getByRole('menuitem', { name: 'New Terminal' }).click();

    await expect(rows(page)).toHaveCount(2);
    // Two panes and two ptys, not one reused: a session's scrollback is its own.
    await expect(page.locator('.xterm-screen')).toHaveCount(2);
    const calls = await ptyCalls(page);
    expect(calls.creates).toHaveLength(2);
    expect(new Set(calls.creates.map((c) => c.sessionId)).size).toBe(2);
  });

  test('a Claude agent row carries the mark and its accent', async ({ page }) => {
    await open(page);
    await toggleTerminal(page);

    await page.getByRole('button', { name: 'New terminal or agent' }).click();
    await page.getByRole('menuitem', { name: /New Agent — Claude/ }).click();

    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByText('Claude · midnite-git')).toBeVisible();

    // The accent comes from the roster, not from a switch in the component —
    // #D97757 is Claude's, and a mark painted in the default foreground means
    // the agent definition never reached the icon. The row's leading glyph is
    // its first svg; the close button's is the other one.
    const accent = await page
      .locator('[data-session-row]')
      .filter({ hasText: 'Claude' })
      .locator('svg')
      .first()
      .evaluate((node) => getComputedStyle(node).color);
    expect(accent).toBe('rgb(217, 119, 87)');
  });

  test('the session list docks to either side', async ({ page }) => {
    await open(page, { terminalSessions: RESTORED });
    await toggleTerminal(page);
    await expect(rows(page)).toHaveCount(3);

    const listBox = async () => (await page.locator('[data-session-list]').boundingBox())!;
    const paneBox = async () => (await page.locator('.xterm-screen').first().boundingBox())!;

    // Right by default.
    expect((await listBox()).x).toBeGreaterThan((await paneBox()).x);

    // Docking is a context menu on the list, not permanent chrome — it is set
    // once and then never again.
    await page.locator('[data-session-list]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to left' }).click();
    expect((await listBox()).x).toBeLessThan((await paneBox()).x);

    // And it is a preference, so it survives a reload — as does the panel
    // being open at all, which Phase 15 started persisting deliberately.
    await page.reload();
    await expect(page.getByRole('button', { name: 'New terminal or agent' })).toBeVisible();
    expect((await listBox()).x).toBeLessThan((await paneBox()).x);
  });

  test('maximize fills the window and restores', async ({ page }) => {
    await open(page, { terminalSessions: RESTORED });
    await toggleTerminal(page);

    const height = async () => (await panel(page).boundingBox())!.height;
    const normal = await height();

    await page.getByRole('button', { name: 'Expand terminal' }).click();
    const tall = await height();
    expect(tall).toBeGreaterThan(normal);
    // The graph is what it takes the room from.
    await expect(page.getByRole('columnheader', { name: 'Commit message' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Restore terminal height' }).click();
    expect(await height()).toBeCloseTo(normal, 0);
    await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  });

  /**
   * The app column is exactly the viewport, so nothing can slide under the bar.
   *
   * It used to be one title bar TALLER: the column was pushed below the bar
   * with a top margin AND sized `100vh - var(--titlebar-h)`, which is the bar's
   * height twice over. `body { overflow: hidden }` hides that from the wheel,
   * but not from the platform — `focus()` and `scrollIntoView()` scroll an
   * overflow-hidden viewport quite happily, and clicking into a terminal
   * focuses xterm's hidden textarea. One click, 48px, and the app sat under
   * the bar with no gesture that could bring it back.
   */
  test('the document has nothing to scroll, so focus cannot shift the app', async ({ page }) => {
    await open(page, { terminalSessions: RESTORED });
    await toggleTerminal(page);
    await page.getByRole('button', { name: 'Expand terminal' }).click();

    const room = await page.evaluate(() => {
      const de = document.documentElement;
      return de.scrollHeight - de.clientHeight;
    });
    expect(room).toBe(0);

    // And the guarantee stated as the symptom: scrolled at, hard, the
    // terminal's own controls are still the thing under the pointer rather
    // than the title bar drawn on top of them.
    await page.evaluate(() => window.scrollTo(0, 400));

    const header = page.locator('[data-terminal-header]');
    const box = (await header.boundingBox())!;
    const strays = await page.evaluate(
      (points) =>
        points
          .map(({ x, y }) => {
            const hit = document.elementFromPoint(x, y);
            if (hit?.closest('[data-terminal-panel]')) return null;
            return { x: Math.round(x), label: hit?.getAttribute('aria-label') ?? hit?.tagName ?? 'none' };
          })
          .filter((entry) => entry !== null),
      Array.from({ length: 16 }, (_, at) => ({
        x: box.x + ((at + 0.5) * box.width) / 16,
        y: box.y + box.height / 2,
      })),
    );
    expect(strays).toEqual([]);

    // Clickable, not merely uncovered — the bug's actual cost was a maximized
    // terminal you could not put back.
    await page.getByRole('button', { name: 'Restore terminal height' }).click();
    await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  });

  /**
   * The restore contract, which is the whole point of the phase: a session
   * outlives its pty, so it comes back as a row with scrollback and NO process
   * until you ask for one.
   */
  test('restored sessions come back dimmed, with their scrollback, and revive', async ({
    page,
  }) => {
    await open(page, { terminalSessions: RESTORED });
    await toggleTerminal(page);

    await expect(rows(page)).toHaveCount(3);
    // Dimmed: no pty was created for any of them, so every label is muted.
    const labels = page.locator('[data-session-list] span.truncate');
    for (let i = 0; i < 3; i += 1) {
      await expect(labels.nth(i)).toHaveClass(/text-muted-foreground/);
    }

    // Dimmed means genuinely process-less, not merely styled that way.
    expect((await ptyCalls(page)).creates).toEqual([]);

    // Enter revives the session it is typed into — and only that one.
    await page.locator('.xterm-screen').first().click();
    await page.keyboard.press('Enter');
    await expect(labels.nth(0)).not.toHaveClass(/text-muted-foreground/);
    await expect(labels.nth(1)).toHaveClass(/text-muted-foreground/);
    expect((await ptyCalls(page)).creates.map((c) => c.sessionId)).toEqual(['s-1']);
  });

  /**
   * Phase 9's rule was "unmount the panel, kill the shell". Phase 15 overturns
   * it, and a hidden-then-shown panel that lost its process would look exactly
   * like one that kept it — until you notice the prompt is gone.
   */
  test('hiding the panel does not kill the shell', async ({ page }) => {
    await open(page);
    await toggleTerminal(page);
    await page.locator('.xterm-screen').click();

    await page.keyboard.type('git status\r');
    await expect.poll(async () => (await ptyCalls(page)).inputs.length).toBeGreaterThan(0);
    const before = await ptyCalls(page);

    await page.getByRole('button', { name: 'Hide terminal' }).click();
    await expect(page.getByRole('button', { name: 'New terminal or agent' })).toHaveCount(0);
    await toggleTerminal(page);
    await expect(page.locator('.xterm-screen')).toBeVisible();

    const after = await ptyCalls(page);
    // Nothing was killed, and nothing was started to replace it — the Phase 9
    // unmount-kills-the-shell rule is genuinely overturned rather than just
    // looking the same on screen.
    expect(after.kills).toEqual([]);
    expect(after.creates).toEqual(before.creates);
  });

  /**
   * The session list's own width, independent of the terminal pane beside it —
   * previously a fixed `w-44`, now a drag like every other split in the app.
   */
  test('the session list resizes independently of the terminal pane', async ({ page }) => {
    await open(page, { terminalSessions: RESTORED });
    await toggleTerminal(page);

    const list = page.locator('[data-session-list]');
    const before = (await list.boundingBox())!;

    const handle = page.getByRole('separator', { name: 'Resize terminal sessions' });
    const handleBox = (await handle.boundingBox())!;
    const midY = handleBox.y + handleBox.height / 2;

    await page.mouse.move(handleBox.x + handleBox.width / 2, midY);
    await page.mouse.down();
    // Docked right (the default), the handle sits LEFT of the list — growing
    // it means dragging left, the same inversion the panel's own height
    // handle needs against the pane above it.
    await page.mouse.move(handleBox.x - 60, midY, { steps: 6 });
    await page.mouse.up();

    const after = (await list.boundingBox())!;
    expect(after.width).toBeGreaterThan(before.width + 40);
    // The pane beside it did not move with it — the two size independently.
    await expect(page.locator('.xterm-screen').first()).toBeVisible();

    // Survives a reload, like every other dragged pane in the app.
    await page.reload();
    await expect(page.getByRole('button', { name: 'New terminal or agent' })).toBeVisible();
    expect((await list.boundingBox())!.width).toBeCloseTo(after.width, 0);
  });

  /**
   * Drag-to-reorder, with a real pointer.
   *
   * `@dnd-kit`'s PointerSensor has a 6px activation constraint, so the move has
   * to travel in steps rather than jump — and the repos panel sits outside
   * `GraphDndProvider` precisely so this second `DndContext` cannot misroute
   * into it. Nothing but a real gesture catches that.
   */
  test('sessions drag into a new order', async ({ page }) => {
    await open(page, { terminalSessions: RESTORED });
    await toggleTerminal(page);

    const titles = () =>
      page.locator('[data-session-list] span.truncate').allTextContents();
    expect(await titles()).toEqual(['midnite-git', 'other-repo', 'Claude · midnite-git']);

    const first = (await page.locator('[data-session-row]').first().boundingBox())!;
    const third = (await page.locator('[data-session-row]').nth(2).boundingBox())!;

    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();
    // Past the 6px constraint, then down in steps so dnd-kit sees movement.
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2 + 10);
    await page.mouse.move(first.x + first.width / 2, third.y + third.height / 2, { steps: 8 });
    await page.mouse.up();

    expect(await titles()).toEqual(['other-repo', 'Claude · midnite-git', 'midnite-git']);
  });
});

/**
 * Written into `docs/screenshots/`, the way every visual phase here does — the
 * shots stay readable in the repo long after a test run's artefacts are gone.
 */
test.describe('phase 15 screenshots', () => {
  test('the panel, and the panel maximized', async ({ page }) => {
    await open(page, { terminalSessions: RESTORED });
    await toggleTerminal(page);

    // Revive the first two so the shot shows both states — live rows and a
    // dimmed one — which is the thing the session list exists to tell apart.
    /*
      Revive first, THEN type.

      The keystroke that wakes a dead session is deliberately not forwarded —
      it belongs to the gesture, not to the command line — so typing straight
      into a restored pane loses its first character and the shot shows a shell
      complaining about `it status`. Waiting for the pty is what separates the
      two, and it is the same order a person uses without thinking about it.
    */
    await page.locator('.xterm-screen').first().click();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await ptyCalls(page)).creates.length).toBe(1);
    await page.waitForTimeout(200);
    await page.keyboard.type('git status\r');
    await page.waitForTimeout(400);

    await page.screenshot({ path: '../../docs/screenshots/phase-15-terminals.png' });

    await page.getByRole('button', { name: 'Expand terminal' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: '../../docs/screenshots/phase-15-terminal-maximized.png' });
  });
});
