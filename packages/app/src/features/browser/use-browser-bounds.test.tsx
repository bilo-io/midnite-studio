import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { useUiStore } from '../../store/ui-store';
import { boundsFromRect, useBrowserBounds } from './use-browser-bounds';

/**
 * `getBoundingClientRect` is always {0,0,0,0} under jsdom, which (since
 * `boundsFromRect` now skips a zero-size measurement rather than sending it,
 * Theme E) would make every test below see `setBounds` never called at all.
 * Real coordinates don't matter to these tests, only that `setBounds` is (or
 * isn't) called once the hook's `ref` is attached to an actual rendered
 * element (a bare `renderHook` never mounts anything, so `ref.current` would
 * stay null) — so every test in this file gets a non-zero stub instead.
 */
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  Element.prototype.getBoundingClientRect = () =>
    ({ x: 0, y: 0, width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, toJSON: () => ({}) }) as DOMRect;
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

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

describe('boundsFromRect', () => {
  function rect(overrides: Partial<DOMRect>): DOMRect {
    return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}), ...overrides } as DOMRect;
  }

  it('rounds fractional coordinates and dimensions', () => {
    expect(boundsFromRect(rect({ x: 10.4, y: 20.6, width: 199.6, height: 99.5 }))).toEqual({
      x: 10,
      y: 21,
      width: 200,
      height: 100,
    });
  });

  it('skips a zero-width measurement rather than sending it', () => {
    expect(boundsFromRect(rect({ x: 5, y: 5, width: 0, height: 200 }))).toBeNull();
  });

  it('skips a zero-height measurement rather than sending it', () => {
    expect(boundsFromRect(rect({ x: 5, y: 5, width: 200, height: 0 }))).toBeNull();
  });

  it('skips the fully zero rect a pane mid-tween measures', () => {
    expect(boundsFromRect(rect({}))).toBeNull();
  });
});
