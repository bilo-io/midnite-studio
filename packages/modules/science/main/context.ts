/**
 * Electron's `dialog.showOpenDialog` shape, so the host passes `(o) => dialog.showOpenDialog(win, o)`
 * without this module importing `electron`.
 */
export type ShowOpenDialog = (opts: {
  properties: ['openFile'];
  filters: { name: string; extensions: string[] }[];
}) => Promise<{ canceled: boolean; filePaths: string[] }>;
