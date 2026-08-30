import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMMAND_IDS, type CommandId } from '@midnite/studio-shared';

import { usePaletteStore } from '../../store/palette-store';
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
