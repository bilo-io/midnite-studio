// @vitest-environment node
// vitest, not Playwright: mounting is logic over an injected ipcMain — no browser needed.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { creatorModuleMain } from '@midnite/studio-module-creator/main';
import { gamerModuleMain } from '@midnite/studio-module-gamer/main';
import { CHANNELS, MSTUDIO_FILE_SCHEME } from '@midnite/studio-shared';

import { installGamerHostFileProtocol, registerGamerHost } from './host';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'gamer-host-'));
  const handlers = new Map<string, number>();
  const on = new Map<string, number>();
  const never = (): never => {
    throw new Error('not used at registration');
  };
  const registered = registerGamerHost({
    ipcMain: {
      handle: (c) => void handlers.set(c, (handlers.get(c) ?? 0) + 1),
      on: (c) => void on.set(c, (on.get(c) ?? 0) + 1),
    },
    trashItem: async () => undefined,
    send: () => undefined,
    mediaRoot: join(dir, 'media'),
    userData: dir,
    revealPath: () => undefined,
    pickSavePath: async () => null,
    pickTiledMap: async () => null,
    vaultDirectory: join(dir, 'runtime'),
    pairing: () => null,
    hasWindow: () => false,
    ffmpegStatus: async () => ({ found: false, reason: 'test' }),
    fetch: async () => never(),
    userAgent: 'test',
    nativeDecode: async () => null,
    toPng: async () => null,
    spawnCaptureWorker: never,
    spawnTerrainWorker: never,
    game: {
      electron: {} as never,
      contents: () => null,
      getWindow: () => null,
      templateDir: join(dir, 'template'),
      enginesDir: join(dir, 'engines'),
    },
    log: () => undefined,
    creator: {
      report: { sink: () => null, homeDir: () => dir, openExternal: async () => undefined, writeClipboard: () => undefined, revealPath: () => undefined },
      videoTemplateRoot: join(dir, 'templates'),
      openPath: async () => '',
      pickImportFiles: async () => null,
      printToPdf: async () => Buffer.alloc(0),
    },
  });
  return { dir, handlers, on, registered };
}

describe('registerGamerHost', () => {
  it('mounts Gamer and Creator: every module’s channels are registered, each exactly once', () => {
    const { handlers, on, registered } = setup();
    const all = new Set([...handlers.keys(), ...on.keys()]);
    for (const module of [gamerModuleMain, creatorModuleMain]) {
      for (const channel of module.channels) expect(all, `${module.feature}: ${channel}`).toContain(channel);
    }
    // media-core is both modules' (one store, one watcher): registered once, by Gamer's mount.
    expect(Math.max(...handlers.values())).toBe(1);
    expect([...on].filter(([, n]) => n > 1)).toEqual([]);
    expect(on.has(CHANNELS.reportError)).toBe(true);
    const declared = new Set([...gamerModuleMain.channels, ...creatorModuleMain.channels]);
    expect([...handlers.keys()].filter((channel) => !declared.has(channel))).toEqual([]);
    registered.shutdown();
    registered.close();
  });
});

describe('installGamerHostFileProtocol', () => {
  it('serves nothing outside the media root and answers 404 for another host', async () => {
    let handler: ((request: { url: string }) => Promise<Response>) | null = null;
    installGamerHostFileProtocol({ handle: (_scheme, h) => void (handler = h), fetchFile: async (url) => new Response(url) }, '/tmp/nowhere');
    expect((await handler!({ url: `${MSTUDIO_FILE_SCHEME}://other/x` })).status).toBe(404);
    expect((await handler!({ url: `${MSTUDIO_FILE_SCHEME}://repo/not-a-repo/x.png` })).status).toBe(404);
  });
});
