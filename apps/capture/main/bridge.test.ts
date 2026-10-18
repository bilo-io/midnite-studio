// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { captureManifest } from '@midnite/studio-feature-capture/main';
import { CHANNELS } from '@midnite/studio-shared';

import { createCaptureBridge, type RendererIpc } from './bridge';

function fakeIpc(): RendererIpc {
  return {
    invoke: vi.fn(async () => ({ ok: true })),
    send: vi.fn(),
    on: () => undefined,
    removeListener: () => undefined,
  };
}

describe('createCaptureBridge', () => {
  it('exposes only capture — no secrets, fs, git, pty, browser or media store', () => {
    const bridge = createCaptureBridge(fakeIpc());
    expect(Object.keys(bridge)).toEqual(['capture']);
  });

  it('calls only the capture channels over invoke', async () => {
    const ipc = fakeIpc();
    const { capture } = createCaptureBridge(ipc);
    const id = 'cap-20261018-093000-abcdef12';
    await capture.status();
    await capture.requestPermission();
    await capture.openPermissionSettings();
    await capture.sources({ kind: 'screen' });
    await capture.still({ mode: 'screen', sourceId: 'screen:1:0' });
    await capture.regionBegin({});
    await capture.regionPending();
    await capture.regionFinish({ pendingId: 'p', rect: { x: 0, y: 0, width: 1, height: 1 } });
    await capture.regionCancel({ pendingId: 'p' });
    await capture.recordingArm({ sourceId: 'screen:1:0' });
    await capture.recordingBegin({ mime: 'video/webm' });
    await capture.recordingChunk({ recordingId: 'r', bytes: new Uint8Array([1]) });
    await capture.recordingFinish({ recordingId: 'r', durationMs: 1 });
    await capture.recordingAbort({ recordingId: 'r' });
    await capture.list();
    await capture.remove({ id });
    await capture.reveal({ id });
    await capture.copy({ id });
    await capture.setSettings({});
    await capture.clipboard.list();
    await capture.clipboard.copy({ id: 'clip-abcdef' });
    await capture.clipboard.remove({ id: 'clip-abcdef' });
    await capture.clipboard.clear();
    await capture.attachment({ id });
    await capture.sendToCreator({ id, repoId: 'r1' });
    const called = vi.mocked(ipc.invoke).mock.calls.map((c) => c[0]);
    expect(called[0]).toBe(CHANNELS.captureStatus);
    expect([...new Set(called)].sort()).toEqual([...captureManifest.ipc].sort());
  });
});
