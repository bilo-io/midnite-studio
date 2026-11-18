/**
 * Camera poses for `game_level_view` (Phase 138 Theme H): pure, no three. A preset or an explicit camera becomes a
 * position, a target and a field of view, in world metres.
 */
import type { LevelViewCamera } from '@midnite/studio-shared';

import { cameraPosition, distanceFor, orbitPose, ORBIT_FOV, type Vec3 } from './camera-transition';

export type WorldBox = { min: Vec3; max: Vec3 };

/** Room left round the level in a `top` or `iso` picture. */
export const CAPTURE_MARGIN = 1.15;

export const boxCentre = (box: WorldBox): Vec3 => [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
const sizeOf = (box: WorldBox): Vec3 => [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];

/** The span (metres of ground in view) `F` frames a box with: four times its largest side, at least eight metres. */
export const framingSpan = (box: WorldBox): number => {
  const s = sizeOf(box);
  return Math.max(s[0], s[1], s[2], 2) * 4;
};

/** The box of the whole level: its ground bounds, as tall as its tallest item. */
export function levelWorldBox(
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
  ground: number,
  items: ReadonlyArray<{ position: Vec3; size: Vec3 }>,
): WorldBox {
  const top = items.reduce((m, i) => Math.max(m, i.position[1] + i.size[1]), ground + 1);
  return { min: [bounds.minX, ground, bounds.minZ], max: [bounds.maxX, top, bounds.maxZ] };
}

/** Straight down over `box`, near enough to fill the picture. The tiny Z offset keeps "up" on the screen pointing north. */
export function topPose(box: WorldBox, aspect: number, fov = ORBIT_FOV): LevelViewCamera {
  const c = boxCentre(box), s = sizeOf(box);
  const span = Math.max(s[2], s[0] / Math.max(aspect, 0.1), 1) * CAPTURE_MARGIN;
  const height = distanceFor(span, fov);
  return { position: [c[0], box.min[1] + height, c[2] + 1e-3], target: [c[0], box.min[1], c[2]], fov };
}

/** 45 degrees round, 35 degrees up, far enough back that the whole `box` is in the picture. */
export function isoPose(box: WorldBox, aspect: number, fov = ORBIT_FOV): LevelViewCamera {
  const c = boxCentre(box), s = sizeOf(box);
  const reach = Math.hypot(s[0], s[1], s[2]) * CAPTURE_MARGIN;
  const span = reach / Math.min(1, Math.max(aspect, 0.1));
  const pose = { target: c, span, pitch: (35 * Math.PI) / 180, yaw: Math.PI / 4, fov };
  return { position: cameraPosition(pose), target: c, fov };
}

/** The editor's `F` framing over a selection: the orbit pose four times its largest side back. */
export function selectionPose(box: WorldBox): LevelViewCamera {
  const c = boxCentre(box);
  const pose = orbitPose(c, framingSpan(box));
  return { position: cameraPosition(pose), target: c, fov: pose.fov };
}

/** The pose a request asks for: its explicit camera, else the preset over `level` (or `selection`), else `null` (the live camera). */
export function capturePose(
  req: { preset: 'top' | 'iso' | 'selection' | 'current'; camera?: LevelViewCamera | undefined; width: number; height: number },
  level: WorldBox,
  selection: WorldBox | null,
): LevelViewCamera | null {
  if (req.camera) return { ...req.camera, fov: req.camera.fov ?? ORBIT_FOV };
  const aspect = req.width / Math.max(1, req.height);
  switch (req.preset) {
    case 'top':
      return topPose(level, aspect);
    case 'iso':
      return isoPose(level, aspect);
    case 'selection':
      return selectionPose(selection ?? level);
    case 'current':
      return null;
  }
}
