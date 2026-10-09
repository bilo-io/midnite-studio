/**
 * Decoded raster images, as the terrain kernel consumes them. Pure typed arrays: image *decode* lives
 * in desktop main (`main/media/png/png-codec.ts`); this file only reduces a decoded raster to samples.
 */
export type RasterImage = {
  width: number;
  height: number;
  channels: 1 | 2 | 3 | 4;
  bitDepth: 8 | 16;
  /** Row-major, channel-interleaved. 16-bit data is a `Uint16Array` in host order. */
  data: Uint8Array | Uint16Array;
};

export const RASTER_8BIT_WARNING = '8-bit heightmap: expect visible terracing. Pre-smooth is on.';

/**
 * A heightmap's samples as `[0, 1]` floats, one per pixel. Grey (and grey + alpha) is used as-is;
 * RGB and RGBA are reduced with Rec. 709 luma. Alpha is ignored.
 */
export function toHeightSamples(image: RasterImage): { samples: Float32Array; warnings: string[] } {
  const { width, height, channels, bitDepth, data } = image;
  const max = bitDepth === 16 ? 65535 : 255;
  const count = width * height;
  const samples = new Float32Array(count);
  const warnings: string[] = [];
  const rgb = channels >= 3;
  for (let i = 0; i < count; i += 1) {
    const base = i * channels;
    const v = rgb ? 0.2126 * data[base]! + 0.7152 * data[base + 1]! + 0.0722 * data[base + 2]! : data[base]!;
    samples[i] = v / max;
  }
  if (bitDepth === 8) warnings.push(RASTER_8BIT_WARNING);
  return { samples, warnings };
}
