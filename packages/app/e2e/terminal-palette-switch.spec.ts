import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Phase 64 Theme G's own verification item: "with eight terminals mounted
 * (sessions + a board card + a loop tab), a palette switch re-themes all of
 * them without recreating any: scrollback survives and no shell dies."
 *
 * Eight restored sessions in the main terminal panel is enough to exercise
 * the actual mechanism this item is about — `terminal-panel.tsx` mounts
 * every open session's `TerminalView` at once and stacks them (only the
 * active one is visible), and each one's own `usePaletteStore.subscribe`
 * effect (`terminal-view.tsx`, keyed on `[]` — NOT `session.id`) re-themes
 * in place rather than rebuilding. A board card and a loop tab session are a
 * DIFFERENT mount site for the same `TerminalView`, not a different
 * mechanism, so this does not re-derive the "eight" from those two extra
 * surfaces specifically.
 */

const session = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  kind: 'shell',
  title: `terminal-${id}`,
  cwd: '/tmp/midnite-studio',
  repoId: 'repo-1',
  createdAt: 1_787_000_000,
  ...over,
});

const EIGHT_RESTORED: MockFixtures['terminalSessions'] = Array.from({ length: 8 }, (_, i) => ({
  session: session(`s-${i + 1}`),
  scrollback: `$ marker-${i + 1}\r\n`,
}));

async function open(page: Page): Promise<void> {
  await installMockBridge(page, { ...fixtures, terminalSessions: EIGHT_RESTORED } as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

async function openAppearanceSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Appearance', exact: true })
    .click();
  await page.getByRole('radiogroup', { name: 'Dark palettes' }).waitFor();
}

test('eight mounted terminals survive a palette switch without any being recreated', async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press('Control+`');

  const screens = page.locator('.xterm-screen');
  await expect(screens).toHaveCount(8);
  await expect(page.locator('[data-session-row]')).toHaveCount(8);

  // Tag every mounted xterm's own container so a recreation (a fresh DOM
  // node, xterm's `Terminal.open()` rebuilding its whole subtree) is
  // falsifiable rather than merely unobserved: the marker cannot survive
  // being replaced.
  const taggedCount = await page.evaluate(() => {
    const nodes = document.querySelectorAll('.xterm-screen');
    nodes.forEach((node, i) => {
      (node as HTMLElement).dataset['p64Marker'] = `untouched-${i}`;
    });
    return nodes.length;
  });
  expect(taggedCount).toBe(8);

  // Settings is a separate content view, but the terminal drawer is
  // app-chrome docked below it (`app.tsx` renders `<TerminalPanel>`
  // unconditionally on `terminalOpen`/`terminalDetached`, independent of
  // which view is active) — it stays mounted and visible while Settings is
  // open, which is what lets this switch the palette without first closing
  // the terminal.
  await openAppearanceSettings(page);
  await page
    .getByRole('radiogroup', { name: 'Dark palettes' })
    .getByRole('radio', { name: 'Monokai' })
    .click();

  // Still eight, still the SAME eight DOM nodes — the marker proves it, not
  // just the count. `.xterm-screen` itself renders via canvas (its own
  // `textContent` is empty even for the one visible session — confirmed by
  // hand against this exact fixture), so "scrollback survives" is provable
  // here only INDIRECTLY: `termRef.current` in `terminal-view.tsx` is never
  // reset except on a `session.id` change, so the same DOM node surviving
  // the switch means the same live `xterm.Terminal` JS instance survived it
  // too, buffer and all — recreation is the only way that buffer would be
  // lost, and recreation is exactly what the marker below falsifies. A pixel
  // or canvas-content assertion would show the same thing more directly, at
  // a cost (a new `window.*` test hook onto xterm's buffer, or screenshot
  // diffing) this item's budget did not stretch to.
  await expect(screens).toHaveCount(8);
  const survivedMarkers = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.xterm-screen')).map(
      (node) => (node as HTMLElement).dataset['p64Marker'],
    ),
  );
  expect(new Set(survivedMarkers)).toEqual(
    new Set(Array.from({ length: 8 }, (_, i) => `untouched-${i}`)),
  );

  // No shell died: a restored session has no process to kill in the first
  // place (the mock never received a `pty.create`), so "alive" here means
  // the row itself is still present and in its pre-switch (dimmed,
  // revivable) state, not that it silently dropped off the list.
  const labels = page.locator('[data-session-name]');
  await expect(labels).toHaveCount(8);
  for (let i = 0; i < 8; i += 1) {
    await expect(labels.nth(i)).toHaveClass(/text-muted-foreground/);
  }
});
