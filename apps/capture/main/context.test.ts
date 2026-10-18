// @vitest-environment node
// vitest, not Playwright: registration, the smoke posture and the file handler are logic over injected
// electron pieces. Nothing here captures a screen, asks for a permission, takes a real chord or reads
// the real clipboard — every one of those is a fake below.
import { mkdtemp, realpath, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  captureManifest,
  createDisplayMediaGate,
  type CaptureElectron,
  type CaptureImage,
  type Timers,
} from '@midnite/studio-feature-capture/main';
import {
  CHANNELS,
  captureFileUrl,
  type CaptureStatus,
  type GitOpResult,
} from '@midnite/studio-shared';

import { captureDataDir, registerCaptureAppHandlers } from './context';
import { installCaptureFileProtocol, resolveCaptureAppFileUrl } from './file-protocol';
import { CAPTURE_APP_SHORTCUT } from './identity';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const emptyImage: CaptureImage = {
  isEmpty: () => true,
  getSize: () => ({ width: 0, height: 0 }),
  toPNG: () => new Uint8Array(),
  toJPEG: () => new Uint8Array(),
  toDataURL: () => 'data:,',
  crop: () => emptyImage,
  resize: () => emptyImage,
};

function fakes() {
  const registered = new Map<string, () => void>();
  const clipboardReads = vi.fn(() => [] as string[]);
  const getSources = vi.fn(async () => []);
  const electron: CaptureElectron = {
    platform: 'darwin',
    getSources,
    screenAccessStatus: () => 'not-determined',
    openScreenRecordingSettings: async () => undefined,
    displays: () => [{ id: 1, size: { width: 1440, height: 900 }, scaleFactor: 2 }],
    displayUnderPointer: () => ({ id: 1, size: { width: 1440, height: 900 }, scaleFactor: 2 }),
    globalShortcut: {
      register: vi.fn((accelerator: string, callback: () => void) => {
        registered.set(accelerator, callback);
        return true;
      }),
      unregister: vi.fn((accelerator: string) => void registered.delete(accelerator)),
    },
    clipboard: {
      availableFormats: clipboardReads,
      has: () => false,
      readText: vi.fn(() => ''),
      readImage: vi.fn(() => emptyImage),
      writeText: vi.fn(),
      writeImage: vi.fn(),
    },
    imageFromPng: () => emptyImage,
    showItemInFolder: vi.fn(),
  };
  const ticks: Array<() => void> = [];
  const timers: Timers = {
    setInterval: ((fn: () => void) => {
      ticks.push(fn);
      return ticks.length;
    }) as unknown as Timers['setInterval'],
    clearInterval: (() => undefined) as Timers['clearInterval'],
  };
  return {
    electron,
    registered,
    clipboardReads,
    getSources,
    timers,
    tick: () => ticks.forEach((t) => t()),
  };
}

async function setup(background: boolean) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'capture-app-')));
  dirs.push(base);
  const f = fakes();
  const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const sent: string[] = [];
  const capture = registerCaptureAppHandlers({
    ipcMain: { handle: (c, l) => void handlers.set(c, l), on: () => undefined },
    trashItem: async () => undefined,
    send: (channel) => void sent.push(channel),
    dataDir: captureDataDir(join(base, 'userData')),
    electron: f.electron,
    gate: createDisplayMediaGate({ isAppOrigin: (o) => o === 'file://' }),
    background,
    timers: f.timers,
  });
  const invoke = (channel: string, payload?: unknown) => handlers.get(channel)!({}, payload);
  return { base, capture, handlers, invoke, sent, ...f };
}

describe('registerCaptureAppHandlers', () => {
  it('registers exactly the capture channels', async () => {
    const { handlers } = await setup(true);
    expect([...handlers.keys()].sort()).toEqual([...captureManifest.ipc].sort());
  });

  it('takes its default chord only once started, and releases it on dispose', async () => {
    const { capture, registered, invoke } = await setup(true);
    expect(registered.size).toBe(0);
    await capture.start();
    expect([...registered.keys()]).toEqual([CAPTURE_APP_SHORTCUT]);
    const status = (await invoke(CHANNELS.captureStatus)) as CaptureStatus;
    expect(status.shortcut.state).toBe('registered');
    await capture.dispose();
    expect(registered.size).toBe(0);
  });

  it('reaches no other feature: no Send to… destination, Creator refused', async () => {
    const { invoke } = await setup(true);
    const status = (await invoke(CHANNELS.captureStatus)) as CaptureStatus;
    expect(status.destinations).toEqual([]);
    expect(status.settings.clipboardHistory).toBe(false);
    const sent = (await invoke(CHANNELS.captureSendToCreator, {
      id: 'cap-20261018-093000-abcdef12',
      repoId: 'r1',
    })) as GitOpResult;
    expect(sent.ok).toBe(false);
  });

  it('asks macOS for nothing until the user asks', async () => {
    const { capture, getSources, invoke } = await setup(true);
    await capture.start();
    await invoke(CHANNELS.captureStatus);
    await invoke(CHANNELS.captureList);
    expect(getSources).not.toHaveBeenCalled();
  });

  it('in a smoke run takes no chord and never reads the clipboard, even with history switched on', async () => {
    const { capture, registered, clipboardReads, invoke, tick } = await setup(false);
    await capture.start();
    expect(registered.size).toBe(0);
    const status = (await invoke(CHANNELS.captureStatus)) as CaptureStatus;
    expect(status.shortcut.state).toBe('disabled');
    await invoke(CHANNELS.captureSettingsSet, { clipboardHistory: true });
    tick();
    tick();
    expect(clipboardReads).not.toHaveBeenCalled();
    await capture.dispose();
  });
});

describe('the capture file handler', () => {
  it('serves only the capture host, and only a name Capture generated', async () => {
    const { base, capture } = await setup(true);
    const dir = join(base, 'userData', 'capture', 'captures');
    await mkdir(dir, { recursive: true });
    const name = 'cap-20261018-093000-abcdef12.png';
    await writeFile(join(dir, name), 'png');
    expect(await resolveCaptureAppFileUrl(captureFileUrl(name), capture.fileResolver)).toBe(
      join(dir, name),
    );
    expect(
      await resolveCaptureAppFileUrl('mstudio-file://library/r/x.png', capture.fileResolver),
    ).toBeNull();
    expect(
      await resolveCaptureAppFileUrl(
        'mstudio-file://capture/captures/..%2F..%2Fsettings.json',
        capture.fileResolver,
      ),
    ).toBeNull();
    expect(
      await resolveCaptureAppFileUrl('https://example.com/x.png', capture.fileResolver),
    ).toBeNull();
  });

  it('answers 404 for anything the resolver refuses, and never fetches it', async () => {
    let handler: ((request: { url: string; headers: Headers }) => Promise<Response>) | null = null;
    const fetchFile = vi.fn(async () => new Response('ok'));
    installCaptureFileProtocol(
      { handle: (_s, h) => void (handler = h), fetchFile },
      async () => null,
    );
    const response = await handler!({
      url: 'mstudio-file://capture/captures/x.png',
      headers: new Headers(),
    });
    expect(response.status).toBe(404);
    expect(fetchFile).not.toHaveBeenCalled();
  });
});
