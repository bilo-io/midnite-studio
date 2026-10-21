import { describe, expect, it } from 'vitest';
import {
  MAP_CAPTURE_TILE_BUDGET,
  chooseCaptureZoom,
  countNoData,
  decodeDem,
  direct,
  encodeR32,
  fillNoData,
  frameBBox,
  frameRing,
  fromFrame,
  inverse,
  listTiles,
  lonLatToWorld,
  nativeMPerPx,
  planTiles,
  resampleHeightmap,
  stitchMosaic,
  tileBounds,
  tileForLonLat,
  toFrame,
  toUint16Heights,
  worldToLonLat,
  writeGeoTiffFloat32,
  type LonLat,
} from './index';
import { syntheticTile, TILE } from './synthetic-dem';

describe('mercator', () => {
  it('round-trips lon/lat through world coordinates', () => {
    for (const p of [
      [18.4241, -33.9249],
      [0, 0],
      [-179.9, 80],
      [151.2, -33.8],
    ] as LonLat[]) {
      const [x, y] = lonLatToWorld(p[0], p[1]);
      const [lon, lat] = worldToLonLat(x, y);
      expect(lon).toBeCloseTo(p[0], 9);
      expect(lat).toBeCloseTo(p[1], 9);
    }
  });
  it('tiles: z0 is one tile; tileBounds contains its own point', () => {
    expect(tileForLonLat(10, 10, 0)).toEqual({ x: 0, y: 0 });
    const t = tileForLonLat(18.4241, -33.9249, 12);
    const [w, s, e, n] = tileBounds(12, t.x, t.y);
    expect(18.4241).toBeGreaterThanOrEqual(w);
    expect(18.4241).toBeLessThanOrEqual(e);
    expect(-33.9249).toBeGreaterThanOrEqual(s);
    expect(-33.9249).toBeLessThanOrEqual(n);
  });
  it('metres per pixel: ~156543 m at z0 equator, halves per zoom, shrinks with latitude', () => {
    expect(nativeMPerPx(0, 0)).toBeCloseTo(156543.03, 1);
    expect(nativeMPerPx(1, 0)).toBeCloseTo(78271.52, 1);
    expect(nativeMPerPx(10, 60)).toBeCloseTo(nativeMPerPx(10, 0) / 2, 3);
  });
});

describe('geodesy', () => {
  it("Vincenty's Flinders Peak -> Buninyong case is 54 972.271 m", () => {
    const dms = (d: number, m: number, s: number) => d + m / 60 + s / 3600;
    const a: LonLat = [dms(144, 25, 29.5244), -dms(37, 57, 3.7203)];
    const b: LonLat = [dms(143, 55, 35.3839), -dms(37, 39, 10.1561)];
    const r = inverse(a, b);
    expect(Math.abs(r.distanceM - 54972.271)).toBeLessThan(0.001);
    expect(r.azi1).toBeCloseTo(306 + 52 / 60 + 5.37 / 3600, 4);
  });
  it('direct inverts inverse', () => {
    const a: LonLat = [18.4, -33.9];
    const b = direct(a, 77, 123456);
    const r = inverse(a, b);
    expect(r.distanceM).toBeCloseTo(123456, 4);
    expect(r.azi1).toBeCloseTo(77, 6);
  });
  it('coincident points are zero; near-antipodal stays finite', () => {
    expect(inverse([1, 2], [1, 2]).distanceM).toBe(0);
    const r = inverse([0, 0], [179.9, 0.1]);
    expect(Number.isFinite(r.distanceM)).toBe(true);
    expect(r.distanceM).toBeGreaterThan(19_900_000);
  });
});

describe('frame', () => {
  it.each([0, 45, 60, -60])('toFrame(fromFrame(p)) round-trips within 1 mm at lat %i', (lat) => {
    const c: LonLat = [18.4, lat];
    for (const p of [
      [-32500, -32500],
      [32500, 32500],
      [0, 0],
      [32500, -1200],
    ] as [number, number][]) {
      const q = toFrame(c, fromFrame(c, p));
      expect(Math.abs(q[0] - p[0])).toBeLessThan(0.001);
      expect(Math.abs(q[1] - p[1])).toBeLessThan(0.001);
    }
  });
  it('x is east and z is south', () => {
    const c: LonLat = [10, 10];
    expect(fromFrame(c, [1000, 0])[0]).toBeGreaterThan(10);
    expect(fromFrame(c, [0, 1000])[1]).toBeLessThan(10);
  });
  it.each([0, 60])('ring sides are sideM long at lat %i (within 0.1 %)', (lat) => {
    const side = 20000;
    const ring = frameRing([5, lat], side, 16);
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring[64]);
    const corners = [0, 16, 32, 48].map((i) => ring[i]!);
    for (let k = 0; k < 4; k += 1) {
      // Sides are straight in the AEQD plane; compare corner spacing against the chord's frame length.
      const a = toFrame([5, lat], corners[k]!);
      const b = toFrame([5, lat], corners[(k + 1) % 4]!);
      expect(Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1]) - side) / side).toBeLessThan(0.001);
    }
  });
  it('bbox encloses the centre', () => {
    const [w, s, e, n] = frameBBox([18.4, -33.9], 10000);
    expect(w).toBeLessThan(18.4);
    expect(e).toBeGreaterThan(18.4);
    expect(s).toBeLessThan(-33.9);
    expect(n).toBeGreaterThan(-33.9);
  });
});

describe('dem', () => {
  it('decodes Terrarium and Terrain-RGB zero, and A=0 as NaN', () => {
    expect(decodeDem(new Uint8Array([128, 0, 0, 255]), 'terrarium')[0]).toBe(0);
    expect(decodeDem(new Uint8Array([1, 134, 160, 255]), 'terrain-rgb')[0]).toBeCloseTo(0, 5);
    expect(decodeDem(new Uint8Array([128, 0, 0, 0]), 'terrarium')[0]).toBeNaN();
    expect(decodeDem(new Uint8Array([129, 2, 128, 255]), 'terrarium')[0]).toBeCloseTo(258.5, 5);
  });
  it('fillNoData fills holes from neighbours', () => {
    const g = new Float32Array([1, 1, 1, 1, NaN, 1, 1, 1, 1]);
    expect(fillNoData(g, 3, 3)).toBe(0);
    expect(g[4]).toBe(1);
    expect(countNoData(new Float32Array([NaN, NaN]))).toBe(2);
    expect(fillNoData(new Float32Array([NaN, NaN]), 2, 1)).toBe(2);
  });
});

describe('capture plan', () => {
  const src = { minZoom: 0, maxZoom: 15, tileSize: 256 };
  it('a 65 km frame at 4097 lands near z13; a 1 km frame at 1025 at z15', () => {
    const big = chooseCaptureZoom(src, { center: [18.4, -34], sideM: 65536 }, 4097);
    expect(big.z).toBe(13);
    expect(big.count).toBeLessThanOrEqual(MAP_CAPTURE_TILE_BUDGET);
    expect(chooseCaptureZoom(src, { center: [18.4, -34], sideM: 1000 }, 1025).z).toBe(15);
  });
  it('steps down for the tile budget, never below minZoom', () => {
    const f = { center: [18.4, -34] as LonLat, sideM: 65536 };
    expect(chooseCaptureZoom(src, f, 4097, { budget: 16 }).count).toBeLessThanOrEqual(16);
    expect(chooseCaptureZoom({ ...src, minZoom: 12 }, f, 4097, { budget: 1 }).z).toBe(12);
  });
  it('lists exactly cols x rows tiles', () => {
    const p = planTiles({ center: [18.4, -34], sideM: 5000 }, 12, 256);
    expect(listTiles(p)).toHaveLength(p.count);
  });
});

function runCapture(opts: {
  center: LonLat;
  sideM: number;
  size: number;
  heightAt: (lon: number, lat: number) => number;
}) {
  const frame = { center: opts.center, sideM: opts.sideM };
  const plan = chooseCaptureZoom({ minZoom: 0, maxZoom: 15, tileSize: TILE }, frame, opts.size);
  const tiles = listTiles(plan).map((t) => ({
    ...t,
    data: decodeDem(syntheticTile(plan.z, t.x, t.y, opts.heightAt), 'terrarium'),
  }));
  const mosaic = stitchMosaic(plan, tiles, (n) => new Float32Array(n), 1, Number.NaN);
  const out = resampleHeightmap(mosaic, plan, frame, opts.size);
  if (!out.ok) throw new Error(out.message);
  return { ...out, plan };
}

describe('golden captures (no network)', () => {
  const R = 6378137;

  it('recovers a plane at lat 60 in true metres: 10 km east-west is 100 m, not 200', () => {
    const height = (lon: number) =>
      1000 + 0.01 * ((lon - 10) * (Math.PI / 180) * R * Math.cos((60 * Math.PI) / 180));
    const n = 129;
    const { heights } = runCapture({ center: [10, 60], sideM: 10000, size: n, heightAt: height });
    const mid = (n - 1) / 2;
    expect(Math.abs(heights[mid * n + (n - 1)]! - heights[mid * n]! - 100)).toBeLessThan(0.5);
    expect(Math.abs(heights[mid]! - heights[(n - 1) * n + mid]!)).toBeLessThan(0.5);
  });

  it('has no seam when the frame straddles the shared corner of four tiles', () => {
    const [w, , , n0] = tileBounds(15, 18000, 19000);
    const bump = (lon: number, lat: number) =>
      200 + 40 * Math.sin((lon - w) * 600) * Math.cos((lat - n0) * 600);
    const size = 257;
    const { heights, plan } = runCapture({ center: [w, n0], sideM: 3000, size, heightAt: bump });
    expect(plan.cols).toBeGreaterThanOrEqual(2);
    expect(plan.rows).toBeGreaterThanOrEqual(2);
    const maxSecond = (idx: (k: number) => number) => {
      let m = 0;
      for (let k = 1; k < size - 1; k += 1)
        m = Math.max(
          m,
          Math.abs(heights[idx(k - 1)]! - 2 * heights[idx(k)]! + heights[idx(k + 1)]!),
        );
      return m;
    };
    const mid = (size - 1) / 2;
    const q = mid >> 1;
    const interior = Math.max(
      maxSecond((k) => q * size + k),
      maxSecond((k) => k * size + q),
    );
    expect(maxSecond((k) => mid * size + k)).toBeLessThanOrEqual(interior * 1.5 + 0.01);
    expect(maxSecond((k) => k * size + mid)).toBeLessThanOrEqual(interior * 1.5 + 0.01);
  });

  it('fails when most of the frame has no data', () => {
    const frame = { center: [18.4, -34] as LonLat, sideM: 4000 };
    const plan = chooseCaptureZoom({ minZoom: 0, maxZoom: 15, tileSize: TILE }, frame, 65);
    const mosaic = stitchMosaic(plan, [], (n) => new Float32Array(n), 1, Number.NaN);
    expect(resampleHeightmap(mosaic, plan, frame, 65).ok).toBe(false);
  });

  it('honours cancellation', () => {
    const frame = { center: [18.4, -34] as LonLat, sideM: 4000 };
    const plan = chooseCaptureZoom({ minZoom: 0, maxZoom: 15, tileSize: TILE }, frame, 65);
    const mosaic = stitchMosaic(plan, [], (n) => new Float32Array(n), 1, 0);
    expect(resampleHeightmap(mosaic, plan, frame, 65, () => true)).toEqual({
      ok: false,
      message: 'Capture cancelled.',
    });
  });
});

describe('encoders', () => {
  it('uint16: min -> 0, max -> 65535; flat frames do not divide by zero', () => {
    expect([...toUint16Heights(new Float32Array([10, 20, 30]), 10, 30)]).toEqual([0, 32768, 65535]);
    expect([...toUint16Heights(new Float32Array([5, 5]), 5, 5)]).toEqual([0, 0]);
  });
  it('r32 is little-endian float32', () => {
    const b = encodeR32(new Float32Array([1.5, -2]));
    expect(new DataView(b.buffer).getFloat32(0, true)).toBe(1.5);
    expect(new DataView(b.buffer).getFloat32(4, true)).toBe(-2);
  });
  it('geotiff: tag table, image data, tiepoint, scale and CRS centre parse back', () => {
    const n = 5;
    const h = new Float32Array(n * n).map((_, i) => i * 0.5);
    const bytes = writeGeoTiffFloat32(h, n, { center: [18.4, -33.9], sideM: 400 });
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe('II');
    expect(v.getUint16(2, true)).toBe(42);
    const ifd = v.getUint32(4, true);
    const count = v.getUint16(ifd, true);
    const tags = new Map<number, number>();
    let prev = 0;
    for (let k = 0; k < count; k += 1) {
      const p = ifd + 2 + k * 12;
      const tag = v.getUint16(p, true);
      expect(tag).toBeGreaterThan(prev);
      prev = tag;
      tags.set(tag, v.getUint32(p + 8, true));
    }
    expect(tags.get(256)).toBe(n);
    expect(tags.get(257)).toBe(n);
    expect(v.getFloat32(tags.get(273)! + 4, true)).toBe(0.5);
    expect(v.getFloat64(tags.get(33550)!, true)).toBeCloseTo(100, 9);
    const tie = tags.get(33922)!;
    expect(v.getFloat64(tie + 24, true)).toBe(-200);
    expect(v.getFloat64(tie + 32, true)).toBe(200);
    const dbl = tags.get(34736)!;
    expect(v.getFloat64(dbl, true)).toBeCloseTo(18.4, 9);
    expect(v.getFloat64(dbl + 8, true)).toBeCloseTo(-33.9, 9);
    expect(v.getUint16(tags.get(34735)! + 6, true)).toBe(11);
  });
});
