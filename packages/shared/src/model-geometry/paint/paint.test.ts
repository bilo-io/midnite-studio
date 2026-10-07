import { describe, expect, it } from 'vitest';

import { ModelPbrSchema, type PbrChannel, type PbrLayer } from '../../media-model-pbr';
import { ModelSpecSchema, type ModelSculptPart } from '../../media-model';
import { PaintStroke, stampPattern } from './brushes';
import { channelInUse, flattenChannel, flattenPbr, packOrmInto, type FlattenInput } from './flatten';
import { PaintHistory } from './history';
import { blendComponent, combineNormals, createPaintImage, type PaintImage } from './image';
import { PBR_PRESET_STACKS } from './presets';
import { addPbrLayer, applyPbrPreset, freshLayerId, removePbrLayer, updatePbrLayer } from './stack';
import { PaintSurface } from './surface';

/** A unit square in the XY plane facing +z, uv = (x, 1 − y) (glTF's top-left origin), one chart. */
function plane(): PaintSurface {
  return new PaintSurface({
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    uvs: new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]),
  });
}

/**
 * The same square split along its diagonal into two uv islands with a gutter between them: the lower-right
 * triangle maps to the left half of the texture, the upper-left one to the right half.
 */
function splitPlane(): PaintSurface {
  return new PaintSurface({
    // Triangle A (0,0)-(1,0)-(1,1) and triangle B (0,0)-(1,1)-(0,1), vertices not shared.
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
    uvs: new Float32Array([0.05, 0.95, 0.45, 0.95, 0.45, 0.55, 0.55, 0.95, 0.95, 0.55, 0.55, 0.55]),
  });
}

const alphaAt = (image: PaintImage, x: number, y: number): number => image.data[(y * image.width + x) * 4 + 3]!;
const rgbAt = (image: PaintImage, x: number, y: number): number[] => [...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 3)];

function painted(image: PaintImage): { count: number; cx: number; cy: number } {
  let count = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (alphaAt(image, x, y) === 0) continue;
      count += 1;
      sx += x + 0.5;
      sy += y + 0.5;
    }
  }
  return { count, cx: count ? sx / count : NaN, cy: count ? sy / count : NaN };
}

const brush = (over: Partial<ConstructorParameters<typeof PaintStroke>[2]> = {}): ConstructorParameters<typeof PaintStroke>[2] => ({
  brush: 'brush',
  radius: 0.1,
  strength: 1,
  falloff: 'constant',
  spacing: 0.15,
  color: [1, 0, 0],
  ...over,
});

describe('paint brushes', () => {
  it('lands at the uv texels of a known hit', () => {
    const surface = plane();
    const image = createPaintImage(64);
    const stroke = new PaintStroke(surface, image, brush());
    // Point (0.25, 0.75) on the surface is uv (0.25, 0.25): texel (16, 16) at 64.
    stroke.to([0.25, 0.75, 0], [0, 0, -1]);
    const hit = painted(image);
    expect(hit.count).toBeGreaterThan(20);
    expect(hit.cx).toBeCloseTo(16, 0);
    expect(hit.cy).toBeCloseTo(16, 0);
    expect(rgbAt(image, 16, 16)).toEqual([255, 0, 0]);
    expect(alphaAt(image, 16, 16)).toBe(255);
    // Only within the radius (0.1 → 6.4 texels).
    expect(alphaAt(image, 16, 24)).toBe(0);
    expect(alphaAt(image, 48, 48)).toBe(0);
    expect(stroke.changed).toMatchObject({ x0: expect.any(Number) });
  });

  it('respects the falloff and strength', () => {
    const surface = plane();
    const image = createPaintImage(64);
    new PaintStroke(surface, image, brush({ falloff: 'linear', strength: 0.5, radius: 0.2 })).to([0.5, 0.5, 0], [0, 0, -1]);
    const centre = alphaAt(image, 32, 32);
    const rim = alphaAt(image, 32, 41);
    expect(centre).toBeGreaterThan(rim);
    expect(centre).toBeLessThanOrEqual(128);
  });

  it('skips faces that look away from the viewer when front faces only', () => {
    const surface = plane();
    const image = createPaintImage(32);
    new PaintStroke(surface, image, brush({ frontFacesOnly: true })).to([0.5, 0.5, 0], [0, 0, 1]);
    expect(painted(image).count).toBe(0);
  });

  it('bleeds across a uv seam into both charts and their gutters', () => {
    const surface = splitPlane();
    expect(surface.chartCount).toBe(2);
    const image = createPaintImage(64);
    // A dab on the diagonal reaches both triangles.
    new PaintStroke(surface, image, brush({ radius: 0.15 })).to([0.5, 0.5, 0], [0, 0, -1]);
    const map = surface.texelMap(64);
    let left = 0;
    let right = 0;
    let gutter = 0;
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        if (alphaAt(image, x, y) === 0) continue;
        if (x < 32) left += 1;
        else right += 1;
        if (!map.inside[y * 64 + x]) gutter += 1;
      }
    }
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
    expect(gutter).toBeGreaterThan(0);
  });

  it('erases coverage', () => {
    const surface = plane();
    const image = createPaintImage(32);
    new PaintStroke(surface, image, brush({ radius: 0.3 })).to([0.5, 0.5, 0], [0, 0, -1]);
    new PaintStroke(surface, image, brush({ brush: 'eraser', radius: 0.1 })).to([0.5, 0.5, 0], [0, 0, -1]);
    expect(alphaAt(image, 16, 16)).toBe(0);
    expect(alphaAt(image, 16, 9)).toBe(255);
  });

  it('fills only the chart under the hit', () => {
    const surface = splitPlane();
    const image = createPaintImage(64);
    // (0.8, 0.2) is in triangle A — the left island.
    new PaintStroke(surface, image, brush({ brush: 'fill' })).to([0.8, 0.2, 0], undefined);
    const map = surface.texelMap(64);
    let wrong = 0;
    let right = 0;
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const t = map.triangle[y * 64 + x]!;
        if (t === 0 && map.inside[y * 64 + x]) right += alphaAt(image, x, y) === 255 ? 1 : 0;
        if (t === 1 && alphaAt(image, x, y) > 0) wrong += 1;
      }
    }
    expect(right).toBeGreaterThan(100);
    expect(wrong).toBe(0);
  });

  it('smudges colour along a stroke', () => {
    const surface = plane();
    const image = createPaintImage(64);
    new PaintStroke(surface, image, brush({ radius: 0.12 })).to([0.2, 0.5, 0], [0, 0, -1]);
    const stroke = new PaintStroke(surface, image, brush({ brush: 'smudge', radius: 0.12, strength: 0.8, spacing: 0.1 }));
    stroke.to([0.2, 0.5, 0], [0, 0, -1]);
    stroke.to([0.6, 0.5, 0], [0, 0, -1]);
    // Red has been dragged right, past where it was painted.
    expect(alphaAt(image, Math.round(0.45 * 64), 32)).toBeGreaterThan(0);
    expect(rgbAt(image, Math.round(0.45 * 64), 32)[0]).toBeGreaterThan(200);
  });

  it('clones from an offset point, reading the image as it was when the stroke began', () => {
    const surface = plane();
    const image = createPaintImage(64);
    new PaintStroke(surface, image, brush({ radius: 0.08, color: [0, 0, 1] })).to([0.25, 0.5, 0], [0, 0, -1]);
    new PaintStroke(surface, image, brush({ brush: 'clone', radius: 0.06, cloneOffset: [-0.5, 0, 0] })).to([0.75, 0.5, 0], [0, 0, -1]);
    expect(rgbAt(image, 48, 32)).toEqual([0, 0, 255]);
    expect(alphaAt(image, 48, 32)).toBe(255);
  });

  it('stamps through an alpha image', () => {
    const surface = plane();
    const image = createPaintImage(128);
    new PaintStroke(surface, image, brush({ brush: 'stamp', radius: 0.4, stamp: stampPattern('dots', 64) })).to([0.5, 0.5, 0], [0, 0, -1]);
    const hit = painted(image).count;
    const full = createPaintImage(128);
    new PaintStroke(surface, full, brush({ radius: 0.4 })).to([0.5, 0.5, 0], [0, 0, -1]);
    // Dots cover part of the disc, not all of it and not none of it.
    expect(hit).toBeGreaterThan(50);
    expect(hit).toBeLessThan(painted(full).count * 0.8);
  });

  it('spaces dabs along a stroke', () => {
    const surface = plane();
    const image = createPaintImage(32);
    const stroke = new PaintStroke(surface, image, brush({ radius: 0.1, spacing: 0.5 }));
    stroke.to([0.1, 0.5, 0], [0, 0, -1]);
    stroke.to([0.9, 0.5, 0], [0, 0, -1]);
    // 0.8 travelled / 0.05 step = 16 more dabs.
    expect(stroke.dabs).toBe(17);
  });
});

describe('paint history', () => {
  it('undoes and redoes a stroke by tiles', () => {
    const surface = plane();
    const image = createPaintImage(128);
    const history = new PaintHistory();
    history.begin('brush');
    const stroke = new PaintStroke(surface, image, brush({ radius: 0.2 }), (rect) => history.touch('a:albedo', image, rect));
    stroke.to([0.5, 0.5, 0], [0, 0, -1]);
    expect(history.commit()).toBe(true);
    const after = image.data.slice();
    expect(history.undo(() => image)).toEqual(['a:albedo']);
    expect(image.data.every((v) => v === 0)).toBe(true);
    history.redo(() => image);
    expect(image.data).toEqual(after);
    expect(history.depth).toEqual({ undo: 1, redo: 0 });
  });

  it('records nothing for a stroke that touched nothing', () => {
    const history = new PaintHistory();
    history.begin('brush');
    expect(history.commit()).toBe(false);
    expect(history.canUndo).toBe(false);
  });
});

describe('blending', () => {
  it('computes each blend mode', () => {
    expect(blendComponent('normal', 0.2, 0.6)).toBeCloseTo(0.6);
    expect(blendComponent('multiply', 0.5, 0.5)).toBeCloseTo(0.25);
    expect(blendComponent('screen', 0.5, 0.5)).toBeCloseTo(0.75);
    expect(blendComponent('overlay', 0.25, 0.5)).toBeCloseTo(0.25);
    expect(blendComponent('overlay', 0.75, 0.5)).toBeCloseTo(0.75);
    expect(blendComponent('add', 0.7, 0.6)).toBe(1);
    expect(blendComponent('subtract', 0.3, 0.6)).toBe(0);
    expect(blendComponent('darken', 0.3, 0.6)).toBeCloseTo(0.3);
    expect(blendComponent('lighten', 0.3, 0.6)).toBeCloseTo(0.6);
  });

  it('combines normals as a detail blend', () => {
    const tilted = [Math.sin(0.3), 0, Math.cos(0.3)];
    expect(combineNormals([0, 0, 1], tilted, 1).map((v) => Number(v.toFixed(4)))).toEqual(tilted.map((v) => Number(v.toFixed(4))));
    expect(combineNormals(tilted, [0, 0, 1], 1).map((v) => Number(v.toFixed(4)))).toEqual(tilted.map((v) => Number(v.toFixed(4))));
    expect(combineNormals(tilted, [0.6, 0, 0.8], 0)[0]).toBeCloseTo(tilted[0]!);
    const both = combineNormals(tilted, tilted, 1);
    expect(both[0]).toBeGreaterThan(tilted[0]!);
    expect(Math.hypot(...both)).toBeCloseTo(1);
  });
});

const sizes = (n: number): Record<PbrChannel, number> => ({ albedo: n, roughness: n, metalness: n, normal: n, ao: n, emissive: n });
const flat = (n: number, value: number): PaintImage => {
  const image = createPaintImage(n);
  for (let i = 0; i < n * n; i += 1) image.data.set([value, value, value, 255], i * 4);
  return image;
};

function input(layers: PbrLayer[], over: Partial<FlattenInput> = {}): FlattenInput {
  return {
    sizes: sizes(8),
    base: { color: '#808080', roughness: 0.5, metalness: 0, emissive: '#000000', emissiveIntensity: 1 },
    bakes: {},
    layers,
    image: () => undefined,
    ...over,
  };
}

describe('flattening', () => {
  it('starts from the part colour and material', () => {
    const albedo = flattenChannel(input([]), 'albedo');
    expect(rgbAt(albedo, 3, 3)).toEqual([128, 128, 128]);
    expect(rgbAt(flattenChannel(input([]), 'roughness'), 0, 0)).toEqual([128, 128, 128]);
  });

  it('blends a fill by opacity and mode', () => {
    const half = flattenChannel(input([{ id: 'a', name: 'A', kind: 'fill', opacity: 0.5, fill: { albedo: '#ffffff' } }]), 'albedo');
    expect(rgbAt(half, 0, 0)[0]).toBe(Math.round(((128 + 255) / 2 / 255) * 255));
    const multiply = flattenChannel(input([{ id: 'a', name: 'A', kind: 'fill', blend: 'multiply', fill: { albedo: '#808080' } }]), 'albedo');
    expect(rgbAt(multiply, 0, 0)[0]).toBe(Math.round((128 / 255) * (128 / 255) * 255));
    // A fill that names no albedo leaves albedo alone.
    expect(rgbAt(flattenChannel(input([{ id: 'a', name: 'A', kind: 'fill', fill: { roughness: 1 } }]), 'albedo'), 0, 0)).toEqual([128, 128, 128]);
  });

  it('weights a paint layer by its coverage', () => {
    const paint = createPaintImage(8);
    paint.data.set([255, 0, 0, 255], 0);
    paint.data.set([255, 0, 0, 0], 4);
    const out = flattenChannel(input([{ id: 'p', name: 'P', kind: 'paint' }], { image: (id, c) => (id === 'p' && c === 'albedo' ? paint : undefined) }), 'albedo');
    expect(rgbAt(out, 0, 0)).toEqual([255, 0, 0]);
    expect(rgbAt(out, 1, 0)).toEqual([128, 128, 128]);
  });

  it('masks a layer by a bake, inverted and smoothstepped', () => {
    const curvature = createPaintImage(8);
    for (let i = 0; i < 64; i += 1) curvature.data.set(i < 32 ? [230, 230, 230, 255] : [128, 128, 128, 255], i * 4);
    const wear: PbrLayer = { id: 'w', name: 'Wear', kind: 'fill', fill: { albedo: '#ffffff' }, mask: { source: 'curvature', low: 0.6, high: 0.7 } };
    const out = flattenChannel(input([wear], { bakes: { curvature } }), 'albedo');
    expect(rgbAt(out, 0, 0)).toEqual([255, 255, 255]); // convex: worn
    expect(rgbAt(out, 0, 7)).toEqual([128, 128, 128]); // flat: untouched
    const inverted = flattenChannel(input([{ ...wear, mask: { ...wear.mask!, invert: true } }], { bakes: { curvature } }), 'albedo');
    expect(rgbAt(inverted, 0, 0)).toEqual([128, 128, 128]);
    // Without the bake the masked layer hides.
    expect(rgbAt(flattenChannel(input([wear]), 'albedo'), 0, 0)).toEqual([128, 128, 128]);
  });

  it('masks by a painted mask', () => {
    const mask = createPaintImage(8);
    mask.data.set([0, 0, 0, 255], 0); // painted black: hidden
    const layer: PbrLayer = { id: 'm', name: 'M', kind: 'fill', fill: { albedo: '#ffffff' }, mask: { source: 'painted' } };
    const out = flattenChannel(input([layer], { image: (id, c) => (id === 'm' && c === 'mask' ? mask : undefined) }), 'albedo');
    expect(rgbAt(out, 0, 0)).toEqual([128, 128, 128]);
    expect(rgbAt(out, 1, 0)).toEqual([255, 255, 255]);
  });

  it('starts occlusion and normals from the bakes', () => {
    const ao = flat(8, 100);
    expect(rgbAt(flattenChannel(input([], { bakes: { ao } }), 'ao'), 2, 2)).toEqual([100, 100, 100]);
    const normal = createPaintImage(8);
    for (let i = 0; i < 64; i += 1) normal.data.set([128, 128, 255, 255], i * 4);
    const n = rgbAt(flattenChannel(input([], { bakes: { normal } }), 'normal'), 0, 0);
    expect(n[2]).toBe(255);
  });

  it('packs occlusion, roughness and metalness into one ORM image', () => {
    const out = packOrmInto(createPaintImage(8), flat(8, 10), flat(4, 20), flat(8, 30));
    expect([...out.data.subarray(0, 4)]).toEqual([10, 20, 30, 255]);
    const set = flattenPbr(input([{ id: 'm', name: 'M', kind: 'fill', fill: { metalness: 1, roughness: 0.2 } }], { bakes: { ao: flat(8, 200) } }));
    expect([...set.orm!.data.subarray(0, 4)]).toEqual([200, 51, 255, 255]);
    // Nothing feeds normal or emissive, so neither is written.
    expect(set.normal).toBeUndefined();
    expect(set.emissive).toBeUndefined();
    expect(channelInUse(input([], { base: { color: '#fff', roughness: 1, metalness: 0, emissive: '#ff0000', emissiveIntensity: 1 } }), 'emissive')).toBe(true);
  });

  it('varies a noisy fill in object space', () => {
    const surface = plane();
    const layer: PbrLayer = { id: 'n', name: 'N', kind: 'fill', fill: { roughness: 0.5, noise: { scale: 10, amount: 0.4 } } };
    const out = flattenChannel(input([layer], { surface, sizes: sizes(32) }), 'roughness');
    const values = new Set<number>();
    for (let i = 0; i < 32 * 32; i += 1) values.add(out.data[i * 4]!);
    expect(values.size).toBeGreaterThan(10);
  });
});

describe('the layer stack', () => {
  it('adds, updates, moves and removes layers', () => {
    const added = addPbrLayer(undefined, { kind: 'fill', name: 'Base', fill: { albedo: '#ff0000' } });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const two = addPbrLayer(added.value.pbr, { kind: 'paint' });
    expect(two.ok && two.value.layer.id).toBe('paint');
    if (!two.ok) return;
    expect(freshLayerId(two.value.pbr, 'paint')).toBe('paint-2');
    const moved = updatePbrLayer(two.value.pbr, 'paint', { index: 0, opacity: 0.5, blend: 'multiply' });
    expect(moved.ok && moved.value.layers.map((l) => l.id)).toEqual(['paint', 'base']);
    const fill = updatePbrLayer(two.value.pbr, 'Base', { fill: { albedo: null, roughness: 0.3 } });
    expect(fill.ok && fill.value.layers[0]!.fill).toEqual({ roughness: 0.3 });
    expect(updatePbrLayer(two.value.pbr, 'Base', { fill: { albedo: null } }).ok).toBe(false);
    expect(updatePbrLayer(two.value.pbr, 'nope', {}).ok).toBe(false);
    const removed = removePbrLayer(two.value.pbr, 'base');
    expect(removed.ok && removed.value.pbr.layers.map((l) => l.id)).toEqual(['paint']);
    expect(addPbrLayer(undefined, { kind: 'fill' }).ok).toBe(false);
  });

  it('applies every preset as a valid stack', () => {
    const spec = ModelSpecSchema.parse({
      name: 't',
      parts: [{ id: 's', name: 'S', shape: 'sculpt', src: 'a.s.mesh.bin', hash: 'abcdef12' }],
    });
    const part = spec.parts[0] as ModelSculptPart;
    for (const name of Object.keys(PBR_PRESET_STACKS) as (keyof typeof PBR_PRESET_STACKS)[]) {
      const next = applyPbrPreset({ ...part, pbr: { layers: [{ id: 'dirt', name: 'Mine', kind: 'paint' }] } }, name, { keepPaint: true });
      expect(ModelPbrSchema.safeParse(next.pbr).success).toBe(true);
      expect(next.pbr!.preset).toBe(name);
      expect(next.pbr!.layers.at(-1)!.name).toBe('Mine');
      expect(next.color).toBe(PBR_PRESET_STACKS[name].color);
    }
  });
});
