import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { map } from '@midnite/studio-shared';

import { encodePngGrey16, encodePngRgba8 } from '../png/png-codec';
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

export type CaptureLayerResult = { ok: true; stats: CaptureStats } | { ok: false; message: string };
const layerStats = (files: string[]): CaptureStats => ({ minM: 0, maxM: 0, seaFraction: 0, files });

export type SatelliteRunInput = { frame: map.CaptureFrame; size: number; plan: map.TilePlan; outDir: string };

/**
 * The satellite layer (Phase 108 Theme E): stitch RGBA tiles into a Mercator mosaic, resample it onto
 * the local square at `size`² with a bilinear, **pixel-centred** sample (Terrain drapes this as a
 * texture over the whole square, so pixel `i` covers `[i, i+1)` of it), and write `satellite.png`.
 */
export function createSatelliteRun(input: SatelliteRunInput) {
  const { plan, size } = input;
  const ts = plan.tileSize;
  const tiles: { x: number; y: number; data: Uint8Array }[] = [];
  return {
    addTile(x: number, y: number, rgba: Uint8Array, width: number, height: number): void {
      if (width !== ts || height !== ts) return; // treated as missing: transparent, then opaque black
      tiles.push({ x, y, data: rgba });
    },
    async finish(onProgress: (fraction: number) => void = () => undefined): Promise<CaptureLayerResult> {
      const mosaic = map.stitchMosaic(plan, tiles, (n) => new Uint8Array(n), 4, 0);
      tiles.length = 0;
      onProgress(0.1);
      const at = map.makeMosaicMapper(input.frame, plan, { count: size, centred: 'pixel' });
      const out = new Uint8Array(size * size * 4);
      for (let j = 0; j < size; j += 1) {
        for (let i = 0; i < size; i += 1) {
          const [u, v] = at(i, j);
          const o = (j * size + i) * 4;
          map.sampleBilinearRgba(mosaic.data, mosaic.width, mosaic.height, u, v, out, o);
          out[o + 3] = 255;
        }
        if (j % 64 === 0) onProgress(0.1 + 0.8 * (j / size));
      }
      await mkdir(input.outDir, { recursive: true });
      await writeFile(join(input.outDir, 'satellite.png'), encodePngRgba8(out, size, size));
      onProgress(1);
      return { ok: true, stats: layerStats(['satellite.png']) };
    },
  };
}

export type RoadsRunInput = { graph: map.RoadGraph; size: number; outDir: string };

/** The roads layer: `roads.png` (cyan on black, Terrain's mask) and `roads.graph.json`. */
export function createRoadsRun(input: RoadsRunInput) {
  return {
    async finish(onProgress: (fraction: number) => void = () => undefined): Promise<CaptureLayerResult> {
      onProgress(0.1);
      const rgba = map.rasterizeRoads(input.graph, input.size);
      onProgress(0.7);
      await mkdir(input.outDir, { recursive: true });
      await writeFile(join(input.outDir, 'roads.png'), encodePngRgba8(rgba, input.size, input.size));
      await writeFile(join(input.outDir, 'roads.graph.json'), `${JSON.stringify(input.graph)}\n`);
      onProgress(1);
      return { ok: true, stats: layerStats(['roads.png', 'roads.graph.json']) };
    },
  };
}
