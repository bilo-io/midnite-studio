// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { encodePngGrey16 } from '@midnite/studio-runtime';
import { createHeightSampler } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

/**
 * Phase 141 Theme B's contract: the editor's sampler (`shared/src/game-heightfield.ts`) and the kit's
 * `createHeightfield().heightAt` answer the same height at the same point, triangle split included — the kit's own
 * module, imported by path as `kit-core-three.test.ts` does, over a PNG decoded by the kit's own decoder.
 */

const coreDir = resolve(__dirname, '../../../../../templates/media-game/kit/core');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS module
const load = async (file: string): Promise<any> => import(pathToFileURL(join(coreDir, file)).href);

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('heightfield agreement (editor sampler vs kit)', () => {
  it('B1: 10,000 seeded points over the fixture terrain agree within 1e-4 m', async () => {
    const { createHeightfield } = await load('heightfield.js');
    const { decodePng16 } = await load('png16.js');
    const { parseHeightfieldInfo } = await load('terrain-manifest.js');
    const parsed = parseHeightfieldInfo(JSON.parse(await readFile(join(__dirname, '__fixtures__', 'terrain-pack', 'heightfield.json'), 'utf8')));
    expect(parsed.ok).toBe(true);
    const info = { resolution: parsed.value.resolution as number, worldSize: parsed.value.worldSize as number, heightRange: parsed.value.heightRange as [number, number] };
    // Rolling hills plus noise, so every cell's two triangles differ.
    const r = rng(141);
    const res = info.resolution;
    const samples = new Uint16Array(res * res);
    for (let j = 0; j < res; j += 1) for (let i = 0; i < res; i += 1) samples[j * res + i] = Math.max(0, Math.min(65535, Math.round(32768 + 20000 * Math.sin(i / 9) * Math.cos(j / 13) + (r() - 0.5) * 12000)));
    const decoded = await decodePng16(new Uint8Array(encodePngGrey16(samples, res, res)));
    const kit = createHeightfield(decoded.data, info);
    const ours = createHeightSampler(decoded.data, info);
    const half = info.worldSize / 2;
    let worst = 0;
    for (let k = 0; k < 10_000; k += 1) {
      // A little past the edge too, where both clamp.
      const x = (r() * 2.1 - 1.05) * half, z = (r() * 2.1 - 1.05) * half;
      worst = Math.max(worst, Math.abs(ours.heightAt(x, z) - kit.heightAt(x, z)));
    }
    expect(worst).toBeLessThan(1e-4);
  });
});
