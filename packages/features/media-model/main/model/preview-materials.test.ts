import { inflateSync } from 'node:zlib';

import { buildScene, ModelSpecSchema } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { pngSize, renderPreviews } from './preview';

/** Decode our own 8-bit RGB, filter-0 PNG back to pixels. */
function decode(png: Buffer): { width: number; height: number; rgb: Uint8Array } {
  const size = pngSize(png)!;
  let at = 8;
  const idat: Buffer[] = [];
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    if (png.toString('ascii', at + 4, at + 8) === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = size.width * 3;
  const rgb = new Uint8Array(size.height * stride);
  for (let y = 0; y < size.height; y += 1) rgb.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), y * stride);
  return { ...size, rgb };
}

const scene = (parts: unknown[]) => buildScene(ModelSpecSchema.parse({ name: 't', parts }));
const BG = [244, 245, 247];
const painted = (img: ReturnType<typeof decode>): number => {
  let n = 0;
  for (let i = 0; i < img.rgb.length; i += 3) if (img.rgb[i] !== BG[0] || img.rgb[i + 1] !== BG[1] || img.rgb[i + 2] !== BG[2]) n += 1;
  return n;
};
const centre = (parts: unknown[], view: 'front' | 'iso' = 'front') => {
  const img = decode(renderPreviews(scene(parts), { views: [view], size: 128 })[0]!.png);
  return { img, mid: [...img.rgb.subarray((64 * 128 + 64) * 3, (64 * 128 + 64) * 3 + 3)] };
};

describe('model preview: new kinds, booleans and materials', () => {
  it.each([
    ['capsule', { shape: 'capsule', radius: 0.4, height: 1 }],
    ['roundedBox', { shape: 'roundedBox', size: [1, 1, 1], radius: 0.2 }],
    ['wedge', { shape: 'wedge', size: [1, 1, 1] }],
    ['prism', { shape: 'prism', radius: 0.5, height: 1, sides: 5 }],
    ['ellipsoid', { shape: 'ellipsoid', radii: [0.6, 0.3, 0.4] }],
    ['tube', { shape: 'tube', path: [[0, 0, 0], [0.5, 0.5, 0], [1, 0, 0]], radius: 0.1 }],
    ['sweep', { shape: 'sweep', profile: [[-0.1, -0.1], [0.1, -0.1], [0.1, 0.1], [-0.1, 0.1]], path: [[0, 0, 0], [0, 1, 0]] }],
    [
      'loft',
      {
        shape: 'loft',
        sections: [
          { y: 0, outline: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] },
          { y: 1, outline: [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]] },
        ],
      },
    ],
    ['mesh', { shape: 'mesh', vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], faces: [[0, 2, 1], [0, 1, 3], [1, 2, 3], [0, 3, 2]] }],
  ])('draws a %s', (_name, part) => {
    expect(painted(centre([{ ...part, color: '#cc3333' }], 'iso').img)).toBeGreaterThan(300);
  });

  it('shows a boolean: a hole drilled through a block lets the background through', () => {
    const solid = centre([{ id: 'b', shape: 'box', size: [2, 2, 2], color: '#3366cc' }]);
    const bored = centre([
      { id: 'b', shape: 'box', size: [2, 2, 2], color: '#3366cc' },
      { shape: 'cylinder', radiusTop: 0.5, radiusBottom: 0.5, height: 4, rotation: [90, 0, 0], op: 'subtract', target: 'b' },
    ]);
    expect(solid.mid).not.toEqual(BG);
    expect(bored.mid).toEqual(BG);
  });

  it('renders metal differently from matte, glow brighter, and glass see-through', () => {
    const base = { shape: 'sphere', radius: 1, color: '#886644' };
    const matte = centre([{ ...base, material: { metalness: 0, roughness: 0.9 } }]).mid;
    const metal = centre([{ ...base, material: { metalness: 1, roughness: 0.2 } }]).mid;
    expect(metal).not.toEqual(matte);
    const glow = centre([{ ...base, material: { emissive: '#ffffff', emissiveIntensity: 1 } }]).mid;
    expect(glow[0]! + glow[1]! + glow[2]!).toBeGreaterThan(matte[0]! + matte[1]! + matte[2]!);
    const behind = { shape: 'box', size: [0.5, 0.5, 0.5], position: [0, 0, -2], color: '#ff0000' };
    const opaque = centre([behind, { ...base, color: '#0000ff' }]).mid;
    const glass = centre([behind, { ...base, color: '#0000ff', material: { opacity: 0.3 } }]).mid;
    expect(glass[0]).toBeGreaterThan(opaque[0]!);
  });

  it('is deterministic with the new shading', () => {
    const parts = scene([{ shape: 'sphere', radius: 1, material: { metalness: 0.7, roughness: 0.3, opacity: 0.8 } }]);
    const a = renderPreviews(parts, { size: 128 });
    const b = renderPreviews(parts, { size: 128 });
    a.forEach((v, i) => expect(v.png.equals(b[i]!.png)).toBe(true));
  });
});
