// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LauncherBridge } from '../common/bridge';
import { APPS, SECTION_ORDER } from '../common/catalog';
import { App } from './app';
import { createMockBridge } from './mock-bridge';

function mount(mode: 'installed' | 'update' | null) {
  const bridge = createMockBridge(mode);
  const open = vi.spyOn(bridge.apps, 'open');
  window.midniteLauncher = bridge as LauncherBridge;
  render(<App />);
  return { bridge, open };
}

afterEach(() => {
  cleanup();
  delete window.midniteLauncher;
  localStorage.clear();
  delete document.documentElement.dataset['theme'];
});

describe('<App>', () => {
  it('lists every app with Install while Studio is missing', async () => {
    mount(null);
    await waitFor(() => expect(screen.getAllByLabelText(/^Install Midnite /)).toHaveLength(APPS.length));
    expect(within(screen.getByLabelText('Filter apps')).getByRole('button', { name: `All ${APPS.length}` })).toBeDefined();
    expect(screen.getAllByText('Runs in Studio')).toHaveLength(APPS.length - 1);
  });

  it('opens an app in Studio on its own view once Studio is installed', async () => {
    const { open } = mount('installed');
    const button = await screen.findByLabelText('Open Midnite Coder');
    fireEvent.click(button);
    expect(open).toHaveBeenCalledWith('coder', undefined);
  });

  it('shows the update banner and the Updates filter count when Studio is behind', async () => {
    mount('update');
    expect(await screen.findByText('Midnite Studio 0.4.1 is available.')).toBeDefined();
    fireEvent.click(within(screen.getByLabelText('Filter apps')).getByRole('button', { name: `Updates ${APPS.length}` }));
    expect(screen.getAllByRole('article')).toHaveLength(APPS.length);
  });

  it('filters by search and says so when nothing matches', async () => {
    mount('installed');
    await screen.findByLabelText('Open Midnite Gamer');
    fireEvent.change(screen.getByLabelText('Search apps'), { target: { value: 'terrain' } });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Search apps'), { target: { value: 'zzz' } });
    expect(screen.getByText(/No apps match/)).toBeDefined();
  });

  it('opens a detail sheet whose features open Studio straight onto them', async () => {
    const { open } = mount('installed');
    await screen.findByLabelText('Open Midnite Gamer');
    const tile = screen.getAllByRole('article').find((a) => within(a).queryByText('Gamer'))!;
    fireEvent.click(within(tile).getByRole('button', { name: /Details/ }));
    const sheet = screen.getByRole('dialog');
    expect(sheet.getAttribute('aria-label')).toBe('Midnite Gamer');
    expect(within(sheet).getByText('Vision')).toBeDefined();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Open Terrains' }));
    expect(open).toHaveBeenCalledWith('gamer', 'terrains');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('switches to the table and remembers it', async () => {
    mount('installed');
    await screen.findByLabelText('Open Midnite Coder');
    fireEvent.click(within(screen.getByLabelText('Layout')).getByRole('button', { name: 'Table' }));
    expect(screen.getAllByRole('table')).toHaveLength(SECTION_ORDER.length);
    expect(localStorage.getItem('midnite-launcher.layout')).toBe('table');
  });

  it('asks before moving Studio to the Trash, naming what goes with it', async () => {
    const { bridge } = mount('installed');
    const uninstall = vi.spyOn(bridge.studio, 'uninstall');
    await screen.findByLabelText('Open Midnite Coder');
    fireEvent.click(screen.getByLabelText('More for Midnite Coder'));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Move Midnite Studio to Trash/ }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(`all ${APPS.length} of them go with it`, { exact: false })).toBeDefined();
    expect(uninstall).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Move to Trash' }));
    });
    expect(uninstall).toHaveBeenCalled();
    expect(await screen.findAllByLabelText(/^Install Midnite /)).toHaveLength(APPS.length);
  });

  it('switches theme from the top bar, remembers it, and tells main', async () => {
    const { bridge } = mount('installed');
    const setNative = vi.spyOn(bridge.theme, 'set');
    await screen.findByLabelText('Open Midnite Coder');
    const themes = screen.getByLabelText('Theme');
    expect(within(themes).getByLabelText('System theme').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(within(themes).getByLabelText('Light theme'));
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('midnite-launcher.theme')).toBe('light');
    expect(setNative).toHaveBeenLastCalledWith('light');

    fireEvent.click(within(themes).getByLabelText('System theme'));
    expect(document.documentElement.dataset['theme']).toBeUndefined();
    expect(localStorage.getItem('midnite-launcher.theme')).toBeNull();
    expect(setNative).toHaveBeenLastCalledWith('system');
  });
});
