import type { GameLibraryAsset, GameLibraryCollection } from '@midnite/studio-shared';
import { useState } from 'react';

import { useAssetLibrary, useAssetLibraryFile } from './use-games';

const formatBytes = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

/** Group a collection's assets by category, categories sorted, `''` last as "Uncategorised". */
export function groupByCategory(assets: readonly GameLibraryAsset[]): Array<[string, GameLibraryAsset[]]> {
  const groups = new Map<string, GameLibraryAsset[]>();
  for (const asset of assets) groups.set(asset.category, [...(groups.get(asset.category) ?? []), asset]);
  return [...groups.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
}

/** The inspector: provenance for every kind, an inline preview for images and audio. */
function LibraryInspector({ collection, asset }: { collection: string; asset: GameLibraryAsset }) {
  const file = useAssetLibraryFile(collection, asset.path);
  const url = file.data?.dataUrl ?? null;
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-card p-2 text-xs" data-testid="library-inspector">
      <p className="truncate font-medium" title={asset.path}>
        {asset.name}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
        <dt>Kind</dt>
        <dd>{asset.kind}</dd>
        <dt>Path</dt>
        <dd className="break-all font-mono">{asset.path}</dd>
        <dt>Size</dt>
        <dd>{formatBytes(asset.bytes)}</dd>
        {asset.source ? (
          <>
            <dt>Source</dt>
            <dd className="break-all font-mono">{asset.source}</dd>
          </>
        ) : null}
        {asset.sha256 ? (
          <>
            <dt>SHA-256</dt>
            <dd className="break-all font-mono">{asset.sha256.slice(0, 16)}…</dd>
          </>
        ) : null}
      </dl>
      {asset.kind === 'image' && url ? <img src={url} alt={asset.name} className="max-h-48 self-start rounded border border-border object-contain" /> : null}
      {asset.kind === 'audio' && url ? <audio controls src={url} className="w-full" aria-label={`Preview ${asset.name}`} /> : null}
      {(asset.kind === 'model' || asset.kind === 'terrain') && file.data ? (
        <p className="text-[11px] text-muted-foreground">No inline preview for {asset.kind} files yet; import it into a game to inspect it.</p>
      ) : null}
      {(asset.kind === 'image' || asset.kind === 'audio') && file.data && !url ? (
        <p className="text-[11px] text-muted-foreground">Too large to preview inline.</p>
      ) : null}
    </div>
  );
}

function CollectionView({ collection }: { collection: GameLibraryCollection }) {
  const [selected, setSelected] = useState<GameLibraryAsset | null>(null);
  return (
    <details className="rounded-md border border-border" data-testid={`library-collection-${collection.id}`}>
      <summary className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs font-medium">
        <span className="flex-1 truncate">{collection.title}</span>
        <span className="text-[10px] font-normal text-muted-foreground">
          {collection.assets.length} assets · {formatBytes(collection.totalBytes)}
        </span>
      </summary>
      {collection.warning ? <p className="px-2 pb-1 text-[11px] text-amber-500">{collection.warning}</p> : null}
      <div className="flex flex-col gap-2 p-2">
        {groupByCategory(collection.assets).map(([category, assets]) => (
          <div key={category}>
            <h4 className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{category === '' ? 'Uncategorised' : category}</h4>
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border text-xs">
              {assets.map((asset) => (
                <li key={asset.path}>
                  <button
                    type="button"
                    aria-pressed={selected?.path === asset.path}
                    onClick={() => setSelected(selected?.path === asset.path ? null : asset)}
                    className={`flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-accent/60 ${selected?.path === asset.path ? 'bg-accent' : ''}`}
                  >
                    <span className="min-w-0 flex-1 truncate" title={asset.path}>
                      {asset.name}
                    </span>
                    <span className="shrink-0 rounded bg-accent/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{asset.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {selected ? <LibraryInspector collection={collection.id} asset={selected} /> : null}
      </div>
    </details>
  );
}

/**
 * The shared asset library (read-only): collections from the library root in Settings ▸ Games, each
 * grouped by category with an inspector. Importing into a game is a separate action.
 */
export function GameAssetLibrary() {
  const library = useAssetLibrary(true);
  if (library.isLoading) return <p className="text-xs text-muted-foreground">Loading library…</p>;
  const { listing, error } = library.data ?? { listing: null, error: null };
  if (error) return <p role="alert" className="text-xs text-red-500">{error}</p>;
  if (!listing) return <p className="text-xs text-muted-foreground">The asset library is not available.</p>;
  if (!listing.exists) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="library-missing">
        No asset library at <code>{listing.root}</code>. Set its folder in Settings ▸ Media ▸ Games.
      </p>
    );
  }
  if (listing.collections.length === 0) return <p className="text-xs text-muted-foreground">The library has no collections yet.</p>;
  return (
    <div className="flex flex-col gap-2" data-testid="game-asset-library">
      {listing.collections.map((collection) => (
        <CollectionView key={collection.id} collection={collection} />
      ))}
    </div>
  );
}
