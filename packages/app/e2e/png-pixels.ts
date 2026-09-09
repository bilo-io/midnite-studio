import zlib from 'node:zlib';

/** A decoded 8-bit RGBA raster. */
export type Raster = { width: number; height: number; data: Uint8Array };

/** RGBA at (x, y). */
export function pixelAt(raster: Raster, x: number, y: number): [number, number, number, number] {
  const i = (y * raster.width + x) * 4;
  return [raster.data[i]!, raster.data[i + 1]!, raster.data[i + 2]!, raster.data[i + 3]!];
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Minimal PNG decoder — enough for what Playwright's `page.screenshot()`
 * emits, which is always 8-bit, non-interlaced, colour type 6 (RGBA).
 *
 * Hand-rolled rather than pulled in: the workspace has no PNG library, and a
 * screenshot assertion that samples actual pixels is the only way to prove a
 * CSS glow paints — `getComputedStyle` reports the rule that matched, not
 * whether anything reached the framebuffer.
 *
 * Colour types 6 (RGBA) and 2 (RGB) are both handled: Playwright emits the
 * latter for a fully-opaque clip and the former when anything is transparent,
 * and which one you get is not something a caller should have to care about.
 */
export function decodePng(buffer: Buffer): Raster {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body.readUInt8(8);
      colorType = body.readUInt8(9);
      interlace = body.readUInt8(12);
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2) || interlace !== 0) {
    throw new Error(`unsupported PNG: depth=${bitDepth} color=${colorType} interlace=${interlace}`);
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const out = new Uint8Array(stride * height);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const rowIn = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const rowOut = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : undefined;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? rowOut[x - bpp]! : 0;
      const b = prev ? prev[x]! : 0;
      const c = prev && x >= bpp ? prev[x - bpp]! : 0;
      const value = rowIn[x]!;
      let recon: number;
      switch (filter) {
        case 0:
          recon = value;
          break;
        case 1:
          recon = value + a;
          break;
        case 2:
          recon = value + b;
          break;
        case 3:
          recon = value + ((a + b) >> 1);
          break;
        case 4:
          recon = value + paeth(a, b, c);
          break;
        default:
          throw new Error(`bad PNG filter ${filter}`);
      }
      rowOut[x] = recon & 0xff;
    }
  }

  if (bpp === 4) return { width, height, data: out };

  // Colour type 2 (RGB) — Playwright's own output for an opaque clip. Widen to
  // RGBA so callers only ever deal with one stride.
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < out.length; i += 3, j += 4) {
    rgba[j] = out[i]!;
    rgba[j + 1] = out[i + 1]!;
    rgba[j + 2] = out[i + 2]!;
    rgba[j + 3] = 255;
  }
  return { width, height, data: rgba };
}
