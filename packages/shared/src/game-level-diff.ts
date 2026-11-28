/**
 * The level diff core (Phase 145 Theme A): what changed between two Tiled maps, as data. Pure, never throws, reads
 * the loose shape (a level that is not a map reads as empty). Objects are matched by id across every layer; tile
 * layers by name. The History panel (Theme C) draws it and the MCP `game_level_diff` tool (Theme H) returns it.
 */

/** The most tile cells one result lists; `count` still counts every changed cell. */
export const LEVEL_DIFF_TILES_MAX = 2000;

export type LevelFieldDelta = { field: string; from: unknown; to: unknown };
export type LevelDiffObjectRef = { id: number; layer: string; name: string; type: string; x: number; y: number };
export type LevelDiffMoved = LevelDiffObjectRef & { from: { x: number; y: number }; to: { x: number; y: number } };
export type LevelDiffChanged = LevelDiffObjectRef & { fields: LevelFieldDelta[] };
export type LevelDiffLink = { id: number; name: string; layer: string; from: unknown; to: unknown };
export type LevelDiffTileCell = { index: number; x: number; y: number; from: number; to: number };
export type LevelDiffTileLayer = { layer: string; count: number; cells: LevelDiffTileCell[] };

export type LevelDiff = {
  objects: { added: LevelDiffObjectRef[]; removed: LevelDiffObjectRef[]; moved: LevelDiffMoved[]; changed: LevelDiffChanged[] };
  tiles: LevelDiffTileLayer[];
  layers: { added: string[]; removed: string[] };
  properties: LevelFieldDelta[];
  links: LevelDiffLink[];
  summary: string;
};

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Link properties (Phase 142 Theme C): a property named `link`, `links` or `midnite.link…`. */
const isLinkProp = (name: string): boolean => /^(midnite\.)?links?(\.|$)/i.test(name);

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a as Rec);
  const bk = Object.keys(b as Rec);
  return ak.length === bk.length && ak.every((k) => k in (b as Rec) && same((a as Rec)[k], (b as Rec)[k]));
}

/** A Tiled `properties` array as a name → value record (the first of a repeated name wins). */
function propRecord(value: unknown): Rec {
  const out: Rec = {};
  if (Array.isArray(value)) for (const p of value) if (isRec(p) && typeof p.name === 'string' && !(p.name in out)) out[p.name] = p.value;
  return out;
}

function recordDeltas(a: Rec, b: Rec, prefix: string, skip?: (name: string) => boolean): LevelFieldDelta[] {
  const out: LevelFieldDelta[] = [];
  for (const name of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    if (skip?.(name)) continue;
    if (!same(a[name], b[name])) out.push({ field: prefix + name, from: a[name], to: b[name] });
  }
  return out;
}

type Placed = { layer: string; obj: Rec };

function objectsById(level: unknown): Map<number, Placed> {
  const out = new Map<number, Placed>();
  const layers = isRec(level) && Array.isArray(level.layers) ? level.layers : [];
  for (const layer of layers) {
    if (!isRec(layer) || !Array.isArray(layer.objects)) continue;
    for (const obj of layer.objects) if (isRec(obj) && typeof obj.id === 'number' && !out.has(obj.id)) out.set(obj.id, { layer: str(layer.name), obj });
  }
  return out;
}

const ref = (id: number, p: Placed): LevelDiffObjectRef => ({ id, layer: p.layer, name: str(p.obj.name), type: str(p.obj.type), x: num(p.obj.x), y: num(p.obj.y) });

const OBJECT_SKIP = new Set(['id', 'x', 'y', 'properties', 'layer']);

function tileLayers(level: unknown): Map<string, { data: number[]; width: number }> {
  const out = new Map<string, { data: number[]; width: number }>();
  const layers = isRec(level) && Array.isArray(level.layers) ? level.layers : [];
  const mapWidth = isRec(level) ? num(level.width) : 0;
  for (const layer of layers) {
    if (!isRec(layer) || layer.type !== 'tilelayer' || !Array.isArray(layer.data)) continue;
    const name = str(layer.name);
    if (out.has(name)) continue;
    out.set(name, { data: layer.data as number[], width: num(layer.width) || mapWidth || layer.data.length || 1 });
  }
  return out;
}

function layerNames(level: unknown): string[] {
  const layers = isRec(level) && Array.isArray(level.layers) ? level.layers : [];
  return layers.filter(isRec).map((l) => str(l.name));
}

function summarise(d: Omit<LevelDiff, 'summary'>): string {
  const parts: string[] = [];
  const add = (n: number, label: string): void => {
    if (n > 0) parts.push(`${n} ${label}`);
  };
  add(d.objects.added.length, 'added');
  add(d.objects.removed.length, 'removed');
  add(d.objects.moved.length, 'moved');
  add(d.objects.changed.length, 'changed');
  const cells = d.tiles.reduce((n, t) => n + t.count, 0);
  if (cells > 0) parts.push(`${cells} ${cells === 1 ? 'tile' : 'tiles'}`);
  add(d.layers.added.length + d.layers.removed.length, d.layers.added.length + d.layers.removed.length === 1 ? 'layer' : 'layers');
  add(d.properties.length, d.properties.length === 1 ? 'map property' : 'map properties');
  add(d.links.length, d.links.length === 1 ? 'link' : 'links');
  return parts.length === 0 ? 'No changes' : parts.join(', ');
}

/** What changed going from level `a` (older) to `b` (newer). Lists are sorted by object id / layer name / field. */
export function diffLevels(a: unknown, b: unknown): LevelDiff {
  const before = objectsById(a);
  const after = objectsById(b);
  const added: LevelDiffObjectRef[] = [];
  const removed: LevelDiffObjectRef[] = [];
  const moved: LevelDiffMoved[] = [];
  const changed: LevelDiffChanged[] = [];
  const links: LevelDiffLink[] = [];

  for (const id of [...new Set([...before.keys(), ...after.keys()])].sort((x, y) => x - y)) {
    const was = before.get(id);
    const now = after.get(id);
    if (was === undefined && now !== undefined) added.push(ref(id, now));
    else if (was !== undefined && now === undefined) removed.push(ref(id, was));
    else if (was !== undefined && now !== undefined) {
      const fields = [
        ...recordDeltas(was.obj, now.obj, '', (n) => OBJECT_SKIP.has(n)),
        ...recordDeltas(propRecord(was.obj.properties), propRecord(now.obj.properties), 'properties.', isLinkProp),
      ];
      if (was.layer !== now.layer) fields.push({ field: 'layer', from: was.layer, to: now.layer });
      const wasLinks = propRecord(was.obj.properties);
      const nowLinks = propRecord(now.obj.properties);
      for (const d of recordDeltas(wasLinks, nowLinks, '', (n) => !isLinkProp(n))) links.push({ id, name: d.field, layer: now.layer, from: d.from, to: d.to });
      const dx = num(was.obj.x) !== num(now.obj.x);
      const dy = num(was.obj.y) !== num(now.obj.y);
      if (fields.length > 0) {
        // A move plus any other edit is one `changed`, its position among the field deltas.
        if (dx) fields.push({ field: 'x', from: num(was.obj.x), to: num(now.obj.x) });
        if (dy) fields.push({ field: 'y', from: num(was.obj.y), to: num(now.obj.y) });
        changed.push({ ...ref(id, now), fields });
      } else if (dx || dy) {
        moved.push({ ...ref(id, now), from: { x: num(was.obj.x), y: num(was.obj.y) }, to: { x: num(now.obj.x), y: num(now.obj.y) } });
      }
    }
  }

  const tiles: LevelDiffTileLayer[] = [];
  const ta = tileLayers(a);
  const tb = tileLayers(b);
  for (const name of [...ta.keys()].filter((n) => tb.has(n)).sort()) {
    const x = ta.get(name)!;
    const y = tb.get(name)!;
    const cells: LevelDiffTileCell[] = [];
    let count = 0;
    for (let i = 0; i < Math.max(x.data.length, y.data.length); i++) {
      const from = num(x.data[i]);
      const to = num(y.data[i]);
      if (from === to) continue;
      count++;
      if (cells.length < LEVEL_DIFF_TILES_MAX) cells.push({ index: i, x: i % y.width, y: Math.floor(i / y.width), from, to });
    }
    if (count > 0) tiles.push({ layer: name, count, cells });
  }

  const na = new Set(layerNames(a));
  const nb = new Set(layerNames(b));
  const layers = { added: [...nb].filter((n) => !na.has(n)).sort(), removed: [...na].filter((n) => !nb.has(n)).sort() };

  const properties = recordDeltas(propRecord(isRec(a) ? a.properties : undefined), propRecord(isRec(b) ? b.properties : undefined), '');

  const partial = { objects: { added, removed, moved, changed }, tiles, layers, properties, links };
  return { ...partial, summary: summarise(partial) };
}
