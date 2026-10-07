import { createRgba, type RgbaImage, type RgbaLike } from './image';

/**
 * Drawing a Tiled map (Phase 106 Themes J and K): reading a `.tmj` loosely (an imported map can carry
 * fields this app never writes), finding which tileset a gid belongs to, and where a cell lands for
 * either orientation. The renderer's canvas (`sprite-map-preview.tsx`) and `sprite_render_preview`'s
 * {@link renderTiledMap} both draw from these, so the two pictures agree.
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

/**
 * The map as an image — every visible tile layer bottom-aligned to its cell as Tiled draws it, then a dot
 * per object (spawn green, exit amber, others white). Tiles whose image is missing are skipped.
 */
export function renderTiledMap(map: Tmj, images: ReadonlyMap<string, RgbaLike>): RgbaImage {
  const size = mapPixelSize(map);
  const lift = Math.max(0, ...map.tilesets.map((t) => t.tileheight - map.tileheight));
  const out = createRgba(Math.max(1, Math.ceil(size.width)), Math.max(1, Math.ceil(size.height + lift)));
  const blit = (img: RgbaLike, sx: number, sy: number, w: number, h: number, dx: number, dy: number) => {
    for (let y = 0; y < h; y += 1) {
      const ty = Math.round(dy + y);
      if (ty < 0 || ty >= out.height || sy + y >= img.height) continue;
      for (let x = 0; x < w; x += 1) {
        const tx = Math.round(dx + x);
        if (tx < 0 || tx >= out.width || sx + x >= img.width) continue;
        const s = ((sy + y) * img.width + sx + x) * 4, d = (ty * out.width + tx) * 4;
        const a = img.data[s + 3]! / 255;
        if (a === 0) continue;
        for (let c = 0; c < 3; c += 1) out.data[d + c] = Math.round(img.data[s + c]! * a + out.data[d + c]! * (1 - a));
        out.data[d + 3] = Math.round(255 * (a + (out.data[d + 3]! / 255) * (1 - a)));
      }
    }
  };
  for (const layer of map.layers) {
    if (!layer.visible) continue;
    if (layer.type === 'tilelayer') {
      for (let y = 0; y < layer.height; y += 1)
        for (let x = 0; x < layer.width; x += 1) {
          const hit = tileOf(map.tilesets, layer.data[y * layer.width + x] ?? 0);
          const img = hit ? images.get(hit.tileset.image) : undefined;
          if (!hit || !img) continue;
          const src = sourceRect(hit.tileset, hit.local);
          const o = cellOrigin(map, x, y);
          blit(img, src.x, src.y, src.w, src.h, o.x, o.y + lift + map.tileheight - src.h);
        }
    } else {
      const r = Math.max(2, Math.round(map.tileheight / 4));
      for (const o of layer.objects) {
        const at = map.orientation === 'isometric' ? cellOrigin(map, o.x / map.tileheight - 0.5, o.y / map.tileheight - 0.5) : { x: o.x - map.tilewidth / 2, y: o.y - map.tileheight / 2 };
        const cx = Math.round(at.x + map.tilewidth / 2), cy = Math.round(at.y + lift + map.tileheight / 2);
        const kind = o.type ?? o.class;
        const rgb = kind === 'spawn' ? [34, 197, 94] : kind === 'exit' ? [245, 158, 11] : [229, 231, 235];
        for (let y = -r; y <= r; y += 1)
          for (let x = -r; x <= r; x += 1) {
            if (x * x + y * y > r * r) continue;
            const tx = cx + x, ty = cy + y;
            if (tx >= 0 && ty >= 0 && tx < out.width && ty < out.height) out.data.set([rgb[0]!, rgb[1]!, rgb[2]!, 255], (ty * out.width + tx) * 4);
          }
      }
    }
  }
  return out;
}
