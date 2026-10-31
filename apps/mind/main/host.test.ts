// @vitest-environment node
// vitest, not Playwright: mounting is logic over an injected ipcMain — no browser needed.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { CaptureElectron, CaptureImage } from '@midnite/studio-feature-capture/main';
import { captureModuleMain } from '@midnite/studio-module-capture/main';
import { mindModuleMain } from '@midnite/studio-module-mind/main';
import { CHANNELS } from '@midnite/studio-shared';

import { registerMindHost } from './host';

const emptyImage: CaptureImage = {
  isEmpty: () => true,
  getSize: () => ({ width: 0, height: 0 }),
  toPNG: () => new Uint8Array(),
  toJPEG: () => new Uint8Array(),
  toDataURL: () => 'data:,',
  crop: () => emptyImage,
  resize: () => emptyImage,
};

const electron: CaptureElectron = {
  platform: 'darwin',
  getSources: async () => [],
  screenAccessStatus: () => 'not-determined',
  openScreenRecordingSettings: async () => undefined,
  displays: () => [{ id: 1, size: { width: 1440, height: 900 }, scaleFactor: 2 }],
  displayUnderPointer: () => ({ id: 1, size: { width: 1440, height: 900 }, scaleFactor: 2 }),
  globalShortcut: { register: () => true, unregister: () => undefined },
  clipboard: {
    availableFormats: async () => [],
    has: async () => false,
    readText: async () => '',
    readImage: async () => emptyImage,
    writeText: async () => undefined,
    writeImage: async () => undefined,
  },
  imageFromPng: () => emptyImage,
  showItemInFolder: () => undefined,
};

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'mind-host-'));
  const handlers = new Map<string, number>();
  const on = new Set<string>();
  const registered = registerMindHost({
    ipcMain: {
      handle: (c) => void handlers.set(c, (handlers.get(c) ?? 0) + 1),
      on: (c) => void on.add(c),
    },
    trashItem: async () => undefined,
    send: () => undefined,
    notesDirectory: dir,
    knowledgeCacheDirectory: join(dir, 'knowledge-cache'),
    capture: { dataDir: join(dir, 'capture'), electron, gate: null, background: false },
  });
  return { handlers, on, registered };
}

describe('registerMindHost', () => {
  it('mounts Mind and Capture: every module channel is registered, each exactly once', async () => {
    const { handlers, on, registered } = setup();
    const all = new Set([...handlers.keys(), ...on]);
    for (const module of [mindModuleMain, captureModuleMain]) {
      for (const channel of module.channels) expect(all, `${module.feature}: ${channel}`).toContain(channel);
    }
    expect(Math.max(...handlers.values())).toBe(1);
    await registered.shutdown();
  });

  it('takes no default chord, and leaves Report an Issue to Mind', async () => {
    const { handlers, registered } = setup();
    await registered.capture.start();
    const status = await registered.capture.status();
    expect(status.shortcut.accelerator).toBeNull();
    expect(handlers.has(CHANNELS.reportGhStatus)).toBe(false);
    await registered.shutdown();
  });
});
