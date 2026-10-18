// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { mediaLibraryManifest } from '@midnite/studio-feature-media-library/main';
import { CHANNELS } from '@midnite/studio-shared';

import { createMediaBridge, type RendererIpc } from './bridge';

function fakeIpc(): RendererIpc {
  return {
    invoke: vi.fn(async () => ({ ok: true, value: [] })),
    send: vi.fn(),
    on: () => undefined,
    removeListener: () => undefined,
  };
}

describe('createMediaBridge', () => {
  it('exposes only the library — no secrets, media store, git, pty or browser', () => {
    const bridge = createMediaBridge(fakeIpc());
    expect(Object.keys(bridge)).toEqual(['media']);
    expect(Object.keys(bridge.media).sort()).toEqual(['library', 'onChanged']);
    expect(Object.keys(bridge.media.library).sort()).toEqual(
      [
        'addRoot',
        'clearProgress',
        'items',
        'onChanged',
        'onScanProgress',
        'progress',
        'removeRoot',
        'roots',
        'scan',
        'setSettings',
        'settings',
      ].sort(),
    );
  });

  it('calls only the library channels over invoke', async () => {
    const ipc = fakeIpc();
    const { library } = createMediaBridge(ipc).media;
    await library.roots();
    await library.addRoot();
    await library.removeRoot({ rootId: 'r1' });
    await library.scan({});
    await library.items({});
    await library.progress({ itemId: 'i', positionS: 1, durationS: 2 });
    await library.clearProgress({ itemId: 'i' });
    await library.settings();
    await library.setSettings({ onlineMetadata: false });
    const called = vi.mocked(ipc.invoke).mock.calls.map((c) => c[0]);
    expect(called[0]).toBe(CHANNELS.mediaLibraryRoots);
    expect([...new Set(called)].sort()).toEqual([...mediaLibraryManifest.ipc].sort());
  });
});
