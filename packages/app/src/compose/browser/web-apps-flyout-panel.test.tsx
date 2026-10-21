import type { ReactElement } from 'react';
import { cleanup, fireEvent, render as baseRender, screen, type RenderOptions } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { useUiStore } from '../../store/ui-store';
import { WebAppsFlyoutPanel } from '@midnite/studio-feature-browser/renderer/testing';
import { StudioProviders } from '../studio-providers';

const render = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) => baseRender(ui, { wrapper: StudioProviders, ...options });

function installBridge(): {
  activate: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
} {
  const activate = vi.fn();
  const detach = vi.fn();
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    webApps: { activate, enable: vi.fn(), disable: vi.fn(), setBounds: vi.fn() } as unknown as MidniteStudioBridge['webApps'],
    window: { detach } as unknown as MidniteStudioBridge['window'],
  } as unknown as MidniteStudioBridge;
  return { activate, detach };
}

describe('WebAppsFlyoutPanel', () => {
  beforeEach(() => {
    useUiStore.setState({ webAppsFlyoutAppId: null });
  });

  afterEach(() => {
    cleanup();
    (window as unknown as { midniteStudio?: unknown }).midniteStudio = undefined;
    vi.clearAllMocks();
  });

  it('renders nothing when no app is active', () => {
    render(<WebAppsFlyoutPanel />);
    expect(screen.queryByTestId('web-apps-flyout')).toBeNull();
  });

  it('renders the active app label when webAppsFlyoutAppId is set', () => {
    useUiStore.setState({ webAppsFlyoutAppId: 'youtube' });
    render(<WebAppsFlyoutPanel />);
    const panel = screen.getByTestId('web-apps-flyout');
    expect(panel.getAttribute('aria-label')).toBe('YouTube');
  });

  it('closing deactivates and clears the flyout', () => {
    const { activate } = installBridge();
    useUiStore.setState({ webAppsFlyoutAppId: 'spotify' });
    render(<WebAppsFlyoutPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Close Spotify' }));

    expect(useUiStore.getState().webAppsFlyoutAppId).toBeNull();
    expect(activate).toHaveBeenCalledWith({ id: null });
  });

  it('detaching closes the flyout locally and asks main to detach the role', () => {
    const { detach, activate } = installBridge();
    useUiStore.setState({ webAppsFlyoutAppId: 'google-calendar' });
    render(<WebAppsFlyoutPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Detach Google Calendar into its own window' }));

    expect(useUiStore.getState().webAppsFlyoutAppId).toBeNull();
    expect(detach).toHaveBeenCalledWith({ role: 'apps-google-calendar' });
    // Detaching must not also tell main to hide the view — it is about to be
    // shown in the new popout instead.
    expect(activate).not.toHaveBeenCalled();
  });

  it('dismisses on a pointerdown outside the panel', () => {
    const { activate } = installBridge();
    useUiStore.setState({ webAppsFlyoutAppId: 'spotify' });
    render(
      <div>
        <div data-testid="elsewhere">Elsewhere</div>
        <WebAppsFlyoutPanel />
      </div>,
    );

    fireEvent.pointerDown(screen.getByTestId('elsewhere'));

    expect(useUiStore.getState().webAppsFlyoutAppId).toBeNull();
    expect(activate).toHaveBeenCalledWith({ id: null });
  });

  it('does not dismiss on a pointerdown inside the panel itself', () => {
    installBridge();
    useUiStore.setState({ webAppsFlyoutAppId: 'spotify' });
    render(<WebAppsFlyoutPanel />);

    fireEvent.pointerDown(screen.getByTestId('web-apps-flyout'));

    expect(useUiStore.getState().webAppsFlyoutAppId).toBe('spotify');
  });

  it('does not dismiss on a pointerdown aimed at a rail icon — that click switches or toggles it instead', () => {
    const { activate } = installBridge();
    useUiStore.setState({ webAppsFlyoutAppId: 'spotify' });
    render(
      <div>
        <button data-testid="web-apps-rail-youtube">Open YouTube</button>
        <WebAppsFlyoutPanel />
      </div>,
    );

    fireEvent.pointerDown(screen.getByTestId('web-apps-rail-youtube'));

    expect(useUiStore.getState().webAppsFlyoutAppId).toBe('spotify');
    expect(activate).not.toHaveBeenCalled();
  });
});
