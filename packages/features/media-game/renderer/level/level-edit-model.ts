/**
 * The 2D level edit model (Phase 132 Theme D): pure, no React. A level is a loose Tiled map (any field this app
 * never writes must survive), every op returns a new {@link EditState} and shares structure with the old one, so
 * undo is a stack of references and "dirty" is a reference comparison with the last saved level.
 */
import { GAME_LEVEL_PROPS } from '@midnite/studio-shared';

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
export type EditSelection = { layerId: number; objectId: number } | null;

export type EditState = {
  level: EditLevel;
  /** The level as last loaded or saved: `dirty` is `level !== saved`. */
  saved: EditLevel;
  activeLayerId: number | null;
  selection: EditSelection;
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
  return { level: prepared, saved: prepared, activeLayerId: first?.id ?? null, selection: null, dirty: false, past: [], future: [], stroke: null };
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
  layerById(state.level, layerId) ? { ...state, activeLayerId: layerId, selection: null } : state;
export const select = (state: EditState, selection: EditSelection): EditState => ({ ...state, selection });
export const markSaved = (state: EditState): EditState => ({ ...state, saved: state.level, dirty: false });

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
  input: { type: string; x: number; y: number; width?: number; height?: number; name?: string },
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
    ...(width === 0 && height === 0 ? { point: true } : {}),
  };
  const level = mapLayers(state.level, layerId, (l) => ({ ...l, objects: [...(l.objects ?? []), object] }));
  return commit(state, { ...level, nextobjectid: id + 1 }, { selection: { layerId, objectId: id } });
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

export function deleteObject(state: EditState, sel: NonNullable<EditSelection>): EditState {
  const level = mapLayers(state.level, sel.layerId, (l) => (l.objects?.some((o) => o.id === sel.objectId) ? { ...l, objects: l.objects.filter((o) => o.id !== sel.objectId) } : l));
  const patch: Partial<EditState> = state.selection && state.selection.objectId === sel.objectId && state.selection.layerId === sel.layerId ? { selection: null } : {};
  return commit(state, level, patch);
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

// --- layers --------------------------------------------------------------------------

export function addLayer(state: EditState, kind: 'tile' | 'object', name: string): EditState {
  const id = Math.max(state.level.nextlayerid ?? 1, ...state.level.layers.map((l) => (l.id ?? 0) + 1));
  const common = { id, name, visible: true, opacity: 1, x: 0, y: 0 };
  const layer: LevelLayer =
    kind === 'tile'
      ? { ...common, type: 'tilelayer', width: state.level.width, height: state.level.height, data: new Array<number>(state.level.width * state.level.height).fill(0) }
      : { ...common, type: 'objectgroup', draworder: 'topdown', objects: [] };
  return commit(state, { ...state.level, layers: [...state.level.layers, layer], nextlayerid: id + 1 }, { activeLayerId: id, selection: null });
}

export const renameLayer = (state: EditState, layerId: number, name: string): EditState =>
  name.trim() === '' ? state : commit(state, mapLayers(state.level, layerId, (l) => (l.name === name ? l : { ...l, name })));

export const toggleVisible = (state: EditState, layerId: number): EditState =>
  commit(state, mapLayers(state.level, layerId, (l) => ({ ...l, visible: l.visible === false })));

// --- history -------------------------------------------------------------------------

export function undo(state: EditState): EditState {
  const previous = state.past[state.past.length - 1];
  if (!previous) return state;
  return { ...state, level: previous, past: state.past.slice(0, -1), future: [state.level, ...state.future], dirty: previous !== state.saved, selection: null, stroke: null };
}

export function redo(state: EditState): EditState {
  const next = state.future[0];
  if (!next) return state;
  return { ...state, level: next, past: [...state.past, state.level], future: state.future.slice(1), dirty: next !== state.saved, selection: null, stroke: null };
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

/** Whether the level is a 3D one: the 2D editor does not take those (Theme E). */
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
