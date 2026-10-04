import { deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { crc32, decodePng, encodePngGrey16, encodePngRgba8, PNG_DAMAGED, PNG_INTERLACED, PNG_LOW_BIT_DEPTH } from './png-codec';
import { encodePng } from '../model/sf3d/png';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** A PNG built by hand: `rows` are already-filtered scanlines (filter byte first). */
function handPng(opts: { width: number; height: number; bitDepth: number; colourType: number; interlace?: number; rows: Buffer[]; extra?: Buffer[] }): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(opts.width, 0);
  ihdr.writeUInt32BE(opts.height, 4);
  ihdr[8] = opts.bitDepth;
  ihdr[9] = opts.colourType;
  ihdr[12] = opts.interlace ?? 0;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), ...(opts.extra ?? []), chunk('IDAT', deflateSync(Buffer.concat(opts.rows))), chunk('IEND', Buffer.alloc(0))]);
}

const decoded = (png: Buffer) => {
  const result = decodePng(png);
  if (!result.ok) throw new Error(result.message);
  return result.image;
};

describe('decodePng', () => {
  it('round-trips a 16-bit greyscale PNG bit-exactly', () => {
    const data = Uint16Array.from([0, 1, 255, 256, 40000, 65535]);
    const image = decoded(encodePngGrey16(data, 3, 2));
    expect(image).toMatchObject({ width: 3, height: 2, channels: 1, bitDepth: 16 });
    expect(Array.from(image.data)).toEqual(Array.from(data));
  });

  it('round-trips RGBA8 and keeps the SF3D encoder name working', () => {
    const rgba = Uint8Array.from([1, 2, 3, 4, 250, 251, 252, 253]);
    expect(Array.from(decoded(encodePngRgba8(rgba, 2, 1)).data)).toEqual(Array.from(rgba));
    expect(Array.from(decoded(encodePng(rgba, 2, 1)).data)).toEqual(Array.from(rgba));
  });

  it('decodes each of the five filter types', () => {
    // 8-bit grey, 3 pixels wide, 5 rows: each row uses one filter. The expected image is the same ramp-ish data.
    const expected = [
      [10, 20, 30],
      [11, 22, 33],
      [15, 25, 35],
      [20, 30, 40],
      [21, 29, 45],
    ];
    const paeth = (a: number, b: number, c: number) => {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    };
    const rows = expected.map((row, y) => {
      const out = [y]; // filter type = y
      row.forEach((v, x) => {
        const a = x > 0 ? row[x - 1]! : 0;
        const b = y > 0 ? expected[y - 1]![x]! : 0;
        const c = x > 0 && y > 0 ? expected[y - 1]![x - 1]! : 0;
        const predictor = [0, a, b, (a + b) >> 1, paeth(a, b, c)][y]!;
        out.push((v - predictor) & 0xff);
      });
      return Buffer.from(out);
    });
    const image = decoded(handPng({ width: 3, height: 5, bitDepth: 8, colourType: 0, rows }));
    expect(Array.from(image.data)).toEqual(expected.flat());
  });

  it('expands a palette image (with tRNS alpha)', () => {
    const plte = chunk('PLTE', Buffer.from([255, 0, 0, 0, 255, 0]));
    const trns = chunk('tRNS', Buffer.from([128]));
    const image = decoded(handPng({ width: 2, height: 1, bitDepth: 8, colourType: 3, rows: [Buffer.from([0, 0, 1])], extra: [plte, trns] }));
    expect(image.channels).toBe(4);
    expect(Array.from(image.data)).toEqual([255, 0, 0, 128, 0, 255, 0, 255]);
  });

  it('reads an 8-bit RGB image as three channels', () => {
    const image = decoded(handPng({ width: 1, height: 1, bitDepth: 8, colourType: 2, rows: [Buffer.from([0, 255, 128, 0])] }));
    expect(image).toMatchObject({ channels: 3, bitDepth: 8 });
    expect(Array.from(image.data)).toEqual([255, 128, 0]);
  });

  it('refuses an interlaced PNG with a readable message', () => {
    const png = handPng({ width: 1, height: 1, bitDepth: 8, colourType: 0, interlace: 1, rows: [Buffer.from([0, 7])] });
    expect(decodePng(png)).toEqual({ ok: false, message: PNG_INTERLACED });
    expect(PNG_INTERLACED).toBe('Interlaced PNGs are not supported — re-save without interlacing.');
  });

  it('refuses a low-bit-depth PNG', () => {
    const png = handPng({ width: 8, height: 1, bitDepth: 1, colourType: 0, rows: [Buffer.from([0, 0b10101010])] });
    expect(decodePng(png)).toEqual({ ok: false, message: PNG_LOW_BIT_DEPTH });
    expect(PNG_LOW_BIT_DEPTH).toBe('Low-bit-depth PNGs are not supported — re-save as 8- or 16-bit.');
  });

  it('refuses a damaged PNG: bad CRC, truncated, or not a PNG at all', () => {
    const good = encodePngGrey16(Uint16Array.from([1, 2, 3, 4]), 2, 2);
    const flipped = Buffer.from(good);
    flipped[good.length - 20] = flipped[good.length - 20]! ^ 0xff; // inside IDAT
    expect(decodePng(flipped)).toEqual({ ok: false, message: PNG_DAMAGED });
    expect(decodePng(good.subarray(0, good.length - 30))).toEqual({ ok: false, message: PNG_DAMAGED });
    expect(decodePng(Buffer.from('not a png'))).toEqual({ ok: false, message: PNG_DAMAGED });
    expect(PNG_DAMAGED).toBe('This PNG is damaged and cannot be read.');
  });
});
