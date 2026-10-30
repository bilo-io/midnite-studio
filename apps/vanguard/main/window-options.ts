import { suiteWindowOptions } from '@midnite/studio-runtime';

import { VANGUARD_NAME } from './identity';

/**
 * Vanguard's `BrowserWindow` options (no `electron` import, so a test can assert them). The frameless
 * chrome comes from the suite's helper; the security options stay here, per app, where the helper
 * cannot weaken them.
 */
export function vanguardWindowOptions(preload: string, platform: NodeJS.Platform) {
  const { additionalArguments, ...frame } = suiteWindowOptions(platform);
  return {
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    title: VANGUARD_NAME,
    show: false,
    ...frame,
    webPreferences: {
      preload,
      additionalArguments,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}
