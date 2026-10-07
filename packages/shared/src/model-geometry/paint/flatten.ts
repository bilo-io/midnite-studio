import { PBR_CHANNELS, PBR_OUTPUT_OF, type PaintTarget, type PbrChannel, type PbrLayer, type PbrNoise, type PbrOutput } from '../../media-model-pbr';
import { valueNoise } from '../sdf/evaluate';
import { blendComponent, clamp01, combineNormals, createPaintImage, decodeNormal, hexToUnit, sampleBilinear, sampleNearest, smoothstep, type PaintImage } from './image';
import type { PaintSurface } from './surface';

/**
 * Flattening a layer stack into glTF's texture set (Phase 104 Theme G).
 *
 * Each channel is composed texel by texel, bottom to top: the **base** (the part's colour and material, the
 * baked occlusion for `ao` and the baked normal map for `normal`), then every visible layer that touches the
 * channel — a fill layer that names it, or a paint layer with an image for it. A layer's weight is its opacity
 * × its mask × (for paint) the texel's coverage; the result is `base` blended toward `blend(base, value)` by
 * that weight. The normal channel ignores the blend mode and lays the layer's normal over what is below as a
 * whiteout detail blend, so slopes add and stay unit length.
 *
 * Masks come from a Theme F bake (`curvature` for convex edges — edge wear; `cavity` or `ao` for crevices —
 * dirt) through a smoothstep `low → high`, optionally inverted, or from a mask the layer paints itself
 * (`lerp(1, value, coverage)`, so an unpainted mask shows the whole layer). A mask whose bake is missing hides
 * its layer.
 *
 * Fill noise is evaluated in **object space** (the texel's surface point, from the texel map), so grain and
 * mottling run continuously across uv seams.
 */
export type PbrBase = { color: string; roughness: number; metalness: number; emissive: string; emissiveIntensity: number };
export type PbrBakes = { normal?: PaintImage; ao?: PaintImage; curvature?: PaintImage; cavity?: PaintImage };

export type FlattenInput = {
  sizes: Record<PbrChannel, number>;
  base: PbrBase;
  bakes: PbrBakes;
  layers: readonly PbrLayer[];
  /** A paint layer's image for a channel (or its painted mask), when it has one. */
  image: (layerId: string, target: PaintTarget) => PaintImage | undefined;
  /** For object-space fill noise; without it, noise runs in uv space. */
  surface?: PaintSurface | null;
};

/** A uv-space rectangle (0–1) to recompute; absent = the whole image. */
export type UvRect = { u0: number; v0: number; u1: number; v1: number };

const FILL_KEY: Record<PbrChannel, 'albedo' | 'roughness' | 'metalness' | 'ao' | 'emissive' | null> = {
  albedo: 'albedo',
  roughness: 'roughness',
  metalness: 'metalness',
  ao: 'ao',
  emissive: 'emissive',
  normal: null,
};

/** Whether a layer contributes to `channel`. */
export function layerTouches(layer: PbrLayer, channel: PbrChannel, image: FlattenInput['image']): boolean {
  if (layer.hidden) return false;
  if (layer.kind === 'fill') {
    const key = FILL_KEY[channel];
    return key !== null && layer.fill?.[key] !== undefined;
  }
  return image(layer.id, channel) !== undefined;
}

/** Whether a channel carries anything beyond the plain base (decides which optional outputs are written). */
export function channelInUse(input: FlattenInput, channel: PbrChannel): boolean {
  if (input.layers.some((layer) => layerTouches(layer, channel, input.image))) return true;
  if (channel === 'normal') return !!input.bakes.normal;
  if (channel === 'ao') return !!input.bakes.ao;
  if (channel === 'emissive') return input.base.emissive.toLowerCase() !== '#000000' && input.base.emissive.toLowerCase() !== '#000';
  return true;
}

function fbm(noise: PbrNoise, p: readonly number[]): number {
  const stretch = noise.stretch ?? [1, 1, 1];
  const x = p[0]! * noise.scale * stretch[0];
  const y = p[1]! * noise.scale * stretch[1];
  const z = p[2]! * noise.scale * stretch[2];
  const octaves = noise.octaves ?? 3;
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * valueNoise(x * f, y * f, z * f, (noise.seed ?? 0) + o * 101);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** The base value of a channel at uv, into `out` (three components). */
function baseValue(input: FlattenInput, channel: PbrChannel, u: number, v: number, out: number[], px: number[]): void {
  const { base, bakes } = input;
  switch (channel) {
    case 'albedo': {
      const c = hexToUnit(base.color);
      out[0] = c[0];
      out[1] = c[1];
      out[2] = c[2];
      return;
    }
    case 'roughness':
      out[0] = out[1] = out[2] = base.roughness;
      return;
    case 'metalness':
      out[0] = out[1] = out[2] = base.metalness;
      return;
    case 'ao': {
      const a = bakes.ao ? sampleBilinear(bakes.ao, u, v, px)[0]! : 1;
      out[0] = out[1] = out[2] = a;
      return;
    }
    case 'emissive': {
      const c = hexToUnit(base.emissive);
      const k = Math.min(1, base.emissiveIntensity);
      out[0] = c[0] * k;
      out[1] = c[1] * k;
      out[2] = c[2] * k;
      return;
    }
    case 'normal':
      if (bakes.normal) {
        sampleBilinear(bakes.normal, u, v, px);
        decodeNormal(px[0]!, px[1]!, px[2]!, out);
      } else {
        out[0] = 0;
        out[1] = 0;
        out[2] = 1;
      }
  }
}

/** A layer's mask at uv (0 hides, 1 shows). */
function maskValue(input: FlattenInput, layer: PbrLayer, u: number, v: number, px: number[]): number {
  const mask = layer.mask;
  if (!mask) return 1;
  let m: number;
  if (mask.source === 'painted') {
    const image = input.image(layer.id, 'mask');
    if (!image) return mask.invert ? 0 : 1;
    sampleBilinear(image, u, v, px);
    m = 1 + (px[0]! - 1) * px[3]!;
  } else {
    const bake = input.bakes[mask.source];
    if (!bake) return 0;
    m = smoothstep(mask.low ?? 0, mask.high ?? 1, sampleBilinear(bake, u, v, px)[0]!);
  }
  return mask.invert ? 1 - m : m;
}

/**
 * Composes one channel into `target` (made at the channel's size when absent), over `rect` or all of it.
 * Scalar channels write their value to RGB; every texel is opaque.
 */
export function flattenChannel(input: FlattenInput, channel: PbrChannel, target?: PaintImage, rect?: UvRect): PaintImage {
  const size = input.sizes[channel];
  const out = target ?? createPaintImage(size);
  const layers = input.layers.filter((layer) => layerTouches(layer, channel, input.image));
  const fillKey = FILL_KEY[channel];
  const needsPoint = layers.some((l) => l.kind === 'fill' && l.fill?.noise);
  const map = needsPoint && input.surface ? input.surface.texelMap(size) : null;
  const images = layers.map((l) => (l.kind === 'paint' ? input.image(l.id, channel) : undefined));
  const fills = layers.map((l): number[] | null => {
    if (l.kind !== 'fill' || fillKey === null) return null;
    const value = l.fill![fillKey]!;
    return typeof value === 'string' ? hexToUnit(value) : [value, value, value];
  });

  const x0 = rect ? Math.max(0, Math.floor(rect.u0 * size)) : 0;
  const x1 = rect ? Math.min(size - 1, Math.ceil(rect.u1 * size)) : size - 1;
  const y0 = rect ? Math.max(0, Math.floor(rect.v0 * size)) : 0;
  const y1 = rect ? Math.min(size - 1, Math.ceil(rect.v1 * size)) : size - 1;

  const value = [0, 0, 0];
  const layerValue = [0, 0, 0];
  const px = [0, 0, 0, 0];
  const point = [0, 0, 0];
  const bary = [0, 0, 0];
  const detail = [0, 0, 1];
  for (let y = y0; y <= y1; y += 1) {
    const v = (y + 0.5) / size;
    for (let x = x0; x <= x1; x += 1) {
      const u = (x + 0.5) / size;
      baseValue(input, channel, u, v, value, px);
      let havePoint = false;
      for (let li = 0; li < layers.length; li += 1) {
        const layer = layers[li]!;
        let weight = (layer.opacity ?? 1) * maskValue(input, layer, u, v, px);
        if (weight <= 0) continue;
        const fill = fills[li];
        if (fill) {
          layerValue[0] = fill[0]!;
          layerValue[1] = fill[1]!;
          layerValue[2] = fill[2]!;
          const noise = layer.fill?.noise;
          if (noise && noise.amount > 0) {
            if (!havePoint) {
              const t = map ? map.triangle[y * size + x]! : -1;
              if (t >= 0 && input.surface) {
                input.surface.barycentric(t, size, x, y, bary);
                input.surface.interpolate(input.surface.positions, t, bary, point);
              } else {
                point[0] = u;
                point[1] = v;
                point[2] = 0;
              }
              havePoint = true;
            }
            const n = fbm(noise, point) * noise.amount;
            if (channel === 'albedo' || channel === 'emissive') for (let k = 0; k < 3; k += 1) layerValue[k] = clamp01(layerValue[k]! * (1 + n));
            else for (let k = 0; k < 3; k += 1) layerValue[k] = clamp01(layerValue[k]! + n);
          }
        } else {
          const image = images[li];
          if (!image) continue;
          if (image.width === size) sampleNearest(image, u, v, px);
          else sampleBilinear(image, u, v, px);
          weight *= px[3]!;
          if (weight <= 0) continue;
          layerValue[0] = px[0]!;
          layerValue[1] = px[1]!;
          layerValue[2] = px[2]!;
        }
        if (channel === 'normal') {
          decodeNormal(layerValue[0]!, layerValue[1]!, layerValue[2]!, detail);
          combineNormals(value, detail, Math.min(1, weight), value);
          continue;
        }
        const mode = layer.blend ?? 'normal';
        for (let k = 0; k < 3; k += 1) value[k] = value[k]! + (blendComponent(mode, value[k]!, layerValue[k]!) - value[k]!) * weight;
      }
      const at = (y * size + x) * 4;
      if (channel === 'normal') {
        out.data[at] = Math.round((value[0]! * 0.5 + 0.5) * 255);
        out.data[at + 1] = Math.round((value[1]! * 0.5 + 0.5) * 255);
        out.data[at + 2] = Math.round((value[2]! * 0.5 + 0.5) * 255);
      } else {
        out.data[at] = Math.round(clamp01(value[0]!) * 255);
        out.data[at + 1] = Math.round(clamp01(value[1]!) * 255);
        out.data[at + 2] = Math.round(clamp01(value[2]!) * 255);
      }
      out.data[at + 3] = 255;
    }
  }
  return out;
}

/** The edge of the packed ORM image: the largest of its three channels. */
export const ormSize = (sizes: Record<PbrChannel, number>): number => Math.max(sizes.ao, sizes.roughness, sizes.metalness);

/** Packs R = occlusion, G = roughness, B = metalness into `out` over `rect` (uv) or all of it. */
export function packOrmInto(out: PaintImage, ao: PaintImage, roughness: PaintImage, metalness: PaintImage, rect?: UvRect): PaintImage {
  const size = out.width;
  const x0 = rect ? Math.max(0, Math.floor(rect.u0 * size)) : 0;
  const x1 = rect ? Math.min(size - 1, Math.ceil(rect.u1 * size)) : size - 1;
  const y0 = rect ? Math.max(0, Math.floor(rect.v0 * size)) : 0;
  const y1 = rect ? Math.min(size - 1, Math.ceil(rect.v1 * size)) : size - 1;
  const px = [0, 0, 0, 0];
  const read = (image: PaintImage, u: number, v: number): number => (image.width === size ? sampleNearest(image, u, v, px) : sampleBilinear(image, u, v, px))[0]!;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const at = (y * size + x) * 4;
      out.data[at] = Math.round(read(ao, u, v) * 255);
      out.data[at + 1] = Math.round(read(roughness, u, v) * 255);
      out.data[at + 2] = Math.round(read(metalness, u, v) * 255);
      out.data[at + 3] = 255;
    }
  }
  return out;
}

export type FlattenedSet = Partial<Record<PbrOutput, PaintImage>>;

/**
 * The export set for the outputs asked for (all by default). `normal` and `emissive` are left out when nothing
 * feeds them (no bake, no layer, a black emissive), so a plain painted part does not ship flat maps.
 */
export function flattenPbr(input: FlattenInput, outputs: ReadonlySet<PbrOutput> = new Set(['baseColor', 'orm', 'normal', 'emissive'])): FlattenedSet {
  const set: FlattenedSet = {};
  if (outputs.has('baseColor')) set.baseColor = flattenChannel(input, 'albedo');
  if (outputs.has('orm')) {
    const ao = flattenChannel(input, 'ao');
    const roughness = flattenChannel(input, 'roughness');
    const metalness = flattenChannel(input, 'metalness');
    set.orm = packOrmInto(createPaintImage(ormSize(input.sizes)), ao, roughness, metalness);
  }
  if (outputs.has('normal') && channelInUse(input, 'normal')) set.normal = flattenChannel(input, 'normal');
  if (outputs.has('emissive') && channelInUse(input, 'emissive')) set.emissive = flattenChannel(input, 'emissive');
  return set;
}

/** The outputs a change to these channels invalidates (a mask can gate any channel). */
export function outputsFor(channels: Iterable<PaintTarget>): Set<PbrOutput> {
  const out = new Set<PbrOutput>();
  for (const channel of channels) {
    if (channel === 'mask') for (const c of PBR_CHANNELS) out.add(PBR_OUTPUT_OF[c]);
    else out.add(PBR_OUTPUT_OF[channel]);
  }
  return out;
}
