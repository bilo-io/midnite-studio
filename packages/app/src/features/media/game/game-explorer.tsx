import type { GameSummary } from '@midnite/studio-shared';
import { LuBox, LuLayers, LuPlus, LuTriangleAlert } from 'react-icons/lu';

import { EmptyState, EmptyStateButton } from '../../../components/empty-state';
import { LoadingRegion, Skeleton } from '../../../components/skeleton';
import { GameAssetsBadge } from './game-assets-panel';
import { useGames } from './use-games';

/**
 * The Games explorer (Phase 107 Theme A): game repos found under the games
 * location plus any registered repo carrying a `midnite-game.json`. A row shows
 * the name, an engine glyph and a dot while the repo has uncommitted work; an
 * invalid manifest still lists, with a warning and its first issue as the
 * tooltip. Works with no repo open — a game is its own repo.
 */
export function GameExplorer({
  selectedId,
  onSelect,
  onNew,
}: {
  selectedId: string | null;
  onSelect: (gameId: string) => void;
  onNew: () => void;
}) {
  const games = useGames();

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="game-explorer">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-2">
        <span className="text-xs font-medium text-muted-foreground">Games</span>
        <button
          type="button"
          onClick={onNew}
          className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent"
        >
          <LuPlus aria-hidden className="h-3 w-3" />
          New game
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {games.isPending ? (
          <LoadingRegion label="Loading games">
            <div className="flex flex-col gap-1 p-2">
              <Skeleton className="h-6" />
              <Skeleton className="h-6" />
            </div>
          </LoadingRegion>
        ) : (games.data ?? []).length === 0 ? (
          <EmptyState
            title="No games yet. Create one from a starter."
            action={<EmptyStateButton icon={LuPlus} label="New game" onClick={onNew} />}
          />
        ) : (
          <ul>
            {(games.data ?? []).map((game) => (
              <GameRow key={game.gameId} game={game} selected={game.gameId === selectedId} onSelect={onSelect} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function GameRow({
  game,
  selected,
  onSelect,
}: {
  game: GameSummary;
  selected: boolean;
  onSelect: (gameId: string) => void;
}) {
  const EngineIcon = game.dimension === '3d' ? LuBox : LuLayers;
  return (
    <li>
      <button
        type="button"
        aria-current={selected || undefined}
        title={game.valid ? game.path : (game.issue ?? 'Invalid manifest')}
        onClick={() => onSelect(game.gameId)}
        className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors hover:bg-primary/10 ${
          selected ? 'bg-accent text-foreground' : 'text-foreground/90'
        }`}
      >
        {game.valid ? (
          <EngineIcon aria-label={game.engine === 'three' ? 'three.js' : 'Phaser'} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <LuTriangleAlert aria-label="Invalid manifest" className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">{game.name}</span>
          <GameAssetsBadge game={game} />
        </span>
        {game.dirty ? (
          <span role="img" aria-label="Uncommitted changes" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
        ) : null}
      </button>
    </li>
  );
}
