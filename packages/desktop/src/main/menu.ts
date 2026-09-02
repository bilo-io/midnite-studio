import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';

import { COMMANDS, DEFAULT_KEYMAP, EVENT_CHANNELS, type CommandId } from '@midnite/studio-shared';

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

  /**
   * A command's menu label, read from `COMMANDS` rather than `DEFAULT_KEYMAP`:
   * the keymap drops every chord-free command, so a menu item for one (Refresh
   * and Fetch, since the reload pair took Mod+R / Mod+Shift+R) would otherwise
   * fall through to showing its raw id.
   */
  const labelOf = (command: CommandId): string =>
    COMMANDS.find((c) => c.id === command)?.label ?? command;

  const item = (command: CommandId, label?: string): MenuItemConstructorOptions => ({
    label: label ?? labelOf(command),
    accelerator: accelerator(command),
    click: send(command),
  });

  /**
   * A menu item for a chord-colliding command, with NO Electron accelerator.
   *
   * `repo.close` shares Mod+w with `browser.closeTab`/`terminal.close` — a
   * native accelerator fires unconditionally whenever the window is focused,
   * regardless of which of those three the renderer's own keydown handler
   * would resolve to (that resolution lives in `use-keybindings.ts` and reads
   * live app state an Electron `Menu` has no way to see). Registering one here
   * meant every Mod+w silently ALSO fired `repo.close` — popping "Close
   * repository?" while the visible, intended effect was closing a browser tab
   * or a terminal session. The item stays for discoverability and click; only
   * the live keyboard shortcut is gone, and the renderer's own listener
   * already covers Mod+w everywhere this menu's accelerator would have.
   *
   * `app.reload`/`app.hardReload` are here for the same reason wearing a
   * different hat. Their chords are the browser ones (Mod+R, Mod+Shift+R) and
   * the renderer deliberately lets a terminal keep them — see
   * `TERMINAL_YIELD_COMMANDS`. An accelerator registered here fires whenever
   * the WINDOW is focused, xterm included, so it would reload the app out from
   * under someone's Ctrl+R reverse-i-search and undo that carve-out entirely.
   * The chord is real everywhere else; the menu row is for clicking.
   */
  const itemNoAccelerator = (command: CommandId): MenuItemConstructorOptions => ({
    label: labelOf(command),
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
        itemNoAccelerator('repo.close'),
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
        itemNoAccelerator('app.reload'),
        itemNoAccelerator('app.hardReload'),
        item('view.refresh'),
        { type: 'separator' },
        item('repos.toggle'),
        item('terminal.toggle'),
        item('browser.toggle'),
        item('fab.toggle'),
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
