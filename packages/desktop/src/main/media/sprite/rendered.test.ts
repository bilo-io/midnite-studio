import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { SpriteRenderRequestEvent, SpriteSheetSpec } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decodePng, encodePngRgba8 } from '../png/png-codec';
import type { RenderHandlers } from './render-relay';
import { createRenderedRunner } from './rendered';
import { createSpriteService } from './sprite-service';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sprite-rendered-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

/** A 32×32 rendered frame: transparent, with an opaque block standing on row 28. */
function frame(h: number): string {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 28 - h; y < 28; y += 1) for (let x = 12; x < 20; x += 1) data.set([90, 120, 200, 255], (y * size + x) * 4);
  return Buffer.from(encodePngRgba8(data, size, size)).toString('base64');
}

function make(render: (event: SpriteRenderRequestEvent, handlers: RenderHandlers) => Promise<void>) {
  const service = createSpriteService({
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
    runJob: createRenderedRunner({ render }),
  });
  return service;
}

describe('rendered runner', () => {
  it('asks for every direction and clip, runs frames through the pipeline at scale 1 and records the real frame counts', async () => {
    let asked: SpriteRenderRequestEvent | null = null;
    const service = make(async (event, h) => {
      asked = event;
      await h.onBatch?.({ total: 2, notes: ['No matching animation: jump'], clips: [{ name: 'walk', frames: 12, fps: 10 }] });
      await h.onFrame({ clip: 'walk', dir: 's', index: 0, png: frame(20) });
      await h.onFrame({ clip: 'walk', dir: 'e', index: 0, png: frame(10) });
    });
    const created = await service.library({
      op: 'create',
      repoId: 'r',
      spec: {
        kind: 'sheet',
        name: 'Knight',
        method: 'rendered',
        style: 'flat',
        directions: 4,
        targetPerspective: 'isometric',
        frameSize: [32, 32],
        clips: [{ name: 'walk', frames: 8, fps: 10 }],
        reference: { kind: 'model', project: 'characters', path: 'knight/model.json' },
      },
    });
    if (!created.ok || !created.value.asset) throw new Error('create failed');
    const target = { repoId: 'r', group: 'characters' as const, asset: created.value.asset };
    const job = await service.generate(target);
    if (!job.ok) throw new Error(job.kind === 'error' ? job.message : 'no job');
    await vi.waitFor(() => expect(service.jobStatus(job.value.jobId)?.state).toBe('done'), { timeout: 15_000 });
    expect(service.jobStatus(job.value.jobId)?.message).toBe('No matching animation: jump');
    expect(asked).toMatchObject({ directions: ['s', 'w', 'n', 'e'], model: { project: 'characters', path: 'knight/model.json' }, frameSize: [32, 32] });
    expect(asked!.settings.camera).toBe('isometric');
    expect(asked!.settings.elevationDeg).toBeCloseTo(26.565, 3);

    const got = await service.get(target);
    if (!got.ok) throw new Error('get failed');
    expect(got.value.frames.frames['walk/s/000']).toMatchObject({ source: 'rendered' });
    expect((got.value.spec as SpriteSheetSpec).clips[0]).toMatchObject({ name: 'walk', frames: 12, fps: 10 });
    // Not rescaled: the 20 px tall block is still 20 px tall, standing on the anchor (the bottom row).
    const decoded = decodePng(await readFile(join(root, 'characters', target.asset, 'frames/walk/s/000.png')));
    if (!decoded.ok) throw new Error('decode');
    const rows: number[] = [];
    for (let y = 0; y < 32; y += 1) {
      let any = false;
      for (let x = 0; x < 32; x += 1) if (decoded.image.data[(y * 32 + x) * decoded.image.channels + decoded.image.channels - 1]! > 8) any = true;
      if (any) rows.push(y);
    }
    expect(rows.length).toBe(20);
    expect(rows.at(-1)).toBe(31);
  });

  it('refuses a sheet with no model before rendering', async () => {
    const render = vi.fn();
    const service = make(render);
    const created = await service.library({ op: 'create', repoId: 'r', spec: { kind: 'sheet', name: 'K', method: 'rendered' } });
    if (!created.ok || !created.value.asset) throw new Error('create failed');
    const job = await service.generate({ repoId: 'r', group: 'characters', asset: created.value.asset });
    expect(job.ok).toBe(false);
    expect(render).not.toHaveBeenCalled();
  });
});
