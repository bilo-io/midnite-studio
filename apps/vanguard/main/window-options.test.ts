import { WINDOW_FRAMELESS_ARG } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { vanguardWindowOptions } from './window-options';

describe('vanguardWindowOptions', () => {
  it('opens frameless on macOS with the suite chrome options', () => {
    const o = vanguardWindowOptions('/p/preload.cjs', 'darwin');
    expect(o.titleBarStyle).toBe('hidden');
    expect(o.trafficLightPosition).toEqual({ x: 16, y: 13 });
    expect(o.webPreferences.additionalArguments).toEqual([`${WINDOW_FRAMELESS_ARG}1`]);
  });

  it('keeps the native frame elsewhere and says so', () => {
    const o = vanguardWindowOptions('/p/preload.cjs', 'linux');
    expect(o).not.toHaveProperty('titleBarStyle');
    expect(o.webPreferences.additionalArguments).toEqual([`${WINDOW_FRAMELESS_ARG}0`]);
  });

  it.each(['darwin', 'linux', 'win32'] as const)('keeps the per-app security options on %s', (platform) => {
    const { webPreferences } = vanguardWindowOptions('/p/preload.cjs', platform);
    expect(webPreferences.sandbox).toBe(true);
    expect(webPreferences.contextIsolation).toBe(true);
    expect(webPreferences.nodeIntegration).toBe(false);
    expect(webPreferences.preload).toBe('/p/preload.cjs');
  });
});
