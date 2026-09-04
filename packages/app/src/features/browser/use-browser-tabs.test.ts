import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { useBrowserStore } from '../../store/browser-store';
import { useBrowserTabsEffects } from './use-browser-tabs';

function installBridge(createImpl?: ReturnType<typeof vi.fn>) {
  const create = createImpl ?? vi.fn().mockResolvedValue({ ok: true });
  const activate = vi.fn();
  const setVisible = vi.fn();
  const onEvent = vi.fn(() => () => {});
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    browser: { create, activate, setVisible, onEvent } as unknown as MidniteStudioBridge['browser'],
  } as Partial<MidniteStudioBridge>;
  return { create, activate, setVisible, onEvent };
}

/** Deferred `create()` — resolved by hand once the test has changed state under it. */
function deferredCreate() {
  let resolve!: () => void;
  const promise = new Promise<{ ok: true }>((res) => {
    resolve = () => res({ ok: true });
  });
  return { create: vi.fn().mockReturnValue(promise), resolve };
}

/** A page tab, seeded directly into the store the way a restored/typed-URL tab would be. */
function seedPageTab(id: string, url = 'https://example.com') {
  useBrowserStore.setState((s) => ({
    tabs: [...s.tabs, { id, kind: 'page', url, title: '', loading: false, canGoBack: false, canGoForward: false }],
    activeTabId: id,
  }));
}

describe('useBrowserTabsEffects', () => {
  // `renderHook` isn't auto-cleaned between tests here — this suite imports
  // `afterEach` from `vitest` explicitly rather than relying on globals, and
  // Testing Library's own auto-cleanup only self-registers against a GLOBAL
  // `afterEach`. Left unmounted, a prior test's hook stays subscribed to the
  // (module-level) browser store and reacts to a later test's state changes,
  // calling whatever bridge that later test just installed — invisible for
  // an assertion that a mock WAS called, but a false negative for one
  // asserting it was NOT, which is exactly what the two regression tests
  // below check. `unmounts` collects every hook this describe block renders
  // so each test tears its own down before the next begins.
  const unmounts: Array<() => void> = [];

  afterEach(() => {
    unmounts.splice(0).forEach((unmount) => unmount());
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    useBrowserStore.setState({ tabs: [], activeTabId: null });
  });

  it("regression: calls onTabReady once the tab's view is actually created, not just browser.activate", async () => {
    // A lazily-created tab has no live view when this effect first runs
    // (`browser-service.ts` never attaches one until `create` resolves) —
    // `activate` alone used to be the only follow-up, and it never pushes
    // bounds. `onTabReady` (`useBrowserBounds`'s `sync`) is what actually
    // sizes/shows the view once it exists.
    const { create, activate } = installBridge();
    seedPageTab('tab-1');
    const onTabReady = vi.fn();

    const { unmount } = renderHook(() => useBrowserTabsEffects(true, true, onTabReady));
    unmounts.push(unmount);

    expect(create).toHaveBeenCalledWith({ tabId: 'tab-1', url: 'https://example.com' });
    await waitFor(() => expect(activate).toHaveBeenCalledWith({ tabId: 'tab-1' }));
    expect(onTabReady).toHaveBeenCalled();
  });

  it('hides the outgoing tab and re-runs onTabReady for the incoming one on switch', async () => {
    const { setVisible, activate } = installBridge();
    seedPageTab('tab-1');
    seedPageTab('tab-2');
    const onTabReady = vi.fn();

    const { rerender, unmount } = renderHook(({ open }) => useBrowserTabsEffects(open, true, onTabReady), {
      initialProps: { open: true },
    });
    unmounts.push(unmount);
    await waitFor(() => expect(activate).toHaveBeenCalledWith({ tabId: 'tab-2' }));
    onTabReady.mockClear();
    setVisible.mockClear();

    useBrowserStore.setState({ activeTabId: 'tab-1' });
    rerender({ open: true });

    expect(setVisible).toHaveBeenCalledWith({ tabId: 'tab-2', visible: false });
    await waitFor(() => expect(activate).toHaveBeenLastCalledWith({ tabId: 'tab-1' }));
    expect(onTabReady).toHaveBeenCalled();
  });

  it('regression: does not activate a tab whose create() resolves after the pane has closed', async () => {
    // Mod+B closing the pane right after it opened (or right after a tab
    // switch) must not have a late `create()` pop the view back onto the
    // screen — `activate` has no `open` flag of its own to check.
    const { create, resolve } = deferredCreate();
    const { activate } = installBridge(create);
    seedPageTab('tab-1');
    const onTabReady = vi.fn();

    const { rerender, unmount } = renderHook(({ open }) => useBrowserTabsEffects(open, true, onTabReady), {
      initialProps: { open: true },
    });
    unmounts.push(unmount);
    expect(create).toHaveBeenCalledWith({ tabId: 'tab-1', url: 'https://example.com' });

    rerender({ open: false });
    resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(activate).not.toHaveBeenCalled();
    expect(onTabReady).not.toHaveBeenCalled();
  });

  it('regression: does not activate a tab whose create() resolves after a different tab took over', async () => {
    const { create, resolve } = deferredCreate();
    const { activate } = installBridge(create);
    seedPageTab('tab-1');
    seedPageTab('tab-2');
    const onTabReady = vi.fn();

    const { unmount } = renderHook(() => useBrowserTabsEffects(true, true, onTabReady));
    unmounts.push(unmount);
    expect(create).toHaveBeenCalledWith({ tabId: 'tab-2', url: 'https://example.com' });

    useBrowserStore.setState({ activeTabId: 'tab-1' });
    resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(activate).not.toHaveBeenCalledWith({ tabId: 'tab-2' });
  });

  it('regression: pre-warms the view while unsettled but waits to activate it until settled', async () => {
    // Side-by-side's open tween: `create` fires immediately (harmless — a
    // background tab is never painted until `activate`), but `activate`
    // must not land while the column is still narrower than the view's
    // eventual bounds, or the real page paints past its edge.
    const { create, activate } = installBridge();
    seedPageTab('tab-1');
    const onTabReady = vi.fn();

    const { rerender, unmount } = renderHook(({ settled }) => useBrowserTabsEffects(true, settled, onTabReady), {
      initialProps: { settled: false },
    });
    unmounts.push(unmount);

    await waitFor(() => expect(create).toHaveBeenCalledWith({ tabId: 'tab-1', url: 'https://example.com' }));
    expect(activate).not.toHaveBeenCalled();
    expect(onTabReady).not.toHaveBeenCalled();

    rerender({ settled: true });

    await waitFor(() => expect(activate).toHaveBeenCalledWith({ tabId: 'tab-1' }));
    expect(onTabReady).toHaveBeenCalled();
  });
});
