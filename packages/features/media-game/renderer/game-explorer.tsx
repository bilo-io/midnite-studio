import type { GameSummary } from '@midnite/studio-shared';
import { useRef, useState, type KeyboardEvent } from 'react';
import { LuBox, LuEllipsis, LuFolderOpen, LuLayers, LuPlus, LuTriangleAlert } from 'react-icons/lu';

import { EmptyState, EmptyStateButton } from '@midnite/studio-frame';
import { LoadingRegion, RingSpinner as Spinner, Skeleton } from '@midnite/studio-frame';
import { useNotify } from './chrome';
import { DeleteGameDialog } from './delete-game-dialog';
import { GameAssetsBadge } from './game-assets-panel';
import { GameRowMenu, gameRowMenuItems } from './game-row-menu';
import { useGameHost } from './host';
import { useDeleteGame, useForgetGame, useGames, useGamesSettings, useRenameGame, useRevealGame } from './use-games';

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
  onOpen,
  opening = false,
}: {
  selectedId: string | null;
  onSelect: (gameId: string) => void;
  onNew: () => void;
  /** Open Game: add a game that already exists on disk. */
  onOpen: () => void;
  /** The Open Game dialog is up or its answer is being applied. */
  opening?: boolean;
}) {
  const games = useGames();
  const settings = useGamesSettings();
  const { removesRepo = false } = useGameHost();
  const notify = useNotify();
  const rename = useRenameGame();
  const reveal = useRevealGame();
  const forget = useForgetGame();
  const deleteGame = useDeleteGame();
  const [menu, setMenu] = useState<{ game: GameSummary; x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<GameSummary | null>(null);

  const copyPath = async (game: GameSummary): Promise<void> => {
    try {
      await navigator.clipboard.writeText(game.path);
      notify('Path copied');
    } catch {
      notify('Could not copy the path', { danger: true });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="game-explorer">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-2">
        <span className="text-xs font-medium text-muted-foreground">Games</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpen}
            disabled={opening}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-60"
          >
            {opening ? <Spinner className="h-3 w-3" /> : <LuFolderOpen aria-hidden className="h-3 w-3" />}
            Open Game
          </button>
          <button
            type="button"
            onClick={onNew}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent"
          >
            <LuPlus aria-hidden className="h-3 w-3" />
            New game
          </button>
        </div>
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
            title="No games yet. Create one from a starter, or open one you already have."
            action={
              <div className="flex items-center gap-2">
                <EmptyStateButton icon={LuPlus} label="New game" onClick={onNew} />
                <EmptyStateButton icon={LuFolderOpen} label="Open Game" onClick={onOpen} />
              </div>
            }
          />
        ) : (
          <ul>
            {(games.data ?? []).map((game) => (
              <GameRow
                key={game.gameId}
                game={game}
                selected={game.gameId === selectedId}
                onSelect={onSelect}
                renaming={renamingId === game.gameId}
                onMenu={(x, y) => setMenu({ game, x, y })}
                onRenameDone={(name) => {
                  setRenamingId(null);
                  if (name !== null && name !== game.name) rename.mutate({ gameId: game.gameId, name });
                }}
              />
            ))}
          </ul>
        )}
      </div>
      {menu ? (
        <GameRowMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={gameRowMenuItems({
            game: menu.game,
            gamesRoot: settings.data?.resolvedRoot,
            removesRepo,
            handlers: {
              onRename: () => setRenamingId(menu.game.gameId),
              onReveal: () => reveal.mutate(menu.game.gameId),
              onCopyPath: () => void copyPath(menu.game),
              onForget: () => forget.mutate(menu.game.gameId),
              onDelete: () => setDeleting(menu.game),
            },
          })}
        />
      ) : null}
      {deleting ? (
        <DeleteGameDialog
          gameId={deleting.gameId}
          name={deleting.name}
          busy={deleteGame.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={(confirmName) =>
            deleteGame.mutate(
              { gameId: deleting.gameId, confirmName },
              {
                onSuccess: (result) => {
                  if (result.ok) setDeleting(null);
                },
              },
            )
          }
        />
      ) : null}
    </div>
  );
}

function GameRow({
  game,
  selected,
  onSelect,
  renaming,
  onMenu,
  onRenameDone,
}: {
  game: GameSummary;
  selected: boolean;
  onSelect: (gameId: string) => void;
  renaming: boolean;
  /** Open the row's menu at a viewport point (right-click, or the ⋯ button). */
  onMenu: (x: number, y: number) => void;
  /** Inline rename finished: the new name, or `null` when cancelled. */
  onRenameDone: (name: string | null) => void;
}) {
  const EngineIcon = game.dimension === '3d' ? LuBox : LuLayers;
  const dots = useRef<HTMLButtonElement>(null);
  const settled = useRef(false);
  const onRenameKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      settled.current = true;
      onRenameDone(event.currentTarget.value.trim() || null);
    } else if (event.key === 'Escape') {
      settled.current = true;
      onRenameDone(null);
    }
  };
  if (renaming) {
    return (
      <li className="px-2 py-1">
        <input
          autoFocus
          aria-label={`Rename ${game.name}`}
          defaultValue={game.name}
          maxLength={80}
          onKeyDown={onRenameKey}
          // Leaving the field cancels: a rename commits on Enter only, because it writes a commit.
          onBlur={() => {
            if (!settled.current) onRenameDone(null);
          }}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs"
        />
      </li>
    );
  }
  return (
    <li
      className="group relative"
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(event.clientX, event.clientY);
      }}
    >
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
      <button
        ref={dots}
        type="button"
        aria-label={`Actions for ${game.name}`}
        aria-haspopup="menu"
        onClick={() => {
          const box = dots.current?.getBoundingClientRect();
          onMenu(box ? box.left : 0, box ? box.bottom : 0);
        }}
        className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded bg-card/80 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      >
        <LuEllipsis aria-hidden className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
