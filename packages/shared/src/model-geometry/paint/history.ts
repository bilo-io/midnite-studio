import type { DirtyRect } from './brushes';
import type { PaintImage } from './image';

/**
 * Per-stroke undo for painted pixels (Phase 104 Theme G). Images are cut into 64-texel tiles; the first time a
 * stroke is about to write a tile, its pixels are saved, and when the stroke ends the same tiles are saved
 * again as they are now. Undo writes the "before" tiles back, redo the "after" ones — so a stroke on a 4K
 * layer costs only the tiles it touched. Images are named by a key (`layer:channel`) and looked up when
 * undoing, so a layer recreated since keeps working.
 */
export const PAINT_TILE = 64;
export const PAINT_HISTORY_LIMIT = 50;

type TileSet = Map<string, Map<number, Uint8Array>>;
type Entry = { label: string; before: TileSet; after: TileSet };

export class PaintHistory {
  private readonly done: Entry[] = [];
  private readonly undone: Entry[] = [];
  private open: { label: string; before: TileSet; images: Map<string, PaintImage> } | null = null;

  constructor(private readonly limit = PAINT_HISTORY_LIMIT) {}

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  get depth(): { undo: number; redo: number } {
    return { undo: this.done.length, redo: this.undone.length };
  }

  begin(label: string): void {
    this.open = { label, before: new Map(), images: new Map() };
  }

  /** Saves the tiles of `rect` on image `key` that this stroke has not saved yet. Call before writing. */
  touch(key: string, image: PaintImage, rect: DirtyRect): void {
    if (!this.open) return;
    this.open.images.set(key, image);
    let tiles = this.open.before.get(key);
    if (!tiles) {
      tiles = new Map();
      this.open.before.set(key, tiles);
    }
    forTiles(image, rect, (tile) => {
      if (!tiles.has(tile)) tiles.set(tile, readTile(image, tile));
    });
  }

  /** Closes the stroke; `false` (nothing recorded) when it touched no tile. */
  commit(): boolean {
    const open = this.open;
    this.open = null;
    if (!open || open.before.size === 0) return false;
    const after: TileSet = new Map();
    for (const [key, tiles] of open.before) {
      const image = open.images.get(key)!;
      after.set(key, new Map([...tiles.keys()].map((tile) => [tile, readTile(image, tile)])));
    }
    this.done.push({ label: open.label, before: open.before, after });
    if (this.done.length > this.limit) this.done.shift();
    this.undone.length = 0;
    return true;
  }

  /** Steps back one stroke; answers the keys it changed. */
  undo(resolve: (key: string) => PaintImage | undefined): string[] | null {
    const entry = this.done.pop();
    if (!entry) return null;
    this.undone.push(entry);
    return apply(entry.before, resolve);
  }

  redo(resolve: (key: string) => PaintImage | undefined): string[] | null {
    const entry = this.undone.pop();
    if (!entry) return null;
    this.done.push(entry);
    return apply(entry.after, resolve);
  }

  clear(): void {
    this.done.length = 0;
    this.undone.length = 0;
    this.open = null;
  }
}

function forTiles(image: PaintImage, rect: DirtyRect, visit: (tile: number) => void): void {
  const across = Math.ceil(image.width / PAINT_TILE);
  for (let ty = Math.floor(rect.y0 / PAINT_TILE); ty <= Math.floor(rect.y1 / PAINT_TILE); ty += 1) {
    for (let tx = Math.floor(rect.x0 / PAINT_TILE); tx <= Math.floor(rect.x1 / PAINT_TILE); tx += 1) visit(ty * across + tx);
  }
}

function tileBounds(image: PaintImage, tile: number): { x0: number; y0: number; w: number; h: number } {
  const across = Math.ceil(image.width / PAINT_TILE);
  const x0 = (tile % across) * PAINT_TILE;
  const y0 = Math.floor(tile / across) * PAINT_TILE;
  return { x0, y0, w: Math.min(PAINT_TILE, image.width - x0), h: Math.min(PAINT_TILE, image.height - y0) };
}

function readTile(image: PaintImage, tile: number): Uint8Array {
  const { x0, y0, w, h } = tileBounds(image, tile);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) out.set(image.data.subarray(((y0 + y) * image.width + x0) * 4, ((y0 + y) * image.width + x0 + w) * 4), y * w * 4);
  return out;
}

function writeTile(image: PaintImage, tile: number, pixels: Uint8Array): void {
  const { x0, y0, w, h } = tileBounds(image, tile);
  for (let y = 0; y < h; y += 1) image.data.set(pixels.subarray(y * w * 4, (y + 1) * w * 4), ((y0 + y) * image.width + x0) * 4);
}

function apply(set: TileSet, resolve: (key: string) => PaintImage | undefined): string[] {
  const keys: string[] = [];
  for (const [key, tiles] of set) {
    const image = resolve(key);
    if (!image) continue;
    for (const [tile, pixels] of tiles) writeTile(image, tile, pixels);
    keys.push(key);
  }
  return keys;
}
