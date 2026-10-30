// vitest/jsdom: DOM events and bridge calls only — the real maximise is Theme I's Playwright e2e.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { WindowChromeBridge } from '@midnite/studio-shared';
import { LuShieldAlert } from 'react-icons/lu';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './app-shell';
import type { NavConfig } from './nav-config';

const NAV: NavConfig = { views: [{ id: 'findings', label: 'Findings', icon: LuShieldAlert }] };

function fakeChrome(frameless = true) {
  let fullscreen: ((value: boolean) => void) | null = null;
  const toggleMaximize = vi.fn();
  const windowChrome = {
    frameless,
    platform: 'darwin',
    onFullscreenChange: (handler: (value: boolean) => void) => {
      fullscreen = handler;
      return () => {};
    },
    onFocusChange: () => () => {},
    setBackgroundColor: () => {},
    toggleMaximize,
  } as unknown as WindowChromeBridge;
  return { windowChrome, toggleMaximize, setFullscreen: (value: boolean) => act(() => fullscreen?.(value)) };
}

function renderFrameless(frameless = true) {
  const chrome = fakeChrome(frameless);
  (window as { midniteStudio?: unknown }).midniteStudio = { windowChrome: chrome.windowChrome };
  render(
    <AppShell app="vanguard" name="Midnite Vanguard" accent="#e11d48" nav={NAV} activeView="findings" onNavigate={() => {}}>
      <p>view</p>
    </AppShell>,
  );
  return chrome;
}

afterEach(() => {
  cleanup();
  delete (window as { midniteStudio?: unknown }).midniteStudio;
});

describe('title bar double-click', () => {
  it('toggles maximise when the drag region is double-clicked', () => {
    const { toggleMaximize } = renderFrameless();
    fireEvent.doubleClick(screen.getByRole('banner'));
    expect(toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it('does nothing in full screen, and works again after leaving it', () => {
    const { toggleMaximize, setFullscreen } = renderFrameless();
    setFullscreen(true);
    fireEvent.doubleClick(screen.getByRole('banner'));
    expect(toggleMaximize).not.toHaveBeenCalled();
    setFullscreen(false);
    fireEvent.doubleClick(screen.getByRole('banner'));
    expect(toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it('leaves a double-click on a control in the bar alone', () => {
    const { toggleMaximize } = renderFrameless();
    const control = screen.getByTestId('app-shell-titlebar-end').querySelector('button');
    expect(control).not.toBeNull();
    fireEvent.doubleClick(control as HTMLElement);
    expect(toggleMaximize).not.toHaveBeenCalled();
  });

  it('draws no bar to double-click in a framed window', () => {
    const { toggleMaximize } = renderFrameless(false);
    expect(screen.queryByRole('banner')).toBeNull();
    expect(toggleMaximize).not.toHaveBeenCalled();
  });
});
