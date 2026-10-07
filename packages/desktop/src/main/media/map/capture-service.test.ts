import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAP_CAPTURE_BUSY, MapCaptureFileSchema, map, type MapCaptureRequest } from '@midnite/studio-shared';

import { encodePngRgba8, decodePng } from '../png/png-codec';
import { createCaptureBroker, type CaptureWorkerHandle } from './capture-broker';
import { createCaptureRun } from './capture-run';
import { createCaptureService, type CaptureServiceDeps } from './capture-service';
import type { CaptureWorkerIn, CaptureWorkerOut } from './capture-protocol';

/** A worker that runs `createCaptureRun` in-process, so the broker's real protocol is exercised. */
function inProcessWorker(): CaptureWorkerHandle {
  const listeners: { message: Array<(m: unknown) => void>; exit: Array<(c: number) => void> } = { message: [], exit: [] };
  let run: ReturnType<typeof createCaptureRun> | null = null;
  const reply = (m: CaptureWorkerOut) => queueMicrotask(() => listeners.message.forEach((l) => l(m)));
  return {
    postMessage: (raw) => {
      const m = raw as CaptureWorkerIn;
      if (m.type === 'begin') run = createCaptureRun(m);
      else if (m.type === 'tile') run?.addTile(m.x, m.y, m.rgba, m.width, m.height);
      else
        void run?.finish((f) => reply({ type: 'progress', id: m.id, fraction: f })).then((r) =>
          reply(r.ok ? { type: 'reply', id: m.id, ok: true, stats: r.stats } : { type: 'reply', id: m.id, ok: false, message: r.message }),
        );
    },
    on: ((event: 'message' | 'exit', listener: never) => {
      (listeners[event] as unknown[]).push(listener);
    }) as CaptureWorkerHandle['on'],
    kill: () => listeners.exit.forEach((l) => l(0)),
  };
}

const R = 6378137;
const plane = (lon: number) => 1000 + 0.01 * ((lon - 18.4) * (Math.PI / 180) * R * Math.cos((-34 * Math.PI) / 180));

function pngTile(z: number, x: number, y: number): Uint8Array {
  return encodePngRgba8(map.syntheticTile(z, x, y, (lon) => plane(lon)), map.TILE, map.TILE);
}

const REQ: MapCaptureRequest = { repoId: 'r1', project: 'maps', center: [18.4, -34], sideM: 3000, size: 129, place: 'Test Place' };

describe('capture service', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'map-capture-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function make(overrides: Partial<CaptureServiceDeps> = {}) {
    const fetched: string[] = [];
    const events: Array<{ stage: string; fraction: number }> = [];
    const onChanged = vi.fn();
    const deps: CaptureServiceDeps = {
      rootFor: async () => root,
      fetcher: {
        fetch: async (key) => {
          fetched.push(key);
          const [, z, x, y] = key.replace(/\.png$/, '').split('/').map(Number) as [number, number, number, number];
          return { ok: true, bytes: pngTile(z, x, y) };
        },
      },
      readKey: async () => null,
      nativeDecode: async () => null,
      broker: createCaptureBroker({ spawn: inProcessWorker }),
      onChanged,
      emitProgress: (e) => events.push(e),
      now: () => new Date(Date.UTC(2026, 9, 7, 10, 0, 0)),
      newId: () => 'cap1',
      ...overrides,
    };
    return { service: createCaptureService(deps), fetched, events, onChanged };
  }

  it('writes the heightmap files and a valid capture.json, atomically', async () => {
    const { service, fetched, events, onChanged } = make();
    const result = await service.capture(REQ);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const dir = join(root, 'maps', result.value.dir);
    expect((await readdir(dir)).sort()).toEqual(['ATTRIBUTION.txt', 'capture.json', 'heightmap.png', 'heightmap.r32', 'heightmap.tif']);
    expect(await readdir(join(root, 'maps', 'captures'))).toEqual([result.value.name]);
    const file = MapCaptureFileSchema.parse(JSON.parse(await readFile(join(dir, 'capture.json'), 'utf8')));
    expect(file).toMatchObject({ size: 129, demZoom: 13, sources: { dem: 'aws-terrarium' } });
    expect(result.value.name).toBe('test-place-20261007-100000');
    expect(fetched.length).toBeGreaterThan(0);
    expect(onChanged).toHaveBeenCalledWith('r1');
    expect(events.some((e) => e.stage === 'dem')).toBe(true);

    // The 16-bit PNG spans min→0 .. max→65535, and the r32 is 129² float32.
    const png = decodePng(await readFile(join(dir, 'heightmap.png')));
    expect(png.ok && png.image.bitDepth).toBe(16);
    if (png.ok) {
      const d = png.image.data as Uint16Array;
      expect(Math.min(...d)).toBe(0);
      expect(Math.max(...d)).toBe(65535);
    }
    expect((await readFile(join(dir, 'heightmap.r32'))).length).toBe(129 * 129 * 4);
    // 3 km east-west at 0.01 m/m is 30 m.
    expect(file.heightMaxM - file.heightMinM).toBeGreaterThan(29);
    expect(file.heightMaxM - file.heightMinM).toBeLessThan(31);
  });

  it('refuses a second capture while one runs', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { service } = make({
      fetcher: { fetch: async () => (await gate, { ok: false as const, status: 404, message: 'x' }) },
    });
    const first = service.capture(REQ);
    await Promise.resolve();
    const second = await service.capture(REQ);
    expect(second).toMatchObject({ ok: false, message: MAP_CAPTURE_BUSY });
    release();
    await first;
  });

  it('cancel during dem resolves cancelled and leaves no captures entry', async () => {
    let signal: AbortSignal | undefined;
    let started!: () => void;
    const hasStarted = new Promise<void>((r) => (started = r));
    const { service } = make({
      fetcher: {
        fetch: (_key, _url, opts) =>
          new Promise((resolve) => {
            signal = opts?.signal;
            started();
            signal?.addEventListener('abort', () => resolve({ ok: false, status: 'aborted', message: 'aborted' }));
          }),
      },
    });
    const pending = service.capture({ ...REQ, captureId: 'cap-x' });
    await hasStarted;
    expect(service.cancel('nope')).toBe(false);
    expect(service.cancel('cap-x')).toBe(true);
    const result = await pending;
    expect(result).toMatchObject({ ok: false, message: 'Capture cancelled.' });
    expect(await readdir(join(root, 'maps', 'captures'))).toEqual([]);
  });

  it('refuses a display-only source and an unavailable key without fetching', async () => {
    const { service, fetched } = make();
    expect(await service.capture({ ...REQ, demSource: 'openfreemap' })).toMatchObject({ ok: false });
    expect(await service.capture({ ...REQ, demSource: 'maptiler-terrain-rgb' })).toMatchObject({ ok: false, message: expect.stringContaining('MapTiler key') });
    expect(fetched).toEqual([]);
  });

  it('fails clearly on an upstream error and cleans up', async () => {
    const { service } = make({ fetcher: { fetch: async () => ({ ok: false as const, status: 503, message: 'down' }) } });
    const result = await service.capture(REQ);
    expect(result).toMatchObject({ ok: false, message: 'Elevation tiles could not be fetched (HTTP 503).' });
    expect(await readdir(join(root, 'maps', 'captures'))).toEqual([]);
  });

  it('all-404 means no data for the area', async () => {
    const { service } = make({ fetcher: { fetch: async () => ({ ok: false as const, status: 404, message: 'none' }) } });
    expect(await service.capture(REQ)).toMatchObject({ ok: false, message: 'The elevation source has no data for most of this area.' });
  });

  it('no repo root is a readable failure', async () => {
    const { service } = make({ rootFor: async () => null });
    expect(await service.capture(REQ)).toMatchObject({ ok: false, message: 'Open a repository to capture into.' });
  });
});
