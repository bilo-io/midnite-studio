/**
 * The 2D level edit model (Phase 132 Theme D): pure, no React. A level is a loose Tiled map (any field this app
 * never writes must survive), every op returns a new {@link EditState} and shares structure with the old one, so
 * undo is a stack of references and "dirty" is a reference comparison with the last saved level.
 */
import { GAME_LEVEL_PROPS } from '@midnite/studio-shared';

import { objectExtentPoints, refKey, sameRef } from './level-selection';

export type LevelProperty = { name: string; type: 'string' | 'int' | 'float' | 'bool' | 'color' | 'file'; value: unknown };

export type LevelObject = {
  id: number;
  name: string;
  type?: string;
  class?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  visible?: boolean;
  point?: boolean;
  properties?: LevelProperty[];
  [extra: string]: unknown;
};

export type LevelLayer = {
  id?: number;
  name: string;
  type: string;
  visible?: boolean;
  data?: number[];
  width?: number;
  height?: number;
  objects?: LevelObject[];
  [extra: string]: unknown;
};

/** A Tiled map as the editor holds it: the fields it reads typed, everything else carried through. */
export type EditLevel = {
  orientation: 'orthogonal' | 'isometric';
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: LevelLayer[];
  tilesets: Array<Record<string, unknown>>;
  nextlayerid?: number;
  nextobjectid?: number;
  properties?: LevelProperty[];
  [extra: string]: unknown;
};

export const UNDO_LIMIT = 100;

export type Cell = { x: number; y: number };
/** One object, addressed by its layer and its id (Tiled ids are unique per map, but the layer keeps lookups O(layer)). */
export type ObjectRef = { layerId: number; objectId: number };
export type EditSelection = ObjectRef | null;
/** A rectangle in map pixels; `width` and `height` are normalised to be at least 0. */
export type PlanRect = { x: number; y: number; width: number; height: number };

export type EditState = {
  level: EditLevel;
  /** The level as last loaded or saved: `dirty` is `level !== saved`. */
  saved: EditLevel;
  activeLayerId: number | null;
  /**
   * The PRIMARY selected object: the inspector's subject and the gizmo's pivot object. Invariant (every op keeps it,
   * `level-edit-model.test.ts` asserts it): `selection === null` iff `selected` is empty, and a set `selection` is
   * an element of `selected`. Read `selected` for "what is selected", `selection` for "which one is active".
   */
  selection: EditSelection;
  /** Every selected object, in the order they were added; the primary is normally the last. Never holds duplicates. */
  selected: readonly ObjectRef[];
  dirty: boolean;
  past: EditLevel[];
  future: EditLevel[];
  /** Set between {@link beginStroke} and {@link endStroke}: a drag is one undo step. */
  stroke: { pushed: boolean } | null;
};

const isTile = (l: LevelLayer): boolean => l.type === 'tilelayer';
const isObjects = (l: LevelLayer): boolean => l.type === 'objectgroup';

/** Layers without an `id` (a hand-written map) get one, so every op can address a layer by id. */
function withLayerIds(level: EditLevel): EditLevel {
  if (level.layers.every((l) => typeof l.id === 'number')) return level;
  let next = Math.max(level.nextlayerid ?? 1, ...level.layers.map((l) => (typeof l.id === 'number' ? l.id + 1 : 1)));
  const layers = level.layers.map((l) => (typeof l.id === 'number' ? l : { ...l, id: next++ }));
  return { ...level, layers, nextlayerid: next };
}

export function createEditState(level: EditLevel): EditState {
  const prepared = withLayerIds(level);
  const first = prepared.layers.find(isTile) ?? prepared.layers[0];
  return { level: prepared, saved: prepared, activeLayerId: first?.id ?? null, selection: null, selected: [], dirty: false, past: [], future: [], stroke: null };
}

export const layerById = (level: EditLevel, id: number | null): LevelLayer | undefined => level.layers.find((l) => l.id === id);

export function findObject(level: EditLevel, sel: EditSelection): LevelObject | undefined {
  if (!sel) return undefined;
  return layerById(level, sel.layerId)?.objects?.find((o) => o.id === sel.objectId);
}

/** Commit `next` as a new undo step (or fold it into the open stroke's step). Same reference → nothing happens. */
function commit(state: EditState, next: EditLevel, patch: Partial<EditState> = {}): EditState {
  if (next === state.level) return Object.keys(patch).length ? { ...state, ...patch } : state;
  let past = state.past;
  let stroke = state.stroke;
  if (!stroke || !stroke.pushed) {
    past = [...past, state.level];
    if (past.length > UNDO_LIMIT) past = past.slice(past.length - UNDO_LIMIT);
    if (stroke) stroke = { pushed: true };
  }
  return { ...state, ...patch, level: next, past, future: [], stroke, dirty: next !== state.saved };
}

const mapLayers = (level: EditLevel, id: number, fn: (layer: LevelLayer) => LevelLayer): EditLevel => {
  let changed = false;
  const layers = level.layers.map((l) => {
    if (l.id !== id) return l;
    const out = fn(l);
    if (out !== l) changed = true;
    return out;
  });
  return changed ? { ...level, layers } : level;
};

// --- stroke grouping and selection ---------------------------------------------------

export const beginStroke = (state: EditState): EditState => ({ ...state, stroke: { pushed: false } });
export const endStroke = (state: EditState): EditState => (state.stroke ? { ...state, stroke: null } : state);
export const setActiveLayer = (state: EditState, layerId: number): EditState =>
  layerById(state.level, layerId) ? { ...state, activeLayerId: layerId, selection: null, selected: [] } : state;
export const markSaved = (state: EditState): EditState => ({ ...state, saved: state.level, dirty: false });

// --- selection (Phase 137 Theme A) -----------------------------------------------------
//
// Selection is not an undo step: it never touches `past`, and every op returns the same reference when the
// selection would not change. `primary` is kept when it survives, else the last ref becomes primary.

const NO_SELECTION: Pick<EditState, 'selection' | 'selected'> = { selection: null, selected: [] };

/** The state with `refs` selected (deduplicated, order kept). Same reference when nothing changed. */
function withSelected(state: EditState, refs: readonly ObjectRef[], primary: ObjectRef | null): EditState {
  const seen = new Set<string>();
  const list = refs.filter((r) => (seen.has(refKey(r)) ? false : (seen.add(refKey(r)), true)));
  const nextPrimary = list.length === 0 ? null : (primary && list.find((r) => sameRef(r, primary))) || list[list.length - 1]!;
  const same =
    list.length === state.selected.length && list.every((r, i) => sameRef(r, state.selected[i]!)) && sameRef(nextPrimary, state.selection);
  if (same) return state;
  return { ...state, ...(list.length === 0 ? NO_SELECTION : { selection: nextPrimary, selected: list }) };
}

/** Select exactly `ref` (or clear with `null`); it is the primary. A plain click. */
export const selectOnly = (state: EditState, ref: ObjectRef | null): EditState => withSelected(state, ref ? [ref] : [], ref);

/** The pre-137 name for {@link selectOnly}; the signature is unchanged. */
export const select = (state: EditState, selection: EditSelection): EditState => selectOnly(state, selection);

/** Mod-click: add an absent ref (it becomes primary) or remove a present one (the last remaining ref becomes primary). */
export function toggleSelected(state: EditState, ref: ObjectRef): EditState {
  if (state.selected.some((r) => sameRef(r, ref))) return withSelected(state, state.selected.filter((r) => !sameRef(r, ref)), state.selection);
  return withSelected(state, [...state.selected, ref], ref);
}

/** Shift-click or an additive marquee: add `refs` that resolve to an object; the last one added becomes primary. */
export function addSelected(state: EditState, refs: readonly ObjectRef[]): EditState {
  const live = refs.filter((r) => findObject(state.level, r));
  if (live.length === 0) return state;
  return withSelected(state, [...state.selected.filter((s) => !live.some((r) => sameRef(r, s))), ...live], live[live.length - 1]!);
}

/** Every object of `layerId` that sits fully inside `rect` (the marquee rule: a big floor that merely crosses the edge stays out). */
function objectsInRect(level: EditLevel, layerIds: readonly number[], rect: PlanRect, filter?: (ref: ObjectRef) => boolean): ObjectRef[] {
  const out: ObjectRef[] = [];
  for (const layer of level.layers) {
    if (!isObjects(layer) || typeof layer.id !== 'number' || !layerIds.includes(layer.id)) continue;
    for (const o of layer.objects ?? []) {
      const ref = { layerId: layer.id, objectId: o.id };
      if (filter && !filter(ref)) continue;
      const points = objectExtentPoints(o);
      if (points.every((p) => p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height)) out.push(ref);
    }
  }
  return out;
}

/**
 * A marquee over `layerIds`: `'replace'` selects exactly what the rectangle encloses, `'add'` (Shift) unions it with the
 * selection, `'toggle'` (Mod) flips each enclosed object. `filter` is Theme H's `isSelectable` (hidden / locked refs).
 * The last enclosed object becomes primary; a marquee that encloses nothing leaves `'add'` / `'toggle'` untouched and
 * clears on `'replace'`.
 */
export function selectInRect(state: EditState, layerIds: readonly number[], rect: PlanRect, mode: 'replace' | 'add' | 'toggle', filter?: (ref: ObjectRef) => boolean): EditState {
  const hit = objectsInRect(state.level, layerIds, rect, filter);
  if (mode === 'replace') return withSelected(state, hit, hit[hit.length - 1] ?? null);
  if (hit.length === 0) return state;
  if (mode === 'add') return addSelected(state, hit);
  return hit.reduce((s, ref) => toggleSelected(s, ref), state);
}

/** Mod+A: every object on `layerId` (empty for a tile layer or an unknown id, which clears nothing). */
export function selectAllInLayer(state: EditState, layerId: number): EditState {
  const layer = layerById(state.level, layerId);
  if (!layer || !isObjects(layer)) return state;
  const refs = (layer.objects ?? []).map((o) => ({ layerId, objectId: o.id }));
  return refs.length === 0 ? state : withSelected(state, refs, refs[refs.length - 1]!);
}

/** The selected objects with their refs, in selection order; a ref that no longer resolves is skipped. A query. */
export function selectedObjects(state: EditState): Array<{ ref: ObjectRef; object: LevelObject }> {
  const out: Array<{ ref: ObjectRef; object: LevelObject }> = [];
  for (const ref of state.selected) {
    const object = findObject(state.level, ref);
    if (object) out.push({ ref, object });
  }
  return out;
}

/** `selected` restricted to refs that still resolve in `level`; the primary survives when it does. */
function pruneSelected(state: EditState, level: EditLevel): EditState {
  const live = state.selected.filter((r) => findObject(level, r));
  return withSelected(state, live, state.selection);
}

// --- tiles ---------------------------------------------------------------------------

const inBounds = (level: EditLevel, c: Cell): boolean => Number.isInteger(c.x) && Number.isInteger(c.y) && c.x >= 0 && c.y >= 0 && c.x < level.width && c.y < level.height;

function setCells(state: EditState, layerId: number, cells: readonly Cell[], gid: number): EditState {
  const layer = layerById(state.level, layerId);
  if (!layer || !isTile(layer) || !layer.data) return state;
  let data: number[] | null = null;
  for (const c of cells) {
    if (!inBounds(state.level, c)) continue;
    const i = c.y * state.level.width + c.x;
    if ((data ?? layer.data)[i] === gid) continue;
    data ??= layer.data.slice();
    data[i] = gid;
  }
  if (!data) return state;
  const next = data;
  return commit(state, mapLayers(state.level, layerId, (l) => ({ ...l, data: next })));
}

export const paint = (state: EditState, layerId: number, cells: readonly Cell[], gid: number): EditState => setCells(state, layerId, cells, gid);
export const erase = (state: EditState, layerId: number, cells: readonly Cell[]): EditState => setCells(state, layerId, cells, 0);

/** The cells of the rectangle with corners `from` and `to`, clipped to the map. */
export function rectCells(level: EditLevel, from: Cell, to: Cell): Cell[] {
  const x0 = Math.max(0, Math.min(from.x, to.x)), x1 = Math.min(level.width - 1, Math.max(from.x, to.x));
  const y0 = Math.max(0, Math.min(from.y, to.y)), y1 = Math.min(level.height - 1, Math.max(from.y, to.y));
  const out: Cell[] = [];
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) out.push({ x, y });
  return out;
}

export const fillRect = (state: EditState, layerId: number, from: Cell, to: Cell, gid: number): EditState =>
  setCells(state, layerId, rectCells(state.level, from, to), gid);

/** The gid on a cell (`0` empty or off the map). A query: it changes nothing. */
export function pick(state: EditState, layerId: number, cell: Cell): number {
  const layer = layerById(state.level, layerId);
  if (!layer || !isTile(layer) || !layer.data || !inBounds(state.level, cell)) return 0;
  return layer.data[cell.y * state.level.width + cell.x] ?? 0;
}

// --- objects -------------------------------------------------------------------------

function nextObjectId(level: EditLevel): number {
  let max = 0;
  for (const l of level.layers) for (const o of l.objects ?? []) max = Math.max(max, o.id);
  return Math.max(level.nextobjectid ?? 1, max + 1);
}

export function addObject(
  state: EditState,
  layerId: number,
  input: { type: string; x: number; y: number; width?: number; height?: number; name?: string; properties?: LevelProperty[]; polyline?: Array<{ x: number; y: number }> },
): EditState {
  const layer = layerById(state.level, layerId);
  if (!layer || !isObjects(layer)) return state;
  const id = nextObjectId(state.level);
  const width = input.width ?? 0, height = input.height ?? 0;
  const object: LevelObject = {
    id,
    name: input.name ?? input.type,
    type: input.type,
    x: input.x,
    y: input.y,
    width,
    height,
    rotation: 0,
    visible: true,
    ...(width === 0 && height === 0 && !input.polyline ? { point: true } : {}),
    ...(input.polyline ? { polyline: input.polyline } : {}),
    ...(input.properties ? { properties: input.properties } : {}),
  };
  const level = mapLayers(state.level, layerId, (l) => ({ ...l, objects: [...(l.objects ?? []), object] }));
  return commit(state, { ...level, nextobjectid: id + 1 }, { selection: { layerId, objectId: id }, selected: [{ layerId, objectId: id }] });
}

function mapObject(state: EditState, sel: NonNullable<EditSelection>, fn: (o: LevelObject) => LevelObject): EditState {
  const level = mapLayers(state.level, sel.layerId, (l) => {
    if (!l.objects) return l;
    let changed = false;
    const objects = l.objects.map((o) => {
      if (o.id !== sel.objectId) return o;
      const out = fn(o);
      if (out !== o) changed = true;
      return out;
    });
    return changed ? { ...l, objects } : l;
  });
  return commit(state, level);
}

export const moveObject = (state: EditState, sel: NonNullable<EditSelection>, x: number, y: number): EditState =>
  mapObject(state, sel, (o) => (o.x === x && o.y === y ? o : { ...o, x, y }));

/**
 * Apply `fn` to every ref'd object in one pass (`null` deletes it). Returns the SAME level when nothing changed, so
 * the caller's `commit` records nothing; otherwise a single new level, which is what makes a group op one undo step.
 */
function mapRefs(level: EditLevel, refs: readonly ObjectRef[], fn: (o: LevelObject) => LevelObject | null): EditLevel {
  const byLayer = new Map<number, Set<number>>();
  for (const r of refs) (byLayer.get(r.layerId) ?? byLayer.set(r.layerId, new Set()).get(r.layerId)!).add(r.objectId);
  let out = level;
  for (const [layerId, ids] of byLayer) {
    out = mapLayers(out, layerId, (l) => {
      if (!l.objects) return l;
      let changed = false;
      const objects: LevelObject[] = [];
      for (const o of l.objects) {
        if (!ids.has(o.id)) { objects.push(o); continue; }
        const next = fn(o);
        if (next !== o) changed = true;
        if (next) objects.push(next);
      }
      return changed ? { ...l, objects } : l;
    });
  }
  return out;
}

/** Move every ref'd object by `(dx, dy)` object coordinates, as one undo step; the selection is untouched. */
export function moveObjects(state: EditState, refs: readonly ObjectRef[], dx: number, dy: number): EditState {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return state;
  return commit(state, mapRefs(state.level, refs, (o) => ({ ...o, x: o.x + dx, y: o.y + dy })));
}

/**
 * Move each ref'd object by its own `(dx, dy)` (object coordinates), as one undo step; the selection is untouched.
 * Align and distribute (Phase 137 Theme E) move every object by a different amount. Zero deltas change nothing.
 */
export function translateObjects(state: EditState, moves: ReadonlyArray<{ ref: ObjectRef; dx: number; dy: number }>): EditState {
  const by = new Map<string, { dx: number; dy: number }>();
  for (const m of moves) if (Number.isFinite(m.dx) && Number.isFinite(m.dy) && (m.dx !== 0 || m.dy !== 0)) by.set(refKey(m.ref), { dx: m.dx, dy: m.dy });
  if (by.size === 0) return state;
  let level = state.level;
  for (const layerId of new Set(moves.map((m) => m.ref.layerId))) {
    level = mapLayers(level, layerId, (l) => {
      if (!l.objects) return l;
      let changed = false;
      const objects = l.objects.map((o) => {
        const d = by.get(refKey({ layerId, objectId: o.id }));
        if (!d) return o;
        changed = true;
        return { ...o, x: o.x + d.dx, y: o.y + d.dy };
      });
      return changed ? { ...l, objects } : l;
    });
  }
  return commit(state, level);
}

/**
 * Add new objects (paste and duplicate, Phase 137 Theme B) as ONE undo step. Each `object` is a template: its `id`
 * is replaced by a fresh one, everything else is kept. An item whose layer is missing or not an object layer is
 * skipped. The inserted objects become the selection, the last one primary.
 */
export function insertObjects(state: EditState, items: ReadonlyArray<{ layerId: number; object: Omit<LevelObject, 'id'> }>): EditState {
  let level = state.level;
  let id = nextObjectId(level);
  const made: ObjectRef[] = [];
  for (const { layerId, object } of items) {
    const layer = layerById(level, layerId);
    if (!layer || !isObjects(layer)) continue;
    const next = { ...object, id } as LevelObject;
    level = mapLayers(level, layerId, (l) => ({ ...l, objects: [...(l.objects ?? []), next] }));
    made.push({ layerId, objectId: id });
    id += 1;
  }
  if (made.length === 0) return state;
  return commit(state, { ...level, nextobjectid: id }, { selection: made[made.length - 1]!, selected: made });
}

/** {@link moveObjects}, named for the arrow keys. */
export const nudgeObjects = moveObjects;

export const deleteObject = (state: EditState, sel: NonNullable<EditSelection>): EditState => deleteObjects(state, [sel]);

/** Delete every ref that resolves, as one undo step. They leave the selection; the remaining selection keeps its primary. */
export function deleteObjects(state: EditState, refs: readonly ObjectRef[]): EditState {
  const level = mapRefs(state.level, refs, (_o) => null);
  if (level === state.level) return state;
  const kept = state.selected.filter((s) => !refs.some((r) => sameRef(r, s)));
  const patch = withSelected(state, kept, state.selection);
  return commit(state, level, { selection: patch.selection, selected: patch.selected });
}

export type ObjectField = 'name' | 'type' | 'x' | 'y' | 'width' | 'height' | 'rotation';
export function setObjectField(state: EditState, sel: NonNullable<EditSelection>, field: ObjectField, value: string | number): EditState {
  const numeric = field !== 'name' && field !== 'type';
  if (numeric && (typeof value !== 'number' || !Number.isFinite(value))) return state;
  return mapObject(state, sel, (o) => {
    if (o[field] === value) return o;
    const next: LevelObject = { ...o, [field]: value };
    // An object given a footprint stops being a point.
    if ((field === 'width' || field === 'height') && typeof value === 'number' && value > 0) delete next.point;
    return next;
  });
}

/** Coerce an input string to a property's type; `null` when it does not parse (the caller keeps the old value). */
export function coerceProperty(type: 'string' | 'int' | 'float' | 'bool', raw: string | number | boolean): string | number | boolean | null {
  switch (type) {
    case 'string':
      return String(raw);
    case 'bool':
      return typeof raw === 'boolean' ? raw : raw === 'true';
    case 'int': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) && String(raw).trim() !== '' ? Math.trunc(n) : null;
    }
    case 'float': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) && String(raw).trim() !== '' ? n : null;
    }
  }
}

const upsert = (props: readonly LevelProperty[] | undefined, next: LevelProperty): LevelProperty[] => {
  const list = props ?? [];
  const at = list.findIndex((p) => p.name === next.name);
  return at < 0 ? [...list, next] : list.map((p, i) => (i === at ? next : p));
};

/** Set a typed custom property on an object, or on the map when `target` is `'map'`. */
export function setProperty(state: EditState, target: NonNullable<EditSelection> | 'map', name: string, type: 'string' | 'int' | 'float' | 'bool', raw: string | number | boolean): EditState {
  const value = coerceProperty(type, raw);
  if (value === null || name.trim() === '') return state;
  const prop: LevelProperty = { name, type, value };
  if (target === 'map') return commit(state, { ...state.level, properties: upsert(state.level.properties, prop) });
  return mapObject(state, target, (o) => ({ ...o, properties: upsert(o.properties, prop) }));
}

export function removeProperty(state: EditState, target: NonNullable<EditSelection> | 'map', name: string): EditState {
  const drop = (props: LevelProperty[] | undefined) => (props?.some((p) => p.name === name) ? props.filter((p) => p.name !== name) : props);
  if (target === 'map') {
    const properties = drop(state.level.properties);
    return properties === state.level.properties ? state : commit(state, { ...state.level, properties });
  }
  return mapObject(state, target, (o) => {
    const properties = drop(o.properties);
    return properties === o.properties ? o : { ...o, properties };
  });
}

// --- 3D placement (Phase 132 Theme E) --------------------------------------------------

/** A volume's default vertical size, metres (Decision 3). */
export const DEFAULT_SIZE_Y = 3;
export type PlanPoint = { x: number; y: number };

/** `degrees` rounded to a multiple of `step`, normalised to `[0, 360)`. */
export function snapRotation(degrees: number, step = 0): number {
  const snapped = step > 0 ? Math.round(degrees / step) * step : degrees;
  return ((snapped % 360) + 360) % 360;
}

/**
 * Tiled's `rotation` (clockwise from above, degrees) that makes an object at `from` face `to`: 0 faces up the
 * screen (-Z), 90 faces right (+X). The yaw tick on the canvas points the same way.
 */
export function rotationToward(from: PlanPoint, to: PlanPoint): number {
  return snapRotation((Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI);
}

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** The object's centre in map pixels: a point is itself, a rectangle turns about its origin (Tiled's rule, as `levelEntityToWorld`). */
export function objectCentre(o: Pick<LevelObject, 'x' | 'y' | 'width' | 'height' | 'rotation'>): PlanPoint {
  const w = o.width ?? 0, h = o.height ?? 0, t = rad(o.rotation ?? 0);
  return { x: o.x + (w / 2) * Math.cos(t) - (h / 2) * Math.sin(t), y: o.y + (w / 2) * Math.sin(t) + (h / 2) * Math.cos(t) };
}

/**
 * Set an object's yaw (Tiled's own `rotation`), turning it about its centre: a footprint keeps the spot it
 * covers, so the world position {@link levelEntityToWorld} reports does not move. `step` snaps (15 with Shift).
 */
export function rotateObject(state: EditState, sel: NonNullable<EditSelection>, degrees: number, step = 0): EditState {
  if (!Number.isFinite(degrees)) return state;
  const next = snapRotation(degrees, step);
  return mapObject(state, sel, (o) => {
    if (snapRotation(o.rotation ?? 0) === next) return o;
    const w = o.width ?? 0, h = o.height ?? 0, c = objectCentre(o), t = rad(next);
    return { ...o, rotation: next, x: c.x - ((w / 2) * Math.cos(t) - (h / 2) * Math.sin(t)), y: c.y - ((w / 2) * Math.sin(t) + (h / 2) * Math.cos(t)) };
  });
}

/** Drag a rectangle (map pixels) into a `prop` box with the default `sizeY`. A drag smaller than a pixel in either direction adds nothing. */
export function setVolume(state: EditState, layerId: number, from: PlanPoint, to: PlanPoint): EditState {
  const width = Math.abs(to.x - from.x), height = Math.abs(to.y - from.y);
  if (width < 1 || height < 1) return state;
  return addObject(setActiveLayer(state, layerId), layerId, {
    type: 'prop',
    name: 'box',
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width,
    height,
    properties: [{ name: 'sizeY', type: 'float', value: DEFAULT_SIZE_Y }],
  });
}

/** A path being drawn: the points so far, a repeated point ignored. Pure, so the editor can keep the draft in view state. */
export function addPathPoint(draft: readonly PlanPoint[], point: PlanPoint): PlanPoint[] {
  const last = draft[draft.length - 1];
  return last && last.x === point.x && last.y === point.y ? [...draft] : [...draft, point];
}

/** Commit a draft as a `path` object: its origin is the first point and the polyline is relative to it. Fewer than two points adds nothing. */
export function finishPath(state: EditState, layerId: number, draft: readonly PlanPoint[]): EditState {
  if (draft.length < 2) return state;
  const origin = draft[0]!;
  return addObject(setActiveLayer(state, layerId), layerId, {
    type: 'path',
    x: origin.x,
    y: origin.y,
    polyline: draft.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y })),
  });
}

/** An optional number property: empty removes it (so the kit snaps or defaults); text that is not a number changes nothing. */
export function setOptionalNumber(state: EditState, sel: NonNullable<EditSelection>, name: string, raw: string): EditState {
  if (raw.trim() === '') return removeProperty(state, sel, name);
  return setProperty(state, sel, name, 'float', raw);
}

/** An optional string property (`model`, `collider`, `color`): empty removes it. */
export function setOptionalText(state: EditState, sel: NonNullable<EditSelection>, name: string, raw: string): EditState {
  if (raw === '') return removeProperty(state, sel, name);
  return setProperty(state, sel, name, 'string', raw);
}

// --- layers --------------------------------------------------------------------------

export function addLayer(state: EditState, kind: 'tile' | 'object', name: string): EditState {
  const id = Math.max(state.level.nextlayerid ?? 1, ...state.level.layers.map((l) => (l.id ?? 0) + 1));
  const common = { id, name, visible: true, opacity: 1, x: 0, y: 0 };
  const layer: LevelLayer =
    kind === 'tile'
      ? { ...common, type: 'tilelayer', width: state.level.width, height: state.level.height, data: new Array<number>(state.level.width * state.level.height).fill(0) }
      : { ...common, type: 'objectgroup', draworder: 'topdown', objects: [] };
  return commit(state, { ...state.level, layers: [...state.level.layers, layer], nextlayerid: id + 1 }, { activeLayerId: id, selection: null, selected: [] });
}

export const renameLayer = (state: EditState, layerId: number, name: string): EditState =>
  name.trim() === '' ? state : commit(state, mapLayers(state.level, layerId, (l) => (l.name === name ? l : { ...l, name })));

export const toggleVisible = (state: EditState, layerId: number): EditState =>
  commit(state, mapLayers(state.level, layerId, (l) => ({ ...l, visible: l.visible === false })));

// --- history -------------------------------------------------------------------------

export function undo(state: EditState): EditState {
  const previous = state.past[state.past.length - 1];
  if (!previous) return state;
  return pruneSelected({ ...state, level: previous, past: state.past.slice(0, -1), future: [state.level, ...state.future], dirty: previous !== state.saved, stroke: null }, previous);
}

export function redo(state: EditState): EditState {
  const next = state.future[0];
  if (!next) return state;
  return pruneSelected({ ...state, level: next, past: [...state.past, state.level], future: state.future.slice(1), dirty: next !== state.saved, stroke: null }, next);
}

/** The level to write: every field the editor did not touch is exactly as it was read. */
export function serialise(state: EditState): EditLevel {
  const level = state.level;
  return level.nextobjectid === undefined ? { ...level, nextobjectid: nextObjectId(level) } : level;
}

// --- snapping and geometry -----------------------------------------------------------

/**
 * Where a map-space point lands as an object coordinate. Orthogonal maps use pixels; isometric objects are
 * measured in tile-height units on both axes (as Tiled and Sprites' preview do), so the point is mapped through
 * the inverse of the diamond layout first.
 */
export function mapPointToObject(level: Pick<EditLevel, 'orientation' | 'height' | 'tilewidth' | 'tileheight'>, px: number, py: number): { x: number; y: number } {
  if (level.orientation !== 'isometric') return { x: px, y: py };
  const a = (px * 2) / level.tilewidth - level.height;
  const b = (py * 2) / level.tileheight - 1;
  return { x: ((a + b) / 2 + 0.5) * level.tileheight, y: ((b - a) / 2 + 0.5) * level.tileheight };
}

/** The inverse of {@link mapPointToObject}: where an object is drawn in map space. */
export function objectToMapPoint(level: Pick<EditLevel, 'orientation' | 'height' | 'tilewidth' | 'tileheight'>, x: number, y: number): { x: number; y: number } {
  if (level.orientation !== 'isometric') return { x, y };
  const fx = x / level.tileheight - 0.5, fy = y / level.tileheight - 0.5;
  return { x: ((fx - fy + level.height) * level.tilewidth) / 2, y: ((fx + fy + 1) * level.tileheight) / 2 };
}

/** The object coordinate at the centre of `cell`. */
export function cellCentre(level: Pick<EditLevel, 'orientation' | 'height' | 'tilewidth' | 'tileheight'>, cell: Cell): { x: number; y: number } {
  if (level.orientation === 'isometric') return { x: (cell.x + 0.5) * level.tileheight, y: (cell.y + 0.5) * level.tileheight };
  return { x: (cell.x + 0.5) * level.tilewidth, y: (cell.y + 0.5) * level.tileheight };
}

/** Whether the level is a 3D one: it opens in plan view (Theme E) rather than as tiles. */
export function isLevel3d(level: Pick<EditLevel, 'properties'>): boolean {
  return level.properties?.some((p) => p.name === GAME_LEVEL_PROPS.dimension && p.value === '3d') ?? false;
}

/** The wire's `unknown` level as an {@link EditLevel}, or `null` when it is not a finite Tiled map. */
export function toEditLevel(raw: unknown): EditLevel | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const int = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;
  if (m.type !== 'map' || !int(m.width) || !int(m.height) || !int(m.tilewidth) || !int(m.tileheight)) return null;
  if (!Array.isArray(m.layers) || !Array.isArray(m.tilesets)) return null;
  if (m.orientation !== 'orthogonal' && m.orientation !== 'isometric') return null;
  const layers = (m.layers as Array<Record<string, unknown>>).map((l) => ({ ...l, name: typeof l.name === 'string' ? l.name : '' }));
  return { ...m, layers } as EditLevel;
}
