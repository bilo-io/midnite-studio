// @vitest-environment node
// vitest, not Playwright: mounting is logic over an injected ipcMain — no browser needed.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { creatorModuleMain } from '@midnite/studio-module-creator/main';
import { mediaModuleMain } from '@midnite/studio-module-media/main';
import { CHANNELS, MSTUDIO_FILE_SCHEME } from '@midnite/studio-shared';

import { installMediaHostFileProtocol, registerMediaHost } from './host';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'media-host-'));
  const handlers = new Map<string, number>();
  const on = new Map<string, number>();
  const registered = registerMediaHost({
    ipcMain: {
      handle: (c) => void handlers.set(c, (handlers.get(c) ?? 0) + 1),
      on: (c) => void on.set(c, (on.get(c) ?? 0) + 1),
    },
    trashItem: async () => undefined,
    send: () => undefined,
    dataDir: join(dir, 'media-library'),
    pickDirectory: async () => null,
    readKey: async () => null,
    interfaces: () => ({}),
    creator: {
      report: { sink: () => null, homeDir: () => dir, openExternal: async () => undefined, writeClipboard: () => undefined, revealPath: () => undefined },
      userData: dir,
      videoTemplateRoot: join(dir, 'templates'),
      openPath: async () => '',
      revealPath: () => undefined,
      pickSavePath: async () => null,
      pickImportFiles: async () => null,
      printToPdf: async () => Buffer.alloc(0),
      ffmpegStatus: async () => ({ found: false, reason: 'test' }),
      readKey: async () => null,
    },
  });
  return { dir, handlers, on, registered };
}

describe('registerMediaHost', () => {
  it('mounts Media and Creator: every module’s channels are registered, each exactly once', async () => {
    const { handlers, on, registered } = setup();
    const all = new Set([...handlers.keys(), ...on.keys()]);
    for (const module of [mediaModuleMain, creatorModuleMain]) {
      for (const channel of module.channels) expect(all, `${module.feature}: ${channel}`).toContain(channel);
    }
    expect(Math.max(...handlers.values())).toBe(1);
    expect([...on].filter(([, n]) => n > 1)).toEqual([]);
    expect(on.has(CHANNELS.reportError)).toBe(true);
    const declared = new Set([...mediaModuleMain.channels, ...creatorModuleMain.channels]);
    expect([...handlers.keys()].filter((channel) => !declared.has(channel))).toEqual([]);
    expect(registered.library).toBeDefined();
    registered.shutdown();
  });
});

describe('installMediaHostFileProtocol', () => {
  it('answers 404 for a URL neither the Library nor Creator serves, and asks the Library first', async () => {
    let handler: ((request: { url: string; headers: Headers }) => Promise<Response>) | null = null;
    const asked: string[] = [];
    installMediaHostFileProtocol(
      { handle: (_scheme, h) => void (handler = h), fetchFile: async (url) => new Response(url) },
      async (url) => {
        asked.push(url);
        return null;
      },
      '/tmp/nowhere',
    );
    const miss = await handler!({ url: `${MSTUDIO_FILE_SCHEME}://other/x`, headers: new Headers() });
    expect(miss.status).toBe(404);
    const hit = await handler!({ url: `${MSTUDIO_FILE_SCHEME}://library/root/a.mp4`, headers: new Headers() });
    // The Library's resolver was consulted for its own host, found nothing, and Creator does not serve that host.
    expect(asked).toContain(`${MSTUDIO_FILE_SCHEME}://library/root/a.mp4`);
    expect(hit.status).toBe(404);
  });
});
