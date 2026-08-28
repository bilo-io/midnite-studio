import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';

import { DEFAULT_KEYMAP, EVENT_CHANNELS, type CommandId } from '@midnite/git-shared';

/**
 * The native application menu.
 *
 * Menu items dispatch CommandIds over `menu:command` rather than doing anything
 * themselves — the renderer's keybinding service handles the same ids, so a
 * menu item and its shortcut can never drift apart, and the (future) command
 * palette gets the same actions for free.
 *
 * The Edit menu is not optional on macOS. Cmd+C/Cmd+V are delivered by the
 * *menu*, not by the web contents: with no Edit menu containing the standard
 * roles, copy and paste silently stop working everywhere in the app, including
 * inside the integrated terminal.
 */
export function buildMenu(getWindow: () => BrowserWindow | null): Menu {
  const send = (command: CommandId) => () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(EVENT_CHANNELS.menuCommand, command);
  };

  /** Electron accelerator for a CommandId, from the single keymap. */
  const accelerator = (command: CommandId): string | undefined => {
    const chord = DEFAULT_KEYMAP.find((b) => b.command === command)?.chord;
    // Our chords use `Mod` for "Cmd on mac, Ctrl elsewhere"; Electron spells
    // that `CmdOrCtrl`. Everything else maps across unchanged.
    return chord?.replace(/^Mod\+/, 'CmdOrCtrl+');
  };

  const item = (command: CommandId, label?: string): MenuItemConstructorOptions => ({
    label: label ?? DEFAULT_KEYMAP.find((b) => b.command === command)?.label ?? command,
    accelerator: accelerator(command),
    click: send(command),
  });

  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([{ role: 'appMenu' }] satisfies MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [
        item('repo.open'),
        item('repo.close'),
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        item('view.refresh'),
        { type: 'separator' },
        item('repos.toggle'),
        item('terminal.toggle'),
        item('browser.toggle'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    {
      label: 'Repository',
      submenu: [item('sync.fetch'), item('sync.pull'), item('sync.push')],
    },
    { role: 'windowMenu' },
  ];

  return Menu.buildFromTemplate(template);
}

export function installMenu(getWindow: () => BrowserWindow | null): void {
  Menu.setApplicationMenu(buildMenu(getWindow));
}
