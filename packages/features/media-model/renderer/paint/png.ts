import type { PaintImage } from '@midnite/studio-shared';
import { unzlibSync, zlibSync } from 'three/examples/jsm/libs/fflate.module.js';

/**
 * A small PNG codec for texture painting in the renderer (Phase 104 Theme G). A canvas round trip would
 * premultiply alpha and lose a paint layer's colour wherever its coverage is low, so layer images are encoded
 * and decoded byte for byte here instead, on the zlib three already ships (`fflate`).
 *
 * Encode writes RGBA8 with filter 0 rows. Decode reads 8-bit grey, RGB, grey + alpha and RGBA, non-interlaced,
 * all five filters — what main's codec and this one write.
 */
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function encodePng(image: PaintImage): Uint8Array {
  const { width, height, data } = image;
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const row = width * 4;
  const raw = new Uint8Array((row + 1) * height);
  for (let y = 0; y < height; y += 1) raw.set(data.subarray(y * row, (y + 1) * row), y * (row + 1) + 1);
  const parts = [new Uint8Array(SIGNATURE), chunk('IHDR', header), chunk('IDAT', zlibSync(raw, { level: 6 })), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Decodes an 8-bit PNG to RGBA (grey and RGB become opaque). Throws a readable error for anything else. */
export function decodePng(bytes: Uint8Array): PaintImage {
  if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) throw new Error('not a PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colour = 0;
  const idat: Uint8Array[] = [];
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      const depth = body[8]!;
      colour = body[9]!;
      if (depth !== 8) throw new Error('only 8-bit PNGs are supported');
      if (body[12] !== 0) throw new Error('interlaced PNGs are not supported');
      if (![0, 2, 4, 6].includes(colour)) throw new Error('palette PNGs are not supported');
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (!width || !height) throw new Error('the PNG has no header');
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of idat) {
    joined.set(c, at);
    at += c.length;
  }
  const raw = unzlibSync(joined);
  const channels = colour === 0 ? 1 : colour === 2 ? 3 : colour === 4 ? 2 : 4;
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!;
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? out[x - channels]! : 0;
      const up = prev ? prev[x]! : 0;
      const upLeft = prev && x >= channels ? prev[x - channels]! : 0;
      const v = src[x]!;
      out[x] = (filter === 0 ? v : filter === 1 ? v + left : filter === 2 ? v + up : filter === 3 ? v + ((left + up) >> 1) : v + paeth(left, up, upLeft)) & 255;
    }
  }
  if (channels === 4) return { width, height, data: pixels };
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const g = pixels[i * channels]!;
    rgba[i * 4] = g;
    rgba[i * 4 + 1] = channels === 3 ? pixels[i * 3 + 1]! : g;
    rgba[i * 4 + 2] = channels === 3 ? pixels[i * 3 + 2]! : g;
    rgba[i * 4 + 3] = channels === 2 ? pixels[i * 2 + 1]! : 255;
  }
  return { width, height, data: rgba };
}
