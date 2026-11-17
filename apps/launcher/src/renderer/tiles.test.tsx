// @vitest-environment jsdom
// Vitest/jsdom: tile state text, roles and the confirm dialog are DOM text, no real layout needed.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LauncherBridge } from '../common/bridge';
import { App } from './app';
import { createMockBridge } from './mock-bridge';

function mount() {
  const bridge = createMockBridge('bundles');
  const spies = {
    install: vi.spyOn(bridge.apps, 'install'),
    uninstall: vi.spyOn(bridge.apps, 'uninstall'),
    studioUninstall: vi.spyOn(bridge.studio, 'uninstall'),
  };
  window.midniteLauncher = bridge as LauncherBridge;
  render(<App />);
  return spies;
}

const tile = (name: string) => screen.getByRole('article', { name: new RegExp(`Midnyte ${name}`) });

afterEach(() => {
  cleanup();
  delete window.midniteLauncher;
  localStorage.clear();
});

describe('tile states come from installed bundles', () => {
  it('shows Installed, Update and Not installed per app, with Studio-hosted apps following Studio', async () => {
    mount();
    await waitFor(() => expect(within(tile('Gamer')).getByText('Installed')).toBeDefined());
    expect(within(tile('Gamer')).getByLabelText('Open Midnyte Gamer')).toBeDefined();
    expect(within(tile('Mind')).getByText('Update available')).toBeDefined();
    expect(within(tile('Vanguard')).getByText('Available to install')).toBeDefined();
    expect(within(tile('Vanguard')).getByLabelText('Install Midnyte Vanguard')).toBeDefined();
    // Nothing published for Agents: still hosted by Studio, which is installed.
    expect(within(tile('Agents')).getByText('Installed')).toBeDefined();
    expect(within(tile('Agents')).getByText('Runs in Studio')).toBeDefined();
  });

  it('installs one app\'s bundle, not Studio', async () => {
    const { install } = mount();
    fireEvent.click(await screen.findByLabelText('Install Midnyte Vanguard'));
    expect(install).toHaveBeenCalledWith('vanguard');
    await waitFor(() => expect(within(tile('Vanguard')).getByText('Installed')).toBeDefined(), { timeout: 3000 });
  });

  it('asks before trashing one app, names only it, and removes only that bundle', async () => {
    const { uninstall, studioUninstall } = mount();
    await waitFor(() => expect(within(tile('Gamer')).getByText('Installed')).toBeDefined());
    fireEvent.click(within(tile('Gamer')).getByLabelText('More for Midnyte Gamer'));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Move Midnyte Gamer to Trash…' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Move Midnyte Gamer to the Trash?')).toBeDefined();
    expect(within(dialog).getByText(/Only Midnyte Gamer is removed/)).toBeDefined();
    expect(uninstall).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Move to Trash' }));
    });
    expect(uninstall).toHaveBeenCalledWith('gamer');
    expect(studioUninstall).not.toHaveBeenCalled();
    await waitFor(() => expect(within(tile('Gamer')).getByText('Available to install')).toBeDefined());
    expect(within(tile('Mind')).getByText('Update available')).toBeDefined();
  });

  it('offers no trash item on an app with no bundle of its own', async () => {
    mount();
    await waitFor(() => expect(within(tile('Vanguard')).getByText('Available to install')).toBeDefined());
    fireEvent.click(within(tile('Vanguard')).getByLabelText('More for Midnyte Vanguard'));
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent);
    expect(items).toContain('Open in Midnyte Studio');
    expect(items.join(' ')).not.toMatch(/Trash/);
  });
});
