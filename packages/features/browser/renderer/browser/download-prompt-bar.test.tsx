import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { useBrowserStore } from '../browser-store';
import { DownloadPromptBar, formatBytes } from './download-prompt-bar';

function renderWithChrome(ui: React.ReactElement) {
  return render(<FrameChromeProvider chrome={createFrameChrome().chrome}>{ui}</FrameChromeProvider>);
}

function installBridge() {
  const respondDownload = vi.fn();
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    browser: { respondDownload } as unknown as MidniteStudioBridge['browser'],
  } as Partial<MidniteStudioBridge>;
  return { respondDownload };
}

const request = {
  tabId: 'tab-1',
  requestId: 'dl-1',
  filename: 'Tool.dmg',
  size: 5 * 1024 * 1024,
  origin: 'https://example.com',
  fileClass: 'disk-image',
};

describe('DownloadPromptBar (Phase 117 Theme D)', () => {
  beforeEach(() => useBrowserStore.setState({ activeTabId: 'tab-1', pendingDownloadRequests: {} }));
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('renders nothing without a pending download', () => {
    installBridge();
    renderWithChrome(<DownloadPromptBar />);
    expect(screen.queryByTestId('browser-download-bar')).toBeNull();
  });

  it('names the file, size, origin and class', () => {
    installBridge();
    useBrowserStore.getState().setPendingDownloadRequest('tab-1', request);
    renderWithChrome(<DownloadPromptBar />);
    expect(screen.getByText('Tool.dmg')).toBeDefined();
    expect(screen.getByText('https://example.com')).toBeDefined();
    expect(screen.getByText(/a disk image/)).toBeDefined();
    expect(screen.getByText(/5\.0 MB/)).toBeDefined();
  });

  it('answers allow and clears the bar', () => {
    const { respondDownload } = installBridge();
    useBrowserStore.getState().setPendingDownloadRequest('tab-1', request);
    renderWithChrome(<DownloadPromptBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(respondDownload).toHaveBeenCalledWith({ requestId: 'dl-1', decision: 'allow' });
    expect(useBrowserStore.getState().pendingDownloadRequests['tab-1']).toBeUndefined();
  });

  it('answers deny on Cancel', () => {
    const { respondDownload } = installBridge();
    useBrowserStore.getState().setPendingDownloadRequest('tab-1', request);
    renderWithChrome(<DownloadPromptBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(respondDownload).toHaveBeenCalledWith({ requestId: 'dl-1', decision: 'deny' });
  });

  it('formats sizes', () => {
    expect(formatBytes(0)).toBe('unknown size');
    expect(formatBytes(2048)).toBe('2 KB');
  });
});
