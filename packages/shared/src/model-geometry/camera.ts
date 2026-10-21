import type { Vec3 } from './math';
import type { MeshPart } from './scene';

/**
 * The preview camera, as data (Phase 104 Theme E). `model_render_preview` draws orthographic views fitted to
 * the scene's bounds; an agent that looked at one aims its brush by *pixel*. For the same pixels to hit the
 * same surface, the render and the aim must share one camera — this is it. `previewCamera` is what
 * `renderView` fits (the preview module calls it), and `pixelRay` inverts it.
 *
 * The camera is orthographic: every pixel is a ray along `forward`. Pixel `(0, 0)` is the image's top-left
 * corner and `x` runs right, `y` down, in the image's own pixels (not the renderer's 2× supersample).
 */

/** The four views `model_render_preview` renders. */
export const PREVIEW_CAMERA_VIEWS = ['front', 'side', 'top', 'iso'] as const;
export type PreviewCameraView = (typeof PREVIEW_CAMERA_VIEWS)[number];

/** The names a brush stroke may aim from: the four previews plus the three-quarter and opposite angles. */
export const AIM_VIEWS = ['front', 'back', 'left', 'right', 'side', 'top', 'iso', 'three_quarter'] as const;
export type AimView = (typeof AIM_VIEWS)[number];

const unit = (v: Vec3): Vec3 => {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
};
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Where each camera looks (forward = camera → model) and which way is up on screen. */
export const CAMERA_DIRECTIONS: Record<AimView, { forward: Vec3; up: Vec3 }> = {
  front: { forward: [0, 0, -1], up: [0, 1, 0] },
  /** Looks along -X: the model's +X side faces the camera. The preview calls it `side`. */
  side: { forward: [-1, 0, 0], up: [0, 1, 0] },
  right: { forward: [-1, 0, 0], up: [0, 1, 0] },
  left: { forward: [1, 0, 0], up: [0, 1, 0] },
  back: { forward: [0, 0, 1], up: [0, 1, 0] },
  top: { forward: [0, -1, 0], up: [0, 0, -1] },
  iso: { forward: unit([-1, -0.8, -1]), up: [0, 1, 0] },
  three_quarter: { forward: unit([-1, -0.8, -1]), up: [0, 1, 0] },
};

/** The preview's supersampling; the camera reports pixel units of the *output* image. */
export const PREVIEW_SUPERSAMPLE = 2;
/** Share of the image the model's longer extent fills. */
export const PREVIEW_FILL = 0.86;

export type PreviewCamera = {
  view: AimView;
  size: number;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
  /** Image pixels per model unit. */
  scale: number;
  /** Pixel of the screen origin (right = 0, up = 0). */
  offsetX: number;
  offsetY: number;
  /** The longer side of the model's screen-space bounds, in model units. */
  extent: number;
  /** The smallest depth (along `forward`) of any vertex — rays start just before it. */
  near: number;
};

/** Fits `view` to the parts exactly as `renderView` does, or `null` for an empty scene. */
export function previewCamera(parts: readonly Pick<MeshPart, 'positions'>[], view: AimView, size: number): PreviewCamera | null {
  const { forward, up: upHint } = CAMERA_DIRECTIONS[view];
  const right = unit(cross(forward, upHint));
  const up = cross(right, forward);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let near = Infinity;
  for (const part of parts) {
    for (let i = 0; i < part.positions.length; i += 3) {
      const p: Vec3 = [part.positions[i]!, part.positions[i + 1]!, part.positions[i + 2]!];
      const x = dot(p, right);
      const y = dot(p, up);
      const z = dot(p, forward);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < near) near = z;
    }
  }
  if (!Number.isFinite(minX)) return null;
  const big = size * PREVIEW_SUPERSAMPLE;
  const extent = Math.max(maxX - minX, maxY - minY, 1e-6);
  const scaleBig = (big * PREVIEW_FILL) / extent;
  const offsetXBig = big / 2 - ((minX + maxX) / 2) * scaleBig;
  const offsetYBig = big / 2 + ((minY + maxY) / 2) * scaleBig;
  return { view, size, forward, right, up, scale: scaleBig / PREVIEW_SUPERSAMPLE, offsetX: offsetXBig / PREVIEW_SUPERSAMPLE, offsetY: offsetYBig / PREVIEW_SUPERSAMPLE, extent, near };
}

/** The ray through image pixel `(px, py)` in world space: an origin just in front of the model and the view direction. */
export function pixelRay(camera: PreviewCamera, px: number, py: number): { origin: Vec3; dir: Vec3 } {
  const x = (px - camera.offsetX) / camera.scale;
  const y = (camera.offsetY - py) / camera.scale;
  const back = camera.near - 1;
  return {
    origin: [
      camera.right[0] * x + camera.up[0] * y + camera.forward[0] * back,
      camera.right[1] * x + camera.up[1] * y + camera.forward[1] * back,
      camera.right[2] * x + camera.up[2] * y + camera.forward[2] * back,
    ],
    dir: camera.forward,
  };
}

/** A world point's image pixel and its depth along `forward`. */
export function projectPoint(camera: PreviewCamera, p: Vec3): { x: number; y: number; depth: number } {
  return {
    x: dot(p, camera.right) * camera.scale + camera.offsetX,
    y: camera.offsetY - dot(p, camera.up) * camera.scale,
    depth: dot(p, camera.forward),
  };
}
