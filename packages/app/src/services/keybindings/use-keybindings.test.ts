import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMMAND_IDS, type CommandId } from '@midnite/studio-shared';

import { usePaletteStore } from '../../store/palette-store';
import { useUiStore } from '../../store/ui-store';
import { useKeybindings } from './use-keybindings';
import type { CommandRuntime } from './use-command-handlers';

const fakeRuntime = (): { runtime: CommandRuntime; run: Record<CommandId, ReturnType<typeof vi.fn>> } => {
  const run = {} as Record<CommandId, ReturnType<typeof vi.fn>>;
  const runtime = {} as CommandRuntime;
  for (const id of COMMAND_IDS) {
    run[id] = vi.fn();
    runtime[id] = { enabled: true, run: run[id] };
  }
  return { runtime, run };
};

const dispatch = (over: Partial<KeyboardEventInit> & { key: string }) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...over }));
};

/**
 * Dispatched at an element inside a root of the given class rather than at
 * `window`: the dispatcher judges a keystroke by its own target, which is
 * what lets one terminal (or Monaco) keep a chord while the rest of the app
 * resolves it to something else.
 */
const dispatchInside = (rootClassName: string, over: Partial<KeyboardEventInit> & { key: string }) => {
  const root = document.createElement('div');
  root.className = rootClassName;
  const textarea = document.createElement('textarea');
  root.appendChild(textarea);
  document.body.appendChild(root);
  try {
    textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...over }));
  } finally {
    root.remove();
  }
};
const inXterm = (over: Partial<KeyboardEventInit> & { key: string }) => dispatchInside('xterm', over);
const inMonaco = (over: Partial<KeyboardEventInit> & { key: string }) =>
  dispatchInside('monaco-editor', over);

/** Chords in these tests are all `Mod+...`; pinning the platform makes `Mod`
 * mean Cmd deterministically, regardless of what jsdom reports. */
const originalPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform');

beforeEach(() => {
  Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
  usePaletteStore.setState({ isOpen: false, mode: 'all', query: '', selectedIndex: 0 });
  useUiStore.setState({ browserOpen: false });
});

afterEach(() => {
  if (originalPlatform) Object.defineProperty(navigator, 'platform', originalPlatform);
  vi.restoreAllMocks();
});

describe('useKeybindings', () => {
  it('runs a bound, enabled command on its chord', () => {
    const { runtime, run } = fakeRuntime();
    renderHook(() => useKeybindings(runtime));

    dispatch({ key: 'g', metaKey: true });

    expect(run['repos.toggle']).toHaveBeenCalledTimes(1);
  });

  it('lets an app chord through untouched while the palette is open', () => {
    const { runtime, run } = fakeRuntime();
    renderHook(() => useKeybindings(runtime));
    usePaletteStore.getState().open();

    dispatch({ key: 'g', metaKey: true });
    dispatch({ key: 'r', metaKey: true });

    expect(run['repos.toggle']).not.toHaveBeenCalled();
    expect(run['app.reload']).not.toHaveBeenCalled();
  });

  it('still resolves palette.open and palette.files while the palette is open', () => {
    const { runtime, run } = fakeRuntime();
    renderHook(() => useKeybindings(runtime));
    usePaletteStore.getState().open();

    dispatch({ key: 'k', metaKey: true });
    dispatch({ key: 'p', metaKey: true });

    expect(run['palette.open']).toHaveBeenCalledTimes(1);
    expect(run['palette.files']).toHaveBeenCalledTimes(1);
  });

  it('resumes normal dispatch once the palette closes', () => {
    const { runtime, run } = fakeRuntime();
    renderHook(() => useKeybindings(runtime));
    usePaletteStore.getState().open();
    usePaletteStore.getState().close();

    dispatch({ key: 'g', metaKey: true });

    expect(run['repos.toggle']).toHaveBeenCalledTimes(1);
  });
});

describe('the reload pair yields to the shell', () => {
  it('does not reload on Mod+R aimed at a terminal', () => {
    const { runtime, run } = fakeRuntime();
    renderHook(() => useKeybindings(runtime));

    inXterm({ key: 'r', metaKey: true });
    inXterm({ key: 'r', metaKey: true, shiftKey: true });

    expect(run['app.reload']).not.toHaveBeenCalled();
    expect(run['app.hardReload']).not.toHaveBeenCalled();
  });

  it('still reloads on Mod+R anywhere else', () => {
    const { runtime, run } = fakeRuntime();
    renderHook(() => useKeybindings(runtime));

    dispatch({ key: 'r', metaKey: true });
    dispatch({ key: 'r', metaKey: true, shiftKey: true });

    expect(run['app.reload']).toHaveBeenCalledTimes(1);
    expect(run['app.hardReload']).toHaveBeenCalledTimes(1);
  });

  /**
   * The carve-out is two commands wide, deliberately — `Mod+1` jumping to the
   * Graph from inside a shell is useful, and stays.
   */
  it('leaves every other app-scope chord firing from inside a terminal', () => {
    const { runtime, run } = fakeRuntime();
    renderHook(() => useKeybindings(runtime));

    inXterm({ key: 'g', metaKey: true });

    expect(run['repos.toggle']).toHaveBeenCalledTimes(1);
  });
});

describe('YIELD_ROOTS — Monaco gets its own yield set (Phase 64 Theme D)', () => {
  it('does not fire status.commit (Mod+Enter) aimed at Monaco', () => {
    const { runtime, run } = fakeRuntime();
    renderHook(() => useKeybindings(runtime));

    inMonaco({ key: 'Enter', metaKey: true });

    expect(run['status.commit']).not.toHaveBeenCalled();
  });

  it('still fires status.commit (Mod+Enter) anywhere else', () => {
    const { runtime, run } = fakeRuntime();
    renderHook(() => useKeybindings(runtime));

    dispatch({ key: 'Enter', metaKey: true });

    expect(run['status.commit']).toHaveBeenCalledTimes(1);
  });

  it('does not fire panel.back/panel.forward (Mod+[ / Mod+]) aimed at Monaco', () => {
    const { runtime, run } = fakeRuntime();
    renderHook(() => useKeybindings(runtime));

    inMonaco({ key: '[', metaKey: true });
    inMonaco({ key: ']', metaKey: true });

    expect(run['panel.back']).not.toHaveBeenCalled();
    expect(run['panel.forward']).not.toHaveBeenCalled();
  });

  it('still fires status.commit (Mod+Enter) aimed at a terminal — the Monaco yield set is its own list', () => {
    // `status.commit` is in Monaco's yield list but NOT the terminal's
    // (`.xterm`'s own six are the reload pair, the panel-history pair,
    // `fab.toggle` and `window.detachActive`) — proof that generalising
    // `insideTerminal` into `YIELD_ROOTS` did not leak Monaco's carve-out
    // into the terminal's.
    const { runtime, run } = fakeRuntime();
    renderHook(() => useKeybindings(runtime));

    inXterm({ key: 'Enter', metaKey: true });

    expect(run['status.commit']).toHaveBeenCalledTimes(1);
  });

  it('still fires fab.toggle (Mod+L) aimed at Monaco — the terminal yield set does not apply here', () => {
    const { runtime, run } = fakeRuntime();
    renderHook(() => useKeybindings(runtime));

    inMonaco({ key: 'l', metaKey: true });

    expect(run['fab.toggle']).toHaveBeenCalledTimes(1);
  });
});

describe('the Mod+w / Mod+t three-way carve-out', () => {
  it('prefers terminal.close over repo.close on Mod+w when a terminal is selected', () => {
    const { runtime, run } = fakeRuntime();
    renderHook(() => useKeybindings(runtime));

    dispatch({ key: 'w', metaKey: true });

    expect(run['terminal.close']).toHaveBeenCalledTimes(1);
    expect(run['repo.close']).not.toHaveBeenCalled();
  });

  it('falls back to repo.close on Mod+w once terminal.close is disabled (no session selected)', () => {
    const { runtime, run } = fakeRuntime();
    runtime['terminal.close'] = { enabled: false, run: run['terminal.close'] };
    renderHook(() => useKeybindings(runtime));

    dispatch({ key: 'w', metaKey: true });

    expect(run['terminal.close']).not.toHaveBeenCalled();
    expect(run['repo.close']).toHaveBeenCalledTimes(1);
  });

  it('prefers browser.closeTab over terminal.close on Mod+w while the browser pane is open', () => {
    useUiStore.setState({ browserOpen: true });
    const { runtime, run } = fakeRuntime();
    renderHook(() => useKeybindings(runtime));

    dispatch({ key: 'w', metaKey: true });

    expect(run['browser.closeTab']).toHaveBeenCalledTimes(1);
    expect(run['terminal.close']).not.toHaveBeenCalled();
    expect(run['repo.close']).not.toHaveBeenCalled();
  });

  it('resolves Mod+t to terminal.new with the browser pane closed', () => {
    const { runtime, run } = fakeRuntime();
    renderHook(() => useKeybindings(runtime));

    dispatch({ key: 't', metaKey: true });

    expect(run['terminal.new']).toHaveBeenCalledTimes(1);
    expect(run['browser.newTab']).not.toHaveBeenCalled();
  });

  it('resolves Mod+t to browser.newTab while the browser pane is open', () => {
    useUiStore.setState({ browserOpen: true });
    const { runtime, run } = fakeRuntime();
    renderHook(() => useKeybindings(runtime));

    dispatch({ key: 't', metaKey: true });

    expect(run['browser.newTab']).toHaveBeenCalledTimes(1);
    expect(run['terminal.new']).not.toHaveBeenCalled();
  });

  it('does nothing on Mod+t when terminal.new is disabled and the browser pane is closed', () => {
    const { runtime, run } = fakeRuntime();
    runtime['terminal.new'] = { enabled: false, run: run['terminal.new'] };
    renderHook(() => useKeybindings(runtime));

    dispatch({ key: 't', metaKey: true });

    expect(run['terminal.new']).not.toHaveBeenCalled();
    expect(run['browser.newTab']).not.toHaveBeenCalled();
  });
});
