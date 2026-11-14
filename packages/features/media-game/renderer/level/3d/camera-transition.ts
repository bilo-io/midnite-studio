/**
 * The Floorplan ↔ 3D camera (Phase 136 Theme E). The plan is a straight-down view through a very narrow lens from
 * far away (near-orthographic); the 3D view is a perspective orbit. Between them the camera eases pitch, yaw and
 * field of view while the distance follows the lens (a dolly zoom), so the ground at the focus keeps the size the
 * plan showed and the user keeps their place. Pure: three-free numbers in, numbers out.
 */
export type Vec3 = [number, number, number];

export type CameraPose = {
  /** Focus point on the ground, metres. */
  target: Vec3;
  /** Metres of ground visible top to bottom at the focus. */
  span: number;
  /** Radians above the horizon: π/2 looks straight down. */
  pitch: number;
  /** Radians about Y; 0 puts the camera on the focus's +Z side (looking towards -Z, "up" the plan). */
  yaw: number;
  /** Vertical field of view, degrees. */
  fov: number;
};

/** The plan's lens: narrow enough to read as orthographic, wide enough to keep depth precision. */
export const PLAN_FOV = 2;
export const ORBIT_FOV = 50;
/** A hair under straight down: OrbitControls cannot hold an exact pole. */
export const PLAN_PITCH = Math.PI / 2 - 1e-4;
export const ORBIT_PITCH = (55 * Math.PI) / 180;
export const TRANSITION_MS = 650;

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/** Distance from the focus at which `fovDeg` shows `span` metres of ground. */
export const distanceFor = (span: number, fovDeg: number): number => span / (2 * Math.tan((fovDeg * Math.PI) / 360));

/**
 * How much farther the camera stands than an orbit lens would at the same span: the draw distance and the fog are
 * measured past it, so the narrow-lens plan camera draws what is in view.
 */
export const dollyOffset = (pose: Pick<CameraPose, 'span' | 'fov'>): number => Math.max(0, distanceFor(pose.span, pose.fov) - distanceFor(pose.span, ORBIT_FOV));

export function cameraPosition(pose: CameraPose): Vec3 {
  const d = distanceFor(pose.span, pose.fov);
  const flat = Math.cos(pose.pitch) * d;
  return [pose.target[0] + flat * Math.sin(pose.yaw), pose.target[1] + Math.sin(pose.pitch) * d, pose.target[2] + flat * Math.cos(pose.yaw)];
}

/** The plan pose over the same focus and span. */
export const planPose = (target: Vec3, span: number): CameraPose => ({ target, span, pitch: PLAN_PITCH, yaw: 0, fov: PLAN_FOV });
/** The orbit pose a switch to 3D lands on: tilted, same yaw (0 keeps the plan's "up" up). */
export const orbitPose = (target: Vec3, span: number, yaw = 0): CameraPose => ({ target, span, pitch: ORBIT_PITCH, yaw, fov: ORBIT_FOV });

/**
 * The pose `t` (0..1, linear time) of the way from `from` to `to`, eased. The lens is blended in its tangent so
 * the dolly is smooth at the narrow end; yaw takes the short way round.
 */
export function blendPose(from: CameraPose, to: CameraPose, t: number): CameraPose {
  const e = easeInOutCubic(clamp01(t));
  let dyaw = to.yaw - from.yaw;
  dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
  const tanFrom = Math.tan((from.fov * Math.PI) / 360), tanTo = Math.tan((to.fov * Math.PI) / 360);
  return {
    target: [lerp(from.target[0], to.target[0], e), lerp(from.target[1], to.target[1], e), lerp(from.target[2], to.target[2], e)],
    span: lerp(from.span, to.span, e),
    pitch: lerp(from.pitch, to.pitch, e),
    yaw: from.yaw + dyaw * e,
    fov: (Math.atan(lerp(tanFrom, tanTo, e)) * 360) / Math.PI,
  };
}

/** The pose of a live camera looking at `target` from `position` with `fov` (to start a transition from wherever the user orbited to). */
export function poseFromCamera(position: Vec3, target: Vec3, fov: number): CameraPose {
  const dx = position[0] - target[0], dy = position[1] - target[1], dz = position[2] - target[2];
  const d = Math.hypot(dx, dy, dz) || 1;
  return { target, span: 2 * d * Math.tan((fov * Math.PI) / 360), pitch: Math.asin(Math.max(-1, Math.min(1, dy / d))), yaw: Math.atan2(dx, dz), fov };
}

/** The plan canvas's view (`screen = map × zoom + offset`) as a focus and span in metres, and back. */
export type PlanView = { x: number; y: number; zoom: number };
export type PlanScale = { tilewidth: number; tileheight: number; mpt: number };

export function planViewToFocus(view: PlanView, size: { width: number; height: number }, scale: PlanScale, ground: number): { target: Vec3; span: number } {
  const cx = (size.width / 2 - view.x) / view.zoom, cy = (size.height / 2 - view.y) / view.zoom;
  return { target: [(cx / scale.tilewidth) * scale.mpt, ground, (cy / scale.tileheight) * scale.mpt], span: (size.height / view.zoom / scale.tileheight) * scale.mpt };
}

export function focusToPlanView(target: Vec3, span: number, size: { width: number; height: number }, scale: PlanScale): PlanView {
  const zoom = size.height / ((span / scale.mpt) * scale.tileheight);
  const cx = (target[0] / scale.mpt) * scale.tilewidth, cy = (target[2] / scale.mpt) * scale.tileheight;
  return { x: size.width / 2 - cx * zoom, y: size.height / 2 - cy * zoom, zoom };
}
