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
};

/** appMenu, editMenu, viewMenu, windowMenu and a Help submenu led by the report item. */
export function buildSuiteMenuTemplate(options: SuiteMenuOptions): SuiteMenuItem[] {
  return [
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    { role: 'help', submenu: [options.reportItem, ...(options.helpItems ?? [])] },
  ];
}
