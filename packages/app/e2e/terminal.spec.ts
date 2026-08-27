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

/**
 * Make the fake shell emit an OSC 7 sequence on the one open pty — `ESC ] 7 ;
 * <payload> BEL`, exactly as a configured shell writes it on `cd`.
 */
async function emitOsc7(page: Page, payload: string): Promise<void> {
  const delivered = await page.evaluate((text) => {
    const write = (window as unknown as { __mgitPtyWrite: (id: string, data: string) => boolean })
      .__mgitPtyWrite;
    return write('pty-1', `\u001b]7;${text}\u0007`);
  }, payload);
  // The hook no-ops on an unknown pty id. Without this, a spec whose pty
  // numbering shifted would go on making negative assertions about a sequence
  // that was never delivered, and pass for entirely the wrong reason.
  expect(delivered, `OSC 7 was not delivered to pty-1: ${payload}`).toBe(true);
}

/**
 * Say that main's process probe just noticed something in a pty.
 *
 * `null` is a real answer — "looked, recognised nothing" — and is a different
 * thing from never having emitted, which is the distinction these specs exist to
 * pin down. There is no fake `ps` behind this: main's matcher is unit-tested
 * against captured process listings (`agent-process.test.ts`), and what a spec
 * can only assert here is the renderer half.
 */
async function emitAgentChanged(
  page: Page,
  agentId: string | null,
  ptyId = 'pty-1',
): Promise<void> {
  const delivered = await page.evaluate(
    ({ id, agent }) => {
      const notify = (
        window as unknown as { __mgitPtyAgent: (p: string, a: string | null) => boolean }
      ).__mgitPtyAgent;
      return notify(id, agent);
    },
    { id: ptyId, agent: agentId },
  );
  // Same trap as `emitOsc7`: the hook no-ops on an unknown pty id, so a spec
  // whose numbering shifted would make negative assertions about an event that
  // never arrived and pass for the wrong reason.
  expect(delivered, `pty:agent-changed was not delivered to ${ptyId}: ${agentId}`).toBe(true);
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

/**
 * Click a control and measure one box, once per frame, until it stops moving.
 *
 * Clicked and sampled INSIDE the page on purpose. A `boundingBox()` per frame
 * from the test process spends most of a 200ms animation in transit and can
 * easily read only its first and last value — which is exactly what a panel
 * that CUT between the two would report. A rect per `requestAnimationFrame`
 * misses no frame, so "it went through the middle" becomes something the test
 * can see rather than infer.
 */
const slide = (
  page: Page,
  control: string,
  box: string,
  axis: 'width' | 'height',
): Promise<number[]> =>
  page.evaluate(
    async ([controlSelector, boxSelector, side]) => {
      document.querySelector<HTMLElement>(controlSelector)?.click();
      const sizes: number[] = [];
      /*
        40 frames is ~660ms: the transition is 200ms, it waits for a frame the
        main thread is not busy in before it starts, and a frame that has a
        panel mounting in it can take a while. Overshooting by this much is what
        makes the LAST sample the settled size, so the test can compare against
        the layout's own number rather than hard-coding one.
      */
      for (let frame = 0; frame < 40; frame += 1) {
        await new Promise((done) => requestAnimationFrame(done));
        const rect = document.querySelector(boxSelector)?.getBoundingClientRect();
        sizes.push(rect ? Math.round(side === 'width' ? rect.width : rect.height) : 0);
      }
      return sizes;
    },
    [control, box, axis] as const,
  );

/** Sorted, so ease-in-out's monotony is stated rather than eyeballed. */
const rising = (sizes: number[]) => [...sizes].sort((a, b) => a - b);
const falling = (sizes: number[]) => [...sizes].sort((a, b) => b - a);

/** Did it stop anywhere between the two ends, or did it cut? */
const passedThrough = (sizes: number[], from: number, to: number) =>
  sizes.some((size) => size > Math.min(from, to) + 8 && size < Math.max(from, to) - 8);

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

  /**
   * The `+` menu is flat and iconned now: New Terminal, then the four agents by
   * name. The `New Agent — ` prefix existed to disambiguate one entry from a
   * heading; with four named agents the label IS the disambiguation.
   */
  test('the + menu names every agent in the roster', async ({ page }) => {
    await open(page);
    await toggleTerminal(page);
    await page.getByRole('button', { name: 'New terminal or agent' }).click();

    for (const label of ['New Terminal', 'Claude Code', 'Antigravity', 'Codex', 'OpenClaude']) {
      await expect(page.getByRole('menuitem', { name: label, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('menuitem', { name: /New Agent —/ })).toHaveCount(0);
  });

  /**
   * The whole point of the install probe: a session that would open and
   * immediately print `command not found` becomes an explanation instead. The
   * mock bridge reports OpenClaude missing and the other three present, which
   * mirrors the machine this phase was written on.
   */
  test('an uninstalled agent is disabled and says how to install it', async ({ page }) => {
    await open(page);
    await toggleTerminal(page);
    await page.getByRole('button', { name: 'New terminal or agent' }).click();

    const missing = page.getByRole('menuitem', { name: 'OpenClaude', exact: true });
    await expect(missing).toBeDisabled();
    await expect(missing).toHaveAttribute('title', 'npm i -g @gitlawb/openclaude');

    // Only that one — a probe result must not cost the agents that ARE there.
    await expect(page.getByRole('menuitem', { name: 'Codex', exact: true })).toBeEnabled();
  });

  test('an agent row carries its own mark and its own accent', async ({ page }) => {
    await open(page);
    await toggleTerminal(page);

    await page.getByRole('button', { name: 'New terminal or agent' }).click();
    await page.getByRole('menuitem', { name: 'Claude Code', exact: true }).click();

    await expect(rows(page)).toHaveCount(2);
    /*
      Visible, not merely present. The name span used to be `flex-1` against a
      `shrink` repo name — basis zero against basis auto — so at the list's
      default width it collapsed to nothing and the row named its repo twice
      while saying nothing about which agent was running in it.
    */
    await expect(page.locator('[data-session-name]', { hasText: 'Claude Code' })).toBeVisible();

    // The accent comes from the roster, not from a switch in the component —
    // #D97757 is Claude's, and a mark painted in the default foreground means
    // the agent definition never reached the icon. The row's leading glyph is
    // its first svg; the close button's is the other one.
    const accent = await page
      .locator('[data-session-row]')
      .filter({ hasText: 'Claude Code' })
      .locator('svg')
      .first()
      .evaluate((node) => getComputedStyle(node).color);
    expect(accent).toBe('rgb(217, 119, 87)');
  });

  /**
   * The registry's reason for existing. Two agent rows, two DIFFERENT marks and
   * two different accents — the version of `SessionIcon` this phase replaced
   * would have painted both of them Claude's.
   */
  test('two agents from the same roster get different marks', async ({ page }) => {
    await open(page);
    await toggleTerminal(page);

    for (const label of ['Claude Code', 'Codex']) {
      await page.getByRole('button', { name: 'New terminal or agent' }).click();
      await page.getByRole('menuitem', { name: label, exact: true }).click();
    }

    const markOf = async (label: string) =>
      page
        .locator('[data-session-row]')
        .filter({ hasText: label })
        .locator('svg')
        .first()
        .evaluate((node) => ({
          color: getComputedStyle(node).color,
          shape: node.innerHTML,
        }));

    const claude = await markOf('Claude Code');
    const codex = await markOf('Codex');

    expect(claude.color).toBe('rgb(217, 119, 87)');
    expect(codex.color).toBe('rgb(16, 163, 127)');
    expect(claude.shape).not.toBe(codex.shape);
  });

  /**
   * Theme E's whole point, from the side the user sees it.
   *
   * A plain shell that someone typed `codex` into is indistinguishable from any
   * other shell until main looks at its process tree — and before this existed
   * the row went on claiming to be a bare terminal for as long as the session
   * lived.
   */
  test('a shell running an agent takes on that agent\u2019s mark', async ({ page }) => {
    await open(page);
    await toggleTerminal(page);
    /*
      A second terminal, because the session list governs nothing while there is
      one session — the header already says everything a list of one could, so
      the toggle is disabled and no row is rendered at all.
    */
    await page.getByRole('button', { name: 'New terminal or agent' }).click();
    await page.getByRole('menuitem', { name: 'New Terminal', exact: true }).click();
    await expect(rows(page)).toHaveCount(2);
    await expect.poll(async () => (await ptyCalls(page)).creates.length).toBe(2);

    // The repo's own auto-opened session, which is `pty-1`.
    const row = rows(page).first();
    const mark = row.locator('svg').first();
    const colourOf = () => mark.evaluate((node) => getComputedStyle(node).color);

    // A shell's glyph is painted in the row's own text colour, never an accent.
    const before = await colourOf();
    expect(before).not.toBe('rgb(16, 163, 127)');

    await emitAgentChanged(page, 'codex');

    // Codex's roster accent, resolved through the icon registry.
    await expect.poll(colourOf).toBe('rgb(16, 163, 127)');

    /*
      Icons only, deliberately. `sessionLabel` already resolves four ways and a
      fifth input into that ordering wants its own design pass, so the row keeps
      the name it had — it did not silently become "Codex".
    */
    await expect(row.locator('[data-session-name]')).not.toHaveText('Codex');
  });

  /**
   * The header's half of the same fact: with Theme D's path beside it, the left
   * of that strip names the current repository and the current agent rather than
   * whichever menu item opened the session.
   */
  test('the header\u2019s glyph follows what is running, not what was opened', async ({ page }) => {
    await open(page);
    await toggleTerminal(page);
    await expect.poll(async () => (await ptyCalls(page)).creates.length).toBe(1);

    const glyph = page.locator('[data-terminal-header] svg').first();
    const colourOf = () => glyph.evaluate((node) => getComputedStyle(node).color);

    await emitAgentChanged(page, 'claude');
    await expect.poll(colourOf).toBe('rgb(217, 119, 87)');

    // Quit it, and the terminal glyph comes back — an explicit `null` is an
    // answer, and it is allowed to take a mark away.
    await emitAgentChanged(page, null);
    await expect.poll(colourOf).not.toBe('rgb(217, 119, 87)');
  });

  /**
   * The tri-state, from the outside. An agent session must keep the mark it was
   * opened with until a probe says otherwise — an absent answer is "nobody has
   * looked", and collapsing it into `null` would flash a terminal glyph over
   * every agent row on startup.
   */
  test('an agent session keeps its mark until the probe contradicts it', async ({ page }) => {
    await open(page);
    await toggleTerminal(page);

    await page.getByRole('button', { name: 'New terminal or agent' }).click();
    await page.getByRole('menuitem', { name: 'Claude Code', exact: true }).click();
    await expect(rows(page)).toHaveCount(2);

    const agentRow = rows(page).filter({ hasText: 'Claude Code' });
    const mark = agentRow.locator('svg').first();
    const colourOf = () => mark.evaluate((node) => getComputedStyle(node).color);

    // Never probed, and already wearing Claude's accent.
    await expect.poll(colourOf).toBe('rgb(217, 119, 87)');

    // The agent quit. `pty-2` is the second session's — the first was opened
    // automatically for the repo.
    await emitAgentChanged(page, null, 'pty-2');
    await expect.poll(colourOf).not.toBe('rgb(217, 119, 87)');

    // And the label is untouched throughout: this phase moves icons only.
    await expect(agentRow.locator('[data-session-name]')).toHaveText('Claude Code');
  });

  /**
   * The probe reports one pty at a time, and a change to one session must not
   * reach another. Two rows, one event.
   */
  test('a probe result lands on one session only', async ({ page }) => {
    await open(page);
    await toggleTerminal(page);

    await page.getByRole('button', { name: 'New terminal or agent' }).click();
    await page.getByRole('menuitem', { name: 'New Terminal', exact: true }).click();
    await expect(rows(page)).toHaveCount(2);
    await expect.poll(async () => (await ptyCalls(page)).creates.length).toBe(2);

    const colourOf = (index: number) =>
      rows(page)
        .nth(index)
        .locator('svg')
        .first()
        .evaluate((node) => getComputedStyle(node).color);

    const untouched = await colourOf(0);
    await emitAgentChanged(page, 'codex', 'pty-2');

    await expect.poll(() => colourOf(1)).toBe('rgb(16, 163, 127)');
    expect(await colourOf(0)).toBe(untouched);
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

  /**
   * The header, after Phase 21 Theme F.
   *
   * It used to open with the literal word "Terminal" — a label for the pane you
   * are already looking at — followed by an un-collapsed absolute path that
   * truncated from the right, throwing away the end that says where you are.
   * What replaces it has to say three things instead: it is a terminal, the
   * process is alive, and this is the checkout it is standing in.
   */
  test('the header names where the terminal is, not that it is a terminal', async ({ page }) => {
    await open(page, { terminalSessions: RESTORED });
    await toggleTerminal(page);

    const header = page.locator('[data-terminal-header]');
    await expect(header).toBeVisible();

    // The word is gone. Asserted on the header's own text rather than the
    // page's, because "New terminal or agent" is a button label inside it.
    await expect(header).not.toContainText('Terminal');

    // `~`-collapsed against the mock bridge's homeDir (`/tmp`), and split in
    // two: dimmed ancestors, then the checkout at full weight.
    const path = header.locator('[title="/tmp/midnite-git"]');
    await expect(path).toHaveText('~/midnite-git');
    await expect(path.locator('span').last()).toHaveText('midnite-git');

    // A glyph and a status circle lead the row. The dot is the session list's
    // own component, so a restored-but-not-revived session reads as idle: a
    // plain muted dot with no pulse.
    await expect(header.locator('svg').first()).toBeVisible();
    await expect(header.locator('span.rounded-full')).toHaveClass(/bg-muted-foreground/);
  });

  /**
   * The path is clipped by the header, not merely shrunk inside it.
   *
   * The tail span deliberately refuses to give up its width before the
   * ancestors do — which, with no clipping box anywhere in this row, let a deep
   * path under a long branch name run straight under the button cluster and out
   * past the panel's right edge. The buttons stayed clickable (they are painted
   * later), so the hit-test below never caught it.
   */
  test('a very deep path is clipped by the header rather than escaping it', async ({ page }) => {
    const root = '/tmp/midnite-git/.worktrees/a-very-long-branch-name-that-will-not-fit';
    await open(page, {
      worktrees: [{ path: root, branch: 'feature/a-very-long-branch-name-that-will-not-fit' }],
      terminalSessions: [
        {
          session: session('s-deep', {
            cwd: `${root}/packages/app-shell/src/components/terminal`,
          }),
          scrollback: '$ \r\n',
        },
      ],
    });
    await toggleTerminal(page);
    // Narrow, so the tail alone is wider than the room left by the buttons —
    // at a full-width window it fits and nothing is proven.
    await page.setViewportSize({ width: 460, height: 800 });
    await page.waitForTimeout(300);

    const header = page.locator('[data-terminal-header]');
    const box = (await header.boundingBox())!;
    // The TAIL span, not its container: a container with `min-w-0` reports the
    // width it was shrunk to while its child paints straight through it, so
    // measuring the wrapper is exactly how this bug hid.
    const tail = (await header.locator('[title] > span').last().boundingBox())!;
    const buttons = (await page.getByRole('button', { name: 'Hide terminal' }).boundingBox())!;

    // Inside the header's own box, and clear of the controls it shares a line with.
    expect(tail.x + tail.width).toBeLessThanOrEqual(box.x + box.width);
    expect(tail.x + tail.width).toBeLessThanOrEqual(buttons.x);
  });

  /**
   * Theme D: the header follows the shell, not the menu item that opened it.
   *
   * Driven with a real OSC 7 sequence written through the fake pty rather than
   * by poking the store, because the thing that can silently fail here is the
   * xterm registration itself — a handler that is never called, or a payload
   * the parser refuses, both look exactly like "no `cd` happened".
   */
  test('the header follows a cd into a sibling worktree', async ({ page }) => {
    const sibling = '/tmp/midnite-git/.worktrees/theme-d';
    await open(page, { worktrees: [{ path: sibling, branch: 'feature/theme-d' }] });
    await toggleTerminal(page);
    await expect.poll(async () => (await ptyCalls(page)).creates.length).toBe(1);

    const path = page.locator('[data-terminal-header] [title]').first();
    await expect(path).toHaveText('~/midnite-git');

    // `cd` into the sibling worktree, announced the way a configured shell does.
    await emitOsc7(page, `file://localhost${sibling}`);
    await expect(path).toHaveText('~/midnite-git/.worktrees/theme-d');
    // The emphasis follows too: the worktree is the checkout you navigate by.
    await expect(path.locator('span').last()).toHaveText('theme-d');

    // Somewhere no repository knows about: still `~`-collapsed (the mock's home
    // is `/tmp`), still left-truncating, but with no segment emphasised —
    // an unrecognised directory is not evidence the session changed repository.
    await emitOsc7(page, 'file:///tmp/scratch/notes');
    await expect(path).toHaveText('~/scratch/notes');
    await expect(path.locator('span.font-medium')).toHaveCount(0);

    /*
      And none of it is persisted. The session keeps the cwd it was opened at —
      a directory the shell wandered into is not one the user chose — so every
      session the app asked to save still carries the ORIGINAL cwd, not either
      of the two it has since been told about.
    */
    const saved = await page.evaluate(
      () => (window as unknown as { __mgitTerminalSaves: { id: string; cwd: string }[] })
        .__mgitTerminalSaves,
    );
    expect(saved.length).toBeGreaterThan(0);
    expect(saved.map((s) => s.cwd)).toEqual(saved.map(() => '/tmp/midnite-git'));
  });

  /**
   * The degradation path, which is most of the real world: macOS `zsh` emits no
   * OSC 7 at all unless the user has added a `chpwd` hook.
   */
  test('a shell that never emits OSC 7 keeps the cwd it was opened at', async ({ page }) => {
    await open(page);
    await toggleTerminal(page);
    await expect.poll(async () => (await ptyCalls(page)).creates.length).toBe(1);

    const path = page.locator('[data-terminal-header] [title]').first();
    await expect(path).toHaveText('~/midnite-git');

    // Ordinary output, including an escape sequence that is not OSC 7, and a
    // malformed OSC 7 that the parser must refuse rather than half-accept.
    await emitOsc7(page, 'file://build-server/var/www');
    await emitOsc7(page, 'file:///Users/x/%');
    await emitOsc7(page, 'not-a-uri');
    await page.waitForTimeout(200);

    await expect(path).toHaveText('~/midnite-git');
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
   * Hidden → visible → maximized → visible → hidden, and every step a slide.
   *
   * The frame is what moves; the panel inside it is already at its final size
   * and gets clipped, which is how the shell is told its new column count once
   * per toggle instead of once per frame. So the frame is what this measures.
   *
   * Two of the five steps are held to "it ended where it should, and it only
   * ever moved one way", and the other three to "it also went through the
   * middle". That is not timidity about those two, it is what the main thread
   * allows: the FIRST open pays for xterm's first paint (shader compile, glyph
   * atlas) and restoring from maximized pays for the view coming back out of
   * `display: none`, and either can eat every frame the middle would have been
   * visible in. The transition is the same one in all five.
   */
  test('the panel slides between hidden, open and maximized', async ({ page }) => {
    await open(page, { terminalSessions: RESTORED });

    const frame = '[data-terminal-frame]';
    const toggle = '[title^="Toggle terminal"]';

    const opening = await slide(page, toggle, frame, 'height');
    const shown = opening[opening.length - 1];
    expect(shown).toBeGreaterThan(100);
    expect(opening).toEqual(rising(opening));

    const closing = await slide(page, toggle, frame, 'height');
    expect(closing).toEqual(falling(closing));
    expect(passedThrough(closing, shown, 0)).toBe(true);
    // Gone at the end, not merely collapsed: the panel unmounts once it has
    // finished leaving, which is what keeps `terminalOpen` meaning what it did.
    await expect(page.locator(frame)).toHaveCount(0);

    const reopening = await slide(page, toggle, frame, 'height');
    expect(reopening[reopening.length - 1]).toBe(shown);
    expect(reopening).toEqual(rising(reopening));
    expect(passedThrough(reopening, 0, shown)).toBe(true);

    const growing = await slide(page, '[aria-label="Expand terminal"]', frame, 'height');
    const tall = growing[growing.length - 1];
    expect(tall).toBeGreaterThan(shown);
    expect(growing).toEqual(rising(growing));
    expect(passedThrough(growing, shown, tall)).toBe(true);

    const shrinking = await slide(page, '[aria-label="Restore terminal height"]', frame, 'height');
    expect(shrinking[shrinking.length - 1]).toBe(shown);
    expect(shrinking).toEqual(falling(shrinking));
  });

  /**
   * The repositories sidebar, held to the same promise as the terminal.
   *
   * Its width is what animates, and the panel inside keeps its own — a sidebar
   * that reflowed its rows on the way out would read as rebuilding rather than
   * leaving.
   */
  test('the repositories sidebar slides in and out', async ({ page }) => {
    await open(page);

    const sidebar = 'aside[aria-label="Repositories"]';
    const toggle = '[title^="Toggle repositories"]';

    const closing = await slide(page, toggle, sidebar, 'width');
    /*
      The widest sample, not the first: the click and the first frame after it
      are the same frame, so by the time anything can be measured the sidebar is
      already a few pixels into leaving.
    */
    const full = Math.max(...closing);
    expect(closing).toEqual(falling(closing));
    expect(passedThrough(closing, full, 0)).toBe(true);
    await expect(page.locator(sidebar)).toHaveCount(0);

    const opening = await slide(page, toggle, sidebar, 'width');
    const wide = opening[opening.length - 1];
    // Back the width it was, which is the point of persisting it separately.
    expect(wide).toBe(full);
    expect(opening).toEqual(rising(opening));
    expect(passedThrough(opening, 0, wide)).toBe(true);
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
    /*
      The session-name span is the one that carries the state — its sibling
      repo-name span is muted whether the session is live or not, so a locator
      matching BOTH (`span.truncate` did, once Phase 19 split the row in two)
      asserts on whichever came first and proves nothing.
    */
    const labels = page.locator('[data-session-name]');
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

    /*
      One entry per row, not one per span: a row carries two labels since
      Phase 19 (the repo, then the session), and a flat list of every span
      reads as six unattributed strings that no reordering assertion can use.
    */
    const titles = () =>
      page.locator('[data-session-row]').evaluateAll((list) =>
        list.map((row) =>
          Array.from(row.querySelectorAll('button span.truncate'), (span) =>
            span.textContent?.trim() ?? '',
          ).join(' · '),
        ),
      );
    expect(await titles()).toEqual([
      'midnite-git · Terminal',
      'other-repo · Terminal',
      'midnite-git · Claude Code',
    ]);

    const first = (await page.locator('[data-session-row]').first().boundingBox())!;
    const third = (await page.locator('[data-session-row]').nth(2).boundingBox())!;

    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();
    // Past the 6px constraint, then down in steps so dnd-kit sees movement.
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2 + 10);
    await page.mouse.move(first.x + first.width / 2, third.y + third.height / 2, { steps: 8 });
    await page.mouse.up();

    expect(await titles()).toEqual([
      'other-repo · Terminal',
      'midnite-git · Claude Code',
      'midnite-git · Terminal',
    ]);
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

/**
 * Phase 21 Theme F's own shots: the header strip alone, at two widths.
 *
 * Clipped to the strip rather than the window, because the change IS the strip
 * — a full-app shot renders it 20px tall in a corner and the two-tone path,
 * which is the entire point, is unreadable.
 */
test.describe('phase 21 screenshots', () => {
  /*
    A session standing deep inside a linked worktree, which is the case the
    header was rebuilt for: the checkout you are in is `theme-f`, and it is
    four segments from the end of a path that does not fit.
  */
  const DEEP = '/tmp/midnite-git/.worktrees/theme-f';
  const DEEP_SESSIONS: MockFixtures['terminalSessions'] = [
    {
      session: session('s-deep', { title: 'midnite-git', cwd: `${DEEP}/packages/app` }),
      scrollback: '$ pnpm test\r\n',
    },
  ];

  test('the rebuilt terminal header, wide and truncating', async ({ page }) => {
    await open(page, {
      terminalSessions: DEEP_SESSIONS,
      worktrees: [{ path: DEEP, branch: 'feature/theme-f' }],
    });
    await toggleTerminal(page);

    // Revive it, so the shot shows the live dot rather than the idle one.
    await page.locator('.xterm-screen').first().click();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await ptyCalls(page)).creates.length).toBe(1);
    await page.waitForTimeout(200);

    const header = page.locator('[data-terminal-header]');
    // Wide: the whole path fits, `~`-collapsed, with the worktree and what is
    // under it at full weight and its ancestors dimmed.
    await expect(header.locator('[title]').first()).toHaveText(
      '~/midnite-git/.worktrees/theme-f/packages/app',
    );
    await header.screenshot({ path: '../../docs/screenshots/phase-21-terminal-header.png' });

    // Narrow enough that the ancestors have to give way — which is the whole
    // reason the path truncates from the left rather than the right. The tail
    // is what survives, and the tail is where you are.
    await page.setViewportSize({ width: 640, height: 800 });
    await page.waitForTimeout(300);
    await header.screenshot({
      path: '../../docs/screenshots/phase-21-terminal-header-narrow.png',
    });
  });

  /**
   * Theme E, before and after — the one thing a still image can show about a
   * live probe.
   *
   * Two sessions, so the list is rendered: the first is a plain shell someone
   * typed `codex` into, the second an agent session whose Claude Code has just
   * quit. Both rows are lying in the "before" shot and honest in the "after"
   * one, and the header's glyph moves with the active session.
   */
  test('the session list before and after a live agent probe', async ({ page }) => {
    await open(page);
    await toggleTerminal(page);

    await page.getByRole('button', { name: 'New terminal or agent' }).click();
    await page.getByRole('menuitem', { name: 'Claude Code', exact: true }).click();
    await expect(rows(page)).toHaveCount(2);
    await expect.poll(async () => (await ptyCalls(page)).creates.length).toBe(2);
    await page.waitForTimeout(200);

    /*
      The whole panel, not just the list. The header's glyph is half of what
      Theme E changes, and the list at its default width truncates every label
      to three characters — a crop of it shows the marks swapping but nothing
      about which session each one belongs to.
    */
    const list = panel(page);
    await list.screenshot({
      path: '../../docs/screenshots/phase-21-live-agent-before.png',
    });

    // What main's probe found: Codex running in the plain shell, and nothing at
    // all in the session that was opened for Claude Code.
    await emitAgentChanged(page, 'codex', 'pty-1');
    await emitAgentChanged(page, null, 'pty-2');
    await page.waitForTimeout(200);

    await list.screenshot({
      path: '../../docs/screenshots/phase-21-live-agent-after.png',
    });
  });
});
