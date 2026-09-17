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
    useUiStore.setState({
      enabledApps: [],
      detachedApps: [],
      appsFlyoutAppId: null,
      lastOpenedAppId: null,
    });
  });

  afterEach(() => {
    cleanup();
    (window as unknown as { midniteStudio?: unknown }).midniteStudio = undefined;
    vi.clearAllMocks();
  });

  it('renders one icon per app, all three, even when none are enabled', () => {
    render(<AppsRailRow />);
    expect(screen.getByTestId('apps-rail-spotify')).toBeDefined();
    expect(screen.getByTestId('apps-rail-google-calendar')).toBeDefined();
    expect(screen.getByTestId('apps-rail-youtube')).toBeDefined();
  });

  it('shows only the most recently opened app until the switcher is hovered', () => {
    useUiStore.setState({
      enabledApps: ['spotify', 'google-calendar', 'youtube'],
      lastOpenedAppId: 'google-calendar',
    });
    render(<AppsRailRow expanded={false} />);

    expect(screen.queryByTestId('apps-rail-spotify')).toBeNull();
    expect(screen.getByTestId('apps-rail-google-calendar')).toBeDefined();
    expect(screen.queryByTestId('apps-rail-youtube')).toBeNull();

    fireEvent.mouseEnter(screen.getByRole('group', { name: 'Apps' }));
    expect(screen.getByTestId('apps-rail-spotify')).toBeDefined();
    expect(screen.getByTestId('apps-rail-google-calendar')).toBeDefined();
    expect(screen.getByTestId('apps-rail-youtube')).toBeDefined();

    fireEvent.mouseLeave(screen.getByRole('group', { name: 'Apps' }));
    expect(screen.queryByTestId('apps-rail-spotify')).toBeNull();
    expect(screen.getByTestId('apps-rail-google-calendar')).toBeDefined();
    expect(screen.queryByTestId('apps-rail-youtube')).toBeNull();
  });

  it('reveals app names beside every icon only while the expanded switcher is hovered', () => {
    useUiStore.setState({
      enabledApps: ['spotify', 'google-calendar', 'youtube'],
      lastOpenedAppId: 'spotify',
    });
    const { rerender } = render(<AppsRailRow expanded />);

    expect(screen.getByText('Spotify')).toBeDefined();
    expect(screen.queryByText('Google Calendar')).toBeNull();

    fireEvent.mouseEnter(screen.getByRole('group', { name: 'Apps' }));
    expect(screen.getByText('Spotify')).toBeDefined();
    expect(screen.getByText('Google Calendar')).toBeDefined();
    expect(screen.getByText('YouTube')).toBeDefined();

    rerender(<AppsRailRow expanded={false} />);
    expect(screen.queryByText('Spotify')).toBeNull();
    expect(screen.queryByText('Google Calendar')).toBeNull();
    expect(screen.queryByText('YouTube')).toBeNull();
  });

  it('stays revealed when the flyout takes focus off a rail icon the pointer is still on', () => {
    installBridge();
    useUiStore.setState({ enabledApps: ['spotify', 'google-calendar', 'youtube'] });
    render(<AppsRailRow />);

    const group = screen.getByRole('group', { name: 'Apps' });
    fireEvent.mouseEnter(group);
    // Clicking an icon opens the flyout, which then takes focus for itself —
    // a blur to a target outside this group while the pointer has never left
    // it. Collapsing here would pull the next icon out from under the click
    // that switches the flyout to a second app.
    fireEvent.click(screen.getByTestId('apps-rail-spotify'));
    fireEvent.blur(screen.getByTestId('apps-rail-spotify'), { relatedTarget: document.body });

    expect(screen.getByTestId('apps-rail-google-calendar')).toBeDefined();
    expect(screen.getByTestId('apps-rail-youtube')).toBeDefined();
  });

  it('falls back to every icon when the remembered app has since been disabled', () => {
    useUiStore.setState({
      enabledApps: ['spotify', 'youtube'],
      lastOpenedAppId: 'google-calendar',
    });
    render(<AppsRailRow expanded={false} />);

    expect(screen.getByTestId('apps-rail-spotify')).toBeDefined();
    expect(screen.getByTestId('apps-rail-google-calendar')).toBeDefined();
    expect(screen.getByTestId('apps-rail-youtube')).toBeDefined();
  });

  it('remembers the last app after its flyout closes', () => {
    installBridge();
    useUiStore.setState({ enabledApps: ['spotify', 'youtube'] });
    render(<AppsRailRow />);

    fireEvent.click(screen.getByTestId('apps-rail-youtube'));
    fireEvent.click(screen.getByTestId('apps-rail-youtube'));

    expect(useUiStore.getState().appsFlyoutAppId).toBeNull();
    expect(useUiStore.getState().lastOpenedAppId).toBe('youtube');
    expect(screen.queryByTestId('apps-rail-spotify')).toBeNull();
    expect(screen.getByTestId('apps-rail-youtube')).toBeDefined();
  });

  it('a disabled app is inert and does nothing on click', () => {
    installBridge();
    render(<AppsRailRow />);
    const button = screen.getByTestId('apps-rail-spotify');
    expect(button.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(button);
    expect(useUiStore.getState().appsFlyoutAppId).toBeNull();
  });

  it('clicking an enabled, docked app opens the flyout and enables + activates it', async () => {
    const { enable, activate } = installBridge();
    useUiStore.setState({ enabledApps: ['spotify'] });
    render(<AppsRailRow />);

    fireEvent.click(screen.getByTestId('apps-rail-spotify'));

    expect(useUiStore.getState().appsFlyoutAppId).toBe('spotify');
    expect(enable).toHaveBeenCalledWith({ id: 'spotify' });
    await vi.waitFor(() => expect(activate).toHaveBeenCalledWith({ id: 'spotify' }));
  });

  it('clicking the already-active app again closes the flyout and deactivates', () => {
    const { activate } = installBridge();
    useUiStore.setState({ enabledApps: ['spotify'], appsFlyoutAppId: 'spotify' });
    render(<AppsRailRow />);

    fireEvent.click(screen.getByTestId('apps-rail-spotify'));

    expect(useUiStore.getState().appsFlyoutAppId).toBeNull();
    expect(activate).toHaveBeenCalledWith({ id: null });
  });

  it('clicking a DETACHED app focuses its window instead of touching the flyout', () => {
    const { focusRole, enable } = installBridge();
    useUiStore.setState({ enabledApps: ['youtube'], detachedApps: ['youtube'] });
    render(<AppsRailRow />);

    fireEvent.click(screen.getByTestId('apps-rail-youtube'));

    expect(focusRole).toHaveBeenCalledWith({ role: 'apps-youtube' });
    expect(enable).not.toHaveBeenCalled();
    expect(useUiStore.getState().appsFlyoutAppId).toBeNull();
    expect(useUiStore.getState().lastOpenedAppId).toBe('youtube');
  });

  it('closes its own flyout if the active app is disabled out from under it', () => {
    useUiStore.setState({ enabledApps: ['spotify'], appsFlyoutAppId: 'spotify' });
    render(<AppsRailRow />);

    act(() => {
      useUiStore.setState({ enabledApps: [] });
    });

    expect(useUiStore.getState().appsFlyoutAppId).toBeNull();
  });
});
