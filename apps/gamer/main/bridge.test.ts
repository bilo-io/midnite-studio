// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { CHANNELS } from '@midnite/studio-shared';

import { createGamerBridge, type RendererIpc } from './bridge';

function fakeIpc(): RendererIpc {
  return {
    invoke: vi.fn(async () => ({ ok: true, value: [] })),
    send: vi.fn(),
    on: () => undefined,
    removeListener: () => undefined,
  };
}

describe('createGamerBridge', () => {
  it('exposes only games and media — no secrets, git, pty or browser', () => {
    const bridge = createGamerBridge(fakeIpc());
    expect(Object.keys(bridge).sort()).toEqual(['games', 'media', 'report']);
    expect(Object.keys(bridge.report).sort()).toEqual(['bundle', 'copy', 'error', 'ghStatus', 'logPath', 'onOpen', 'openUrl', 'reveal', 'submitIssue']);
    expect(Object.keys(bridge.media).sort()).toEqual(
      ['cancelExport', 'export', 'ffmpegStatus', 'file', 'map', 'model', 'onChanged', 'onExportProgress', 'project', 'reveal', 'sprite', 'terrain'].sort(),
    );
    expect(Object.keys(bridge.media.model).sort()).toEqual(
      ['cancel', 'export', 'generate', 'library', 'mesh', 'onChanged', 'onOpen', 'onProgress', 'providers', 'saveEdit', 'sf3d'].sort(),
    );
    expect(Object.keys(bridge.media.map).sort()).toEqual(['cache', 'capture', 'captureCancel', 'get', 'onCaptureProgress', 'onOpen', 'setView', 'sources']);
  });

  it('calls channels over invoke, and the bounds push over send', async () => {
    const ipc = fakeIpc();
    const { media, games } = createGamerBridge(ipc);
    await media.project.list({ repoId: 'gamer', tab: 'map' });
    await media.terrain.library({ op: 'list', repoId: 'gamer' } as never);
    await games.list();
    games.setBounds({ gameId: 'g', bounds: { x: 0, y: 0, width: 1, height: 1 } } as never);
    expect(vi.mocked(ipc.invoke).mock.calls.map((c) => c[0])).toEqual([CHANNELS.mediaProjectList, CHANNELS.mediaTerrainLibrary, CHANNELS.gamesList]);
    expect(vi.mocked(ipc.send).mock.calls.map((c) => c[0])).toEqual([CHANNELS.gamesSetBounds]);
  });
});
