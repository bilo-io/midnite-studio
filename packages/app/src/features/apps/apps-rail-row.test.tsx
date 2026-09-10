import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { useUiStore } from '../../store/ui-store';
import { AppsRailRow } from './apps-rail-row';

function installBridge(): {
  enable: ReturnType<typeof vi.fn>;
  disable: ReturnType<typeof vi.fn>;
  activate: ReturnType<typeof vi.fn>;
  focusRole: ReturnType<typeof vi.fn>;
} {
  const enable = vi.fn(async () => ({ ok: true as const }));
  const disable = vi.fn();
  const activate = vi.fn();
  const focusRole = vi.fn();
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    apps: { enable, disable, activate, setBounds: vi.fn() } as unknown as MidniteStudioBridge['apps'],
    window: { focusRole } as unknown as MidniteStudioBridge['window'],
  } as unknown as MidniteStudioBridge;
  return { enable, disable, activate, focusRole };
}

describe('AppsRailRow', () => {
  beforeEach(() => {
    useUiStore.setState({ enabledApps: [], detachedApps: [], appsFlyoutAppId: null });
  });

  afterEach(() => {
    cleanup();
    (window as unknown as { midniteStudio?: unknown }).midniteStudio = undefined;
    vi.clearAllMocks();
  });

  it('renders one icon per app, all three, even when none are enabled', () => {
    render(<AppsRailRow expanded />);
    expect(screen.getByTestId('apps-rail-spotify')).toBeDefined();
    expect(screen.getByTestId('apps-rail-google-calendar')).toBeDefined();
    expect(screen.getByTestId('apps-rail-youtube')).toBeDefined();
  });

  it('a disabled app is inert and does nothing on click', () => {
    installBridge();
    render(<AppsRailRow expanded />);
    const button = screen.getByTestId('apps-rail-spotify');
    expect(button.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(button);
    expect(useUiStore.getState().appsFlyoutAppId).toBeNull();
  });

  it('clicking an enabled, docked app opens the flyout and enables + activates it', async () => {
    const { enable, activate } = installBridge();
    useUiStore.setState({ enabledApps: ['spotify'] });
    render(<AppsRailRow expanded />);

    fireEvent.click(screen.getByTestId('apps-rail-spotify'));

    expect(useUiStore.getState().appsFlyoutAppId).toBe('spotify');
    expect(enable).toHaveBeenCalledWith({ id: 'spotify' });
    await vi.waitFor(() => expect(activate).toHaveBeenCalledWith({ id: 'spotify' }));
  });

  it('clicking the already-active app again closes the flyout and deactivates', () => {
    const { activate } = installBridge();
    useUiStore.setState({ enabledApps: ['spotify'], appsFlyoutAppId: 'spotify' });
    render(<AppsRailRow expanded />);

    fireEvent.click(screen.getByTestId('apps-rail-spotify'));

    expect(useUiStore.getState().appsFlyoutAppId).toBeNull();
    expect(activate).toHaveBeenCalledWith({ id: null });
  });

  it('clicking a DETACHED app focuses its window instead of touching the flyout', () => {
    const { focusRole, enable } = installBridge();
    useUiStore.setState({ enabledApps: ['youtube'], detachedApps: ['youtube'] });
    render(<AppsRailRow expanded />);

    fireEvent.click(screen.getByTestId('apps-rail-youtube'));

    expect(focusRole).toHaveBeenCalledWith({ role: 'apps-youtube' });
    expect(enable).not.toHaveBeenCalled();
    expect(useUiStore.getState().appsFlyoutAppId).toBeNull();
  });

  it('closes its own flyout if the active app is disabled out from under it', () => {
    useUiStore.setState({ enabledApps: ['spotify'], appsFlyoutAppId: 'spotify' });
    render(<AppsRailRow expanded />);

    act(() => {
      useUiStore.setState({ enabledApps: [] });
    });

    expect(useUiStore.getState().appsFlyoutAppId).toBeNull();
  });
});
