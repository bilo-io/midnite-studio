import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { SPRITE_FRAME_SOURCES_PENDING, SPRITE_JOB_BUSY, SPRITE_NEEDS_MODEL, type SpriteAssetSpec, type SpriteSheetSpec } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decodePng, encodePngRgba8 } from '../png/png-codec';
import { createSpriteService, NOT_AN_IMAGE, type SpriteJobRunner, type SpriteServiceDeps } from './sprite-service';

let repo: string;
let root: string;

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'sprite-service-'));
  root = join(repo, '.midnite', 'media', 'sprite');
  await mkdir(root, { recursive: true });
});
afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function make(over: Partial<SpriteServiceDeps> = {}) {
  const emitChanged = vi.fn();
  const emitProgress = vi.fn();
  const log = vi.fn();
  const service = createSpriteService({
    rootFor: async () => root,
    writeBytes: async ({ project, path, data }) => {
      const abs = join(root, project, path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, data);
      return { ok: true, value: undefined };
    },
    trash: (abs) => rm(abs, { recursive: true, force: true }),
    toPng: async (bytes) => (bytes[0] === 0 ? null : PNG),
    onChanged: () => undefined,
    emitProgress,
    emitChanged,
    log,
    now: () => new Date(2026, 9, 4, 12, 0, 0),
    ...over,
  });
  return { service, emitChanged, emitProgress, log };
}

const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
};

async function createHero(service: ReturnType<typeof make>['service'], spec: Record<string, unknown> = {}) {
  const created = await service.library({ op: 'create', repoId: 'r', spec: { kind: 'sheet', name: 'Hero', ...spec } });
  if (!created.ok || !created.value.group || !created.value.asset) throw new Error('create failed');
  return { repoId: 'r', group: created.value.group, asset: created.value.asset };
}

describe('library', () => {
  it('creates a sheet in Characters with preset clips and a stamped folder', async () => {
    const { service, emitChanged } = make();
    const target = await createHero(service);
    expect(target).toMatchObject({ group: 'characters', asset: 'hero-20261004-120000' });
    const got = await service.get(target);
    expect(got.ok && got.value.spec.kind === 'sheet' && got.value.spec.clips.map((c) => c.name)).toContain('walk');
    expect(emitChanged).toHaveBeenCalled();
  });

  it('routes an object, a tileset and a map to their own groups', async () => {
    const { service } = make();
    expect((await createHero(service, { category: 'object' })).group).toBe('objects');
    const tiles = await service.library({ op: 'create', repoId: 'r', spec: { kind: 'tileset', name: 'Grass' } });
    expect(tiles.ok && tiles.value.group).toBe('tilesets');
    const map = await service.library({ op: 'create', repoId: 'r', spec: { kind: 'map', name: 'World' } });
    expect(map.ok && map.value.group).toBe('maps');
  });

  it('refuses an invalid spec with a message instead of throwing', async () => {
    const { service } = make();
    const bad = await service.library({ op: 'create', repoId: 'r', spec: { kind: 'sheet', name: 'x', clips: [{ name: 'Walk!', frames: 4 }] } });
    expect(bad.ok).toBe(false);
  });

  it('renames, duplicates and deletes', async () => {
    const { service } = make();
    const target = await createHero(service);
    const renamed = await service.library({ op: 'rename', ...target, to: 'Knight' });
    expect(renamed.ok && renamed.value.asset).toBe('knight-20261004-120000');
    const next = { ...target, asset: 'knight-20261004-120000' };
    const copy = await service.library({ op: 'duplicate', ...next });
    expect(copy.ok && copy.value.asset).toBe('knight-copy-20261004-120000');
    expect((await service.library({ op: 'delete', ...next })).ok).toBe(true);
    expect((await service.get(next)).ok).toBe(false);
  });
});

describe('setSpec and setReference', () => {
  it('merges a patch but never changes the kind', async () => {
    const { service } = make();
    const target = await createHero(service);
    const set = await service.setSpec({ ...target, patch: { frameSize: [32, 32], kind: 'tileset' } });
    expect(set.ok && (set.value.spec as SpriteSheetSpec).frameSize).toEqual([32, 32]);
    expect(set.ok && set.value.spec.kind).toBe('sheet');
    expect((await service.setSpec({ ...target, patch: { frameSize: [1, 1] } })).ok).toBe(false);
  });

  it('writes a reference png, points at a model, and removes it', async () => {
    const { service } = make();
    const target = await createHero(service);
    expect((await service.setReference({ ...target, bytes: new Uint8Array([1, 2]), name: 'a.png' })).ok).toBe(true);
    await expect(stat(join(root, target.group, target.asset, 'reference', 'reference.png'))).resolves.toBeTruthy();
    const withImage = await service.get(target);
    expect(withImage.ok && (withImage.value.spec as SpriteSheetSpec).reference).toEqual({ kind: 'image', file: 'reference/reference.png', approved: false });
    expect((await service.setReference({ ...target, model: { project: 'p', path: 'knight/model.json' } })).ok).toBe(true);
    const withModel = await service.get(target);
    expect(withModel.ok && (withModel.value.spec as SpriteSheetSpec).reference?.kind).toBe('model');
    expect((await service.setReference({ ...target, remove: true })).ok).toBe(true);
  });

  it('rejects bytes that are not an image', async () => {
    const { service } = make();
    const target = await createHero(service);
    const result = await service.setReference({ ...target, bytes: new Uint8Array([0, 0]), name: 'x' });
    expect(result).toMatchObject({ ok: false, message: NOT_AN_IMAGE });
  });
});

describe('generate', () => {
  it('refuses a second generate on a busy asset with the literal message', async () => {
    const hold = gate();
    const runJob: SpriteJobRunner = () => hold.promise;
    const { service } = make({ runJob });
    const target = await createHero(service);
    const first = await service.generate(target);
    expect(first.ok).toBe(true);
    const second = await service.generate(target);
    expect(second).toMatchObject({ ok: false, kind: 'error', message: SPRITE_JOB_BUSY });
    expect(SPRITE_JOB_BUSY).toBe('This asset is already generating. Cancel it first.');
    hold.release();
  });

  it('runs jobs of different assets concurrently', async () => {
    const hold = gate();
    const { service } = make({ runJob: () => hold.promise });
    const a = await createHero(service);
    const b = await createHero(service, { name: 'Other' });
    expect((await service.generate(a)).ok).toBe(true);
    expect((await service.generate(b)).ok).toBe(true);
    hold.release();
  });

  it('cancel keeps written frames and ends the job cancelled', async () => {
    const written = gate();
    const runJob: SpriteJobRunner = async (ctx) => {
      await ctx.writeFrame({ clip: 'idle', dir: 'e', n: 0, png: PNG });
      written.release();
      await new Promise<void>((resolve) => ctx.signal.addEventListener('abort', () => resolve()));
    };
    const { service, log } = make({ runJob });
    const target = await createHero(service);
    const started = await service.generate(target);
    if (!started.ok) throw new Error('no job');
    await written.promise;
    expect((await service.cancel(started.value.jobId)).ok).toBe(true);
    await vi.waitFor(() => expect(service.jobStatus(started.value.jobId)?.state).toBe('cancelled'));
    await expect(readFile(join(root, target.group, target.asset, 'frames', 'idle', 'e', '000.png'))).resolves.toBeTruthy();
    const got = await service.get(target);
    expect(got.ok && Object.keys(got.value.frames.frames)).toEqual(['idle/e/000']);
    expect(got.ok && got.value.report).toMatchObject({ frames: 1, failing: 0 });
    expect(log.mock.calls.at(-1)?.[0]).toMatch(/^sprite job hero-\S+ method=hand-drawn frames=1 requests=1 ms=\d+ cancelled$/);
    // the asset is free again
    expect(service.cancel(started.value.jobId).ok).toBe(false);
  });

  it('ends failed with the pending message when no frame source is installed', async () => {
    const { service } = make();
    const target = await createHero(service);
    const started = await service.generate(target);
    if (!started.ok) throw new Error('no job');
    await vi.waitFor(() => expect(service.jobStatus(started.value.jobId)?.state).toBe('failed'));
    expect(service.jobStatus(started.value.jobId)?.message).toBe(SPRITE_FRAME_SOURCES_PENDING);
  });

  it('refuses rendered from 3D with no model attached', async () => {
    const { service } = make();
    const target = await createHero(service, { method: 'rendered' });
    expect(await service.generate(target)).toMatchObject({ ok: false, message: SPRITE_NEEDS_MODEL });
  });
});

describe('submitFrame (the frame pipeline)', () => {
  function pngOn(fg: [number, number, number], h: number): Uint8Array {
    const size = 48;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1) {
        const inside = x >= 16 && x < 28 && y >= 44 - h && y < 44;
        data.set(inside ? [...fg, 255] : [255, 0, 255, 255], (y * size + x) * 4);
      }
    return encodePngRgba8(data, size, size);
  }

  it('normalises frames, badges them and stores the reference height and pixel palette', async () => {
    const runJob: SpriteJobRunner = async (ctx) => {
      await ctx.submitFrame({ clip: 'idle', dir: 'e', n: 0, bytes: pngOn([200, 40, 40], 30), meta: { source: 'sliced' } });
      await ctx.submitFrame({ clip: 'idle', dir: 'e', n: 1, bytes: pngOn([200, 40, 40], 30) });
      await ctx.submitFrame({ clip: 'idle', dir: 'e', n: 2, bytes: pngOn([40, 40, 200], 15) });
    };
    const { service } = make({ runJob });
    const target = await createHero(service, { style: 'pixel', frameSize: [32, 32], palette: { size: 4 } });
    const job = await service.generate(target);
    if (!job.ok) throw new Error('no job');
    await vi.waitFor(() => expect(service.jobStatus(job.value.jobId)?.state).toBe('done'));
    const got = await service.get(target);
    if (!got.ok) throw new Error('get failed');
    expect(got.value.frames.referenceHeights).toEqual({ e: 30 });
    expect(got.value.frames.frames['idle/e/000']).toMatchObject({ source: 'sliced', badges: [] });
    expect(got.value.frames.frames['idle/e/002']?.badges).toEqual(['height']);
    expect(got.value.report).toMatchObject({ frames: 3, failing: 1 });
    const spec = got.value.spec as SpriteSheetSpec;
    expect(spec.palette && 'colours' in spec.palette && spec.palette.colours.length).toBeGreaterThanOrEqual(2);
    const frame = decodePng(await readFile(join(root, target.group, target.asset, 'frames', 'idle', 'e', '000.png')));
    expect(frame.ok && [frame.image.width, frame.image.height]).toEqual([32, 32]);
  });
});

describe('patchFrames', () => {
  async function seeded(over: Partial<SpriteServiceDeps> = {}, n = 3) {
    const runJob: SpriteJobRunner = async (ctx) => {
      for (let i = 0; i < n; i += 1) await ctx.writeFrame({ clip: 'idle', dir: 'e', n: i, png: Buffer.from([0x89, i]) });
    };
    const made = make({ runJob, ...over });
    const target = await createHero(made.service);
    const job = await made.service.generate(target);
    if (!job.ok) throw new Error('no job');
    await vi.waitFor(() => expect(made.service.jobStatus(job.value.jobId)?.state).toBe('done'));
    return { ...made, target, dir: join(root, target.group, target.asset) };
  }
  const frameMeta = async (service: ReturnType<typeof make>['service'], target: Awaited<ReturnType<typeof createHero>>) => {
    const got = await service.get(target);
    if (!got.ok) throw new Error('get failed');
    return got.value.frames.frames;
  };

  it('nudges (relative) and flips (toggle) existing frames only', async () => {
    const { service, target } = await seeded();
    expect((await service.patchFrames({ ...target, ops: [{ op: 'nudge', key: 'idle/e/000', dx: 2, dy: -1 }, { op: 'nudge', key: 'idle/e/000', dx: 1, dy: 0 }, { op: 'flip', key: 'idle/e/000' }] })).ok).toBe(true);
    expect((await frameMeta(service, target))['idle/e/000']).toMatchObject({ anchorNudge: [3, -1], flipped: true });
    const missing = await service.patchFrames({ ...target, ops: [{ op: 'flip', key: 'idle/e/009' }] });
    expect(missing.ok).toBe(false);
  });

  it('delete moves the frame to the trash and restore brings it back with its metadata', async () => {
    const { service, target, dir } = await seeded();
    await service.patchFrames({ ...target, ops: [{ op: 'flip', key: 'idle/e/001' }] });
    expect((await service.patchFrames({ ...target, ops: [{ op: 'delete', key: 'idle/e/001' }] })).ok).toBe(true);
    expect((await frameMeta(service, target))['idle/e/001']).toBeUndefined();
    await expect(stat(join(dir, 'frames/idle/e/001.png'))).rejects.toThrow();
    await stat(join(dir, 'frames/.trash/idle/e/001.png'));
    expect((await service.patchFrames({ ...target, ops: [{ op: 'restore', key: 'idle/e/001' }] })).ok).toBe(true);
    expect((await frameMeta(service, target))['idle/e/001']).toMatchObject({ flipped: true });
    expect([...(await readFile(join(dir, 'frames/idle/e/001.png')))]).toEqual([0x89, 1]);
  });

  it('move renames the frames between and keeps each frame its metadata', async () => {
    const { service, target, dir } = await seeded();
    await service.patchFrames({ ...target, ops: [{ op: 'flip', key: 'idle/e/000' }] });
    expect((await service.patchFrames({ ...target, ops: [{ op: 'move', key: 'idle/e/000', to: 2 }] })).ok).toBe(true);
    const bytes = async (n: number) => [...(await readFile(join(dir, `frames/idle/e/00${n}.png`)))][1];
    expect([await bytes(0), await bytes(1), await bytes(2)]).toEqual([1, 2, 0]);
    const meta = await frameMeta(service, target);
    expect(meta['idle/e/002']!.flipped).toBe(true);
    expect(meta['idle/e/000']!.flipped).toBe(false);
  });

  it('a reroll starts a job for just those frames', async () => {
    const seen: Array<readonly string[] | undefined> = [];
    const { service, target } = await seeded();
    // Swap the runner by recreating the service over the same folder.
    const { service: again } = make({
      runJob: async (ctx) => {
        seen.push(ctx.frames);
      },
    });
    const patched = await again.patchFrames({ ...target, ops: [{ op: 'reroll', keys: ['idle/e/001'] }] });
    expect(patched.ok && patched.value.jobId).toBeTruthy();
    await vi.waitFor(() => expect(seen).toEqual([['idle/e/001']]));
    expect(service).toBeDefined();
  });

  it('refuses edits while the asset is generating', async () => {
    const hold = gate();
    const { service, target } = await seeded();
    const { service: busy } = make({ runJob: () => hold.promise });
    await busy.generate(target);
    const refused = await busy.patchFrames({ ...target, ops: [{ op: 'flip', key: 'idle/e/000' }] });
    expect(refused).toMatchObject({ ok: false, message: SPRITE_JOB_BUSY });
    hold.release();
    expect(service).toBeDefined();
  });

  it('a finished job prunes frames numbered past their clip (a shorter re-render)', async () => {
    const { service, target, dir } = await seeded({}, 6);
    expect(Object.keys(await frameMeta(service, target)).sort()).toEqual(['idle/e/000', 'idle/e/001', 'idle/e/002', 'idle/e/003']);
    await expect(stat(join(dir, 'frames/idle/e/004.png'))).rejects.toThrow();
  });
});

it('keeps the spec type honest', () => {
  const spec: SpriteAssetSpec | null = null;
  expect(spec).toBeNull();
});
