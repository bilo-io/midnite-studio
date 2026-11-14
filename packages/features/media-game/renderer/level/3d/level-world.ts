/**
 * A 3D level as world items (Phase 136 Theme B): pure, no three. Every placement goes through shared's
 * `levelEntityToWorld` (the same mapping the kit's `toWorld3d` uses), so the 3D view puts an object exactly where
 * the game builds it; {@link gizmoEdit} is its inverse, turning a gizmo result back into Tiled fields and the 3D
 * props the plan inspector writes, as one undo step.
 */
import { GAME_LEVEL_PROPS, levelEntityToWorld, levelProperties, metresPerTile as levelMetresPerTile } from '@midnite/studio-shared';

import {
  beginStroke,
  endStroke,
  findObject,
  setObjectField,
  setOptionalNumber,
  snapRotation,
  type EditLevel,
  type EditSelection,
  type EditState,
  type LevelObject,
} from '../level-edit-model';

export type WorldKind = 'box' | 'point' | 'path';

export type WorldItem = {
  /** Index into the items array; the instanced meshes and the spatial grid address items by it. */
  index: number;
  sel: NonNullable<EditSelection>;
  kind: WorldKind;
  type: string;
  /** Metres: footprint centre on X/Z, and `y` the base (the object's `elevation`, else the ground). */
  position: [number, number, number];
  /** Radians, three's Euler in `YXZ` order: yaw about Y first, then pitch, then roll. */
  yaw: number;
  pitch: number;
  roll: number;
  scale: number;
  /** Metres as drawn: footprint x, height, footprint z (a point gets {@link POINT_SIZE}). */
  size: [number, number, number];
  model: string | null;
  /** The XZ box the item can cover at any yaw, metres; what the spatial grid indexes. */
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  /** A path's points in world X/Z. */
  path?: Array<[number, number]>;
};

/** A point entity (spawn, light, a prop placed with one click) is drawn as a marker this wide, metres. */
export const POINT_SIZE = 0.8;

const isObjects = (type: string): boolean => type === 'objectgroup';

/** The ground height an object with no `elevation` sits on: the level's `midnite.groundY`, else 0. */
export function groundY(level: Pick<EditLevel, 'properties'>): number {
  const g = levelProperties(level)[GAME_LEVEL_PROPS.groundY];
  return typeof g === 'number' && Number.isFinite(g) ? g : 0;
}

function kindOf(o: LevelObject): WorldKind {
  if (Array.isArray(o.polyline) || Array.isArray(o.polygon)) return 'path';
  if (o.point || ((o.width ?? 0) === 0 && (o.height ?? 0) === 0)) return 'point';
  return 'box';
}

/** Every visible object of every visible object layer, as world items, in layer then object order. */
export function levelWorldItems(level: EditLevel): WorldItem[] {
  const ground = groundY(level);
  const mpt = levelMetresPerTile(level);
  const items: WorldItem[] = [];
  for (const layer of level.layers) {
    if (!isObjects(layer.type) || layer.visible === false || typeof layer.id !== 'number') continue;
    for (const o of layer.objects ?? []) {
      if (o.visible === false) continue;
      const placed = levelEntityToWorld(o, level);
      const props = levelProperties(o);
      const kind = kindOf(o);
      const [px, py, pz] = placed.position;
      const size: [number, number, number] =
        kind === 'point'
          ? [POINT_SIZE * placed.scale, (props.sizeY === undefined ? POINT_SIZE * 2 : placed.size[1]) * placed.scale, POINT_SIZE * placed.scale]
          : [placed.size[0] * placed.scale, placed.size[1] * placed.scale, placed.size[2] * placed.scale];
      const reach = Math.hypot(size[0], size[2]) / 2;
      const item: WorldItem = {
        index: items.length,
        sel: { layerId: layer.id, objectId: o.id },
        kind,
        type: String(o.type ?? o.class ?? ''),
        position: [px, py ?? ground, pz],
        yaw: placed.yaw,
        pitch: placed.pitch,
        roll: placed.roll,
        scale: placed.scale,
        size,
        model: typeof props.model === 'string' && props.model !== '' ? props.model : null,
        bounds: { minX: px - reach, minZ: pz - reach, maxX: px + reach, maxZ: pz + reach },
      };
      if (kind === 'path') {
        const pts = (o.polyline ?? o.polygon) as Array<{ x: number; y: number }>;
        item.path = pts.map((p) => [((o.x + p.x) / level.tilewidth) * mpt, ((o.y + p.y) / level.tileheight) * mpt]);
        const xs = item.path.map((p) => p[0]), zs = item.path.map((p) => p[1]);
        item.bounds = { minX: Math.min(...xs), minZ: Math.min(...zs), maxX: Math.max(...xs), maxZ: Math.max(...zs) };
      }
      items.push(item);
    }
  }
  return items;
}

/** A world X/Z point as a Tiled object coordinate (map pixels) on a 3D level. */
export function worldToObjectPoint(level: Pick<EditLevel, 'tilewidth' | 'tileheight' | 'properties'>, x: number, z: number): { x: number; y: number } {
  const mpt = levelMetresPerTile(level);
  return { x: (x / mpt) * level.tilewidth, y: (z / mpt) * level.tileheight };
}

/** What a gizmo drag ended on, in world terms. Absent fields did not change. */
export type GizmoChange = {
  /** New footprint centre, metres. */
  centre?: [number, number];
  /** New base height, metres: written as `elevation`. */
  elevation?: number;
  /** Radians, three's Euler (YXZ). */
  yaw?: number;
  pitch?: number;
  roll?: number;
  /** A box's new drawn size in metres (footprint x, height, footprint z); a point's uniform scale instead. */
  size?: [number, number, number];
  scale?: number;
};

const round = (n: number, places = 4): number => Math.round(n * 10 ** places) / 10 ** places;
const deg = (rad: number): number => (rad * 180) / Math.PI;

/**
 * The Tiled fields an object ends up with when its footprint centre is `centre` (map px), its yaw `rotation`
 * (degrees, Tiled's clockwise) and its footprint `w`×`h` (map px): the origin is the centre less the rotated half
 * extents, Tiled's rule as `levelEntityToWorld` reads it.
 */
export function originFor(centre: { x: number; y: number }, rotation: number, w: number, h: number): { x: number; y: number } {
  const t = (rotation * Math.PI) / 180;
  return { x: round(centre.x - ((w / 2) * Math.cos(t) - (h / 2) * Math.sin(t))), y: round(centre.y - ((w / 2) * Math.sin(t) + (h / 2) * Math.cos(t))) };
}

/**
 * Apply a gizmo result to the selected object as **one** undo step. Yaw is Tiled's own `rotation` (negated three
 * yaw); pitch, roll, elevation, sizeY and scale are the same optional props the plan inspector writes.
 */
export function gizmoEdit(state: EditState, sel: NonNullable<EditSelection>, change: GizmoChange): EditState {
  const level = state.level;
  const o = findObject(level, sel);
  if (!o) return state;
  const mpt = levelMetresPerTile(level);
  const props = levelProperties(o);
  const scale = typeof props.scale === 'number' && props.scale > 0 ? props.scale : 1;
  const placed = levelEntityToWorld(o, level);
  const isPoint = kindOf(o) === 'point';

  let rotation = o.rotation ?? 0;
  if (change.yaw !== undefined) rotation = round(snapRotation(-deg(change.yaw)), 3);
  let w = o.width ?? 0, h = o.height ?? 0;
  let sizeY: number | undefined;
  if (change.size && !isPoint) {
    w = round((change.size[0] / scale / mpt) * level.tilewidth);
    h = round((change.size[2] / scale / mpt) * level.tileheight);
    sizeY = round(change.size[1] / scale);
  }
  const centreWorld = change.centre ?? [placed.position[0], placed.position[2]];
  const centre = worldToObjectPoint(level, centreWorld[0], centreWorld[1]);
  const origin = isPoint ? { x: round(centre.x), y: round(centre.y) } : originFor(centre, rotation, w, h);

  let s = beginStroke(state);
  // A sub-milli-pixel difference is float noise from the round trip, not an edit.
  const moved = (a: number, b: number): boolean => Math.abs(a - b) > 1e-3;
  if (moved(origin.x, o.x)) s = setObjectField(s, sel, 'x', origin.x);
  if (moved(origin.y, o.y)) s = setObjectField(s, sel, 'y', origin.y);
  if (moved(w, o.width ?? 0) && w > 0) s = setObjectField(s, sel, 'width', w);
  if (moved(h, o.height ?? 0) && h > 0) s = setObjectField(s, sel, 'height', h);
  if (moved(rotation, o.rotation ?? 0)) s = setObjectField(s, sel, 'rotation', rotation);
  const num = (name: string, value: number | undefined, current: unknown) => {
    if (value === undefined || (typeof current === 'number' && !moved(value, current))) return;
    s = setOptionalNumber(s, sel, name, String(value));
  };
  num('elevation', change.elevation === undefined ? undefined : round(change.elevation), props.elevation);
  num('pitch', change.pitch === undefined ? undefined : round(deg(change.pitch), 3), props.pitch ?? 0);
  num('roll', change.roll === undefined ? undefined : round(deg(change.roll), 3), props.roll ?? 0);
  num('sizeY', sizeY, props.sizeY ?? 3);
  if (isPoint && change.scale !== undefined) num('scale', round(change.scale, 3), props.scale ?? 1);
  return endStroke(s);
}
