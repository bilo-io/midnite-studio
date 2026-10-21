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

const tile = (name: string) => screen.getByRole('article', { name: new RegExp(`Midnite ${name}`) });

afterEach(() => {
  cleanup();
  delete window.midniteLauncher;
  localStorage.clear();
});

describe('tile states come from installed bundles', () => {
  it('shows Installed, Update and Not installed per app, with Studio-hosted apps following Studio', async () => {
    mount();
    await waitFor(() => expect(within(tile('Cleaner')).getByText('Installed')).toBeDefined());
    expect(within(tile('Cleaner')).getByLabelText('Open Midnite Cleaner')).toBeDefined();
    expect(within(tile('Monitor')).getByText('Update available')).toBeDefined();
    expect(within(tile('Vault')).getByText('Available to install')).toBeDefined();
    expect(within(tile('Vault')).getByLabelText('Install Midnite Vault')).toBeDefined();
    // Nothing published for Coder: still hosted by Studio, which is installed.
    expect(within(tile('Coder')).getByText('Installed')).toBeDefined();
    expect(within(tile('Coder')).getByText('Runs in Studio')).toBeDefined();
  });

  it('installs one app\'s bundle, not Studio', async () => {
    const { install } = mount();
    fireEvent.click(await screen.findByLabelText('Install Midnite Vault'));
    expect(install).toHaveBeenCalledWith('vault');
    await waitFor(() => expect(within(tile('Vault')).getByText('Installed')).toBeDefined(), { timeout: 3000 });
  });

  it('asks before trashing one app, names only it, and removes only that bundle', async () => {
    const { uninstall, studioUninstall } = mount();
    await waitFor(() => expect(within(tile('Cleaner')).getByText('Installed')).toBeDefined());
    fireEvent.click(within(tile('Cleaner')).getByLabelText('More for Midnite Cleaner'));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Move Midnite Cleaner to Trash…' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Move Midnite Cleaner to the Trash?')).toBeDefined();
    expect(within(dialog).getByText(/Only Midnite Cleaner is removed/)).toBeDefined();
    expect(uninstall).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Move to Trash' }));
    });
    expect(uninstall).toHaveBeenCalledWith('cleaner');
    expect(studioUninstall).not.toHaveBeenCalled();
    await waitFor(() => expect(within(tile('Cleaner')).getByText('Available to install')).toBeDefined());
    expect(within(tile('Monitor')).getByText('Update available')).toBeDefined();
  });

  it('offers no trash item on an app with no bundle of its own', async () => {
    mount();
    await waitFor(() => expect(within(tile('Vault')).getByText('Available to install')).toBeDefined());
    fireEvent.click(within(tile('Vault')).getByLabelText('More for Midnite Vault'));
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent);
    expect(items).toContain('Open in Midnite Studio');
    expect(items.join(' ')).not.toMatch(/Trash/);
  });
});
