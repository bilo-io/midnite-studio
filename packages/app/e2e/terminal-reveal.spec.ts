import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The blank-pane-on-reveal defect, and the fit-once-at-the-end contract that
 * fixes it (Phase 30 Theme A).
 *
 * Collapsing the terminal used to unmount it; revealing it again built a fresh
 * xterm whose mount path replayed only the RESTORED transcript, never the live
 * ring buffer main kept accumulating for a pty that never died. And nothing
 * fit the panel once the reveal tween finished — the terminal's own
 * `ResizeObserver` fires continuously as the outer box grows, sending the
 * shell a resize every frame instead of once at the end.
 */

/** `Ctrl+\`` on every platform — macOS reserves Cmd+\` for window cycling. */
async function toggleTerminal(page: Page): Promise<void> {
  await page.keyboard.press('Control+`');
}

const ptyCalls = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as {
        __mstudioPty: {
          creates: { ptyId: string; sessionId: string }[];
          resizes: { ptyId: string; cols: number; rows: number }[];
          snapshots: string[];
        };
      }).__mstudioPty,
  );

async function open(page: Page, over: Partial<MockFixtures> = {}): Promise<void> {
  await installMockBridge(page, { ...fixtures, ...over } as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

/** The reveal tween's own duration (`REVEAL_MS` in `use-reveal.ts`), plus slack. */
const SETTLE_WAIT_MS = 300;

test.describe('terminal reveal', () => {
  test('revealing a live session replays its buffer with one resize, not one per frame', async ({
    page,
  }) => {
    await open(page);
    await toggleTerminal(page);
    await expect(page.locator('.xterm-screen')).toBeVisible();

    const { creates } = await ptyCalls(page);
    expect(creates).toHaveLength(1);
    const liveptyId = creates[0]?.ptyId;
    const resizesBeforeCollapse = (await ptyCalls(page)).resizes.length;

    // Collapse, and wait past the exit tween: the frame stays mounted for the
    // length of the exit (so it can animate), and only unmounts after.
    await toggleTerminal(page);
    await page.waitForTimeout(SETTLE_WAIT_MS);
    await expect(page.locator('[data-terminal-frame]')).toHaveCount(0);

    // Reveal again. The frame remounts, and the pane inside it is a NEW xterm —
    // this is exactly the moment the old code left blank.
    await toggleTerminal(page);
    await expect(page.locator('[data-terminal-frame]')).toHaveCount(1);
    await page.waitForTimeout(SETTLE_WAIT_MS);

    const after = await ptyCalls(page);
    // Main's ring buffer was read, not the disk-restored transcript —
    // `pty.snapshot`, not a second `pty.create`. React 18 StrictMode
    // double-invokes the mount effect in dev (the server this suite runs
    // against), so the throwaway first instance's request is a real, harmless
    // duplicate rather than a sign of a second pty — asserting on the PTY it
    // named, not the call count, is what stays true either way.
    expect(after.creates).toHaveLength(1);
    expect(after.snapshots.length).toBeGreaterThanOrEqual(1);
    expect(new Set(after.snapshots)).toEqual(new Set([liveptyId]));
    // One resize per genuinely new size (the fit-at-the-end contract, not one
    // per animation frame) — deduped even across StrictMode's extra mount,
    // since both instances fit the same, unchanged target height.
    expect(after.resizes.length).toBe(resizesBeforeCollapse + 1);
  });
});
