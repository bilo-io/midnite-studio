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
    expect(run['view.refresh']).not.toHaveBeenCalled();
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
