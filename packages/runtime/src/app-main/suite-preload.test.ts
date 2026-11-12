import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import type { RendererIpc } from './bridge-slice';
import { createSuiteBridge } from './suite-preload';

const ipc = (): RendererIpc => ({ invoke: vi.fn(async () => ({})), send: vi.fn(), on: vi.fn(), removeListener: vi.fn() });

describe('createSuiteBridge', () => {
  it('exposes windowChrome, suitePrefs and suiteLink, and only those', () => {
    const bridge = createSuiteBridge(ipc(), ['--mstudio-frameless=0'], 'darwin');
    expect(Object.keys(bridge).sort()).toEqual(['appVersion', 'suiteLink', 'suitePrefs', 'suiteReleaseNotes', 'windowChrome']);
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

  it('reads the app version from its argument, 0.0.0 when absent', () => {
    expect(createSuiteBridge(ipc(), ['--mstudio-app-version=0.0.7'], 'darwin').appVersion).toBe('0.0.7');
    expect(createSuiteBridge(ipc(), [], 'darwin').appVersion).toBe('0.0.0');
  });

  it('routes suiteReleaseNotes over its channel', async () => {
    const i = ipc();
    await createSuiteBridge(i, [], 'darwin').suiteReleaseNotes.get({ latest: 4 });
    expect(i.invoke).toHaveBeenCalledWith(CHANNELS.suiteReleaseNotes, { latest: 4 });
  });

  it('routes suiteLink over its channels', async () => {
    const i = ipc();
    const { suiteLink } = createSuiteBridge(i, [], 'darwin');
    await suiteLink.take();
    expect(i.invoke).toHaveBeenCalledWith(CHANNELS.suiteLinkTake, undefined);
    suiteLink.onOpen(() => undefined);
    expect(i.on).toHaveBeenCalledWith(EVENT_CHANNELS.suiteLinkOpen, expect.any(Function));
  });
});
