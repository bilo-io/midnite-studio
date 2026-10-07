import { useState } from 'react';
import { LuGamepad2 } from 'react-icons/lu';

import { EmptyState } from '../../../components/empty-state';
import { MediaLayout } from '../media-layout';
import { GameConsoleDrawer } from './game-console-drawer';
import { GameCreatePanel } from './game-create-panel';
import { GameDetailPanel } from './game-detail-panel';
import { GameExplorer } from './game-explorer';
import { GameRunnerHost, type GameResolution } from './game-runner-host';
import { GameRunnerToolbar } from './game-runner-toolbar';
import { useGameAgentEvents } from './game-agent-store';
import { useGameEvents, useGames } from './use-games';

/**
 * Media ▸ Games (Phase 107). Unlike Docs/Images/Audio/Models it is not
 * repo-scoped — a game is its own git repo under the games location — so it
 * renders with no repo open, like Video.
 *
 * - **Explorer**: game repos, with a **New game** button.
 * - **Centre**: the sandboxed runner (a native view floats over the stage div)
 *   with its console drawer.
 * - **Right**: the create form (with an optional first prompt), or the
 *   selected game's details over the create-and-iterate agent panel (Theme M).
 */
export function GameTab() {
  useGameEvents();
  useGameAgentEvents();
  const games = useGames();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resolution, setResolution] = useState<GameResolution>('fit');
  const selected = (games.data ?? []).find((game) => game.gameId === selectedId) ?? null;

  const select = (gameId: string) => {
    setSelectedId(gameId);
    setCreating(false);
  };

  return (
    <MediaLayout
      tab="game"
      explorerLabel="Games"
      detailLabel="Game details"
      detailName="details"
      toolbar={
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <GameRunnerToolbar gameId={selected?.gameId ?? null} resolution={resolution} onResolution={setResolution} />
          <span className="min-w-0 flex-1 truncate text-center text-xs font-semibold" title={selected?.name}>
            {selected?.name ?? ''}
          </span>
        </div>
      }
      explorer={<GameExplorer selectedId={selectedId} onSelect={select} onNew={() => setCreating(true)} />}
      content={
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1">
            <GameRunnerHost gameId={selected?.gameId ?? null} resolution={resolution} />
          </div>
          <GameConsoleDrawer gameId={selected?.gameId ?? null} />
        </div>
      }
      detail={
        creating || !selected ? (
          creating || (games.data ?? []).length === 0 ? (
            <GameCreatePanel onCreated={select} />
          ) : (
            <EmptyState icon={LuGamepad2} title="No game selected" body="Pick one from the list to see its details." />
          )
        ) : (
          <GameDetailPanel game={selected} />
        )
      }
    />
  );
}
