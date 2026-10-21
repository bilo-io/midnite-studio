/**
 * The standard application menu every midnite app shares.
 *
 * Electron's default menu has no Help ▸ Report an Issue…, and an app that sets its own must still
 * carry the Edit roles (on macOS Cmd+C/Cmd+V are delivered by the *menu*, so without them copy and
 * paste stop working). This returns the template as plain objects: the runtime may not import
 * `electron`, so the app's main process calls `Menu.buildFromTemplate` on the result.
 */

/** Structural stand-in for Electron's `MenuItemConstructorOptions`, the subset the suite uses. */
export type SuiteMenuItem = {
  role?: string;
  label?: string;
  type?: 'separator';
  click?: () => void;
  submenu?: SuiteMenuItem[];
};

export type SuiteMenuOptions = {
  /** The Report an Issue item (`reportIssueMenuItem(send)`); always the first Help entry. */
  reportItem: SuiteMenuItem;
  /** Further Help entries, after the report item. */
  helpItems?: SuiteMenuItem[];
  /**
   * Leave the View and/or Window menus out (both default to present). Browser and Capture shipped
   * with the app and Edit menus only: Electron's View ▸ Reload and Window ▸ Close would take Mod+r /
   * Mod+w from the page (Browser's tab commands) before the renderer sees them.
   */
  omit?: { view?: boolean; window?: boolean };
};

/** appMenu, editMenu, viewMenu, windowMenu and a Help submenu led by the report item. */
export function buildSuiteMenuTemplate(options: SuiteMenuOptions): SuiteMenuItem[] {
  const { omit } = options;
  return [
    { role: 'appMenu' },
    { role: 'editMenu' },
    ...(omit?.view === true ? [] : [{ role: 'viewMenu' }]),
    ...(omit?.window === true ? [] : [{ role: 'windowMenu' }]),
    { role: 'help', submenu: [options.reportItem, ...(options.helpItems ?? [])] },
  ];
}
