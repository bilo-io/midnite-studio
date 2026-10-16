// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { CHANNELS } from '@midnite/studio-shared';

import { createCreatorBridge, type RendererIpc } from './bridge';

function fakeIpc(): RendererIpc {
  return {
    invoke: vi.fn(async () => ({ ok: true, value: [] })),
    send: vi.fn(),
    on: () => undefined,
    removeListener: () => undefined,
  };
}

describe('createCreatorBridge', () => {
  it('exposes only media — no secrets, git, pty or browser', () => {
    const bridge = createCreatorBridge(fakeIpc());
    expect(Object.keys(bridge).sort()).toEqual(['media', 'video']);
    expect(Object.keys(bridge.media).sort()).toEqual(
      ['audio', 'cancelExport', 'doc', 'export', 'ffmpegStatus', 'file', 'image', 'onChanged', 'onExportProgress', 'project', 'reveal'].sort(),
    );
    expect(Object.keys(bridge.media.image).sort()).toEqual(['cancel', 'generate', 'onProgress', 'providers']);
    expect(Object.keys(bridge.media.doc)).toEqual(['export']);
    expect(Object.keys(bridge.video).sort()).toEqual(
      ['engine', 'files', 'onRenderProgress', 'onStudioChanged', 'openFile', 'project', 'readFile', 'render', 'revealFile', 'root', 'setup', 'studio', 'toolchain'].sort(),
    );
    // No `gm` (the music editor's instrument library): Audio's generator and import only.
    expect(Object.keys(bridge.media.audio).sort()).toEqual(
      ['cancel', 'engine', 'expand', 'generate', 'import', 'installEngine', 'onEngineProgress', 'onProgress', 'providers'].sort(),
    );
  });

  it('calls the media channels over invoke', async () => {
    const ipc = fakeIpc();
    const { media } = createCreatorBridge(ipc);
    await media.project.list({ repoId: 'creator', tab: 'doc' });
    await media.image.providers();
    await createCreatorBridge(ipc).video.project.list();
    expect(vi.mocked(ipc.invoke).mock.calls.map((c) => c[0])).toEqual([CHANNELS.mediaProjectList, CHANNELS.mediaImageProviders, CHANNELS.videoProjectList]);
  });
});
