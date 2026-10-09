import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAP_CAPTURE_BUSY, MapBuildingsFileSchema, MapCaptureFileSchema, MapRoadGraphFileSchema, map, type MapCaptureRequest } from '@midnite/studio-shared';

import { encodePngRgba8, decodePng } from '../png/png-codec';
import { createCaptureBroker, type CaptureBroker, type CaptureWorkerHandle } from './capture-broker';
import { createCaptureDispatcher } from './capture-dispatch';
import { createCaptureService, type CaptureServiceDeps } from './capture-service';
import type { CaptureWorkerIn, CaptureWorkerOut } from './capture-protocol';

/** A worker that runs the real dispatcher in-process, so the broker's real protocol is exercised. */
function inProcessWorker(): CaptureWorkerHandle {
  const listeners: { message: Array<(m: unknown) => void>; exit: Array<(c: number) => void> } = { message: [], exit: [] };
  const dispatch = createCaptureDispatcher((m: CaptureWorkerOut) => queueMicrotask(() => listeners.message.forEach((l) => l(m))));
  return {
    postMessage: (raw) => dispatch(raw as CaptureWorkerIn),
    on: ((event: 'message' | 'exit', listener: never) => {
      (listeners[event] as unknown[]).push(listener);
    }) as CaptureWorkerHandle['on'],
    kill: () => listeners.exit.forEach((l) => l(0)),
  };
}

/** A broker whose runs also drop extra files into the temp folder, standing in for Theme E's outputs. */
function wrapBroker(inner: CaptureBroker, extra: (dir: string) => Promise<void>): CaptureBroker {
  return {
    ...inner,
    begin: (input, onProgress) => {
      const handle = inner.begin(input, onProgress);
      return { ...handle, finish: async () => (await extra(input.outDir), handle.finish()) };
    },
  };
}

const R = 6378137;
const plane = (lon: number) => 1000 + 0.01 * ((lon - 18.4) * (Math.PI / 180) * R * Math.cos((-34 * Math.PI) / 180));

function pngTile(z: number, x: number, y: number): Uint8Array {
  return encodePngRgba8(map.syntheticTile(z, x, y, (lon) => plane(lon)), map.TILE, map.TILE);
}

const REQ: MapCaptureRequest = { repoId: 'r1', project: 'maps', center: [18.4, -34], sideM: 3000, size: 129, place: 'Test Place', satellite: false, roads: false, buildings: false };

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

  describe('satellite and roads (Phase 108 Theme E)', () => {
    const solid = (r: number, g: number, b: number) => {
      const px = new Uint8Array(map.TILE * map.TILE * 4);
      for (let i = 0; i < px.length; i += 4) px.set([r, g, b, 255], i);
      return encodePngRgba8(px, map.TILE, map.TILE);
    };
    const osm = (): map.OsmResponse => {
      const n = (id: number, x: number, z: number) => {
        const [lon, lat] = map.fromFrame(REQ.center, [x, z]);
        return { type: 'node' as const, id, lat, lon };
      };
      return { elements: [n(1, -1000, 0), n(2, 1000, 0), { type: 'way', id: 9, nodes: [1, 2], tags: { highway: 'primary', name: 'Main' } }] };
    };
    const tiles = (fetched: string[]): CaptureServiceDeps['fetcher'] => ({
      fetch: async (key) => {
        fetched.push(key);
        if (key.startsWith('eox')) return { ok: true, bytes: solid(200, 100, 50) };
        const [, z, x, y] = key.replace(/\.png$/, '').split('/').map(Number) as [number, number, number, number];
        return { ok: true, bytes: pngTile(z, x, y) };
      },
    });
    const both = { ...REQ, satellite: undefined, roads: undefined };
    const bldgOsm = (): map.OsmResponse => {
      const n = (id: number, x: number, z: number) => {
        const [lon, lat] = map.fromFrame(REQ.center, [x, z]);
        return { type: 'node' as const, id, lat, lon };
      };
      return { elements: [n(1, 0, 0), n(2, 20, 0), n(3, 20, 20), n(4, 0, 20), { type: 'way', id: 7, nodes: [1, 2, 3, 4, 1], tags: { building: 'yes', height: '12 m' } }] };
    };

    it('writes satellite.png at the texture size, the roads mask and graph, and records every source', async () => {
      const fetched: string[] = [];
      const query = vi.fn(async () => ({ ok: true as const, osm: osm() }));
      const { service, events } = make({ fetcher: tiles(fetched), overpass: { query } });
      const result = await service.capture(both);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const dir = join(root, 'maps', result.value.dir);
      expect((await readdir(dir)).sort()).toEqual(['ATTRIBUTION.txt', 'capture.json', 'heightmap.png', 'heightmap.r32', 'heightmap.tif', 'roads.graph.json', 'roads.png', 'satellite.png']);
      const sat = decodePng(await readFile(join(dir, 'satellite.png')));
      expect(sat.ok && [sat.image.width, sat.image.height]).toEqual([2048, 2048]);
      if (sat.ok) expect(Array.from((sat.image.data as Uint8Array).subarray(0, 4))).toEqual([200, 100, 50, 255]);
      const roads = decodePng(await readFile(join(dir, 'roads.png')));
      expect(roads.ok && roads.image.width).toBe(2048);
      expect(MapRoadGraphFileSchema.safeParse(JSON.parse(await readFile(join(dir, 'roads.graph.json'), 'utf8'))).success).toBe(true);
      const file = MapCaptureFileSchema.parse(JSON.parse(await readFile(join(dir, 'capture.json'), 'utf8')));
      expect(file.sources).toEqual({ dem: 'aws-terrarium', satellite: 'eox-s2cloudless-2016', roads: 'overpass' });
      expect(file.satelliteZoom).toBeGreaterThan(0);
      expect(file.missing).toEqual([]);
      expect(file.files).toEqual(expect.arrayContaining(['satellite.png', 'roads.png', 'roads.graph.json']));
      const attribution = await readFile(join(dir, 'ATTRIBUTION.txt'), 'utf8');
      expect(attribution).toMatch(/Mapzen/);
      expect(attribution).toMatch(/EOX/);
      expect(attribution).toMatch(/OpenStreetMap contributors/);
      expect(query).toHaveBeenCalledTimes(1);
      expect(events.some((e) => e.stage === 'satellite')).toBe(true);
      expect(events.some((e) => e.stage === 'roads')).toBe(true);
    });

    it('writes buildings.json with heights from a second Overpass query, and records the source', async () => {
      const query = vi.fn(async (_bbox: unknown, _signal: unknown, kind?: string) => ({ ok: true as const, osm: kind === 'buildings' ? bldgOsm() : osm() }));
      const { service, events } = make({ fetcher: tiles([]), overpass: { query } });
      const result = await service.capture({ ...both, satellite: false, buildings: undefined });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const dir = join(root, 'maps', result.value.dir);
      const file = MapBuildingsFileSchema.parse(JSON.parse(await readFile(join(dir, 'buildings.json'), 'utf8')));
      expect(file.buildings).toHaveLength(1);
      expect(file.buildings[0]).toMatchObject({ id: 7, heightM: 12 });
      expect(result.value.capture.sources.buildings).toBe('overpass');
      expect(result.value.capture.files).toContain('buildings.json');
      expect(result.value.capture.missing).toEqual([]);
      expect(query.mock.calls.map((c) => c[2])).toEqual([undefined, 'buildings']);
      expect(events.some((e) => e.stage === 'buildings')).toBe(true);
    });

    it('skips buildings above 10 km, when the area has none, or when Overpass fails, keeping the rest', async () => {
      const query = vi.fn(async () => ({ ok: true as const, osm: { elements: [] } }));
      const { service } = make({ fetcher: tiles([]), overpass: { query } });
      const big = await service.capture({ ...both, satellite: false, roads: false, buildings: undefined, sideM: 12_000, size: 129 });
      expect(big.ok && big.value.capture.missing).toEqual([{ slot: 'buildings', reason: 'Buildings are captured for frames up to 10 km a side.' }]);
      expect(query).not.toHaveBeenCalled();
      const again = make({ fetcher: tiles([]), overpass: { query }, now: () => new Date(Date.UTC(2026, 9, 7, 11, 0, 0)) });
      const empty = await again.service.capture({ ...both, satellite: false, roads: false, buildings: undefined });
      expect(empty.ok && empty.value.capture.missing).toEqual([{ slot: 'buildings', reason: 'No buildings in this area.' }]);
      const failing = make({
        fetcher: tiles([]),
        overpass: { query: async () => ({ ok: false as const, reason: 'busy' }) },
        now: () => new Date(Date.UTC(2026, 9, 7, 12, 0, 0)),
      });
      const failed = await failing.service.capture({ ...both, satellite: false, roads: false, buildings: undefined });
      expect(failed.ok && failed.value.capture.missing).toEqual([{ slot: 'buildings', reason: 'busy' }]);
      expect(failed.ok && failed.value.capture.files).toContain('heightmap.png');
    });

    it('a display-only satellite source makes no fetch and records the licence reason', async () => {
      const fetched: string[] = [];
      const { service } = make({ fetcher: tiles(fetched) });
      const result = await service.capture({ ...both, roads: false, satelliteSource: 'maptiler-streets' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(fetched.every((k) => k.startsWith('aws-terrarium'))).toBe(true);
      expect(result.value.capture.missing).toEqual([{ slot: 'satellite', reason: expect.stringMatching(/not a satellite source/) }]);
    });

    it('Overpass failing leaves the heightmap and lists roads as missing', async () => {
      const query = vi.fn(async () => ({ ok: false as const, reason: "OpenStreetMap's Overpass server is busy — try again in a minute." }));
      const { service } = make({ fetcher: tiles([]), overpass: { query } });
      const result = await service.capture({ ...both, satellite: false });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.capture.missing).toEqual([{ slot: 'roads', reason: expect.stringMatching(/busy/) }]);
      expect(result.value.capture.files).toContain('heightmap.png');
      expect(await readdir(join(root, 'maps', result.value.dir))).not.toContain('roads.png');
    });

    it('a satellite fetch failure keeps the heightmap', async () => {
      const base = tiles([]);
      const fetcher: CaptureServiceDeps['fetcher'] = {
        fetch: async (key, url, opts) => (key.startsWith('eox') ? { ok: false, status: 503, message: 'down' } : base.fetch(key, url, opts)),
      };
      const { service } = make({ fetcher });
      const result = await service.capture({ ...both, roads: false });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.capture.missing).toEqual([{ slot: 'satellite', reason: 'Satellite tiles could not be fetched (HTTP 503).' }]);
    });

    it('skips roads above 25 km and when the area has none, without calling Overpass', async () => {
      const query = vi.fn(async () => ({ ok: true as const, osm: { elements: [] } }));
      const { service } = make({ fetcher: tiles([]), overpass: { query } });
      const big = await service.capture({ ...both, satellite: false, sideM: 30_000, size: 129 });
      expect(big.ok && big.value.capture.missing).toEqual([{ slot: 'roads', reason: 'Roads are captured for frames up to 25 km a side.' }]);
      expect(query).not.toHaveBeenCalled();
      const again = make({ fetcher: tiles([]), overpass: { query }, now: () => new Date(Date.UTC(2026, 9, 7, 11, 0, 0)) });
      const empty = await again.service.capture({ ...both, satellite: false });
      expect(empty.ok && empty.value.capture.missing).toEqual([{ slot: 'roads', reason: 'No roads in this area.' }]);
    });

    it('cancelling during the Overpass request leaves no captures entry', async () => {
      let started!: () => void;
      const hasStarted = new Promise<void>((r) => (started = r));
      const query = (_bbox: unknown, signal: AbortSignal) =>
        new Promise<{ ok: false; reason: string; aborted: true }>((resolve) => {
          started();
          signal.addEventListener('abort', () => resolve({ ok: false, reason: 'Capture cancelled.', aborted: true }));
        });
      const { service } = make({ fetcher: tiles([]), overpass: { query } });
      const pending = service.capture({ ...both, satellite: false, captureId: 'cap-r' });
      await hasStarted;
      expect(service.cancel('cap-r')).toBe(true);
      expect(await pending).toMatchObject({ ok: false, message: 'Capture cancelled.' });
      expect(await readdir(join(root, 'maps', 'captures'))).toEqual([]);
    });
  });

  describe('hand-off to Terrain (Phase 108 Theme F)', () => {
    function fakeTerrain(overrides: Record<string, unknown> = {}) {
      const calls: string[] = [];
      const args: Record<string, unknown> = {};
      const rec =
        (name: string, value: unknown) =>
        async (...a: unknown[]) => {
          calls.push(name);
          args[name] = a;
          return value;
        };
      const terrain = {
        library: rec('library', { ok: true, value: { project: 'terrains', terrain: 'test-place-1' } }),
        setInput: rec('setInput', { ok: true, value: { warnings: [] } }),
        setRoadsGraph: rec('setRoadsGraph', { ok: true, value: { edges: 1 } }),
        setBuildingsFootprints: rec('setBuildingsFootprints', { ok: true, value: { count: 1 } }),
        setSpec: rec('setSpec', { ok: true, value: { spec: {} } }),
        build: rec('build', { ok: true, value: {} }),
        ...overrides,
      } as unknown as NonNullable<CaptureServiceDeps['terrain']>;
      return { terrain, calls, args };
    }

    it('creates the terrain, attaches the heightmap, sets the spec and opens it — in that order', async () => {
      const { terrain, calls, args } = fakeTerrain();
      const emitOpen = vi.fn();
      const { service } = make({ terrain, emitOpen });
      const result = await service.capture({ ...REQ, handoff: true });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Heightmap only today: satellite/roads/graph activate when Theme E writes them.
      expect(calls).toEqual(['library', 'setInput', 'setSpec']);
      expect(args.library).toEqual([{ op: 'create', repoId: 'r1', name: 'Test Place' }]);
      const input = (args.setInput as Array<{ slot: string; bytes: Uint8Array; name: string }>)[0]!;
      expect(input).toMatchObject({ repoId: 'r1', project: 'terrains', terrain: 'test-place-1', slot: 'heightmap', name: 'heightmap.png' });
      expect(input.bytes.length).toBeGreaterThan(0);
      const spec = (args.setSpec as Array<{ patch: Record<string, unknown> }>)[0]!.patch;
      expect(spec).toMatchObject({ worldSize: 3000, resolution: 129, textureSize: 2048, preSmooth: 0, name: 'Test Place' });
      expect(spec.seaLevel).toBeUndefined();
      expect(emitOpen).toHaveBeenCalledTimes(1);
      expect(emitOpen).toHaveBeenCalledWith({ repoId: 'r1', project: 'terrains', terrain: 'test-place-1' });
      expect(result.value.terrain).toEqual({ project: 'terrains', terrain: 'test-place-1' });
    });

    it('names an unnamed capture after its coordinates and builds only when asked', async () => {
      const { terrain, calls, args } = fakeTerrain();
      const { service } = make({ terrain, emitOpen: vi.fn() });
      const { place: _place, ...noPlace } = REQ;
      const result = await service.capture({ ...noPlace, handoff: true, build: true });
      expect(result.ok).toBe(true);
      expect(calls).toEqual(['library', 'setInput', 'setSpec', 'build']);
      expect(args.library).toEqual([{ op: 'create', repoId: 'r1', name: '-34.000, 18.400' }]);
    });

    it('hands over the satellite, roads mask and captured graph when the capture carries them', async () => {
      const { terrain, calls, args } = fakeTerrain();
      const withExtras: Partial<CaptureServiceDeps> = {
        terrain,
        emitOpen: vi.fn(),
        broker: wrapBroker(createCaptureBroker({ spawn: inProcessWorker }), async (dir) => {
          await writeFile(join(dir, 'satellite.png'), new Uint8Array([1]));
          await writeFile(join(dir, 'roads.png'), new Uint8Array([2]));
          await writeFile(join(dir, 'roads.graph.json'), '{}');
        }),
      };
      const { service } = make(withExtras);
      const result = await service.capture({ ...REQ, handoff: true });
      expect(result.ok).toBe(true);
      expect(calls).toEqual(['library', 'setInput', 'setInput', 'setInput', 'setRoadsGraph', 'setSpec']);
      expect((args.setRoadsGraph as unknown[])[1]).toBeInstanceOf(Uint8Array);
    });

    it('hands the captured building footprints to Terrain before the spec', async () => {
      const { terrain, calls, args } = fakeTerrain();
      const { service } = make({
        terrain,
        emitOpen: vi.fn(),
        broker: wrapBroker(createCaptureBroker({ spawn: inProcessWorker }), async (dir) => writeFile(join(dir, 'buildings.json'), '{}')),
      });
      expect((await service.capture({ ...REQ, handoff: true })).ok).toBe(true);
      expect(calls).toEqual(['library', 'setInput', 'setBuildingsFootprints', 'setSpec']);
      expect((args.setBuildingsFootprints as unknown[])[1]).toBeInstanceOf(Uint8Array);
    });

    it('a failing setSpec names the terrain settings, keeps the capture and leaves the terrain', async () => {
      const { terrain } = fakeTerrain({ setSpec: async () => ({ ok: false, kind: 'error', message: 'heightRange must rise' }) });
      const { service } = make({ terrain, emitOpen: vi.fn() });
      const result = await service.capture({ ...REQ, handoff: true });
      expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/terrain settings/) });
      expect(await readdir(join(root, 'maps', 'captures'))).toHaveLength(1);
    });

    it('does not touch Terrain without a hand-off request', async () => {
      const { terrain, calls } = fakeTerrain();
      const { service } = make({ terrain });
      expect((await service.capture(REQ)).ok).toBe(true);
      expect(calls).toEqual([]);
    });
  });
});
