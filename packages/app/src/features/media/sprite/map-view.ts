/**
 * The map previewer's pure half (Phase 106 Theme J): reading a Tiled `.tmj` loosely (an imported map can
 * carry fields this app never writes), finding which tileset a gid belongs to, and where a cell lands on
 * screen for either orientation. The canvas in `sprite-map-preview.tsx` only draws what these return.
 */
export type TmjTileset = {
  firstgid: number;
  name: string;
  image: string;
  tilewidth: number;
  tileheight: number;
  columns: number;
  margin: number;
  spacing: number;
  tiles?: Array<{ id: number; properties?: Array<{ name: string; value: unknown }> }>;
};
export type TmjTileLayer = { type: 'tilelayer'; name: string; visible: boolean; data: number[]; width: number; height: number };
export type TmjObjectLayer = { type: 'objectgroup'; name: string; visible: boolean; objects: Array<{ name: string; type?: string; class?: string; x: number; y: number }> };
export type TmjLayer = TmjTileLayer | TmjObjectLayer;
export type Tmj = {
  orientation: 'orthogonal' | 'isometric';
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TmjLayer[];
  tilesets: TmjTileset[];
};

/** Tiled stores flips in a gid's top bits. */
export const GID_MASK = 0x1fffffff;

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** A `.tmj` as the previewer reads it, or `null` when it is not a finite tile map. Unknown layer kinds are skipped. */
export function readTmj(raw: unknown): Tmj | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (m.type !== 'map' || !Array.isArray(m.layers) || !Array.isArray(m.tilesets)) return null;
  const layers: TmjLayer[] = [];
  for (const l of m.layers as Array<Record<string, unknown>>) {
    if (l.type === 'tilelayer' && Array.isArray(l.data)) layers.push({ type: 'tilelayer', name: String(l.name ?? ''), visible: l.visible !== false, data: l.data as number[], width: num(l.width), height: num(l.height) });
    else if (l.type === 'objectgroup' && Array.isArray(l.objects)) layers.push({ type: 'objectgroup', name: String(l.name ?? ''), visible: l.visible !== false, objects: l.objects as TmjObjectLayer['objects'] });
  }
  const tilesets = (m.tilesets as Array<Record<string, unknown>>)
    .filter((t) => typeof t.image === 'string')
    .map((t) => ({
      firstgid: num(t.firstgid, 1),
      name: String(t.name ?? ''),
      image: t.image as string,
      tilewidth: num(t.tilewidth, 1),
      tileheight: num(t.tileheight, 1),
      columns: Math.max(1, num(t.columns, 1)),
      margin: num(t.margin),
      spacing: num(t.spacing),
      ...(Array.isArray(t.tiles) ? { tiles: t.tiles as TmjTileset['tiles'] } : {}),
    }))
    .sort((a, b) => a.firstgid - b.firstgid);
  return {
    orientation: m.orientation === 'isometric' ? 'isometric' : 'orthogonal',
    width: num(m.width),
    height: num(m.height),
    tilewidth: num(m.tilewidth, 1),
    tileheight: num(m.tileheight, 1),
    layers,
    tilesets,
  };
}

/** The tileset a gid belongs to (the last one whose `firstgid` it reaches) and the tile's local id. */
export function tileOf(tilesets: readonly TmjTileset[], rawGid: number): { tileset: TmjTileset; local: number } | null {
  const gid = rawGid & GID_MASK;
  if (gid === 0) return null;
  let found: TmjTileset | null = null;
  for (const t of tilesets) if (t.firstgid <= gid) found = t;
  return found ? { tileset: found, local: gid - found.firstgid } : null;
}

/** Where tile `local` sits in its tileset image. */
export function sourceRect(t: TmjTileset, local: number): { x: number; y: number; w: number; h: number } {
  const col = local % t.columns, row = Math.floor(local / t.columns);
  return { x: t.margin + col * (t.tilewidth + t.spacing), y: t.margin + row * (t.tileheight + t.spacing), w: t.tilewidth, h: t.tileheight };
}

/** The map's size in pixels (an isometric map's diamond bounds). */
export function mapPixelSize(map: Pick<Tmj, 'orientation' | 'width' | 'height' | 'tilewidth' | 'tileheight'>): { width: number; height: number } {
  if (map.orientation === 'isometric') return { width: ((map.width + map.height) * map.tilewidth) / 2, height: ((map.width + map.height) * map.tileheight) / 2 };
  return { width: map.width * map.tilewidth, height: map.height * map.tileheight };
}

/** The top-left of cell `(x, y)`'s grid box — a tile is drawn bottom-aligned to it, as Tiled does. */
export function cellOrigin(map: Pick<Tmj, 'orientation' | 'height' | 'tilewidth' | 'tileheight'>, x: number, y: number): { x: number; y: number } {
  if (map.orientation === 'isometric') return { x: ((x - y + map.height - 1) * map.tilewidth) / 2, y: ((x + y) * map.tileheight) / 2 };
  return { x: x * map.tilewidth, y: y * map.tileheight };
}

/** A cell's collision flag, from the `collision` property of whichever tile is on it in `layer`. */
export function collisionAt(map: Pick<Tmj, 'tilesets'>, layer: TmjTileLayer, index: number): string | null {
  const hit = tileOf(map.tilesets, layer.data[index] ?? 0);
  const value = hit?.tileset.tiles?.find((t) => t.id === hit.local)?.properties?.find((p) => p.name === 'collision')?.value;
  return typeof value === 'string' && value !== 'walkable' ? value : null;
}

/** The layer collision is read from: `collision` when the map has one, else `ground`, else the first tile layer. */
export function collisionLayer(map: Pick<Tmj, 'layers'>): TmjTileLayer | null {
  const tiles = map.layers.filter((l): l is TmjTileLayer => l.type === 'tilelayer');
  return tiles.find((l) => l.name === 'collision') ?? tiles.find((l) => l.name === 'ground') ?? tiles[0] ?? null;
}

export const MAP_ZOOMS = [0.25, 0.5, 1, 2, 3, 4, 6, 8] as const;
export const stepZoom = (zoom: number, by: 1 | -1): number => {
  const i = MAP_ZOOMS.findIndex((z) => z >= zoom);
  const at = i < 0 ? MAP_ZOOMS.length - 1 : i;
  return MAP_ZOOMS[Math.min(MAP_ZOOMS.length - 1, Math.max(0, at + by))]!;
};
