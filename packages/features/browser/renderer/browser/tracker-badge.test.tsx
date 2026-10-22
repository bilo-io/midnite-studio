import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { useBrowserStore } from '../browser-store';
import { TrackerBadge } from './tracker-badge';

function installBridge() {
  const setTrackerException = vi.fn();
  const reload = vi.fn();
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    browser: { setTrackerException, reload } as unknown as MidniteStudioBridge['browser'],
  } as Partial<MidniteStudioBridge>;
  return { setTrackerException, reload };
}

const mount = () => render(<FrameChromeProvider chrome={createFrameChrome().chrome}><TrackerBadge /></FrameChromeProvider>);

describe('TrackerBadge (Phase 117 Theme E)', () => {
  beforeEach(() => {
    useBrowserStore.setState({
      activeTabId: 'tab-1',
      trackerBlocks: {},
      tabs: [{ id: 'tab-1', url: 'https://news.test/story' } as never],
    });
  });
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('is absent at zero and shows the count otherwise', () => {
    installBridge();
    const { unmount } = mount();
    expect(screen.queryByTestId('browser-tracker-badge')).toBeNull();
    unmount();
    useBrowserStore.getState().setTrackerBlocks('tab-1', { count: 7, hosts: ['a.test', 'b.test'] });
    mount();
    expect(screen.getByTestId('browser-tracker-badge').textContent).toBe('7');
  });

  it('lists hosts in the popover and sets a per-site exception, reloading the tab', () => {
    const { setTrackerException, reload } = installBridge();
    useBrowserStore.getState().setTrackerBlocks('tab-1', { count: 2, hosts: ['a.test', 'b.test'] });
    mount();
    fireEvent.click(screen.getByTestId('browser-tracker-badge'));
    expect(screen.getByText('a.test')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Allow on news.test' }));
    expect(setTrackerException).toHaveBeenCalledWith({ host: 'news.test', allow: true });
    expect(reload).toHaveBeenCalledWith({ tabId: 'tab-1' });
  });
});
