import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { useBrowserStore } from '../browser-store';
import { PermissionPromptBar } from './permission-prompt-bar';

function renderWithChrome(ui: React.ReactElement) {
  const chrome = createFrameChrome().chrome;
  return render(<FrameChromeProvider chrome={chrome}>{ui}</FrameChromeProvider>);
}

function installBridge() {
  const respondPermission = vi.fn();
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    browser: { respondPermission } as unknown as MidniteStudioBridge['browser'],
  } as Partial<MidniteStudioBridge>;
  return { respondPermission };
}

describe('PermissionPromptBar (Phase 117 Theme B)', () => {
  beforeEach(() => {
    useBrowserStore.setState({
      activeTabId: 'tab-1',
      pendingPermissionRequests: {},
    });
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('renders nothing when active tab has no pending permission request', () => {
    installBridge();
    renderWithChrome(<PermissionPromptBar />);
    expect(screen.queryByTestId('browser-permission-bar')).toBeNull();
  });

  it('renders prompt with displayName and permission kind', () => {
    installBridge();
    useBrowserStore.getState().setPendingPermissionRequest('tab-1', {
      tabId: 'tab-1',
      requestId: 'req-1',
      origin: 'https://example.com',
      permission: 'camera',
      displayName: 'https://example.com',
    });

    renderWithChrome(<PermissionPromptBar />);
    expect(screen.getByTestId('browser-permission-bar')).toBeDefined();
    expect(screen.getByText(/wants to use your camera/)).toBeDefined();
    expect(screen.getByText('https://example.com')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Allow' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Block' })).toBeDefined();
  });

  it('calls respondPermission with allow on clicking Allow and clears prompt', () => {
    const { respondPermission } = installBridge();
    useBrowserStore.getState().setPendingPermissionRequest('tab-1', {
      tabId: 'tab-1',
      requestId: 'req-123',
      origin: 'https://example.com',
      permission: 'microphone',
      displayName: 'https://example.com',
    });

    renderWithChrome(<PermissionPromptBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));

    expect(respondPermission).toHaveBeenCalledWith({
      requestId: 'req-123',
      decision: 'allow',
    });
    expect(useBrowserStore.getState().pendingPermissionRequests['tab-1']).toBeUndefined();
  });

  it('calls respondPermission with deny on clicking Block', () => {
    const { respondPermission } = installBridge();
    useBrowserStore.getState().setPendingPermissionRequest('tab-1', {
      tabId: 'tab-1',
      requestId: 'req-456',
      origin: 'https://example.com',
      permission: 'geolocation',
      displayName: 'https://example.com',
    });

    renderWithChrome(<PermissionPromptBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Block' }));

    expect(respondPermission).toHaveBeenCalledWith({
      requestId: 'req-456',
      decision: 'deny',
    });
    expect(useBrowserStore.getState().pendingPermissionRequests['tab-1']).toBeUndefined();
  });

  it('calls respondPermission with dismiss on clicking Dismiss (X)', () => {
    const { respondPermission } = installBridge();
    useBrowserStore.getState().setPendingPermissionRequest('tab-1', {
      tabId: 'tab-1',
      requestId: 'req-789',
      origin: 'https://example.com',
      permission: 'notifications',
      displayName: 'https://example.com',
    });

    renderWithChrome(<PermissionPromptBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(respondPermission).toHaveBeenCalledWith({
      requestId: 'req-789',
      decision: 'dismiss',
    });
    expect(useBrowserStore.getState().pendingPermissionRequests['tab-1']).toBeUndefined();
  });
});
