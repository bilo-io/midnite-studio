import { deflateSync } from 'node:zlib';

import {
  MODEL_PREVIEW_SIZE_DEFAULT,
  MODEL_PREVIEW_SIZE_MAX,
  MODEL_PREVIEW_SIZE_MIN,
  MODEL_PREVIEW_VIEWS,
  previewCamera,
  type MeshPart,
  type AimView,
} from '@midnite/studio-shared';


/**
 * A small software renderer for `model_render_preview`: the design's meshes
 * (`buildScene`, the same triangles the `.obj`/`.fbx` are written from) drawn
 * orthographically from a named camera into a PNG.
 *
 * Why not render in the app's WebGL canvas? WebGL lives in the renderer, which
 * may have no window at all (an MCP session while the app is in the tray, a
 * hidden Models tab, a detached view) and whose output depends on the GPU, the
 * driver and the device pixel ratio. A round trip over IPC would also put a
 * live window on the critical path of every refinement. This renderer needs
 * nothing but the meshes: it is deterministic (pure float math, no GPU, no
 * clock, no randomness), bounded (≤ 768 px per view, 2×2 supersampled), and a
 * vitest can render a model and look at the pixels.
 *
 * Look: lambert shading with a head-light plus a key light, per-part colour, and a PBR approximation
 * (metalness tints a Blinn-Phong highlight and a sky/ground reflection, roughness widens it, emissive adds
 * glow, opacity blends over what is behind), a 1 px darker outline wherever the part or the depth changes — which
 * is what makes two same-coloured parts readable as two parts.
 */

type Vec = [number, number, number];

const SUPERSAMPLE = 2;
const BACKGROUND: Vec = [244, 245, 247];
const OUTLINE = 0.45;

const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: Vec): Vec => {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
};

export type RenderedView = { view: AimView; size: number; png: Buffer };

export const clampPreviewSize = (size: number | undefined): number =>
  Math.min(MODEL_PREVIEW_SIZE_MAX, Math.max(MODEL_PREVIEW_SIZE_MIN, Math.round(size ?? MODEL_PREVIEW_SIZE_DEFAULT)));

const hexToRgb = (hex: string): Vec => {
  const body = hex.replace('#', '');
  const full = body.length === 3 ? [...body].map((ch) => ch + ch).join('') : body;
  return [parseInt(full.slice(0, 2), 16) || 0, parseInt(full.slice(2, 4), 16) || 0, parseInt(full.slice(4, 6), 16) || 0];
};

/** Rasterise one camera into an RGB buffer of `size × size` pixels. */
export function renderView(parts: readonly MeshPart[], view: AimView, size: number): Uint8Array {
  const camera = previewCamera(parts, view, size);
  const big = size * SUPERSAMPLE;
  const color = new Uint8Array(big * big * 3);
  for (let i = 0; i < big * big; i += 1) color.set(BACKGROUND, i * 3);
  if (!camera) return downsample(color, size);
  const { forward, right, up, extent } = camera;
  const scale = camera.scale * SUPERSAMPLE;
  const offsetX = camera.offsetX * SUPERSAMPLE;
  const offsetY = camera.offsetY * SUPERSAMPLE;

  // Project every vertex once: screen x/y in model units, depth along `forward`.
  const projected = parts.map((part) => {
    const count = part.positions.length / 3;
    const xs = new Float32Array(count);
    const ys = new Float32Array(count);
    const zs = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const p: Vec = [part.positions[i * 3]!, part.positions[i * 3 + 1]!, part.positions[i * 3 + 2]!];
      xs[i] = dot(p, right);
      ys[i] = dot(p, up);
      zs[i] = dot(p, forward);
    }
    return { xs, ys, zs };
  });

  const depth = new Float32Array(big * big).fill(Infinity);
  const ids = new Uint16Array(big * big);

  // A head-light plus a key light from upper left, both fixed to the camera.
  const light = unit([
    -forward[0] * 0.6 + up[0] * 0.5 - right[0] * 0.4,
    -forward[1] * 0.6 + up[1] * 0.5 - right[1] * 0.4,
    -forward[2] * 0.6 + up[2] * 0.5 - right[2] * 0.4,
  ]);

  // Opaque parts first (they write depth), then see-through ones blended over them without writing depth.
  const order = parts.map((_, i) => i).sort((x, y) => Number(parts[x]!.material.opacity < 1) - Number(parts[y]!.material.opacity < 1) || x - y);
  const view3: Vec = [-forward[0], -forward[1], -forward[2]];
  const half = unit([light[0] + view3[0], light[1] + view3[1], light[2] + view3[2]]);
  for (const partIndex of order) {
    const part = parts[partIndex]!;
    const { xs, ys, zs } = projected[partIndex]!;
    const base = hexToRgb(part.color);
    const { metalness, roughness, opacity } = part.material;
    const glow = hexToRgb(part.material.emissive).map((c) => c * part.material.emissiveIntensity) as Vec;
    const shininess = 2 / (roughness * roughness + 0.02);
    // Dielectrics reflect ~4% white; metals reflect their own colour.
    const specColor = base.map((c) => (255 * 0.04 * (1 - metalness) + c * metalness) / 255) as Vec;
    const rgb = new Float32Array(xs.length * 3);
    for (let i = 0; i < xs.length; i += 1) {
      let n: Vec = [part.normals[i * 3]!, part.normals[i * 3 + 1]!, part.normals[i * 3 + 2]!];
      // Face the camera whatever the winding, so an open or inverted mesh is not drawn black.
      if (dot(n, forward) > 0) n = [-n[0], -n[1], -n[2]];
      const diffuse = (0.3 + 0.7 * Math.max(0, dot(n, light))) * (1 - 0.85 * metalness);
      const spec = Math.pow(Math.max(0, dot(n, half)), shininess) * (1 - roughness * 0.5);
      // A cheap sky/ground "environment" so a metal reads as reflective rather than dark.
      const nv = dot(n, view3);
      const reflectY = 2 * nv * n[1] - view3[1];
      const env = 0.5 + 0.5 * Math.max(-1, Math.min(1, reflectY));
      const envRgb: Vec = [90 + 110 * env, 85 + 130 * env, 80 + 155 * env];
      const envWeight = metalness * (1 - roughness * 0.6);
      for (let ch = 0; ch < 3; ch += 1) {
        rgb[i * 3 + ch] = Math.min(
          255,
          base[ch]! * diffuse + 255 * spec * specColor[ch]! * 0.7 + envRgb[ch]! * specColor[ch]! * envWeight * 0.8 + glow[ch]!,
        );
      }
    }

    for (let t = 0; t < part.indices.length; t += 3) {
      const a = part.indices[t]!;
      const b = part.indices[t + 1]!;
      const c = part.indices[t + 2]!;
      const ax = xs[a]! * scale + offsetX;
      const ay = offsetY - ys[a]! * scale;
      const bx = xs[b]! * scale + offsetX;
      const by = offsetY - ys[b]! * scale;
      const cx = xs[c]! * scale + offsetX;
      const cy = offsetY - ys[c]! * scale;
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(area) < 1e-9) continue;

      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const x1 = Math.min(big - 1, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
      const y1 = Math.min(big - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const px = x + 0.5;
          const py = y + 0.5;
          const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
          const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
          const z = w0 * zs[a]! + w1 * zs[b]! + w2 * zs[c]!;
          const at = y * big + x;
          if (z >= depth[at]!) continue;
          if (opacity >= 1) {
            depth[at] = z;
            ids[at] = partIndex + 1;
          }
          for (let ch = 0; ch < 3; ch += 1) {
            const lit = Math.min(255, w0 * rgb[a * 3 + ch]! + w1 * rgb[b * 3 + ch]! + w2 * rgb[c * 3 + ch]!);
            color[at * 3 + ch] = opacity >= 1 ? lit : color[at * 3 + ch]! * (1 - opacity) + lit * opacity;
          }
        }
      }
    }
  }

  // Outline where the part changes or the surface jumps in depth.
  const jump = extent * 0.02;
  const outlined = color.slice();
  for (let y = 0; y < big - 1; y += 1) {
    for (let x = 0; x < big - 1; x += 1) {
      const at = y * big + x;
      for (const next of [at + 1, at + big]) {
        const edge = ids[at] !== ids[next] || (ids[at] !== 0 && Math.abs(depth[at]! - depth[next]!) > jump);
        if (!edge) continue;
        // Darken the nearer side, so the outline hugs the silhouette from the inside.
        const target = ids[at] === 0 ? next : ids[next] === 0 ? at : depth[at]! <= depth[next]! ? at : next;
        if (ids[target] === 0) continue;
        for (let ch = 0; ch < 3; ch += 1) outlined[target * 3 + ch] = color[target * 3 + ch]! * OUTLINE;
      }
    }
  }
  return downsample(outlined, size);
}

/** Box-filter the supersampled buffer down to `size × size`. */
function downsample(big: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size * size * 3);
  const side = size * SUPERSAMPLE;
  const samples = SUPERSAMPLE * SUPERSAMPLE;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      for (let ch = 0; ch < 3; ch += 1) {
        let sum = 0;
        for (let dy = 0; dy < SUPERSAMPLE; dy += 1) {
          for (let dx = 0; dx < SUPERSAMPLE; dx += 1) sum += big[((y * SUPERSAMPLE + dy) * side + x * SUPERSAMPLE + dx) * 3 + ch]!;
        }
        out[(y * size + x) * 3 + ch] = Math.round(sum / samples);
      }
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** An 8-bit RGB PNG. */
export function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The requested views of a scene as PNGs, in request order, duplicates dropped. */
export function renderPreviews(
  parts: readonly MeshPart[],
  options: { views?: readonly AimView[] | undefined; size?: number | undefined } = {},
): RenderedView[] {
  const size = clampPreviewSize(options.size);
  const views = [...new Set(options.views ?? MODEL_PREVIEW_VIEWS)];
  return views.map((view) => ({ view, size, png: encodePng(size, size, renderView(parts, view, size)) }));
}

/** Decode-free check used by tests and the tool: the PNG signature and its IHDR size. */
export function pngSize(png: Buffer): { width: number; height: number } | null {
  if (png.length < 24 || png.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
