import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { encodePngGrey16 } from '@midnite/studio-runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearTerrainHeightsCache, heightsOver, readHeightSource, type HeightSource } from './terrain-heights';

const TERRAIN = { minX: -500, minZ: -500, maxX: 500, maxZ: 500 };
/** 11 × 11 samples, 100 m apart, rising 10 units a column. */
const source: HeightSource = { width: 11, height: 11, values: Uint16Array.from({ length: 121 }, (_, i) => (i % 11) * 6553.5), top: 65535, range: [0, 1000] };
const metres = (h: NonNullable<ReturnType<typeof heightsOver>>): number[] => {
  const raw = Buffer.from(h.data, 'base64');
  return Array.from({ length: h.cols * h.rows }, (_, i) => h.min + (raw.readUInt16LE(i * 2) / 65535) * (h.max - h.min));
};

describe('heightsOver', () => {
  it('keeps the source spacing over an area, edges on the area', () => {
    const h = heightsOver(source, TERRAIN, { minX: -200, minZ: 0, maxX: 200, maxZ: 300 })!;
    expect([h.cols, h.rows]).toEqual([5, 4]);
    const m = metres(h);
    expect(m[0]).toBeCloseTo(300, 0);
    expect(m[4]).toBeCloseTo(700, 0);
  });
  it('interpolates between samples', () => {
    const h = heightsOver(source, TERRAIN, { minX: -450, minZ: 0, maxX: -350, maxZ: 100 })!;
    expect(metres(h)[0]).toBeCloseTo(50, 0);
  });
  it('never exceeds the side cap', () => {
    const h = heightsOver(source, TERRAIN, TERRAIN, 4)!;
    expect([h.cols, h.rows]).toEqual([4, 4]);
    expect(metres(h)[3]).toBeCloseTo(1000, 0);
  });
  it('is null for an empty area', () => {
    expect(heightsOver(source, TERRAIN, { minX: 0, minZ: 0, maxX: 0, maxZ: 10 })).toBeNull();
  });
});

describe('readHeightSource', () => {
  let dir = '';
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'heights-'));
    clearTerrainHeightsCache();
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  it('reads a 16-bit heightfield with the range its json states', async () => {
    await writeFile(join(dir, 'h.png'), encodePngGrey16(Uint16Array.from([0, 65535, 0, 65535]), 2, 2));
    await writeFile(join(dir, 'h.json'), JSON.stringify({ heightRange: [-20, 1090] }));
    const s = (await readHeightSource({ png: join(dir, 'h.png'), json: join(dir, 'h.json') }, [0, 1]))!;
    expect([s.width, s.height, s.top]).toEqual([2, 2, 65535]);
    expect(s.range).toEqual([-20, 1090]);
    expect(s.values[1]).toBe(65535);
  });
  it('falls back to the manifest range, and is null without any or without a file', async () => {
    await writeFile(join(dir, 'h.png'), encodePngGrey16(Uint16Array.from([0, 1, 2, 3]), 2, 2));
    expect((await readHeightSource({ png: join(dir, 'h.png'), json: null }, [5, 9]))!.range).toEqual([5, 9]);
    expect(await readHeightSource({ png: join(dir, 'h.png'), json: null }, null)).toBeNull();
    expect(await readHeightSource({ png: join(dir, 'missing.png'), json: null }, [0, 1])).toBeNull();
    expect(await readHeightSource({ png: null, json: null }, [0, 1])).toBeNull();
  });
});
