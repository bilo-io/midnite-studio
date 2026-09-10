import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../test-support/fixtures';
import type { MockFixtures } from '../../test-support/mock-bridge';
import { renderView } from '../../test-support/render';
import { PaletteToggle } from '../features/status-bar/palette-toggle';
import { useCommandHandlers } from '../services/keybindings/use-command-handlers';
import { useKeybindings } from '../services/keybindings/use-keybindings';
import { usePaletteStore } from '../store/palette-store';
import { useUiStore } from '../store/ui-store';
import { PaletteHost } from './palette-host';
import { ToastHost } from './toast-host';

/**
 * Migrated from `e2e/palette.spec.ts` (Phase 82 Theme C, wave 4) — 11 of its
 * 14 tests move to jsdom, mounting the real `Palette` (through `PaletteHost`)
 * beside a small harness that wires up the same `useCommandHandlers` +
 * `useKeybindings` pair `app.tsx` mounts, so a real `Meta+k` keystroke really
 * dispatches through the real command runtime — not a stand-in.
 *
 * **3 stay in Playwright**, all genuine cross-feature navigation: "palette
 * navigates to views and settings", "Select Theme Palette…" and "Import VS
 * Code Theme…" each assert on `SettingsView`'s own rendered Appearance page
 * (a radiogroup, an accordion, a file input) — a different feature's real
 * surface, not something `Palette` owns. They double as this view's required
 * one-browser-smoke-test-per-view.
 *
 * A cross-component action (opening/closing the repos panel) is asserted
 * through `useUiStore.getState().reposOpen` directly, the same substitution
 * wave 3's `actions-view.bridge.test.tsx` used for "every stateful verb links
 * out instead of being reimplemented" — mounting the real `ReposPanel` just to
 * read a boolean back off it would test `ReposPanel`, not `Palette`.
 *
 * **A new harness gap this wave found.** `Palette`'s row list is
 * `@tanstack/react-virtual`, same as `search-view`'s — but unlike a component
 * that is already mounted when its `ResizeObserver` starts observing,
 * `Palette` itself only mounts (and so only calls `observe()`) the instant
 * `Meta+k` opens it. `vitest-setup.ts`'s `FiringResizeObserver` fires its
 * callback from a `queueMicrotask`, not synchronously, so a synchronous
 * `getByRole('option', …)` right after `fireEvent.keyDown` / `fireEvent.change`
 * races that microtask and finds nothing — the same shape of false negative as
 * wave 2's lazy-chunk trap, just one tick long instead of a multi-second
 * transform. Every assertion below that reads a rendered row (not just the
 * search input's value or the store) awaits `findByRole`/`waitFor` instead of
 * `getByRole`, which is what actually gives that microtask a turn.
 */

const MAIN = '/tmp/midnite-studio';

const localRef = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  fullName: `refs/heads/${name}`,
  kind: 'localBranch',
  sha: 'a'.repeat(40),
  upstream: null,
  isHead: false,
  worktreePath: null,
  ...over,
});

const paletteFixtures: MockFixtures = {
  ...fixtures,
  refs: [localRef('main', { isHead: true, worktreePath: MAIN })],
  remotes: [],
  worktrees: [],
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  forge: { cli: { reason: 'ready' }, runs: [], pulls: [] },
};

const UI_STATE = { selectedRepoId: 'repo-1', reposOpen: true, terminalOpen: false };

/**
 * The same provider stack `app.tsx` assembles around `Palette`: the real
 * command runtime, the real global key dispatcher, and the real title-bar
 * trigger. `xterm-stub` stands in for a `.xterm` root purely so a keystroke's
 * `event.target` can sit inside one — `YIELD_ROOTS` matches by selector, not
 * by mounting a real terminal (which stays in Playwright, per this phase's
 * own "terminal: real xterm + ANSI" carve-out).
 */
function Inner() {
  const runtime = useCommandHandlers();
  useKeybindings(runtime);
  return (
    <PaletteHost>
      <PaletteToggle />
      <div className="xterm" tabIndex={-1} data-testid="xterm-stub" />
    </PaletteHost>
  );
}

function Harness() {
  return (
    <ToastHost>
      <Inner />
    </ToastHost>
  );
}

function open(): void {
  renderView(<Harness />, { fixtures: paletteFixtures, uiState: UI_STATE });
}

const palette = () => screen.getByRole('dialog', { name: 'Command Palette' });
const search = () => screen.getByRole('combobox', { name: 'Command palette search' });

// `usePaletteStore` is a module singleton (like `useUiStore`) — it does not
// reset itself between tests the way a fresh `page` does in Playwright.
beforeEach(() => {
  usePaletteStore.setState({ isOpen: false, mode: 'all', query: '', selectedIndex: 0 });
});

afterEach(cleanup);

describe('Palette, assembled through the real bridge', () => {
  it('Meta+k opens the palette and Escape closes it', () => {
    open();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(palette()).toBeTruthy();
    expect(document.activeElement).toBe(search());

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).toBeNull();
  });

  it('the title-bar button opens the palette too, and returns focus on close', () => {
    open();

    const trigger = screen.getByRole('button', { name: 'Command Palette' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(palette()).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('typing narrows the list across groups', async () => {
    open();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    fireEvent.change(search(), { target: { value: 'terminal' } });

    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(4);
    const labels = options.map((o) => o.textContent);
    expect(labels.some((l) => l?.includes('Toggle Terminal'))).toBe(true);
    expect(labels.some((l) => l?.includes('Focus Terminal'))).toBe(true);
    expect(labels.some((l) => l?.includes('Detach Terminal'))).toBe(true);
    expect(labels.some((l) => l?.includes('Settings: Terminal'))).toBe(true);
  });

  it('ArrowDown and Enter run the selected command and close the palette', () => {
    open();
    expect(useUiStore.getState().reposOpen).toBe(true);

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    fireEvent.change(search(), { target: { value: 'toggle repositories' } });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).toBeNull();
    expect(useUiStore.getState().reposOpen).toBe(false);
  });

  it('clicking a row runs THAT row, even without hovering it first', async () => {
    open();
    expect(useUiStore.getState().reposOpen).toBe(true);

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    fireEvent.change(search(), { target: { value: 'toggle' } });
    // No preceding `mouseEnter` — the still-default `selectedIndex` (row 0,
    // "Toggle Terminal") stays whatever it was. The row that must actually
    // run is the one clicked, not the one still marked selected.
    fireEvent.click(await screen.findByRole('option', { name: /Toggle Repositories/ }));

    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).toBeNull();
    expect(useUiStore.getState().reposOpen).toBe(false);
    // Toggling repositories must not also have opened the terminal.
    expect(useUiStore.getState().terminalOpen).toBe(false);
  });

  it('the reload pair carries the browser chords, and the commands they displaced carry none', async () => {
    open();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    fireEvent.change(search(), { target: { value: 'reload' } });
    expect(await screen.findByRole('option', { name: /Reload ⌘R/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Hard Reload ⌘⇧R/ })).toBeTruthy();

    // Refresh and Fetch are still listed — they lost their chords, not their
    // place in the palette.
    fireEvent.change(search(), { target: { value: 'refresh' } });
    expect(await screen.findByRole('option', { name: 'Refresh' })).toBeTruthy();
    fireEvent.change(search(), { target: { value: 'fetch' } });
    expect(await screen.findByRole('option', { name: 'Fetch' })).toBeTruthy();
  });

  it('a disabled command shows its reason and does not run on Enter', async () => {
    open();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    fireEvent.change(search(), { target: { value: 'commit' } });

    await waitFor(() => {
      expect(document.querySelector('[role="option"][aria-disabled="true"]')).toBeTruthy();
    });

    fireEvent.keyDown(window, { key: 'Enter' });
    // Disabled commands never run — the palette stays open rather than
    // silently closing on a keystroke that did nothing.
    expect(palette()).toBeTruthy();
  });

  it('Meta+g typed into the palette does not toggle the repositories panel', () => {
    open();
    expect(useUiStore.getState().reposOpen).toBe(true);

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    fireEvent.keyDown(window, { key: 'g', metaKey: true });
    expect(palette()).toBeTruthy();
    expect(useUiStore.getState().reposOpen).toBe(true);

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'g', metaKey: true });
    expect(useUiStore.getState().reposOpen).toBe(false);
  });

  it('Meta+k opens the palette while a `.xterm`-rooted element has focus', () => {
    open();
    const xterm = screen.getByTestId('xterm-stub');
    xterm.focus();

    fireEvent.keyDown(xterm, { key: 'k', metaKey: true });
    expect(palette()).toBeTruthy();
  });

  it('fuzzy search matches acronyms and renders mark tags', async () => {
    open();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    fireEvent.change(search(), { target: { value: 'tt' } });

    // Not `findByRole(..., { name: /Toggle Terminal/ })`: two DISJOINT
    // `<mark>` elements (one per matched character, "tt" → the T in
    // "Toggle" and the T in "Terminal") split the row's text across four
    // sibling nodes, and `dom-accessibility-api`'s accname computation
    // does not reassemble that the way plain `textContent` does. Filtering
    // `findAllByRole`'s array by `textContent` is the house style anyway
    // (`CLAUDE.md`: plain assertions, no `jest-dom`) — just applied here
    // to the row lookup itself, not only the final expectation.
    const rows = await screen.findAllByRole('option');
    const row = rows.find((r) => /Toggle Terminal/.test(r.textContent ?? ''));
    expect(row).toBeTruthy();
    expect(row?.querySelectorAll('mark')).toHaveLength(2);
  });

  it('palette and go to file both have gradient glow classes', () => {
    open();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const container = palette().querySelector(':scope > div');
    expect(container?.className).toContain('gradient-border');
    expect(container?.className).toContain('gradient-border--always');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).toBeNull();

    fireEvent.keyDown(window, { key: 'p', metaKey: true });
    const goToFileContainer = palette().querySelector(':scope > div');
    expect(goToFileContainer?.className).toContain('gradient-border');
    expect(goToFileContainer?.className).toContain('gradient-border--always');
  });
});
