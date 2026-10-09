// @ts-check
/**
 * Midnite game kit — a small PNG decoder that keeps 16-bit samples
 * (engine-free; runs in the browser and in Node 22).
 *
 * The terrain pack's `heightfield.png` is 16-bit greyscale. A browser's own
 * decoders (`<img>`, `createImageBitmap`, a canvas) quantise to 8 bits, which
 * would turn 65 536 height steps into 256 terraces, so the kit decodes it
 * itself: parse the chunks, inflate IDAT with `DecompressionStream('deflate')`
 * and undo the per-row filters. Greyscale and greyscale+alpha at 8 or 16 bits,
 * non-interlaced — what Midnite Studio writes.
 */

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/**
 * @typedef {{ width: number, height: number, bitDepth: 8 | 16, channels: number, data: Uint16Array | Uint8Array }} DecodedPng
 */

/** @param {Uint8Array} bytes */
async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** @param {number} a @param {number} b @param {number} c */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Decode a greyscale PNG. `data` holds `width × height × channels` samples,
 * row-major from the top row: a `Uint16Array` for 16-bit images (PNG's
 * big-endian bytes already swapped), else a `Uint8Array`.
 * @param {ArrayBuffer | Uint8Array} input
 * @returns {Promise<DecodedPng>}
 */
export async function decodePng16(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) throw new Error('Not a PNG file.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  /** @type {Uint8Array[]} */
  const idat = [];
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      bitDepth = body[8] ?? 0;
      colorType = body[9] ?? 0;
      if ((body[12] ?? 0) !== 0) throw new Error('Interlaced PNGs are not supported.');
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (colorType !== 0 && colorType !== 4) throw new Error('Only greyscale PNGs are supported here.');
  if (bitDepth !== 8 && bitDepth !== 16) throw new Error('Only 8- and 16-bit PNGs are supported here.');
  const channels = colorType === 4 ? 2 : 1;
  const bytesPerSample = bitDepth / 8;
  const bpp = channels * bytesPerSample;
  const stride = width * bpp;

  const total = idat.reduce((n, part) => n + part.length, 0);
  const joined = new Uint8Array(total);
  let at = 0;
  for (const part of idat) {
    joined.set(part, at);
    at += part.length;
  }
  const raw = await inflate(joined);
  if (raw.length < height * (stride + 1)) throw new Error('This PNG is damaged and cannot be read.');

  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const prev = dst - stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[src + x] ?? 0;
      const a = x >= bpp ? (out[dst + x - bpp] ?? 0) : 0;
      const b = y > 0 ? (out[prev + x] ?? 0) : 0;
      const c = y > 0 && x >= bpp ? (out[prev + x - bpp] ?? 0) : 0;
      let recon;
      switch (filter) {
        case 0: recon = value; break;
        case 1: recon = value + a; break;
        case 2: recon = value + b; break;
        case 3: recon = value + ((a + b) >> 1); break;
        case 4: recon = value + paeth(a, b, c); break;
        default: throw new Error(`This PNG is damaged and cannot be read (filter ${filter}).`);
      }
      out[dst + x] = recon & 0xff;
    }
  }

  if (bitDepth === 8) return { width, height, bitDepth: 8, channels, data: out };
  const data = new Uint16Array(width * height * channels);
  for (let i = 0; i < data.length; i += 1) data[i] = ((out[i * 2] ?? 0) << 8) | (out[i * 2 + 1] ?? 0);
  return { width, height, bitDepth: 16, channels, data };
}
