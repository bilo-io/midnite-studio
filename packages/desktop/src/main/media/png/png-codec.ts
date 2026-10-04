import { deflateSync, inflateSync } from 'node:zlib';

import type { RasterImage } from '@midnite/studio-shared';

/**
 * A small PNG codec on `node:zlib` — the only production PNG decoder in the tree, and the reason a
 * 16-bit heightmap keeps its 65 536 steps (Electron's `nativeImage` is 8-bit BGRA). It imports no
 * `electron`, so it runs in the `terrain-worker` utility process and under bare vitest.
 *
 * Decode: colour types 0 (grey), 2 (RGB), 3 (palette, 8-bit), 4 (grey + alpha) and 6 (RGBA) at 8 and
 * 16 bits, all five scanline filters. Interlaced and 1/2/4-bit images are refused with a readable
 * message. JPEG and WebP never reach here: they are transcoded to PNG once, at attach.
 */
export type DecodeResult = { ok: true; image: RasterImage } | { ok: false; message: string };

export const PNG_INTERLACED = 'Interlaced PNGs are not supported — re-save without interlacing.';
export const PNG_DAMAGED = 'This PNG is damaged and cannot be read.';
export const PNG_LOW_BIT_DEPTH = 'Low-bit-depth PNGs are not supported — re-save as 8- or 16-bit.';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// --- decode ------------------------------------------------------------------

const CHANNELS_BY_COLOUR_TYPE: Record<number, 1 | 2 | 3 | 4> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Reverses the five scanline filters in place; `bpp` is whole bytes per pixel (at least 1). */
function unfilter(raw: Uint8Array, width: number, height: number, bitsPerPixel: number): Uint8Array | null {
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  if (raw.length < (stride + 1) * height) return null;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const prev = dst - stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? out[dst + x - bpp]! : 0;
      const b = y > 0 ? out[prev + x]! : 0;
      const c = y > 0 && x >= bpp ? out[prev + x - bpp]! : 0;
      const v = raw[src + x]!;
      switch (filter) {
        case 0:
          out[dst + x] = v;
          break;
        case 1:
          out[dst + x] = (v + a) & 0xff;
          break;
        case 2:
          out[dst + x] = (v + b) & 0xff;
          break;
        case 3:
          out[dst + x] = (v + ((a + b) >> 1)) & 0xff;
          break;
        case 4:
          out[dst + x] = (v + paeth(a, b, c)) & 0xff;
          break;
        default:
          return null;
      }
    }
  }
  return out;
}

export function decodePng(bytes: Uint8Array): DecodeResult {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) return { ok: false, message: PNG_DAMAGED };
  let offset = 8;
  let header: { width: number; height: number; bitDepth: number; colourType: number; interlace: number } | null = null;
  let palette: Uint8Array | null = null;
  let paletteAlpha: Uint8Array | null = null;
  const idat: Buffer[] = [];
  let sawEnd = false;
  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buf.length) return { ok: false, message: PNG_DAMAGED };
    if (crc32(buf.subarray(offset + 4, dataEnd)) !== buf.readUInt32BE(dataEnd)) return { ok: false, message: PNG_DAMAGED };
    const data = buf.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      if (length !== 13) return { ok: false, message: PNG_DAMAGED };
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8]!,
        colourType: data[9]!,
        interlace: data[12]!,
      };
    } else if (type === 'PLTE') palette = new Uint8Array(data);
    else if (type === 'tRNS') paletteAlpha = new Uint8Array(data);
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') {
      sawEnd = true;
      break;
    }
    offset = dataEnd + 4;
  }
  if (!header || !sawEnd || idat.length === 0) return { ok: false, message: PNG_DAMAGED };
  if (header.interlace !== 0) return { ok: false, message: PNG_INTERLACED };
  const sampleChannels = CHANNELS_BY_COLOUR_TYPE[header.colourType];
  if (!sampleChannels || header.width < 1 || header.height < 1) return { ok: false, message: PNG_DAMAGED };
  if (header.bitDepth !== 8 && header.bitDepth !== 16) {
    return { ok: false, message: [1, 2, 4].includes(header.bitDepth) ? PNG_LOW_BIT_DEPTH : PNG_DAMAGED };
  }
  if (header.colourType === 3 && (header.bitDepth !== 8 || !palette)) {
    return { ok: false, message: header.bitDepth !== 8 ? PNG_LOW_BIT_DEPTH : PNG_DAMAGED };
  }
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return { ok: false, message: PNG_DAMAGED };
  }
  const { width, height, bitDepth } = header;
  const bitsPerPixel = sampleChannels * bitDepth;
  const pixels = unfilter(raw, width, height, bitsPerPixel);
  if (!pixels) return { ok: false, message: PNG_DAMAGED };

  if (header.colourType === 3) {
    // Expand the palette to RGB, or RGBA when a tRNS chunk carries alpha.
    const channels = paletteAlpha ? 4 : 3;
    const data = new Uint8Array(width * height * channels);
    for (let i = 0; i < width * height; i += 1) {
      const index = pixels[i]!;
      if (index * 3 + 2 >= palette!.length) return { ok: false, message: PNG_DAMAGED };
      data[i * channels] = palette![index * 3]!;
      data[i * channels + 1] = palette![index * 3 + 1]!;
      data[i * channels + 2] = palette![index * 3 + 2]!;
      if (channels === 4) data[i * 4 + 3] = paletteAlpha![index] ?? 255;
    }
    return { ok: true, image: { width, height, channels, bitDepth: 8, data } };
  }
  if (bitDepth === 8) return { ok: true, image: { width, height, channels: sampleChannels, bitDepth: 8, data: pixels } };
  const data = new Uint16Array(width * height * sampleChannels);
  for (let i = 0; i < data.length; i += 1) data[i] = (pixels[i * 2]! << 8) | pixels[i * 2 + 1]!;
  return { ok: true, image: { width, height, channels: sampleChannels, bitDepth: 16, data } };
}

// --- encode ------------------------------------------------------------------

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data.buffer, data.byteOffset, data.byteLength).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encode(width: number, height: number, bitDepth: 8 | 16, colourType: 0 | 6, rows: (y: number, row: Buffer) => void, rowBytes: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = bitDepth;
  header[9] = colourType;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (rowBytes + 1)] = 0;
    rows(y, raw.subarray(y * (rowBytes + 1) + 1, (y + 1) * (rowBytes + 1)));
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/** A 16-bit greyscale PNG (filter 0 rows, one IDAT) — how the heightfield is stored losslessly. */
export function encodePngGrey16(data: Uint16Array, width: number, height: number): Buffer {
  if (data.length !== width * height) throw new Error(`Expected ${width * height} samples, got ${data.length}.`);
  return encode(
    width,
    height,
    16,
    0,
    (y, row) => {
      for (let x = 0; x < width; x += 1) row.writeUInt16BE(data[y * width + x]!, x * 2);
    },
    width * 2,
  );
}

/** An RGBA8 PNG (filter 0 rows, one IDAT) — usable where `nativeImage` is not (a utility process). */
export function encodePngRgba8(data: Uint8Array, width: number, height: number): Buffer {
  if (data.length !== width * height * 4) throw new Error(`Expected ${width * height * 4} RGBA bytes, got ${data.length}.`);
  return encode(
    width,
    height,
    8,
    6,
    (y, row) => {
      row.set(data.subarray(y * width * 4, (y + 1) * width * 4));
    },
    width * 4,
  );
}
