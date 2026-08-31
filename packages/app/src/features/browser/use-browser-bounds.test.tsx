import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { useUiStore } from '../../store/ui-store';
import { useBrowserBounds } from './use-browser-bounds';

/**
 * `getBoundingClientRect` is always {0,0,0,0} under jsdom — real coordinates
 * don't matter to these tests, only that `setBounds` is (or isn't) called
 * once the hook's `ref` is attached to an actual rendered element (a bare
 * `renderHook` never mounts anything, so `ref.current` would stay null).
 */
function installBridge() {
  const setVisible = vi.fn();
  const setBounds = vi.fn();
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    browser: { setVisible, setBounds } as unknown as MidniteStudioBridge['browser'],
  } as Partial<MidniteStudioBridge>;
  return { setVisible, setBounds };
}

/** jsdom has no `ResizeObserver` — a minimal stub is enough, since these tests
 * never rely on it firing (only on the initial `sync()` push it wraps). */
class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', StubResizeObserver);

let latestSync: (() => void) | null = null;

function Harness({ activeTabId, visible }: { activeTabId: string | null; visible: boolean }) {
  const { ref, sync } = useBrowserBounds(activeTabId, visible);
  latestSync = sync;
  return <div ref={ref} />;
}

describe('useBrowserBounds', () => {
  beforeEach(() => {
    useUiStore.setState({ occluders: 0 });
    latestSync = null;
  });

  afterEach(() => {
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('pushes visible + bounds for the active tab on mount', () => {
    const { setVisible, setBounds } = installBridge();
    render(<Harness activeTabId="tab-1" visible={true} />);

    expect(setVisible).toHaveBeenCalledWith({ tabId: 'tab-1', visible: true });
    expect(setBounds).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 'tab-1', bounds: expect.any(Object) }),
    );
  });

  it('hides the native view while an occluder (a context menu) is open, and restores it on close', () => {
    const { setVisible, setBounds } = installBridge();
    render(<Harness activeTabId="tab-1" visible={true} />);
    setVisible.mockClear();
    setBounds.mockClear();

    act(() => useUiStore.getState().incrementOccluders());
    expect(setVisible).toHaveBeenLastCalledWith({ tabId: 'tab-1', visible: false });
    setBounds.mockClear();

    act(() => useUiStore.getState().decrementOccluders());
    expect(setVisible).toHaveBeenLastCalledWith({ tabId: 'tab-1', visible: true });
    // Restoring visibility must also re-push bounds, not just flip the flag.
    expect(setBounds).toHaveBeenCalled();
  });

  it('regression: `sync()` re-checks the CURRENT occluder state, so a caller cannot force a tab visible over an open menu', () => {
    const { setVisible } = installBridge();
    render(<Harness activeTabId="tab-1" visible={true} />);
    setVisible.mockClear();

    act(() => useUiStore.getState().incrementOccluders());
    setVisible.mockClear();

    // Simulates `useBrowserTabsEffects` calling `sync` once a lazily-created
    // tab's view finally exists, while a context menu is still open.
    act(() => latestSync?.());
    expect(setVisible).toHaveBeenCalledWith({ tabId: 'tab-1', visible: false });
  });
});
