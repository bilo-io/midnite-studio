import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { SUITE_COMMANDS, type CommandId } from '@midnite/studio-shared';

import type { CommandRuntime } from './command-runtime';
import { usePaletteStore } from './palette/palette-store';
import { shouldEscapeTerminal, useKeybindings } from './use-keybindings';

/**
 * The frame's dispatcher as a suite app mounts it (Phase 123 Theme D): a `Partial` runtime over
 * `SUITE_COMMANDS`, no gates. Studio's own behaviour — its browser pane and overlay gates over the
 * same dispatcher — stays covered by `packages/app/src/services/keybindings/use-keybindings.test.ts`.
 */
const suiteRuntime = (ids: readonly CommandId[] = SUITE_COMMANDS) => {
  const run = {} as Record<CommandId, Mock>;
  const runtime: CommandRuntime = {};
  for (const id of ids) {
    run[id] = vi.fn();
    runtime[id] = { enabled: true, run: run[id] };
  }
  return { runtime, run };
};

const keydown = (over: Partial<KeyboardEventInit> & { key: string }) =>
  new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...over });

const inXterm = (event: KeyboardEvent): KeyboardEvent => {
  const root = document.createElement('div');
  root.className = 'xterm';
  const textarea = document.createElement('textarea');
  root.appendChild(textarea);
  document.body.appendChild(root);
  try {
    textarea.dispatchEvent(event);
  } finally {
    root.remove();
  }
  return event;
};

const originalPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform');
const setPlatform = (value: string) =>
  Object.defineProperty(navigator, 'platform', { value, configurable: true });

beforeEach(() => {
  setPlatform('MacIntel');
  usePaletteStore.setState({ isOpen: false, mode: 'all', query: '', selectedIndex: 0 });
});

afterEach(() => {
  if (originalPlatform) Object.defineProperty(navigator, 'platform', originalPlatform);
  vi.restoreAllMocks();
});

describe('useKeybindings in a suite app', () => {
  it('runs a bound suite command on its chord and claims the keystroke', () => {
    const { runtime, run } = suiteRuntime();
    renderHook(() => useKeybindings(runtime));

    const event = keydown({ key: 'k', metaKey: true });
    window.dispatchEvent(event);

    expect(run['palette.open']).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves a chord whose command has no handler to the page', () => {
    const { runtime } = suiteRuntime();
    renderHook(() => useKeybindings(runtime));

    // Mod+g is repos.toggle — Studio's, not a suite app's.
    const event = keydown({ key: 'g', metaKey: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('opens Settings on Meta+,', () => {
    const { runtime, run } = suiteRuntime();
    renderHook(() => useKeybindings(runtime));

    window.dispatchEvent(keydown({ key: ',', metaKey: true }));

    expect(run['view.settings']).toHaveBeenCalledTimes(1);
  });

  it('takes Mod+w for terminal.close when the app binds no repo.close', () => {
    const { runtime, run } = suiteRuntime();
    renderHook(() => useKeybindings(runtime));

    window.dispatchEvent(keydown({ key: 'w', metaKey: true }));

    expect(run['terminal.close']).toHaveBeenCalledTimes(1);
  });

  it('lets a chord through while the palette owns the keyboard, bar its own', () => {
    const { runtime, run } = suiteRuntime();
    renderHook(() => useKeybindings(runtime));
    usePaletteStore.getState().open();

    window.dispatchEvent(keydown({ key: ',', metaKey: true }));
    window.dispatchEvent(keydown({ key: 'k', metaKey: true }));

    expect(run['view.settings']).not.toHaveBeenCalled();
    expect(run['palette.open']).toHaveBeenCalledTimes(1);
  });

  it('honours a gate the host supplies', () => {
    const { runtime, run } = suiteRuntime();
    const gates = { blocked: () => true };
    renderHook(() => useKeybindings(runtime, gates));

    window.dispatchEvent(keydown({ key: ',', metaKey: true }));

    expect(run['view.settings']).not.toHaveBeenCalled();
  });
});

describe('terminal yield in a suite app', () => {
  it('fires terminal.toggle on Ctrl+` from inside .xterm, and xterm lets it through', () => {
    const { runtime, run } = suiteRuntime();
    renderHook(() => useKeybindings(runtime));

    const event = inXterm(keydown({ key: '`', code: 'Backquote', ctrlKey: true }));

    expect(run['terminal.toggle']).toHaveBeenCalledTimes(1);
    expect(shouldEscapeTerminal(event)).toBe(true);
  });

  it('yields fab.toggle (Mod+l) to the shell from inside .xterm — Ctrl+L off macOS is clear-screen', () => {
    setPlatform('Linux x86_64');
    const { runtime, run } = suiteRuntime();
    renderHook(() => useKeybindings(runtime));

    const event = inXterm(keydown({ key: 'l', ctrlKey: true }));

    expect(run['fab.toggle']).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(shouldEscapeTerminal(event)).toBe(false);
  });

  it('keeps Mod+t inside xterm (not a global chord), and Mod+k escapes it', () => {
    expect(shouldEscapeTerminal(keydown({ key: 't', metaKey: true }))).toBe(false);
    expect(shouldEscapeTerminal(keydown({ key: 'k', metaKey: true }))).toBe(true);
  });
});
