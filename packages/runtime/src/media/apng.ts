import { crc32, encodePngRgba8 } from './png-codec';

/**
 * Animated PNG (Phase 106 Theme K): what `sprite_render_preview` hands an agent so it can see motion,
 * not just a contact sheet. APNG over GIF because a sprite has real alpha, and because the encoder is
 * almost free: each frame is an ordinary `encodePngRgba8` PNG whose IDAT data is lifted out and
 * re-wrapped — the first frame's as plain `IDAT` (so a viewer that ignores animation shows frame one),
 * the rest as `fdAT` with a sequence number — behind `acTL` and one `fcTL` per frame.
 *
 * Every frame is full-size at (0, 0), disposed to nothing and drawn with `APNG_BLEND_SOURCE`, so
 * transparent pixels stay transparent instead of compositing over the frame before.
 */
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const APNG_DISPOSE_NONE = 0;
const APNG_BLEND_SOURCE = 0;

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data.buffer, data.byteOffset, data.byteLength).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** The chunks of a PNG, in order. */
export function pngChunks(png: Uint8Array): Array<{ type: string; data: Buffer }> {
  const buf = Buffer.from(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Array<{ type: string; data: Buffer }> = [];
  for (let at = 8; at + 12 <= buf.length; ) {
    const length = buf.readUInt32BE(at);
    chunks.push({ type: buf.toString('ascii', at + 4, at + 8), data: buf.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return chunks;
}

export type ApngFrame = { data: Uint8Array; delayMs: number };

/** Frames of one size (RGBA, row-major) → an APNG that loops forever. */
export function encodeApng(frames: readonly ApngFrame[], width: number, height: number): Buffer {
  if (frames.length === 0) throw new Error('An animation needs at least one frame.');
  let sequence = 0;
  const parts: Buffer[] = [SIGNATURE];
  const fcTL = (delayMs: number): Buffer => {
    const data = Buffer.alloc(26);
    data.writeUInt32BE(sequence++, 0);
    data.writeUInt32BE(width, 4);
    data.writeUInt32BE(height, 8);
    data.writeUInt32BE(0, 12);
    data.writeUInt32BE(0, 16);
    // delay as a fraction: milliseconds over 1000
    data.writeUInt16BE(Math.max(1, Math.min(65535, Math.round(delayMs))), 20);
    data.writeUInt16BE(1000, 22);
    data.writeUInt8(APNG_DISPOSE_NONE, 24);
    data.writeUInt8(APNG_BLEND_SOURCE, 25);
    return chunk('fcTL', data);
  };
  frames.forEach((frame, i) => {
    const png = pngChunks(encodePngRgba8(frame.data instanceof Uint8Array ? frame.data : new Uint8Array(frame.data), width, height));
    const idat = png.filter((c) => c.type === 'IDAT').map((c) => c.data);
    if (i === 0) {
      parts.push(chunk('IHDR', png.find((c) => c.type === 'IHDR')!.data));
      const actl = Buffer.alloc(8);
      actl.writeUInt32BE(frames.length, 0);
      actl.writeUInt32BE(0, 4); // loop forever
      parts.push(chunk('acTL', actl));
      parts.push(fcTL(frame.delayMs));
      for (const data of idat) parts.push(chunk('IDAT', data));
    } else {
      parts.push(fcTL(frame.delayMs));
      for (const data of idat) {
        const fd = Buffer.alloc(4 + data.length);
        fd.writeUInt32BE(sequence++, 0);
        data.copy(fd, 4);
        parts.push(chunk('fdAT', fd));
      }
    }
  });
  parts.push(chunk('IEND', new Uint8Array(0)));
  return Buffer.concat(parts);
}
