// @vitest-environment jsdom
// Vitest/jsdom: the "Replaces" note and the swap offer are DOM text and roles, no real layout needed.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LauncherBridge } from '../common/bridge';
import { App } from './app';
import { createMockBridge } from './mock-bridge';

/** The `bundles` mock, with extra retired bundles recorded as installed. */
function mount(extra: string[]) {
  const bridge = createMockBridge('bundles');
  const base = bridge.apps.status.bind(bridge.apps);
  bridge.apps.status = async () => {
    const status = await base();
    return { ...status, installed: [...status.installed, ...extra.map((id) => ({ id, version: '0.4.1', runtimeVersion: status.runtimeVersion }))] };
  };
  const uninstall = vi.spyOn(bridge.apps, 'uninstall');
  window.midniteLauncher = bridge as LauncherBridge;
  render(<App />);
  return { uninstall };
}

const tile = (name: string) => screen.getByRole('article', { name: new RegExp(`Midnite ${name}`) });

afterEach(() => {
  cleanup();
  delete window.midniteLauncher;
  localStorage.clear();
});

describe('a host tile whose retired app is installed (Phase 124 Theme G.3)', () => {
  it('says what it replaces and offers the host while it is not installed', async () => {
    mount(['cleaner', 'vault']);
    await waitFor(() => expect(within(tile('Vanguard')).getByText('Replaces Cleaner and Vault')).toBeDefined());
    expect(within(tile('Vanguard')).getByLabelText('Install Midnite Vanguard')).toBeDefined();
    // Another host has nothing to replace.
    expect(within(tile('Mind')).queryByText(/^Replaces/)).toBeNull();
    fireEvent.click(within(tile('Vanguard')).getByText('Details ↗'));
    expect(within(screen.getByRole('dialog')).getByText(/Install it to move over/)).toBeDefined();
    expect(within(screen.getByRole('dialog')).queryByText('Move Midnite Cleaner to Trash')).toBeNull();
  });

  it('offers to remove the old bundle once the host is installed, and removes only that bundle', async () => {
    const { uninstall } = mount(['capture']);
    // Mind is installed (Update available) in the bundles mock, so the old Capture can go.
    await waitFor(() => expect(within(tile('Mind')).getByText('Replaces Capture')).toBeDefined());
    fireEvent.click(within(tile('Mind')).getByText('Details ↗'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/the old app can go/)).toBeDefined();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move Midnite Capture to Trash' }));
    expect(uninstall).toHaveBeenCalledWith('capture');
  });
});
