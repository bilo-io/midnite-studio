import type { z } from 'zod';

import type { SpritePerspective, SpriteRenderSettings } from '../media-sprite';
import { SpriteRenderSettingsSchema } from '../media-sprite';
import type { Mat4, Vec3 } from '../model-geometry/math';

/**
 * Phase 106 Theme E: the orthographic camera a Models character is rendered through.
 *
 * - **Directions are screen directions.** `s` faces the viewer, `e` faces screen-right, and the yaw of
 *   a direction is its compass angle: `s` 0°, `sw` 45°, `w` 90°, … `se` 315° — so direction `i` of an
 *   8-direction sheet is `i × 45°` and of a 4-direction one `i × 90°`, and a 1-direction side sheet
 *   (`e`) is 270°. `azimuthDeg` turns every direction by the same amount (45° lines `s` up with an
 *   isometric grid's axis instead of the screen's down).
 * - The model's front is `+z` (a Models rig's default `facing`). The camera orbits the model: at yaw 0
 *   it sits on `+z` looking back at the front; positive yaw swings it toward `+x`, which turns the
 *   model's front toward screen-left — the `w` direction at 90°.
 * - **Presets:** side 0°, top-down 60°, isometric `atan(0.5)` = 26.565° — the exact pixel 2:1 angle
 *   (the doc's "about 30°" would draw 1.73:1 tile edges). Every preset's azimuth is 0.
 *
 * Matrices are row-major 4×4 acting on column vectors, like the model-geometry kernel.
 */
export const SPRITE_ISOMETRIC_ELEVATION = (Math.atan(0.5) * 180) / Math.PI;

export const SPRITE_CAMERA_PRESETS = {
  side: { elevationDeg: 0, azimuthDeg: 0 },
  'top-down': { elevationDeg: 60, azimuthDeg: 0 },
  isometric: { elevationDeg: SPRITE_ISOMETRIC_ELEVATION, azimuthDeg: 0 },
} as const;

/** Compass yaw of each direction name. */
export const SPRITE_DIRECTION_YAW: Readonly<Record<string, number>> = { s: 0, sw: 45, w: 90, nw: 135, n: 180, ne: 225, e: 270, se: 315 };

/**
 * Extra yaw for a rig that does not face `+z`: the camera must sit in front of the model's own front
 * for `s` to face the viewer (`+x` → 90°, `-z` → 180°, `-x` → 270°).
 */
export const SPRITE_FACING_YAW: Readonly<Record<string, number>> = { '+z': 0, '+x': 90, '-z': 180, '-x': 270 };

/** The camera a perspective starts on. */
export function defaultSpriteCamera(perspective: SpritePerspective): SpriteRenderSettings['camera'] {
  return perspective === 'top-down' ? 'top-down' : perspective === 'isometric' ? 'isometric' : 'side';
}

/** The sheet's render settings with defaults filled and a preset's angles applied (custom keeps its own). */
export function resolveRenderSettings(spec: { render?: z.input<typeof SpriteRenderSettingsSchema> | undefined; targetPerspective: SpritePerspective }): SpriteRenderSettings {
  const settings = SpriteRenderSettingsSchema.parse(spec.render ?? { camera: defaultSpriteCamera(spec.targetPerspective) });
  if (settings.camera === 'custom') return settings;
  return { ...settings, ...SPRITE_CAMERA_PRESETS[settings.camera] };
}

/** The yaw (degrees) a direction is rendered at. */
export function spriteDirectionYaw(settings: Pick<SpriteRenderSettings, 'azimuthDeg'>, dir: string): number {
  return (SPRITE_DIRECTION_YAW[dir] ?? 0) + settings.azimuthDeg;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * The view matrix (world → camera) for one direction: `Rx(elevation) · Ry(−yaw)`. Rotation only — the
 * camera is orthographic, so where it sits along its axis does not matter, and {@link orthoFit} places
 * the frustum.
 */
export function spriteCameraMatrix(settings: Pick<SpriteRenderSettings, 'elevationDeg' | 'azimuthDeg'>, dir: string): Mat4 {
  const yaw = rad(spriteDirectionYaw(settings, dir));
  const el = rad(settings.elevationDeg);
  const [cy, sy] = [Math.cos(yaw), Math.sin(yaw)];
  const [ce, se] = [Math.cos(el), Math.sin(el)];
  // Ry(−yaw) = [[cy,0,−sy],[0,1,0],[sy,0,cy]]; Rx(el) = [[1,0,0],[0,ce,−se],[0,se,ce]].
  return [cy, 0, -sy, 0, -se * sy, ce, -se * cy, 0, ce * sy, se, ce * cy, 0, 0, 0, 0, 1];
}

/** Where the camera sits (unit vector from the target), for a renderer that positions a real camera. */
export function spriteCameraDirection(settings: Pick<SpriteRenderSettings, 'elevationDeg' | 'azimuthDeg'>, dir: string): Vec3 {
  const yaw = rad(spriteDirectionYaw(settings, dir));
  const el = rad(settings.elevationDeg);
  return [Math.cos(el) * Math.sin(yaw), Math.sin(el), Math.cos(el) * Math.cos(yaw)];
}

const project = (m: Mat4, p: Vec3): [number, number] => [m[0]! * p[0] + m[1]! * p[1] + m[2]! * p[2], m[4]! * p[0] + m[5]! * p[1] + m[6]! * p[2]];

export type SpriteBox = { min: Vec3; max: Vec3 };

const corners = (b: SpriteBox): Vec3[] => {
  const out: Vec3[] = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push([x, y, z]);
  return out;
};

/** One direction's orthographic frustum, in camera space (x right, y up). */
export type SpriteFrustum = { left: number; right: number; top: number; bottom: number };

export type SpriteOrthoFit = {
  /** World units per output pixel — the same for every direction and frame, so the sheet keeps one scale. */
  unitsPerPixel: number;
  /** Per direction, the frustum centred on everything the model covers in that view. */
  frusta: Record<string, SpriteFrustum>;
};

/** How much of the frame the widest view may fill, so nothing touches the edge (the frame pipeline then anchors it). */
export const SPRITE_RENDER_FILL = 0.9;

/**
 * One scale for the whole sheet: the bounds of every sampled pose, seen from every direction, fit
 * inside {@link SPRITE_RENDER_FILL} of the frame. Each direction's frustum is centred on its own
 * projected extent, so a wide attack clip shrinks the sheet uniformly rather than one frame.
 */
export function orthoFit(
  boxes: readonly SpriteBox[],
  views: Readonly<Record<string, Mat4>>,
  frameSize: readonly [number, number],
): SpriteOrthoFit {
  const [w, h] = frameSize;
  const extents: Record<string, { x0: number; x1: number; y0: number; y1: number }> = {};
  let need = 0;
  const points = boxes.flatMap(corners);
  for (const [dir, view] of Object.entries(views)) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of points) {
      const [x, y] = project(view, p);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    if (!Number.isFinite(x0)) x0 = x1 = y0 = y1 = 0;
    extents[dir] = { x0, x1, y0, y1 };
    need = Math.max(need, (x1 - x0) / (w * SPRITE_RENDER_FILL), (y1 - y0) / (h * SPRITE_RENDER_FILL));
  }
  const unitsPerPixel = need > 0 ? need : 1 / Math.max(w, h);
  const frusta: Record<string, SpriteFrustum> = {};
  for (const [dir, e] of Object.entries(extents)) {
    const cx = (e.x0 + e.x1) / 2;
    const cy = (e.y0 + e.y1) / 2;
    const hw = (w * unitsPerPixel) / 2;
    const hh = (h * unitsPerPixel) / 2;
    frusta[dir] = { left: cx - hw, right: cx + hw, top: cy + hh, bottom: cy - hh };
  }
  return { unitsPerPixel, frusta };
}

/** Projects a world point through a view and frustum to output pixels (x right, y down). */
export function spritePixelOf(view: Mat4, frustum: SpriteFrustum, frameSize: readonly [number, number], p: Vec3): [number, number] {
  const [x, y] = project(view, p);
  return [((x - frustum.left) / (frustum.right - frustum.left)) * frameSize[0], ((frustum.top - y) / (frustum.top - frustum.bottom)) * frameSize[1]];
}
