import type { GameSummary } from '@midnite/studio-shared';
import { useState } from 'react';
import { LuPackagePlus, LuRefreshCw } from 'react-icons/lu';

import { GameAssetPicker } from './game-asset-picker';
import { useGameAssets, useReimportAssets } from './use-games';

export const assetsChangedLabel = (count: number): string => `${count} ${count === 1 ? 'asset' : 'assets'} changed`;

/**
 * "2 assets changed" for the explorer row: quiet unless a source moved on.
 * Missing sources are shown in the panel but never nag from the list.
 */
export function GameAssetsBadge({ game }: { game: GameSummary }) {
  const assets = useGameAssets(game.gameId, game.valid);
  const changed = assets.data?.changed ?? 0;
  if (changed === 0) return null;
  return (
    <span className="text-[10px] text-amber-500" data-testid="game-assets-badge">
      {assetsChangedLabel(changed)}
    </span>
  );
}

const STATE_LABEL = { current: 'Up to date', changed: 'Source changed', missing: 'Source missing' } as const;
const STATE_CLASS = {
  current: 'text-muted-foreground',
  changed: 'text-amber-500',
  missing: 'text-red-500',
} as const;

/**
 * A game's assets (Phase 107 Theme N): what was imported and from where it
 * came, whether the source has changed since, and the picker to bring more in.
 * Re-import is an explicit button and one commit; nothing is overwritten silently.
 */
export function GameAssetsPanel({ game }: { game: GameSummary }) {
  const [picking, setPicking] = useState(false);
  const assets = useGameAssets(game.gameId);
  const reimport = useReimportAssets();
  const list = assets.data?.assets ?? [];
  const changed = assets.data?.changed ?? 0;

  return (
    <section aria-label="Assets" className="flex flex-col gap-2" data-testid="game-assets">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">Assets{list.length > 0 ? ` (${list.length})` : ''}</h3>
        <button
          type="button"
          aria-expanded={picking}
          onClick={() => setPicking((open) => !open)}
          className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent"
        >
          <LuPackagePlus aria-hidden className="h-3 w-3" />
          Import asset
        </button>
      </div>
      {picking ? <GameAssetPicker gameId={game.gameId} onDone={() => setPicking(false)} /> : null}
      {changed > 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs" role="status">
          <span>{assetsChangedLabel(changed)}</span>
          <button
            type="button"
            disabled={reimport.isPending}
            onClick={() => reimport.mutate({ gameId: game.gameId })}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] hover:bg-accent disabled:opacity-60"
          >
            <LuRefreshCw aria-hidden className="h-3 w-3" />
            Re-import
          </button>
        </div>
      ) : null}
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nothing imported yet. Sprites, models, terrains, images and audio are copied into <code>assets/</code>.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border text-xs">
          {list.map((asset) => (
            <li key={asset.name} className="flex items-center gap-2 px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate font-medium" title={asset.name}>
                {asset.name}
              </span>
              <span className="shrink-0 rounded bg-accent/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{asset.kind}</span>
              <span className={`shrink-0 text-[10px] ${STATE_CLASS[asset.state]}`}>{STATE_LABEL[asset.state]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
