import { encodePngRgba8 } from '@midnite/studio-runtime';

/** A deterministic noisy RGBA image: noise does not compress, so a big one is a big file. */
export function noisyPng(width: number, height: number): Buffer {
  const data = new Uint8Array(width * height * 4);
  let s = 12345;
  for (let i = 0; i < data.length; i += 1) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    data[i] = i % 4 === 3 ? 255 : s >>> 24;
  }
  return encodePngRgba8(data, width, height);
}
