import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  chunkMesh,
  TERRAIN_CLASS_RGB,
  TERRAIN_CLASSES,
  type MeshPart,
  type TerrainPreviewView,
  type TerrainSpec,
} from '@midnite/studio-shared';

import { clampPreviewSize, encodePng, renderView } from '../model/preview';
import { decodePng } from '../png/png-codec';
import { loadBuilt, terrainMeshPart, type Built } from './terrain-export';

/**
 * The software renderer behind `terrain_render_preview` (Phase 105 Theme J, Decision 14). It needs no
 * window and no GPU, so an agent gets pictures while the app sits in the tray:
 *
 * - `top`, `landcover` and `roads` are 2-D rasters of the heightfield, hillshaded, with the drape (or
 *   a height ramp), the land-cover classes or the road graph on top. They are the tools for judging
 *   what is *where*.
 * - `oblique` and `horizon` reuse the Models renderer (`renderView`, iso and front) over the LOD-3
 *   mesh split into six height bands, each its own colour — `renderView` has no texture sampling, so
 *   bands are how relief reads. They are the tools for judging what it *looks like*.
 *
 * A layer the build does not have (no satellite, no roads) falls back to the height ramp and says so
 * in `note`, so the agent is never handed five identical pictures without being told why.
 */

type Rgb = [number, number, number];

const BANDS = 6;
/** Low to high: water-green, grass, scrub, rock, scree, snow. */
const RAMP: Rgb[] = [
  [58, 110, 120],
  [96, 150, 84],
  [156, 164, 92],
  [150, 118, 82],
  [140, 138, 140],
  [240, 242, 246],
];
const SUN: Rgb = (() => {
  const v: Rgb = [-0.55, 0.7, -0.45];
  const len = Math.hypot(...v);
  return [v[0] / len, v[1] / len, v[2] / len];
})();

function rampAt(t: number): Rgb {
  const x = Math.min(0.9999, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = RAMP[i]!;
  const b = RAMP[i + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

const clamp8 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

export type TerrainPreviewPicture = { view: TerrainPreviewView; png: Buffer; note?: string };

/** Shade and normalised height per output pixel, sampled from the heightfield. */
function hillshade(b: Built, range: readonly [number, number], size: number): { shade: Float32Array; t: Float32Array } {
  const { resolution: res, worldSize, heights } = b.field;
  const cell = worldSize / (res - 1);
  const span = range[1] - range[0] || 1;
  const shade = new Float32Array(size * size);
  const t = new Float32Array(size * size);
  const at = (x: number, z: number): number => heights[Math.max(0, Math.min(res - 1, z)) * res + Math.max(0, Math.min(res - 1, x))]!;
  for (let py = 0; py < size; py += 1) {
    const gz = Math.min(res - 1, Math.round(((py + 0.5) / size) * (res - 1)));
    for (let px = 0; px < size; px += 1) {
      const gx = Math.min(res - 1, Math.round(((px + 0.5) / size) * (res - 1)));
      const dx = (at(gx + 1, gz) - at(gx - 1, gz)) / (2 * cell);
      const dz = (at(gx, gz + 1) - at(gx, gz - 1)) / (2 * cell);
      const len = Math.hypot(dx, 1, dz);
      const lit = (-dx * SUN[0] + SUN[1] - dz * SUN[2]) / len;
      shade[py * size + px] = 0.45 + 0.75 * Math.max(0, lit);
      t[py * size + px] = (at(gx, gz) - range[0]) / span;
    }
  }
  return { shade, t };
}

function rasterRgb(size: number, pixel: (i: number, x: number, y: number) => Rgb): Uint8Array {
  const out = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const c = pixel(i, x, y);
      out[i * 3] = clamp8(c[0]);
      out[i * 3 + 1] = clamp8(c[1]);
      out[i * 3 + 2] = clamp8(c[2]);
    }
  }
  return out;
}

async function decodeFile(path: string) {
  const bytes = await readFile(path).catch(() => null);
  if (!bytes) return null;
  const decoded = decodePng(bytes);
  return decoded.ok ? decoded.image : null;
}

/** Stamps a filled disc of `radius` px, clipped to the raster. */
function disc(rgb: Uint8Array, size: number, cx: number, cy: number, radius: number, colour: Rgb): void {
  const r = Math.max(0.5, radius);
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(size - 1, Math.ceil(cy + r)); y += 1) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(size - 1, Math.ceil(cx + r)); x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      rgb.set(colour, (y * size + x) * 3);
    }
  }
}

function drawRoads(rgb: Uint8Array, size: number, b: Built): number {
  const roads = b.roads;
  if (!roads) return 0;
  const half = b.field.worldSize / 2;
  const toPx = (v: number): number => ((v + half) / b.field.worldSize) * size;
  let drawn = 0;
  for (const edge of roads.edges) {
    const radius = Math.max(1, ((edge.widthM / b.field.worldSize) * size) / 2);
    const colour: Rgb = edge.kind === 'avenue' ? [255, 120, 40] : edge.kind === 'street' ? [255, 190, 60] : [255, 235, 140];
    for (let i = 0; i + 1 < edge.points.length; i += 1) {
      const [ax, , az] = edge.points[i]!;
      const [bx, , bz] = edge.points[i + 1]!;
      const steps = Math.max(1, Math.ceil(Math.hypot(toPx(bx) - toPx(ax), toPx(bz) - toPx(az))));
      for (let s = 0; s <= steps; s += 1) disc(rgb, size, toPx(ax + ((bx - ax) * s) / steps), toPx(az + ((bz - az) * s) / steps), radius, colour);
    }
    drawn += 1;
  }
  return drawn;
}

/** The LOD-3 mesh as six height-band parts, so the relief reads without a texture. */
function bandParts(b: Built, range: readonly [number, number]): MeshPart[] {
  const acc = Array.from({ length: BANDS }, () => ({ positions: [] as number[], normals: [] as number[], indices: [] as number[] }));
  const span = range[1] - range[0] || 1;
  for (let cz = 0; cz < b.chunksPerSide; cz += 1) {
    for (let cx = 0; cx < b.chunksPerSide; cx += 1) {
      const m = chunkMesh(b.field, cx, cz, 3, range);
      for (let i = 0; i + 2 < m.indices.length; i += 3) {
        const tri = [m.indices[i]!, m.indices[i + 1]!, m.indices[i + 2]!];
        const meanY = (m.positions[tri[0]! * 3 + 1]! + m.positions[tri[1]! * 3 + 1]! + m.positions[tri[2]! * 3 + 1]!) / 3;
        const band = Math.max(0, Math.min(BANDS - 1, Math.floor(((meanY - range[0]) / span) * BANDS)));
        const into = acc[band]!;
        for (const v of tri) {
          into.indices.push(into.positions.length / 3);
          into.positions.push(m.positions[v * 3]!, m.positions[v * 3 + 1]!, m.positions[v * 3 + 2]!);
          into.normals.push(m.normals[v * 3]!, m.normals[v * 3 + 1]!, m.normals[v * 3 + 2]!);
        }
      }
    }
  }
  const hex = (c: Rgb): string => `#${c.map((v) => clamp8(v).toString(16).padStart(2, '0')).join('')}`;
  return acc
    .map((band, i) => (band.indices.length === 0 ? null : terrainMeshPart(`band_${i}`, hex(RAMP[i]!), band.positions, band.normals, band.indices)))
    .filter((part): part is MeshPart => part !== null);
}

export type RenderTerrainPreviewsArgs = { dir: string; spec: TerrainSpec; views: readonly TerrainPreviewView[]; size?: number | undefined };

/** The requested views, in request order with duplicates dropped; `null` when the terrain is not built. */
export async function renderTerrainPreviews({ dir, spec, views, size: wanted }: RenderTerrainPreviewsArgs): Promise<TerrainPreviewPicture[] | null> {
  const loaded = await loadBuilt(dir);
  if (!loaded.ok) return null;
  const b = loaded.value;
  const size = clampPreviewSize(wanted);
  const range: [number, number] = [spec.heightRange[0], spec.heightRange[1]];
  const out: TerrainPreviewPicture[] = [];
  let shaded: ReturnType<typeof hillshade> | null = null;
  const base = (): ReturnType<typeof hillshade> => (shaded ??= hillshade(b, range, size));

  for (const view of [...new Set(views)]) {
    if (view === 'oblique' || view === 'horizon') {
      const parts = bandParts(b, range);
      out.push({ view, png: encodePng(size, size, renderView(parts, view === 'oblique' ? 'iso' : 'front', size)) });
      continue;
    }
    const { shade, t } = base();
    if (view === 'top') {
      const drape = await decodeFile(join(b.build, 'drape.png'));
      const note = drape ? undefined : 'No satellite drape in this build — coloured by height.';
      const rgb = rasterRgb(size, (i, x, y) => {
        if (!drape) return rampAt(t[i]!).map((c) => c * shade[i]!) as Rgb;
        const sx = Math.min(drape.width - 1, Math.floor((x / size) * drape.width));
        const sy = Math.min(drape.height - 1, Math.floor((y / size) * drape.height));
        const from = (sy * drape.width + sx) * drape.channels;
        const max = drape.bitDepth === 16 ? 257 : 1;
        const px = (k: number): number => drape.data[from + (drape.channels >= 3 ? k : 0)]! / max;
        return [px(0) * shade[i]!, px(1) * shade[i]!, px(2) * shade[i]!];
      });
      out.push({ view, png: encodePng(size, size, rgb), ...(note ? { note } : {}) });
    } else if (view === 'landcover') {
      const cover = await decodeFile(join(b.build, 'landcover.png'));
      const note = cover ? undefined : 'No land cover in this build (it needs a satellite image) — coloured by height.';
      const rgb = rasterRgb(size, (i, x, y) => {
        if (!cover) return rampAt(t[i]!).map((c) => c * shade[i]!) as Rgb;
        const sx = Math.min(cover.width - 1, Math.floor((x / size) * cover.width));
        const sy = Math.min(cover.height - 1, Math.floor((y / size) * cover.height));
        const cls = TERRAIN_CLASSES[cover.data[(sy * cover.width + sx) * cover.channels]!] ?? 'other';
        const c = TERRAIN_CLASS_RGB[cls];
        const k = 0.55 + 0.45 * shade[i]!;
        return [c[0] * k, c[1] * k, c[2] * k];
      });
      out.push({ view, png: encodePng(size, size, rgb), ...(note ? { note } : {}) });
    } else {
      const rgb = rasterRgb(size, (i) => {
        const g = 90 + 110 * t[i]! * shade[i]!;
        return [g, g, g];
      });
      const drawn = drawRoads(rgb, size, b);
      out.push({ view, png: encodePng(size, size, rgb), ...(drawn === 0 ? { note: 'No roads in this build (attach a roads mask, then build) — greyscale height only.' } : {}) });
    }
  }
  return out;
}
