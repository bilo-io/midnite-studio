import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { SPRITE_ONE_SHOT_TOO_MANY, type GitOpResult, type SpriteSheetSpec } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImageBytesRequest } from '../image/image-service';
import type { GeneratedImage } from '../image/types';
import { encodePngRgba8 } from '../png/png-codec';
import { createOneShotRunner, ONE_SHOT_SHEET_FILE, oneShotPreflight } from './one-shot';
import { createSpriteService, type SpriteJobRunner } from './sprite-service';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sprite-one-shot-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

/**
 * A magenta sheet of `cols × rows` cells (cell 40, gutter 8), each holding a 16×24 block standing on
 * the cell's bottom; `merge` closes the gutter after that column (a missing gutter).
 */
function sheetPng(cols: number, rows: number, opts: { merge?: number; wide?: number } = {}): Buffer {
  const cell = 40;
  const gutter = 8;
  const w = cols * cell + (cols + 1) * gutter;
  const h = rows * cell + (rows + 1) * gutter;
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i += 1) data.set([255, 0, 255, 255], i * 4);
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < cols; c += 1) {
      const x0 = gutter + c * (cell + gutter) + 12;
      const y0 = gutter + r * (cell + gutter) + 12;
      const bw = c === opts.wide ? 34 : opts.merge === c ? cell + gutter : 16;
      for (let y = y0; y < y0 + 24; y += 1) for (let x = x0; x < Math.min(w, x0 + bw); x += 1) data.set([40 + 50 * r, 120, 40 + 30 * c, 255], (y * w + x) * 4);
    }
  return encodePngRgba8(data, w, h);
}

function make(runJob: SpriteJobRunner) {
  return createSpriteService({
    rootFor: async () => root,
    writeBytes: async ({ project, path, data }) => {
      const abs = join(root, project, path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, data);
      return { ok: true, value: undefined };
    },
    trash: (abs) => rm(abs, { recursive: true, force: true }),
    toPng: async () => null,
    onChanged: () => undefined,
    emitProgress: () => undefined,
    emitChanged: () => undefined,
    log: () => undefined,
    runJob,
    preflight: oneShotPreflight,
  });
}

async function create(service: ReturnType<typeof make>, over: Record<string, unknown> = {}) {
  const created = await service.library({
    op: 'create',
    repoId: 'r',
    spec: { kind: 'sheet', name: 'Knight', method: 'one-shot', style: 'flat', frameSize: [32, 32], prompt: 'a knight', clips: [{ name: 'idle', frames: 3 }, { name: 'walk', frames: 3 }], ...over },
  });
  if (!created.ok || !created.value.asset) throw new Error('create failed');
  return { repoId: 'r', group: 'characters' as const, asset: created.value.asset };
}

const done = async (service: ReturnType<typeof make>, jobId: string) => {
  await vi.waitFor(() => expect(service.jobStatus(jobId)?.state).not.toBe('running'), { timeout: 15_000 });
  return service.jobStatus(jobId)!;
};

describe('one-shot runner', () => {
  it('asks once with the versioned prompt, detects the grid, slices every cell through the pipeline, and records it all', async () => {
    const requests: ImageBytesRequest[] = [];
    const generateImage = async (req: ImageBytesRequest): Promise<GitOpResult<GeneratedImage>> => {
      requests.push(req);
      return { ok: true, value: { bytes: sheetPng(3, 2, { wide: 2 }), mime: 'image/png' } };
    };
    const service = make(createOneShotRunner({ generateImage, toPng: async () => null }));
    const target = await create(service);
    const job = await service.generate(target);
    if (!job.ok) throw new Error('no job');
    expect((await done(service, job.value.jobId)).state).toBe('done');
    expect(requests).toHaveLength(1);
    expect(requests[0]!.aspect).toBe('3:2');
    expect(requests[0]!.prompt).toContain('3 columns');

    const got = await service.get(target);
    if (!got.ok) throw new Error('get');
    const spec = got.value.spec as SpriteSheetSpec;
    expect(spec.oneShot).toMatchObject({ promptVersion: 1, grid: { columns: 3, rows: 2 }, aspect: '3:2', rows: [{ clip: 'idle', dir: 'e' }, { clip: 'walk', dir: 'e' }] });
    expect(spec.oneShot!.mismatch).toBeUndefined();
    expect(spec.oneShot!.detected!.columns).toHaveLength(3);
    // 6 cells, each mirrored to w on a side sheet.
    const keys = Object.keys(got.value.frames.frames).sort();
    expect(keys).toEqual(['idle/e/000', 'idle/e/001', 'idle/e/002', 'idle/w/000', 'idle/w/001', 'idle/w/002', 'walk/e/000', 'walk/e/001', 'walk/e/002', 'walk/w/000', 'walk/w/001', 'walk/w/002']);
    expect(got.value.frames.frames['idle/e/001']).toMatchObject({ source: 'sliced' });
    expect(got.value.frames.frames['idle/w/001']).toMatchObject({ source: 'mirrored', flipped: true });
    // The third column is twice as wide: its cells carry `grid`.
    expect(got.value.frames.frames['walk/e/002']!.badges).toContain('grid');
    expect(got.value.frames.frames['walk/e/000']!.badges).not.toContain('grid');
    await stat(join(root, 'characters', target.asset, ONE_SHOT_SHEET_FILE));
  });

  it('a mismatched grid is reported and nothing is sliced', async () => {
    const service = make(createOneShotRunner({ generateImage: async () => ({ ok: true, value: { bytes: sheetPng(3, 2, { merge: 0 }), mime: 'image/png' } }), toPng: async () => null }));
    const target = await create(service);
    const job = await service.generate(target);
    if (!job.ok) throw new Error('no job');
    const status = await done(service, job.value.jobId);
    expect(status).toMatchObject({ state: 'failed', message: 'Expected 3 × 2 cells, found 2 × 2. Nothing was sliced.' });
    const got = await service.get(target);
    if (!got.ok) throw new Error('get');
    expect((got.value.spec as SpriteSheetSpec).oneShot?.mismatch).toBe('Expected 3 × 2 cells, found 2 × 2. Nothing was sliced.');
    expect(got.value.frames.frames).toEqual({});
  });

  it('refuses a grid over 8 × 8 before any request', async () => {
    const generateImage = vi.fn();
    const service = make(createOneShotRunner({ generateImage, toPng: async () => null }));
    const target = await create(service, { clips: [{ name: 'walk', frames: 9 }] });
    const job = await service.generate(target);
    expect(job).toMatchObject({ ok: false, message: SPRITE_ONE_SHOT_TOO_MANY });
    expect(generateImage).not.toHaveBeenCalled();
  });
});

describe('hand-off to Hand-drawn', () => {
  it('makes a frame the approved reference, then runs one clip with the hand-drawn method', async () => {
    const seen: Array<{ method: string; clips: readonly string[] | undefined }> = [];
    const service = make(async (ctx) => {
      if (ctx.spec.kind === 'sheet') seen.push({ method: ctx.spec.method, clips: ctx.clips });
    });
    const target = await create(service);
    const frame = join(root, 'characters', target.asset, 'frames/attack/e/000.png');
    await mkdir(dirname(frame), { recursive: true });
    await writeFile(frame, sheetPng(1, 1));
    expect((await service.setReference({ ...target, fromFrame: { clip: 'attack', dir: 'e', n: 0 } })).ok).toBe(true);
    expect(await readFile(join(root, 'characters', target.asset, 'reference/reference.png'))).toEqual(await readFile(frame));
    const job = await service.generate({ ...target, clips: ['attack'], method: 'hand-drawn' });
    if (!job.ok) throw new Error('no job');
    await done(service, job.value.jobId);
    expect(seen).toEqual([{ method: 'hand-drawn', clips: ['attack'] }]);
    const got = await service.get(target);
    if (!got.ok) throw new Error('get');
    const spec = got.value.spec as SpriteSheetSpec;
    // The stored sheet keeps its own method; the reference is locked.
    expect(spec.method).toBe('one-shot');
    expect(spec.reference).toEqual({ kind: 'image', file: 'reference/reference.png', approved: true });
    expect((await service.setReference({ ...target, fromFrame: { clip: 'nope', dir: 'e', n: 0 } })).ok).toBe(false);
  });
});
