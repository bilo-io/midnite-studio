// vitest/jsdom: DOM structure, roles and attributes only — no browser capability needed.
import { cleanup, render, screen, within } from '@testing-library/react';
import type { WindowChromeBridge } from '@midnite/studio-shared';
import { LuRadar, LuShieldAlert } from 'react-icons/lu';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell, type AppShellProps } from './app-shell';
import { appLogoUrl } from './app-logo';
import type { NavConfig } from './nav-config';

const NAV: NavConfig = {
  views: [
    { id: 'findings', label: 'Findings', icon: LuShieldAlert },
    { id: 'sensors', label: 'Sensors', icon: LuRadar },
  ],
};

function chrome(frameless: boolean): WindowChromeBridge {
  return { frameless, platform: 'darwin', onFullscreenChange: () => () => {}, onFocusChange: () => () => {} } as unknown as WindowChromeBridge;
}

function renderShell(props: Partial<AppShellProps> = {}) {
  return render(
    <AppShell app="vanguard" name="Midnite Vanguard" accent="#e11d48" nav={NAV} activeView="findings" onNavigate={() => {}} {...props}>
      <p>the active view</p>
    </AppShell>,
  );
}

afterEach(() => {
  cleanup();
  delete (window as { midniteStudio?: unknown }).midniteStudio;
});

describe('AppShell', () => {
  it('renders the name, the launcher logo and the view', () => {
    renderShell();
    expect(screen.getAllByText('Midnite Vanguard').length).toBeGreaterThan(0);
    const logo = screen.getByRole('img', { name: 'Midnite Vanguard' });
    expect(logo.getAttribute('src')).toBe(appLogoUrl('vanguard'));
    expect(screen.getByText('the active view')).toBeTruthy();
  });

  it('puts the view in a clipping slot, so each view owns its scroll', () => {
    renderShell();
    const slot = screen.getByTestId('app-shell-view');
    expect(slot.className).toContain('overflow-hidden');
    expect(within(slot).getByText('the active view')).toBeTruthy();
  });

  it('draws the slim strip in a framed window (no bridge, or frameless: false)', () => {
    renderShell();
    expect(screen.getByTestId('app-shell-framed-strip')).toBeTruthy();
    cleanup();
    (window as { midniteStudio?: unknown }).midniteStudio = { windowChrome: chrome(false) };
    renderShell();
    expect(screen.getByTestId('app-shell-framed-strip')).toBeTruthy();
  });

  it('draws the title bar, not the strip, in a frameless window', () => {
    (window as { midniteStudio?: unknown }).midniteStudio = { windowChrome: chrome(true) };
    renderShell();
    expect(screen.queryByTestId('app-shell-framed-strip')).toBeNull();
    expect(screen.getByTestId('app-shell-titlebar-end')).toBeTruthy();
  });

  it('builds the rail from the manifest nav', () => {
    renderShell();
    const rail = screen.getByRole('navigation', { name: 'Views' });
    expect(within(rail).getByRole('link', { name: 'Findings' }).getAttribute('href')).toBe('/findings');
    expect(within(rail).getByRole('link', { name: 'Sensors' }).getAttribute('href')).toBe('/sensors');
  });

  it('puts Settings last in the rail footer, marked current when active', () => {
    const onNavigate = vi.fn();
    renderShell({ onNavigate });
    const settings = screen.getByRole('button', { name: 'Settings' });
    expect(settings.parentElement?.lastElementChild).toBe(settings);
    expect(settings.getAttribute('aria-current')).toBeNull();
    settings.click();
    expect(onNavigate).toHaveBeenCalledWith('settings');
    cleanup();
    renderShell({ activeView: 'settings' });
    expect(screen.getByRole('button', { name: 'Settings' }).getAttribute('aria-current')).toBe('page');
  });

  it('mounts only the panels it is given', () => {
    const Stub = () => <div data-testid="terminal-stub" />;
    const { container } = renderShell({ panels: { terminal: Stub } });
    expect(screen.getByTestId('terminal-stub')).toBeTruthy();
    expect(container.querySelector('[data-shell-panel="terminal"]')).not.toBeNull();
    expect(container.querySelector('[data-shell-panel="companion"]')).toBeNull();
    expect(container.querySelector('[data-shell-panel="fab"]')).toBeNull();
  });

  it('renders titleBarEnd before the theme toggle', () => {
    renderShell({ titleBarEnd: <span data-testid="studio-extras" /> });
    const extras = screen.getByTestId('studio-extras');
    const toggle = screen.getByTestId('app-shell-theme-toggle');
    expect(extras.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sets --app-accent on the root and the accent class on the active nav row only', () => {
    const { container } = renderShell();
    const root = container.querySelector<HTMLElement>('.app-shell');
    expect(root?.style.getPropertyValue('--app-accent')).toBe('#e11d48');
    const rail = screen.getByRole('navigation', { name: 'Views' });
    const active = within(rail).getByRole('link', { name: 'Findings' });
    const inactive = within(rail).getByRole('link', { name: 'Sensors' });
    expect(active.className).toContain('app-accent-active');
    expect(inactive.className).not.toContain('app-accent-active');
  });
});
