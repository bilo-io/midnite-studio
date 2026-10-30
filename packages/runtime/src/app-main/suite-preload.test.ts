import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import type { RendererIpc } from './bridge-slice';
import { createSuiteBridge } from './suite-preload';

const ipc = (): RendererIpc => ({ invoke: vi.fn(async () => ({})), send: vi.fn(), on: vi.fn(), removeListener: vi.fn() });

describe('createSuiteBridge', () => {
  it('exposes windowChrome and suitePrefs, and only those', () => {
    const bridge = createSuiteBridge(ipc(), ['--mstudio-frameless=0'], 'darwin');
    expect(Object.keys(bridge).sort()).toEqual(['suitePrefs', 'windowChrome']);
    expect(bridge.windowChrome.frameless).toBe(false);
  });

  it('routes suitePrefs over its channels', async () => {
    const i = ipc();
    const { suitePrefs } = createSuiteBridge(i, [], 'darwin');
    await suitePrefs.get();
    await suitePrefs.set({ key: 'terminal', value: { showAllApps: true } });
    expect(i.invoke).toHaveBeenCalledWith(CHANNELS.suitePrefsGet, undefined);
    expect(i.invoke).toHaveBeenCalledWith(CHANNELS.suitePrefsSet, { key: 'terminal', value: { showAllApps: true } });
    const off = suitePrefs.onChanged(() => undefined);
    expect(i.on).toHaveBeenCalledWith(EVENT_CHANNELS.suitePrefsChanged, expect.any(Function));
    off();
    expect(i.removeListener).toHaveBeenCalled();
  });
});
