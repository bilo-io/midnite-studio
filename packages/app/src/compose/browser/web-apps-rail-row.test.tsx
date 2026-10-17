import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render as baseRender, screen, type RenderOptions } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { useUiStore } from '../../store/ui-store';
import { WebAppsRailRow } from '@midnite/studio-feature-browser/renderer/testing';
import { StudioProviders } from '../studio-providers';

const render = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) => baseRender(ui, { wrapper: StudioProviders, ...options });

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
    webApps: { enable, disable, activate, setBounds: vi.fn() } as unknown as MidniteStudioBridge['webApps'],
    window: { focusRole } as unknown as MidniteStudioBridge['window'],
  } as unknown as MidniteStudioBridge;
  return { enable, disable, activate, focusRole };
}

describe('WebAppsRailRow', () => {
  beforeEach(() => {
    useUiStore.setState({
      enabledWebApps: [],
      detachedWebApps: [],
      webAppsFlyoutAppId: null,
      lastOpenedWebAppId: null,
    });
  });

  afterEach(() => {
    cleanup();
    (window as unknown as { midniteStudio?: unknown }).midniteStudio = undefined;
    vi.clearAllMocks();
  });

  it('renders one icon per enabled app, all three, when all are enabled', () => {
    useUiStore.setState({ enabledWebApps: ['spotify', 'google-calendar', 'youtube'] });
    render(<WebAppsRailRow />);
    expect(screen.getByTestId('web-apps-rail-spotify')).toBeDefined();
    expect(screen.getByTestId('web-apps-rail-google-calendar')).toBeDefined();
    expect(screen.getByTestId('web-apps-rail-youtube')).toBeDefined();
  });

  it('renders no button at all for a disabled app, and no Apps group when none are enabled', () => {
    useUiStore.setState({ enabledWebApps: ['spotify'] });
    render(<WebAppsRailRow />);
    expect(screen.getByTestId('web-apps-rail-spotify')).toBeDefined();
    expect(screen.queryByTestId('web-apps-rail-google-calendar')).toBeNull();
    expect(screen.queryByTestId('web-apps-rail-youtube')).toBeNull();

    cleanup();
    useUiStore.setState({ enabledWebApps: [] });
    render(<WebAppsRailRow />);
    expect(screen.queryByRole('group', { name: 'Apps' })).toBeNull();
  });

  it('shows only the most recently opened app until the switcher is hovered', () => {
    useUiStore.setState({
      enabledWebApps: ['spotify', 'google-calendar', 'youtube'],
      lastOpenedWebAppId: 'google-calendar',
    });
    render(<WebAppsRailRow expanded={false} />);

    expect(screen.queryByTestId('web-apps-rail-spotify')).toBeNull();
    expect(screen.getByTestId('web-apps-rail-google-calendar')).toBeDefined();
    expect(screen.queryByTestId('web-apps-rail-youtube')).toBeNull();

    fireEvent.mouseEnter(screen.getByRole('group', { name: 'Apps' }));
    expect(screen.getByTestId('web-apps-rail-spotify')).toBeDefined();
    expect(screen.getByTestId('web-apps-rail-google-calendar')).toBeDefined();
    expect(screen.getByTestId('web-apps-rail-youtube')).toBeDefined();

    fireEvent.mouseLeave(screen.getByRole('group', { name: 'Apps' }));
    expect(screen.queryByTestId('web-apps-rail-spotify')).toBeNull();
    expect(screen.getByTestId('web-apps-rail-google-calendar')).toBeDefined();
    expect(screen.queryByTestId('web-apps-rail-youtube')).toBeNull();
  });

  it('reveals app names beside every icon only while the expanded switcher is hovered', () => {
    useUiStore.setState({
      enabledWebApps: ['spotify', 'google-calendar', 'youtube'],
      lastOpenedWebAppId: 'spotify',
    });
    const { rerender } = render(<WebAppsRailRow expanded />);

    expect(screen.getByText('Spotify')).toBeDefined();
    expect(screen.queryByText('Google Calendar')).toBeNull();

    fireEvent.mouseEnter(screen.getByRole('group', { name: 'Apps' }));
    expect(screen.getByText('Spotify')).toBeDefined();
    expect(screen.getByText('Google Calendar')).toBeDefined();
    expect(screen.getByText('YouTube')).toBeDefined();

    rerender(<WebAppsRailRow expanded={false} />);
    expect(screen.queryByText('Spotify')).toBeNull();
    expect(screen.queryByText('Google Calendar')).toBeNull();
    expect(screen.queryByText('YouTube')).toBeNull();
  });

  it('stays revealed when the flyout takes focus off a rail icon the pointer is still on', () => {
    installBridge();
    useUiStore.setState({ enabledWebApps: ['spotify', 'google-calendar', 'youtube'] });
    render(<WebAppsRailRow />);

    const group = screen.getByRole('group', { name: 'Apps' });
    fireEvent.mouseEnter(group);
    // Clicking an icon opens the flyout, which then takes focus for itself —
    // a blur to a target outside this group while the pointer has never left
    // it. Collapsing here would pull the next icon out from under the click
    // that switches the flyout to a second app.
    fireEvent.click(screen.getByTestId('web-apps-rail-spotify'));
    fireEvent.blur(screen.getByTestId('web-apps-rail-spotify'), { relatedTarget: document.body });

    expect(screen.getByTestId('web-apps-rail-google-calendar')).toBeDefined();
    expect(screen.getByTestId('web-apps-rail-youtube')).toBeDefined();
  });

  it('falls back to every enabled icon when the remembered app has since been disabled', () => {
    useUiStore.setState({
      enabledWebApps: ['spotify', 'youtube'],
      lastOpenedWebAppId: 'google-calendar',
    });
    render(<WebAppsRailRow expanded={false} />);

    expect(screen.getByTestId('web-apps-rail-spotify')).toBeDefined();
    expect(screen.getByTestId('web-apps-rail-youtube')).toBeDefined();
    // google-calendar is disabled — it must not appear, not even as the
    // switcher's single collapsed icon.
    expect(screen.queryByTestId('web-apps-rail-google-calendar')).toBeNull();
  });

  it('remembers the last app after its flyout closes', () => {
    installBridge();
    useUiStore.setState({ enabledWebApps: ['spotify', 'youtube'] });
    render(<WebAppsRailRow />);

    fireEvent.click(screen.getByTestId('web-apps-rail-youtube'));
    fireEvent.click(screen.getByTestId('web-apps-rail-youtube'));

    expect(useUiStore.getState().webAppsFlyoutAppId).toBeNull();
    expect(useUiStore.getState().lastOpenedWebAppId).toBe('youtube');
    expect(screen.queryByTestId('web-apps-rail-spotify')).toBeNull();
    expect(screen.getByTestId('web-apps-rail-youtube')).toBeDefined();
  });

  it('clicking an enabled, docked app opens the flyout and enables + activates it', async () => {
    const { enable, activate } = installBridge();
    useUiStore.setState({ enabledWebApps: ['spotify'] });
    render(<WebAppsRailRow />);

    fireEvent.click(screen.getByTestId('web-apps-rail-spotify'));

    expect(useUiStore.getState().webAppsFlyoutAppId).toBe('spotify');
    expect(enable).toHaveBeenCalledWith({ id: 'spotify' });
    await vi.waitFor(() => expect(activate).toHaveBeenCalledWith({ id: 'spotify' }));
  });

  it('clicking the already-active app again closes the flyout and deactivates', () => {
    const { activate } = installBridge();
    useUiStore.setState({ enabledWebApps: ['spotify'], webAppsFlyoutAppId: 'spotify' });
    render(<WebAppsRailRow />);

    fireEvent.click(screen.getByTestId('web-apps-rail-spotify'));

    expect(useUiStore.getState().webAppsFlyoutAppId).toBeNull();
    expect(activate).toHaveBeenCalledWith({ id: null });
  });

  it('clicking a DETACHED app focuses its window instead of touching the flyout', () => {
    const { focusRole, enable } = installBridge();
    useUiStore.setState({ enabledWebApps: ['youtube'], detachedWebApps: ['youtube'] });
    render(<WebAppsRailRow />);

    fireEvent.click(screen.getByTestId('web-apps-rail-youtube'));

    expect(focusRole).toHaveBeenCalledWith({ role: 'apps-youtube' });
    expect(enable).not.toHaveBeenCalled();
    expect(useUiStore.getState().webAppsFlyoutAppId).toBeNull();
    expect(useUiStore.getState().lastOpenedWebAppId).toBe('youtube');
  });

  it('closes its own flyout if the active app is disabled out from under it', () => {
    useUiStore.setState({ enabledWebApps: ['spotify'], webAppsFlyoutAppId: 'spotify' });
    render(<WebAppsRailRow />);

    act(() => {
      useUiStore.setState({ enabledWebApps: [] });
    });

    expect(useUiStore.getState().webAppsFlyoutAppId).toBeNull();
  });
});
