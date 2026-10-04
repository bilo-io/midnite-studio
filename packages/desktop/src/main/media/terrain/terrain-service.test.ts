import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { TERRAIN_BUILD_CANCELLED, TERRAIN_NOT_AVAILABLE, type TerrainStats } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { encodePngGrey16, encodePngRgba8 } from '../png/png-codec';
import { createTerrainService, NOT_AN_IMAGE, notAvailableYet, type TerrainServiceDeps } from './terrain-service';
import type { TerrainBroker, TerrainRunResult } from './terrain-broker';

const stats: TerrainStats = {
  resolution: 129,
  worldSize: 1024,
  vertexCount: 16641,
  triangleCount: 32768,
  chunkCount: 4,
  lodCount: 4,
  buildMs: 7,
  minHeight: 0,
  maxHeight: 200,
  histogram: new Array<number>(16).fill(1),
  warnings: [],
};

let repo: string;
let root: string;

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'terrain-service-'));
  root = join(repo, '.midnite', 'media', 'terrain');
  await mkdir(root, { recursive: true });
});
afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

type FakeBroker = TerrainBroker & { build: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> };

/** A broker whose build writes `heights.f32` into the out dir (as the real worker would) and resolves `result`. */
function fakeBroker(result: () => TerrainRunResult | Promise<TerrainRunResult>): FakeBroker {
  const build = vi.fn((request: { dir: string; outDir: string }, onProgress?: (stage: string, fraction: number) => void) => {
    const done = (async () => {
      const outcome = await result();
      if (outcome.ok) {
        await mkdir(join(request.dir, request.outDir), { recursive: true });
        await writeFile(join(request.dir, request.outDir, 'heights.f32'), Buffer.alloc(4));
        onProgress?.('write', 1);
      }
      return outcome;
    })();
    return { buildId: 'b1', done, cancel: () => undefined };
  });
  return { build, cancel: vi.fn(() => true), dispose: vi.fn() } as unknown as FakeBroker;
}

function makeService(broker: FakeBroker, extra: Partial<TerrainServiceDeps> = {}) {
  const events: string[] = [];
  const deps: TerrainServiceDeps = {
    rootFor: async () => root,
    writeBytes: async ({ project, path, data }) => {
      const abs = join(root, project, path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, data);
      return { ok: true };
    },
    trash: async (abs) => {
      await rm(abs, { recursive: true, force: true });
    },
    toPng: async () => null,
    broker,
    onChanged: () => events.push('changed'),
    emitProgress: (e) => events.push(`progress:${e.stage}`),
    emitChanged: (e) => events.push(`event:${e.terrain}`),
    log: (line) => events.push(`log:${line}`),
    ...extra,
  };
  return { service: createTerrainService(deps), events };
}

async function createTerrain(service: ReturnType<typeof createTerrainService>, name = 'Dunes') {
  const created = await service.library({ op: 'create', repoId: 'r', name });
  if (!created.ok || !created.value.terrain) throw new Error('create failed');
  return { repoId: 'r', project: created.value.project!, terrain: created.value.terrain };
}

const heightmap16 = () => encodePngGrey16(new Uint16Array([0, 65535, 32768, 100]), 2, 2);
const attach = (target: { repoId: string; project: string; terrain: string }, bytes: Uint8Array, slot: 'heightmap' | 'satellite' | 'roads' = 'heightmap') => ({
  ...target,
  slot,
  bytes,
  name: 'h.png',
});

describe('library', () => {
  it('creates, renames, duplicates and deletes a terrain folder', async () => {
    const { service } = makeService(fakeBroker(() => ({ ok: true, stats })));
    const target = await createTerrain(service);
    expect(target.project).toBe('terrains');
    expect(target.terrain).toMatch(/^dunes-\d{8}-\d{6}$/);
    const got = await service.get(target);
    expect(got.ok && got.value).toMatchObject({ built: false, spec: { name: 'Dunes', version: 1 } });

    const renamed = await service.library({ op: 'rename', ...target, to: 'Badlands' });
    expect(renamed.ok && renamed.value.terrain).toMatch(/^badlands-/);
    const next = { ...target, terrain: renamed.ok ? renamed.value.terrain! : '' };
    expect((await service.get(next)).ok).toBe(true);
    expect((await service.get(target)).ok).toBe(false);

    const copy = await service.library({ op: 'duplicate', ...next });
    expect(copy.ok && copy.value.terrain).toMatch(/^badlands-copy-/);

    expect((await service.library({ op: 'delete', ...next })).ok).toBe(true);
    expect((await service.get(next)).ok).toBe(false);
    expect(await readdir(join(root, 'terrains'))).toHaveLength(1);
  });

  it('answers a failure, never a throw, for a missing terrain', async () => {
    const { service } = makeService(fakeBroker(() => ({ ok: true, stats })));
    const result = await service.get({ repoId: 'r', project: 'terrains', terrain: 'nope' });
    expect(result).toMatchObject({ ok: false, kind: 'error', message: 'Terrain not found.' });
  });
});

describe('setSpec', () => {
  it('merges a patch, validates it and refuses to touch owned keys', async () => {
    const { service } = makeService(fakeBroker(() => ({ ok: true, stats })));
    const target = await createTerrain(service);
    const set = await service.setSpec({ ...target, patch: { resolution: 1025, worldSize: 2048, inputs: { heightmap: 'evil' }, lastBuild: 1 } });
    expect(set.ok && set.value.spec).toMatchObject({ resolution: 1025, worldSize: 2048, inputs: {} });
    expect(set.ok && set.value.spec.lastBuild).toBeUndefined();
    const bad = await service.setSpec({ ...target, patch: { resolution: 500 } });
    expect(bad.ok).toBe(false);
    const after = await service.get(target);
    expect(after.ok && after.value.spec.resolution).toBe(1025); // the refused patch changed nothing
  });
});

describe('setInput', () => {
  it('stores a 16-bit PNG as-is and records its size and depth', async () => {
    const { service } = makeService(fakeBroker(() => ({ ok: true, stats })));
    const target = await createTerrain(service);
    const bytes = heightmap16();
    const result = await service.setInput(attach(target, bytes));
    expect(result.ok && result.value.input).toEqual({ file: 'inputs/heightmap.png', sourceName: 'h.png', width: 2, height: 2, bitDepth: 16 });
    expect(result.ok && result.value.warnings).toEqual([]);
    const stored = await readFile(join(root, target.project, target.terrain, 'inputs', 'heightmap.png'));
    expect(Buffer.compare(stored, bytes)).toBe(0);
    const spec = await service.get(target);
    expect(spec.ok && spec.value.spec).toMatchObject({ preSmooth: 0, inputs: { heightmap: { bitDepth: 16 } } });
  });

  it('softens an 8-bit heightmap by default and warns about terracing', async () => {
    const { service } = makeService(fakeBroker(() => ({ ok: true, stats })));
    const target = await createTerrain(service);
    const result = await service.setInput(attach(target, encodePngRgba8(new Uint8Array(16), 2, 2)));
    expect(result.ok && result.value.warnings).toEqual(['8-bit heightmap: expect visible terracing. Pre-smooth is on.']);
    const spec = await service.get(target);
    expect(spec.ok && spec.value.spec.preSmooth).toBe(1);
  });

  it('transcodes a non-PNG through the injected converter', async () => {
    const toPng = vi.fn(async () => ({ png: encodePngRgba8(new Uint8Array(16), 2, 2) }));
    const { service } = makeService(fakeBroker(() => ({ ok: true, stats })), { toPng });
    const target = await createTerrain(service);
    const result = await service.setInput(attach(target, new Uint8Array([0xff, 0xd8, 0xff]), 'satellite'));
    expect(toPng).toHaveBeenCalled();
    expect(result.ok && result.value.input?.file).toBe('inputs/satellite.png');
    // A satellite image never changes the heightmap pre-smooth.
    const spec = await service.get(target);
    expect(spec.ok && spec.value.spec.preSmooth).toBe(0);
  });

  it('refuses bytes that are not an image', async () => {
    const { service } = makeService(fakeBroker(() => ({ ok: true, stats })));
    const target = await createTerrain(service);
    const result = await service.setInput(attach(target, new Uint8Array([1, 2, 3])));
    expect(result).toMatchObject({ ok: false, message: NOT_AN_IMAGE });
  });

  it('refuses a 16-bit heightmap above the side cap rather than quantise it', async () => {
    const { service } = makeService(fakeBroker(() => ({ ok: true, stats })));
    const target = await createTerrain(service);
    const wide = encodePngGrey16(new Uint16Array(8193), 8193, 1);
    const result = await service.setInput(attach(target, wide));
    expect(result).toMatchObject({ ok: false, message: '16-bit heightmaps larger than 8192 px are not supported.' });
  });

  it('downscales an oversized 8-bit image and says so', async () => {
    const small = encodePngRgba8(new Uint8Array(16), 2, 2);
    const toPng = vi.fn(async () => ({ png: small, downscaledFrom: { width: 9000, height: 9000 } }));
    const { service } = makeService(fakeBroker(() => ({ ok: true, stats })), { toPng });
    const target = await createTerrain(service);
    const big = encodePngRgba8(new Uint8Array(8193 * 4), 8193, 1);
    const result = await service.setInput(attach(target, big, 'satellite'));
    expect(result.ok && result.value.warnings).toEqual(['Downscaled from 9000×9000 to the 8192 px limit.']);
  });

  it('removes an input and its file', async () => {
    const { service } = makeService(fakeBroker(() => ({ ok: true, stats })));
    const target = await createTerrain(service);
    await service.setInput(attach(target, heightmap16()));
    const removed = await service.setInput({ ...target, slot: 'heightmap', remove: true });
    expect(removed.ok).toBe(true);
    const spec = await service.get(target);
    expect(spec.ok && spec.value.spec.inputs.heightmap).toBeUndefined();
    await expect(stat(join(root, target.project, target.terrain, 'inputs', 'heightmap.png'))).rejects.toThrow();
  });
});

describe('build', () => {
  it('answers needs-height-source without ever starting the worker', async () => {
    const broker = fakeBroker(() => ({ ok: true, stats }));
    const { service } = makeService(broker);
    const target = await createTerrain(service);
    const result = await service.build(target);
    expect(result).toEqual({ ok: true, value: { status: 'needs-height-source' } });
    expect(broker.build).not.toHaveBeenCalled();
  });

  it('builds, swaps build/ in, records lastBuild and announces the change', async () => {
    const broker = fakeBroker(() => ({ ok: true, stats }));
    const { service, events } = makeService(broker);
    const target = await createTerrain(service);
    await service.setInput(attach(target, heightmap16()));
    const result = await service.build({ ...target, buildId: 'b1' });
    expect(result).toEqual({ ok: true, value: { status: 'built', stats } });
    const dir = join(root, target.project, target.terrain);
    expect((await readdir(dir)).sort()).toEqual(['build', 'inputs', 'terrain.json']);
    expect((await readdir(join(dir, 'build')))).toEqual(['heights.f32']);
    const got = await service.get(target);
    expect(got.ok && got.value.built).toBe(true);
    expect(got.ok && got.value.spec.lastBuild?.stats).toEqual(stats);
    expect(events).toContain('progress:write');
    expect(events.some((e) => e.startsWith('log:terrain build dunes-') && e.endsWith(' ok'))).toBe(true);
  });

  it('keeps the previous build when a run is cancelled and answers Build cancelled.', async () => {
    let outcome: TerrainRunResult = { ok: true, stats };
    const broker = fakeBroker(() => outcome);
    const { service } = makeService(broker);
    const target = await createTerrain(service);
    await service.setInput(attach(target, heightmap16()));
    await service.build(target);
    const dir = join(root, target.project, target.terrain);
    await writeFile(join(dir, 'build', 'marker'), 'old');
    outcome = { ok: false, message: TERRAIN_BUILD_CANCELLED, cancelled: true };
    const result = await service.build(target);
    expect(result).toMatchObject({ ok: false, message: 'Build cancelled.' });
    expect(await readFile(join(dir, 'build', 'marker'), 'utf8')).toBe('old');
    expect((await readdir(dir)).filter((n) => n.startsWith('.build-tmp'))).toEqual([]);
  });

  it('surfaces a worker failure message', async () => {
    const broker = fakeBroker(() => ({ ok: false, message: 'This PNG is damaged and cannot be read.' }));
    const { service } = makeService(broker);
    const target = await createTerrain(service);
    await service.setInput(attach(target, heightmap16()));
    expect(await service.build(target)).toMatchObject({ ok: false, message: 'This PNG is damaged and cannot be read.' });
  });

  it('cancel passes the build id to the broker and always succeeds', () => {
    const broker = fakeBroker(() => ({ ok: true, stats }));
    const { service } = makeService(broker);
    expect(service.cancel('abc')).toEqual({ ok: true });
    expect(broker.cancel).toHaveBeenCalledWith('abc');
  });
});

describe('channels whose theme has not landed', () => {
  it('answers a readable error rather than hanging', () => {
    expect(notAvailableYet()).toEqual({ ok: false, kind: 'error', message: TERRAIN_NOT_AVAILABLE });
    expect(TERRAIN_NOT_AVAILABLE).toBe('Terrain building is not available yet.');
  });
});
