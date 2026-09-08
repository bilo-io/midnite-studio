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
export function buildMenu(getMainWindow: () => BrowserWindow | null): Menu {
  /*
   * Always the main window, deliberately NOT sender-resolved (Phase 55):
   * every menu command here — repos.toggle, sync.*, the git-status reads —
   * is meaningful only against main's own docked layout and per-window
   * `ui-store`. Routing to `BrowserWindow.getFocusedWindow()` would silently
   * toggle a POPOUT's own unrendered flag while the user watched nothing
   * happen (a popout renders one panel, not the multi-view Shell), which is
   * worse than the pre-Phase-55 behaviour this restores.
   */
  const send = (command: CommandId) => () => {
    const win = getMainWindow();
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
   *
   * `repos.toggle`, `fab.toggle` and `repo.open` join them for Phase 64 Theme
   * D, wearing yet another hat: an OS accelerator bypasses `YIELD_ROOTS`
   * entirely (that registry only ever contests a keystroke the RENDERER'S OWN
   * listener sees), so registering one here would fire even with Monaco
   * focused — `Cmd+G` is find-next in Monaco and in every macOS text surface,
   * `Cmd+L` is Monaco's expand-line-selection AND is already in the terminal's
   * own yield list (proof the carve-out is bypassed), and `Cmd+O` pops a
   * native folder picker mid-keystroke. Same remedy: the chord still works
   * through the renderer's own listener everywhere it is not yielded; only
   * the OS-level accelerator is gone.
   *
   * `palette.open` (Phase 23 Theme C) joins them for a related but distinct
   * reason: it is `scope: 'global'`, so it already reaches the app from
   * *inside* a shell without any help from this menu. An OS-level accelerator
   * would take the keystroke away from the renderer's own dispatcher before
   * `YIELD_ROOTS` ever sees it. The row exists for discoverability and click;
   * `Mod+k` keeps working everywhere through the listener that already knows
   * about it.
   */
  const itemNoAccelerator = (command: CommandId, label?: string): MenuItemConstructorOptions => ({
    label: label ?? labelOf(command),
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
        itemNoAccelerator('repo.open'),
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
        itemNoAccelerator('palette.open', 'Command Palette…'),
        itemNoAccelerator('repos.toggle'),
        item('terminal.toggle'),
        item('browser.toggle'),
        itemNoAccelerator('fab.toggle'),
        // Chord-free (Phase 79 Theme C), so `itemNoAccelerator` is not a choice
        // here the way it is for the rows above — there is no accelerator to
        // strip. Its label comes from `COMMANDS`, which is the only place a
        // chord-free command's label exists.
        itemNoAccelerator('companion.toggle'),
        item('activity.toggle'),
        item('workflow.run'),
        item('view.video'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        /*
          Theme G's `browser.zoomIn`/`zoomOut`/`zoomReset` bind `Mod+=`/
          `Mod+-`/`Mod+0` — exactly the accelerators these three roles get by
          default. An empty `accelerator` is what actually strips one: Electron
          only falls back to the role's own default when the property is
          absent entirely, so an explicit `''` here (not `undefined`, which is
          the same as leaving it out) is what makes the OS-level shortcut go
          away while the menu item — and its click handler, still the real
          window's own zoom — is untouched. Same remedy `app.reload`/
          `app.hardReload` used at `:124-125`, and for the identical reason:
          `use-keybindings.ts:39-49` routes the chord to the `browser.*`
          reading while `browserOpen` is true and to the host's own zoom
          otherwise, which an always-live native accelerator would bypass.
        */
        { role: 'resetZoom', accelerator: '' },
        { role: 'zoomIn', accelerator: '' },
        { role: 'zoomOut', accelerator: '' },
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
