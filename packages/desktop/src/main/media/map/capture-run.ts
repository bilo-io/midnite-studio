import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { map } from '@midnite/studio-shared';

import { encodePngGrey16 } from '../png/png-codec';
import type { CaptureStats } from './capture-protocol';

/**
 * One heightmap capture's compute half (Phase 108 Theme D): collect the decoded DEM tiles into a
 * mosaic, resample onto the vertex-centred local square, and write `heightmap.png` / `.r32` / `.tif`.
 * Plain Node (no `electron`), so the worker and bare vitest run the same code.
 */
export const HEIGHTMAP_FILES = ['heightmap.png', 'heightmap.r32', 'heightmap.tif'] as const;

export type CaptureRunInput = {
  frame: map.CaptureFrame;
  size: number;
  plan: map.TilePlan;
  encoding: map.DemEncoding;
  outDir: string;
};

export function createCaptureRun(input: CaptureRunInput) {
  const { plan } = input;
  const tiles: { x: number; y: number; data: Float32Array }[] = [];
  const ts = plan.tileSize;

  return {
    addTile(x: number, y: number, rgba: Uint8Array, width: number, height: number): void {
      if (width !== ts || height !== ts) return; // a wrong-size tile is treated as missing → NaN → filled
      tiles.push({ x, y, data: map.decodeDem(rgba, input.encoding) });
    },
    async finish(
      onProgress: (fraction: number) => void = () => undefined,
      isCancelled: () => boolean = () => false,
    ): Promise<{ ok: true; stats: CaptureStats } | { ok: false; message: string }> {
      const mosaic = map.stitchMosaic(plan, tiles, (n) => new Float32Array(n), 1, Number.NaN);
      tiles.length = 0;
      onProgress(0.1);
      const resampled = map.resampleHeightmap(mosaic, plan, input.frame, input.size, isCancelled);
      if (!resampled.ok) return resampled;
      onProgress(0.6);
      const { heights, minM, maxM } = resampled;
      await mkdir(input.outDir, { recursive: true });
      const png = encodePngGrey16(map.toUint16Heights(heights, minM, maxM), input.size, input.size);
      await writeFile(join(input.outDir, 'heightmap.png'), png);
      onProgress(0.75);
      await writeFile(join(input.outDir, 'heightmap.r32'), map.encodeR32(heights));
      onProgress(0.9);
      await writeFile(
        join(input.outDir, 'heightmap.tif'),
        map.writeGeoTiffFloat32(heights, input.size, { center: input.frame.center, sideM: input.frame.sideM }),
      );
      onProgress(1);
      let wet = 0;
      for (let k = 0; k < heights.length; k += 1) if (heights[k]! <= 0) wet += 1;
      return { ok: true, stats: { minM, maxM, seaFraction: heights.length > 0 ? wet / heights.length : 0, files: [...HEIGHTMAP_FILES] } };
    },
  };
}
