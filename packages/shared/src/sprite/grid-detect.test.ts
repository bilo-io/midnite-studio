import { describe, expect, it } from 'vitest';

import { SpriteFramesFileSchema, SpriteSheetSpecSchema } from '../media-sprite';
import { cellBounds, compareGrid, detectGrid, oneShotVerdict, outlierSpans, profileSpans, sliceCell } from './grid-detect';
import { createRgba, type RgbaImage } from './image';

/** A transparent sheet with opaque blocks: `cols`/`rows` give each block's [start, end) per axis. */
function sheet(width: number, height: number, cols: Array<[number, number]>, rows: Array<[number, number]>, skip: (c: number, r: number) => boolean = () => false): RgbaImage {
  const img = createRgba(width, height);
  rows.forEach(([y0, y1], r) =>
    cols.forEach(([x0, x1], c) => {
      if (skip(c, r)) return;
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) img.data.set([200, 40, 40, 255], (y * width + x) * 4);
    }),
  );
  return img;
}

describe('profileSpans', () => {
  it('splits on gutters ≥ 2 px and keeps 1 px seams inside a span', () => {
    expect(profileSpans([0, 3, 3, 0, 3, 3, 0, 0, 4, 4, 0])).toEqual([[1, 6], [8, 10]]);
    expect(profileSpans([5, 5, 0, 0, 5, 5])).toEqual([[0, 2], [4, 6]]);
  });
});

describe('detectGrid', () => {
  it('finds a clean 4 × 2 grid', () => {
    const cols: Array<[number, number]> = [[8, 40], [48, 80], [88, 120], [128, 160]];
    const rows: Array<[number, number]> = [[8, 40], [48, 80]];
    const found = detectGrid(sheet(168, 88, cols, rows));
    expect(found).toEqual({ columns: cols, rows });
    expect(compareGrid(found, { columns: 4, rows: 2 })).toBeNull();
  });

  it('finds uneven gutters too', () => {
    const cols: Array<[number, number]> = [[2, 30], [33, 70], [90, 120]];
    const found = detectGrid(sheet(130, 40, cols, [[5, 35]]));
    expect(found.columns).toEqual(cols);
    expect(compareGrid(found, { columns: 3, rows: 1 })).toBeNull();
  });

  it('reports a missing gutter as a mismatch — nothing is re-cut', () => {
    // Two of eight columns touch: seven spans.
    const cols: Array<[number, number]> = [[0, 10], [12, 22], [24, 34], [34, 44], [46, 56], [58, 68], [70, 80], [82, 92]];
    const found = detectGrid(sheet(96, 60, cols, [[0, 12], [16, 28], [32, 44], [48, 60]]));
    expect(found.columns).toHaveLength(7);
    expect(compareGrid(found, { columns: 8, rows: 4 })).toBe('Expected 8 × 4 cells, found 7 × 4. Nothing was sliced.');
  });

  it('a row with fewer frames still lines up on the full grid', () => {
    const cols: Array<[number, number]> = [[4, 20], [28, 44], [52, 68]];
    const found = detectGrid(sheet(72, 48, cols, [[4, 20], [28, 44]], (c, r) => r === 1 && c === 2));
    expect(compareGrid(found, { columns: 3, rows: 2 })).toBeNull();
  });
});

describe('slicing', () => {
  it('widens spans to the gutter midpoints and slices the right cells', () => {
    const img = sheet(168, 88, [[8, 40], [48, 80], [88, 120], [128, 160]], [[8, 40], [48, 80]]);
    // Mark cell (2, 1) blue so its slice is identifiable.
    for (let y = 48; y < 80; y += 1) for (let x = 88; x < 120; x += 1) img.data.set([0, 0, 255, 255], (y * 168 + x) * 4);
    const found = detectGrid(img);
    const cols = cellBounds(found.columns, 168);
    const rows = cellBounds(found.rows, 88);
    expect(cols).toEqual([[0, 44], [44, 84], [84, 124], [124, 168]]);
    expect(rows).toEqual([[0, 44], [44, 88]]);
    const cell = sliceCell(img, cols[2]!, rows[1]!);
    expect([cell.width, cell.height]).toEqual([40, 44]);
    const centre = ((20 * cell.width) + 20) * 4;
    expect([...cell.data.slice(centre, centre + 4)]).toEqual([0, 0, 255, 255]);
  });

  it('flags spans more than 20 % off the median', () => {
    expect([...outlierSpans([[0, 30], [40, 70], [80, 125], [130, 160]])]).toEqual([2]);
  });
});

describe('oneShotVerdict', () => {
  const spec = SpriteSheetSpecSchema.parse({
    kind: 'sheet',
    name: 'k',
    clips: [
      { name: 'idle', frames: 2 },
      { name: 'attack', frames: 3 },
    ],
    oneShot: { promptVersion: 1, grid: { columns: 3, rows: 2, cell: [64, 64], gutter: 8 }, aspect: '3:2', rows: [{ clip: 'idle', dir: 'e' }, { clip: 'attack', dir: 'e' }] },
  });
  const meta = (badges: string[]) => ({ badges, source: 'sliced' });

  it('says which rows passed and what failed most', () => {
    const frames = SpriteFramesFileSchema.parse({
      frames: { 'idle/e/000': meta([]), 'idle/e/001': meta([]), 'attack/e/000': meta(['clipped']), 'attack/e/001': meta([]), 'attack/e/002': meta(['clipped', 'grid']) },
    });
    expect(oneShotVerdict(spec, frames)).toEqual({
      sheet: null,
      rows: [
        { clip: 'idle', dir: 'e', ok: true, summary: 'row 1, idle: 2 frames ok' },
        { clip: 'attack', dir: 'e', ok: false, summary: 'row 2, attack: 2 of 3 frames clipped' },
      ],
    });
  });

  it('missing frames and a grid mismatch are verdicts too', () => {
    expect(oneShotVerdict(spec, SpriteFramesFileSchema.parse({}))?.rows[0]?.summary).toBe('row 1, idle: 2 of 2 frames missing');
    const mismatch = { ...spec, oneShot: { ...spec.oneShot!, mismatch: 'Expected 3 × 2 cells, found 2 × 2. Nothing was sliced.' } };
    expect(oneShotVerdict(mismatch, SpriteFramesFileSchema.parse({}))).toEqual({ sheet: 'Expected 3 × 2 cells, found 2 × 2. Nothing was sliced.', rows: [] });
  });
});
