// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LauncherBridge } from '../common/bridge';
import { APPS, SECTION_ORDER } from '../common/catalog';
import { App } from './app';
import { createMockBridge } from './mock-bridge';

function mount(mode: 'installed' | 'update' | 'bundles' | 'launcher-update' | null) {
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
  const installableApps = APPS.filter((a) => !a.comingSoon);

  it('lists every app with Install while Studio is missing, and Coming soon for comingSoon apps', async () => {
    mount(null);
    await waitFor(() => expect(screen.getAllByLabelText(/^Install Midnite /)).toHaveLength(installableApps.length));
    expect(within(screen.getByLabelText('Filter apps')).getByRole('button', { name: `All ${APPS.length}` })).toBeDefined();
    expect(screen.getAllByText('Runs in Studio')).toHaveLength(installableApps.length - 1);
    expect(screen.getAllByRole('button', { name: 'Coming soon' })).toHaveLength(APPS.length - installableApps.length);
  });

  it('opens an app in Studio on its own view once Studio is installed', async () => {
    const { open } = mount('installed');
    const button = await screen.findByLabelText('Open Midnite Agents');
    fireEvent.click(button);
    expect(open).toHaveBeenCalledWith('agents', undefined);
  });

  it('opens an app\'s detail sheet when a midnite:// link asks for one (live and parked)', async () => {
    const bridge = createMockBridge(null);
    let show: (id: 'money') => void = () => undefined;
    bridge.apps.onShow = (listener) => {
      show = listener as typeof show;
      return () => undefined;
    };
    bridge.apps.takePending = async () => 'agents';
    window.midniteLauncher = bridge as LauncherBridge;
    render(<App />);
    expect(await screen.findByText(/Midnite Agents/, { selector: '[role="dialog"] *' })).toBeDefined();
    act(() => show('money'));
    expect(await screen.findByText(/Midnite Money/, { selector: '[role="dialog"] *' })).toBeDefined();
  });

  it('offers to update the launcher itself when its feed is newer, and always from the status bar', async () => {
    const { bridge } = mount('launcher-update');
    const update = vi.spyOn(bridge.self, 'update');
    expect(await screen.findByText('Midnite Apps 0.0.2 is available.')).toBeDefined();
    const buttons = screen.getAllByRole('button', { name: 'Update launcher' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]!);
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/it will quit and reopen/)).toBeDefined();
  });

  it('re-enables Update and shows the error when a started update fails', async () => {
    const bridge = createMockBridge('launcher-update');
    let fail: (message: string) => void = () => undefined;
    bridge.self.onFailed = (listener) => {
      fail = listener;
      return () => undefined;
    };
    window.midniteLauncher = bridge as LauncherBridge;
    render(<App />);
    await screen.findByText('Midnite Apps 0.0.2 is available.');
    const [banner] = screen.getAllByRole('button', { name: 'Update launcher' });
    fireEvent.click(banner!);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Updating…' })).toHaveLength(2));
    act(() => fail('The update failed (exit 22)'));
    expect(await screen.findByText('The update failed (exit 22)')).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'Update launcher' }).every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('shows no launcher banner when the launcher is current, but keeps the status-bar Update', async () => {
    mount('installed');
    await screen.findByLabelText('Open Midnite Agents');
    expect(screen.queryByText(/Midnite Apps .* is available/)).toBeNull();
    const update = screen.getByRole('button', { name: 'Update launcher' });
    // The version sits beside its Update, without the redundant "Launcher" label.
    expect(update.parentElement?.textContent).toBe('v0.0.1Update launcher');
    expect(screen.queryByText(/Launcher 0\.0\.1/)).toBeNull();
    expect(screen.queryByText('Midnite app suite')).toBeNull();
    expect(screen.queryByRole('button', { name: /GitHub/ })).toBeNull();
  });

  it('shows the update banner and the Updates filter count when Studio is behind', async () => {
    mount('update');
    expect(await screen.findByText('Midnite Studio 0.4.1 is available.')).toBeDefined();
    fireEvent.click(within(screen.getByLabelText('Filter apps')).getByRole('button', { name: `Updates ${installableApps.length}` }));
    expect(screen.getAllByRole('article')).toHaveLength(installableApps.length);
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
    const tile = screen.getAllByRole('article').find((a) => within(a).queryByLabelText('Open Midnite Gamer'))!;
    fireEvent.click(within(tile).getByRole('button', { name: /Details/ }));
    const sheet = screen.getByRole('dialog');
    expect(sheet.getAttribute('aria-label')).toBe('Midnite Gamer');
    expect(within(sheet).getByText('Vision')).toBeDefined();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Open Terrains' }));
    expect(open).toHaveBeenCalledWith('gamer', 'terrains');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows module chips on a multi-module tile and none on a single-module one', async () => {
    mount('installed');
    await screen.findByLabelText('Open Midnite Agents');
    const agents = screen.getAllByRole('article').find((el) => within(el).queryByLabelText('Open Midnite Agents'))!;
    expect(within(within(agents).getByLabelText('Midnite Agents modules')).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Agents',
      'Coder',
      'Creator',
    ]);
    const browser = screen.getAllByRole('article').find((el) => within(el).queryByLabelText('Open Midnite Browser'))!;
    expect(within(browser).queryByLabelText('Midnite Browser modules')).toBeNull();
  });

  it('groups the detail sheet by module and opens a module on its own', async () => {
    const { open } = mount('installed');
    await screen.findByLabelText('Open Midnite Vanguard');
    const tile = screen.getAllByRole('article').find((el) => within(el).queryByLabelText('Open Midnite Vanguard'))!;
    fireEvent.click(within(tile).getAllByRole('button', { name: /Details/ })[0]!);
    const sheet = screen.getByRole('dialog');
    for (const name of ['Vanguard', 'Vault', 'Cleaner', 'Monitor']) {
      expect(within(sheet).getByRole('region', { name: `${name} module` })).toBeDefined();
    }
    fireEvent.click(within(sheet).getByRole('button', { name: 'Open Cleaner module' }));
    expect(open).toHaveBeenCalledWith('vanguard', 'module:cleaner');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Open Secrets' }));
    expect(open).toHaveBeenCalledWith('vanguard', 'secrets');
  });

  it('lists a coming-soon module with no way to open it', async () => {
    mount('installed');
    await screen.findByLabelText('Open Midnite Money');
    const tile = screen.getAllByRole('article').find((el) => within(el).queryByLabelText('Open Midnite Money'))!;
    fireEvent.click(within(tile).getAllByRole('button', { name: /Details/ })[0]!);
    const sheet = screen.getByRole('dialog');
    const accountant = within(sheet).getByRole('region', { name: 'Accountant module' });
    expect(within(accountant).getByText('Coming soon')).toBeDefined();
    expect(within(accountant).queryByRole('button')).toBeNull();
    expect(within(sheet).getByRole('button', { name: 'Open Money module' })).toBeDefined();
  });

  it('switches to the table and remembers it', async () => {
    mount('installed');
    await screen.findByLabelText('Open Midnite Agents');
    fireEvent.click(within(screen.getByLabelText('Layout')).getByRole('button', { name: 'Table' }));
    expect(screen.getAllByRole('table')).toHaveLength(SECTION_ORDER.length);
    expect(localStorage.getItem('midnite-launcher.layout')).toBe('table');
  });

  it('asks before moving Studio to the Trash, naming what goes with it', async () => {
    const { bridge } = mount('installed');
    const uninstall = vi.spyOn(bridge.studio, 'uninstall');
    await screen.findByLabelText('Open Midnite Agents');
    fireEvent.click(screen.getByLabelText('More for Midnite Agents'));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Move Midnite Studio to Trash/ }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(`all ${APPS.length} of them go with it`, { exact: false })).toBeDefined();
    expect(uninstall).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Move to Trash' }));
    });
    expect(uninstall).toHaveBeenCalled();
    expect(await screen.findAllByLabelText(/^Install Midnite /)).toHaveLength(installableApps.length);
  });

  it('renders coming-soon apps with disabled button, limited menu, and safe detail view', async () => {
    mount('installed');
    await screen.findByLabelText('Open Midnite Agents');
    const scienceTile = screen.getAllByRole('article').find((a) => within(a).queryByLabelText('More for Midnite Science'))!;
    expect(within(scienceTile).getAllByText('Coming soon').length).toBeGreaterThanOrEqual(2);
    expect(within(scienceTile).queryByText('Runs in Studio')).toBeNull();
    const comingSoonBtn = within(scienceTile).getByRole('button', { name: 'Coming soon' });
    expect(comingSoonBtn.getAttribute('disabled')).not.toBeNull();
    expect(comingSoonBtn.getAttribute('aria-disabled')).toBe('true');

    // Menu only has About this app
    fireEvent.click(within(scienceTile).getByLabelText('More for Midnite Science'));
    const menuItems = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(menuItems).toHaveLength(1);
    expect(menuItems[0]!.textContent).toBe('About this app');

    // Details sheet
    fireEvent.click(menuItems[0]!);
    const sheet = screen.getByRole('dialog');
    expect(sheet.getAttribute('aria-label')).toBe('Midnite Science');
    expect(within(sheet).getByText('Vision')).toBeDefined();
    // No feature Open buttons
    expect(within(sheet).queryByRole('button', { name: /^Open / })).toBeNull();
    // No "runs in Studio" note
    expect(within(sheet).queryByText(/runs inside Midnite Studio/)).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('switches theme from the top bar, remembers it, and tells main', async () => {
    const { bridge } = mount('installed');
    const setNative = vi.spyOn(bridge.theme, 'set');
    await screen.findByLabelText('Open Midnite Agents');
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

  it('moves every installed app to the Trash in one go, after a confirm that lists them', async () => {
    const { bridge } = mount('bundles');
    const removeBundle = vi.spyOn(bridge.apps, 'uninstall');
    const removeStudio = vi.spyOn(bridge.studio, 'uninstall');
    const button = screen.getByRole('button', { name: 'Move all apps to Trash…' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    fireEvent.click(button);
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Move all 3 apps to the Trash?')).toBeDefined();
    expect(within(dialog).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Midnite Gamer',
      'Midnite Mind',
      'Midnite Studio',
    ]);
    expect(removeBundle).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Move all to Trash' }));
    });
    expect(removeBundle.mock.calls).toEqual([['gamer'], ['mind']]);
    expect(removeStudio).toHaveBeenCalledOnce();
    expect(await screen.findByText('Moved 3 apps to the Trash.')).toBeDefined();
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(true));
  });

  it('skips an app that refuses, keeps going, and says which and why', async () => {
    const { bridge } = mount('bundles');
    vi.spyOn(bridge.studio, 'uninstall').mockResolvedValue({ ok: false, message: 'Midnite Studio is running — quit it first.' });
    const button = screen.getByRole('button', { name: 'Move all apps to Trash…' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    fireEvent.click(button);
    await act(async () => {
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Move all to Trash' }));
    });
    const toast = await screen.findByRole('alert');
    expect(toast.textContent).toContain('Moved 2 of 3 apps to the Trash.');
    expect(toast.textContent).toContain('Midnite Studio: Midnite Studio is running — quit it first.');
  });

  it('offers nothing to remove while no app is installed', async () => {
    mount(null);
    await screen.findAllByLabelText(/^Install Midnite /);
    expect(screen.getByRole('button', { name: 'Move all apps to Trash…' }).hasAttribute('disabled')).toBe(true);
  });
});
