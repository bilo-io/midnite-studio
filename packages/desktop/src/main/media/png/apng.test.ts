import { describe, expect, it } from 'vitest';

import { encodeApng, pngChunks } from './apng';
import { decodePng } from './png-codec';

const solid = (rgba: [number, number, number, number]) => {
  const data = new Uint8Array(2 * 2 * 4);
  for (let i = 0; i < 4; i += 1) data.set(rgba, i * 4);
  return data;
};

describe('encodeApng', () => {
  it('writes acTL, one fcTL per frame and fdAT for every frame after the first, in sequence', () => {
    const png = encodeApng(
      [
        { data: solid([255, 0, 0, 255]), delayMs: 100 },
        { data: solid([0, 255, 0, 128]), delayMs: 100 },
        { data: solid([0, 0, 255, 0]), delayMs: 125 },
      ],
      2,
      2,
    );
    const chunks = pngChunks(png);
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'acTL', 'fcTL', 'IDAT', 'fcTL', 'fdAT', 'fcTL', 'fdAT', 'IEND']);
    expect(chunks[1]!.data.readUInt32BE(0)).toBe(3); // frames
    expect(chunks[1]!.data.readUInt32BE(4)).toBe(0); // loop forever
    const sequence = chunks.filter((c) => c.type === 'fcTL' || c.type === 'fdAT').map((c) => c.data.readUInt32BE(0));
    expect(sequence).toEqual([0, 1, 2, 3, 4]);
    const lastFc = chunks[6]!.data;
    expect([lastFc.readUInt16BE(20), lastFc.readUInt16BE(22)]).toEqual([125, 1000]);
  });

  it('is still a valid PNG of the first frame to a reader that ignores animation', () => {
    const decoded = decodePng(encodeApng([{ data: solid([10, 20, 30, 255]), delayMs: 50 }, { data: solid([0, 0, 0, 0]), delayMs: 50 }], 2, 2));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(Array.from(decoded.image.data.slice(0, 4))).toEqual([10, 20, 30, 255]);
  });
});
