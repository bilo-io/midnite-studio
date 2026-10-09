// vitest (node): the software preview renderer — pure CPU, no browser capability.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseTerrainSpec, type TerrainSpec } from '@midnite/studio-shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { decodePng } from '../png/png-codec';
import { runTerrainBuild } from './build-pipeline';
import { renderTerrainPreviews } from './terrain-preview';

let dir: string;
let spec: TerrainSpec;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'terrain-preview-'));
  spec = parseTerrainSpec({ name: 'Preview Isle', resolution: 129, worldSize: 1000, heightRange: [0, 120], noise: { seed: 5, erosion: { iterations: 0 } } });
  await runTerrainBuild({ dir, outDir: 'build', spec });
}, 60_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('renderTerrainPreviews', () => {
  it('is null for a terrain that has not been built', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'terrain-preview-empty-'));
    expect(await renderTerrainPreviews({ dir: empty, spec, views: ['top'] })).toBeNull();
    await rm(empty, { recursive: true, force: true });
  });

  it('renders each requested view once, in request order, at the requested size', async () => {
    const pictures = await renderTerrainPreviews({ dir, spec, views: ['oblique', 'top', 'top', 'horizon', 'landcover', 'roads'], size: 128 });
    expect(pictures?.map((p) => p.view)).toEqual(['oblique', 'top', 'horizon', 'landcover', 'roads']);
    for (const p of pictures!) {
      const png = decodePng(new Uint8Array(p.png));
      expect(png.ok && [png.image.width, png.image.height]).toEqual([128, 128]);
    }
  });

  it('falls back to a height ramp, with a note, when a layer was not built', async () => {
    const pictures = await renderTerrainPreviews({ dir, spec, views: ['top', 'landcover', 'roads'], size: 128 });
    expect(pictures?.every((p) => typeof p.note === 'string' && p.note.length > 0)).toBe(true);
  });
});
