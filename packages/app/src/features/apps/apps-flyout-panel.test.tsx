import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { useUiStore } from '../../store/ui-store';
import { AppsFlyoutPanel } from './apps-flyout-panel';

function installBridge(): {
  activate: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
} {
  const activate = vi.fn();
  const detach = vi.fn();
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    apps: { activate, enable: vi.fn(), disable: vi.fn(), setBounds: vi.fn() } as unknown as MidniteStudioBridge['apps'],
    window: { detach } as unknown as MidniteStudioBridge['window'],
  } as unknown as MidniteStudioBridge;
  return { activate, detach };
}

describe('AppsFlyoutPanel', () => {
  beforeEach(() => {
    useUiStore.setState({ appsFlyoutAppId: null });
  });

  afterEach(() => {
    cleanup();
    (window as unknown as { midniteStudio?: unknown }).midniteStudio = undefined;
    vi.clearAllMocks();
  });

  it('renders nothing when no app is active', () => {
    render(<AppsFlyoutPanel />);
    expect(screen.queryByTestId('apps-flyout')).toBeNull();
  });

  it('renders the active app label when appsFlyoutAppId is set', () => {
    useUiStore.setState({ appsFlyoutAppId: 'youtube' });
    render(<AppsFlyoutPanel />);
    const panel = screen.getByTestId('apps-flyout');
    expect(panel.getAttribute('aria-label')).toBe('YouTube');
  });

  it('closing deactivates and clears the flyout', () => {
    const { activate } = installBridge();
    useUiStore.setState({ appsFlyoutAppId: 'spotify' });
    render(<AppsFlyoutPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Close Spotify' }));

    expect(useUiStore.getState().appsFlyoutAppId).toBeNull();
    expect(activate).toHaveBeenCalledWith({ id: null });
  });

  it('detaching closes the flyout locally and asks main to detach the role', () => {
    const { detach, activate } = installBridge();
    useUiStore.setState({ appsFlyoutAppId: 'google-calendar' });
    render(<AppsFlyoutPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Detach Google Calendar into its own window' }));

    expect(useUiStore.getState().appsFlyoutAppId).toBeNull();
    expect(detach).toHaveBeenCalledWith({ role: 'apps-google-calendar' });
    // Detaching must not also tell main to hide the view — it is about to be
    // shown in the new popout instead.
    expect(activate).not.toHaveBeenCalled();
  });
});
