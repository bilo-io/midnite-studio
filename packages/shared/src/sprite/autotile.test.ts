import { describe, expect, it } from 'vitest';

import {
  BLOB,
  BLOB47_MASKS,
  buildTilesetTiles,
  CORNER,
  CORNER16,
  blobFitsEast,
  blobFitsSouth,
  compositeTile,
  cornerFitsEast,
  cornerFitsSouth,
  maskEdge,
  periodicNoise,
  reduceBlob,
  restrictiveCollision,
  stackTiles,
  transitionMask,
  wangId,
} from './autotile';
import { createRgba, type RgbaImage } from './image';

const S = 32;
const SEED = 7;

const solid = (r: number, g: number, b: number, size = S): RgbaImage => {
  const img = createRgba(size, size);
  for (let i = 0; i < size * size; i += 1) img.data.set([r, g, b, 255], i * 4);
  return img;
};

describe('blob 47', () => {
  it('has exactly 47 valid configurations', () => {
    expect(BLOB47_MASKS).toHaveLength(47);
    expect(new Set(BLOB47_MASKS).size).toBe(47);
    for (const m of BLOB47_MASKS) expect(reduceBlob(m)).toBe(m);
  });

  it('keeps a corner only when both of its edges are set', () => {
    expect(reduceBlob(BLOB.NE)).toBe(0);
    expect(reduceBlob(BLOB.N | BLOB.E | BLOB.NE)).toBe(BLOB.N | BLOB.E | BLOB.NE);
    expect(reduceBlob(255)).toBe(255);
  });

  it('matches the touching edge byte for byte in every adjacent pair, both ways', () => {
    const masks = new Map(BLOB47_MASKS.map((m) => [m, transitionMask({ scheme: 'blob47', config: m }, S, SEED)]));
    let east = 0, south = 0;
    for (const l of BLOB47_MASKS)
      for (const r of BLOB47_MASKS) {
        if (blobFitsEast(l, r)) {
          east += 1;
          expect(maskEdge(masks.get(l)!, S, 'e')).toEqual(maskEdge(masks.get(r)!, S, 'w'));
        }
        if (blobFitsSouth(l, r)) {
          south += 1;
          expect(maskEdge(masks.get(l)!, S, 's')).toEqual(maskEdge(masks.get(r)!, S, 'n'));
        }
      }
    expect(east).toBeGreaterThan(100);
    expect(south).toBe(east);
  });

  it('matches in soft (antialiased) masks too', () => {
    const l = BLOB47_MASKS.find((m) => m === (BLOB.N | BLOB.E | BLOB.S | BLOB.W | BLOB.NE))!;
    const r = BLOB.N | BLOB.E | BLOB.S | BLOB.W | BLOB.NW | BLOB.NE | BLOB.SW | BLOB.SE;
    const soft = (m: number) => transitionMask({ scheme: 'blob47', config: m }, S, SEED, true);
    expect(blobFitsEast(l, r)).toBe(false);
    for (const a of BLOB47_MASKS) for (const b of BLOB47_MASKS) if (blobFitsEast(a, b)) expect(maskEdge(soft(a), S, 'e')).toEqual(maskEdge(soft(b), S, 'w'));
  });

  it('is plain terrain along every edge that borders the surrounding terrain', () => {
    for (const m of BLOB47_MASKS) {
      const mask = transitionMask({ scheme: 'blob47', config: m }, S, SEED);
      if (!(m & BLOB.N)) expect(maskEdge(mask, S, 'n').every((v) => v === 0)).toBe(true);
      if (!(m & BLOB.E)) expect(maskEdge(mask, S, 'e').every((v) => v === 0)).toBe(true);
      if (!(m & BLOB.S)) expect(maskEdge(mask, S, 's').every((v) => v === 0)).toBe(true);
      if (!(m & BLOB.W)) expect(maskEdge(mask, S, 'w').every((v) => v === 0)).toBe(true);
    }
  });

  it('is all b for the full mask and has b in the middle of an isolated cell', () => {
    const full = transitionMask({ scheme: 'blob47', config: 255 }, S, SEED);
    expect(full.every((v) => v === 255)).toBe(true);
    const lone = transitionMask({ scheme: 'blob47', config: 0 }, S, SEED);
    expect(lone[(S / 2) * S + S / 2]).toBe(255);
    expect(lone[0]).toBe(0);
  });

  it('roughens the boundary with noise but is deterministic', () => {
    const a = transitionMask({ scheme: 'blob47', config: 0 }, S, 1);
    expect(transitionMask({ scheme: 'blob47', config: 0 }, S, 1)).toEqual(a);
    expect(transitionMask({ scheme: 'blob47', config: 0 }, S, 2)).not.toEqual(a);
  });
});

describe('corner 16', () => {
  it('has 16 configurations', () => {
    expect(CORNER16).toHaveLength(16);
  });

  it('matches the touching edge byte for byte in every adjacent pair', () => {
    const masks = CORNER16.map((c) => transitionMask({ scheme: 'corner16', config: c }, S, SEED));
    let pairs = 0;
    for (const l of CORNER16)
      for (const r of CORNER16) {
        if (cornerFitsEast(l, r)) {
          pairs += 1;
          expect(maskEdge(masks[l]!, S, 'e')).toEqual(maskEdge(masks[r]!, S, 'w'));
        }
        if (cornerFitsSouth(l, r)) expect(maskEdge(masks[l]!, S, 's')).toEqual(maskEdge(masks[r]!, S, 'n'));
      }
    expect(pairs).toBe(64);
  });

  it('is all a with no corners and all b with all four', () => {
    expect(transitionMask({ scheme: 'corner16', config: 0 }, S, SEED).every((v) => v === 0)).toBe(true);
    expect(transitionMask({ scheme: 'corner16', config: 15 }, S, SEED).every((v) => v === 255)).toBe(true);
  });
});

describe('noise', () => {
  it('is periodic with the tile', () => {
    const n = periodicNoise(3);
    for (const t of [0, 0.13, 0.5, 0.77]) {
      expect(n(0, t)).toBeCloseTo(n(1, t), 10);
      expect(n(t, 0)).toBeCloseTo(n(t, 1), 10);
    }
  });
});

describe('tiles', () => {
  const bases = [
    { id: 'grass', collision: 'walkable' as const, image: solid(10, 200, 10) },
    { id: 'dirt', collision: 'solid' as const, image: solid(150, 100, 40) },
  ];

  it('builds the bases then a full set per transition', () => {
    const tiles = buildTilesetTiles({ scheme: 'blob47', tileSize: S, seed: SEED, soft: false, bases, transitions: [{ a: 'grass', b: 'dirt' }] });
    expect(tiles).toHaveLength(2 + 47);
    expect(tiles.map((t) => t.id)).toEqual(tiles.map((_, i) => i));
    expect(tiles[0]).toMatchObject({ kind: 'base', terrain: 'grass', collision: 'walkable' });
    expect(tiles[2]).toMatchObject({ kind: 'transition', a: 'grass', b: 'dirt', config: 0, collision: 'solid' });
    const corner = buildTilesetTiles({ scheme: 'corner16', tileSize: S, seed: SEED, soft: false, bases, transitions: [{ a: 'grass', b: 'dirt' }] });
    expect(corner).toHaveLength(2 + 16);
  });

  it('takes the more restrictive collision', () => {
    expect(restrictiveCollision('walkable', 'water')).toBe('water');
    expect(restrictiveCollision('water', 'solid')).toBe('solid');
    expect(restrictiveCollision('solid', 'walkable')).toBe('solid');
    expect(restrictiveCollision('walkable', 'walkable')).toBe('walkable');
  });

  it('composites a under b through the mask, and the full mask is exactly b', () => {
    const tiles = buildTilesetTiles({ scheme: 'blob47', tileSize: S, seed: SEED, soft: false, bases, transitions: [{ a: 'grass', b: 'dirt' }] });
    const full = tiles.find((t) => t.config === 255)!;
    expect(Array.from(full.image.data)).toEqual(Array.from(bases[1]!.image.data));
    const lone = tiles.find((t) => t.config === 0)!;
    expect(Array.from(lone.image.data.slice(0, 4))).toEqual([10, 200, 10, 255]);
  });

  it('refuses a transition between terrains it lacks', () => {
    expect(() => buildTilesetTiles({ scheme: 'blob47', tileSize: S, seed: 1, soft: false, bases, transitions: [{ a: 'grass', b: 'lava' }] })).toThrow(/lava/);
  });

  it('stacks tiles row-major', () => {
    const sheet = stackTiles([{ image: solid(1, 1, 1, 4) }, { image: solid(2, 2, 2, 4) }, { image: solid(3, 3, 3, 4) }], 4, 4, 2);
    expect(sheet).toMatchObject({ columns: 2, rows: 2 });
    expect(sheet.image.width).toBe(8);
    expect(sheet.image.data[(4 * 8 + 0) * 4]).toBe(3);
    expect(sheet.image.data[4 * 4]).toBe(2);
  });

  it('composites a plain pair', () => {
    const out = compositeTile(solid(0, 0, 0, 2), solid(200, 200, 200, 2), new Uint8Array([0, 255, 0, 255]));
    expect(Array.from(out.data.slice(0, 8))).toEqual([0, 0, 0, 255, 200, 200, 200, 255]);
  });

  it('writes Tiled wang ids', () => {
    expect(wangId('blob47', 255)).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
    expect(wangId('blob47', 0)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(wangId('corner16', CORNER.NE | CORNER.SW)).toEqual([0, 2, 0, 1, 0, 2, 0, 1]);
  });
});
