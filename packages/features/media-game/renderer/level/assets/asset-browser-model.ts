/** The asset browser's pure half (Phase 139 Theme C): which assets show, and how a filter narrows them. */
import type { GameAssetProvenance } from '@midnite/studio-shared';

/** The kinds a level can place or preview, in chip order. Audio, animation and the rest are never listed. */
export const ASSET_KIND_CHIPS = ['model', 'sprite', 'image', 'tileset', 'background'] as const satisfies readonly GameAssetProvenance['kind'][];
export type AssetKindChip = (typeof ASSET_KIND_CHIPS)[number];

export const isPlaceableKind = (kind: string): kind is AssetKindChip => (ASSET_KIND_CHIPS as readonly string[]).includes(kind);

export type BrowserAsset = Pick<GameAssetProvenance, 'name' | 'kind' | 'path' | 'sha256'>;

/** The manifest's assets the browser shows: only the chip kinds, in manifest order. */
export const placeableAssets = (assets: readonly BrowserAsset[]): BrowserAsset[] => assets.filter((a) => isPlaceableKind(a.kind));

/** Name substring (case-insensitive) AND kind in `kinds`. An empty `kinds` shows nothing: every chip off is "no kinds". */
export function filterAssets<T extends Pick<BrowserAsset, 'name' | 'kind'>>(assets: readonly T[], query: string, kinds: ReadonlySet<string>): T[] {
  const q = query.trim().toLowerCase();
  return assets.filter((a) => kinds.has(a.kind) && (q === '' || a.name.toLowerCase().includes(q)));
}

/** Move a tile focus by an arrow key in a grid of `columns`, clamped to `[0, count)`. */
export function moveTileFocus(index: number, key: string, columns: number, count: number): number {
  const step = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : key === 'ArrowDown' ? columns : key === 'ArrowUp' ? -columns : 0;
  if (step === 0 || count === 0) return index;
  return Math.min(count - 1, Math.max(0, index + step));
}
