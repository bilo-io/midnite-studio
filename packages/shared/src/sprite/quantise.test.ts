import { describe, expect, it } from 'vitest';

import { createRgba, rgbToHex } from './image';
import { darkestColour, outline1px } from './outline';
import { mapToPalette, medianCut } from './quantise';
import { rectOn } from './test-fixtures';

function gradient(size: number) {
  const img = createRgba(size, size);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) img.data.set([x * 8, y * 8, (x * y) % 256, 255], (y * size + x) * 4);
  return img;
}

describe('quantise', () => {
  it('medianCut yields at most the palette size', () => {
    const img = gradient(32);
    expect(medianCut(img.data, 16).length).toBeLessThanOrEqual(16);
    expect(medianCut(img.data, 16).length).toBeGreaterThan(8);
    expect(medianCut([img.data, gradient(16).data], 4).length).toBeLessThanOrEqual(4);
    expect(medianCut(createRgba(4, 4).data, 8)).toEqual([]);
  });

  it('mapToPalette output uses only palette colours', () => {
    const img = gradient(32);
    const palette = medianCut(img.data, 8);
    const mapped = mapToPalette(img, palette);
    const used = new Set<string>();
    for (let i = 0; i < mapped.data.length; i += 4) used.add(rgbToHex([mapped.data[i]!, mapped.data[i + 1]!, mapped.data[i + 2]!]));
    for (const c of used) expect(palette).toContain(c);
  });

  it('respects a fixed palette', () => {
    const mapped = mapToPalette(rectOn(4, 4, 0, 0, 4, 4, '#d02828'), ['#000000', '#ff0000', '#ffffff']);
    expect(Array.from(mapped.data.slice(0, 4))).toEqual([255, 0, 0, 255]);
  });
});

describe('outline1px', () => {
  it('rings the subject in the darkest palette colour', () => {
    expect(darkestColour(['#ffffff', '#102030', '#808080'])).toBe('#102030');
    const out = outline1px(rectOn(6, 6, 2, 2, 2, 2), '#102030');
    const a = (x: number, y: number) => out.data[(y * 6 + x) * 4 + 3];
    expect(a(1, 2)).toBe(255);
    expect(a(2, 1)).toBe(255);
    expect(a(1, 1)).toBe(0);
    expect(Array.from(out.data.slice((2 * 6 + 1) * 4, (2 * 6 + 1) * 4 + 3))).toEqual([0x10, 0x20, 0x30]);
  });
});
