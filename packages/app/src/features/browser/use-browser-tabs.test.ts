import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { useBrowserStore } from '../../store/browser-store';
import { useBrowserTabsEffects } from './use-browser-tabs';

function installBridge() {
  const create = vi.fn().mockResolvedValue({ ok: true });
  const activate = vi.fn();
  const setVisible = vi.fn();
  const onEvent = vi.fn(() => () => {});
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    browser: { create, activate, setVisible, onEvent } as unknown as MidniteStudioBridge['browser'],
  } as Partial<MidniteStudioBridge>;
  return { create, activate, setVisible, onEvent };
}

/** A page tab, seeded directly into the store the way a restored/typed-URL tab would be. */
function seedPageTab(id: string, url = 'https://example.com') {
  useBrowserStore.setState((s) => ({
    tabs: [...s.tabs, { id, kind: 'page', url, title: '', loading: false, canGoBack: false, canGoForward: false }],
    activeTabId: id,
  }));
}

describe('useBrowserTabsEffects', () => {
  afterEach(() => {
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

    renderHook(() => useBrowserTabsEffects(true, onTabReady));

    expect(create).toHaveBeenCalledWith({ tabId: 'tab-1', url: 'https://example.com' });
    await waitFor(() => expect(activate).toHaveBeenCalledWith({ tabId: 'tab-1' }));
    expect(onTabReady).toHaveBeenCalled();
  });

  it('hides the outgoing tab and re-runs onTabReady for the incoming one on switch', async () => {
    const { setVisible, activate } = installBridge();
    seedPageTab('tab-1');
    seedPageTab('tab-2');
    const onTabReady = vi.fn();

    const { rerender } = renderHook(({ open }) => useBrowserTabsEffects(open, onTabReady), {
      initialProps: { open: true },
    });
    await waitFor(() => expect(activate).toHaveBeenCalledWith({ tabId: 'tab-2' }));
    onTabReady.mockClear();
    setVisible.mockClear();

    useBrowserStore.setState({ activeTabId: 'tab-1' });
    rerender({ open: true });

    expect(setVisible).toHaveBeenCalledWith({ tabId: 'tab-2', visible: false });
    await waitFor(() => expect(activate).toHaveBeenLastCalledWith({ tabId: 'tab-1' }));
    expect(onTabReady).toHaveBeenCalled();
  });
});
