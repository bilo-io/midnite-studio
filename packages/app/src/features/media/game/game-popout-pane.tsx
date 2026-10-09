import { useState } from 'react';

import { GameConsoleDrawer } from './game-console-drawer';
import { useGameRunStore } from './game-run-store';
import { GameRunnerHost, type GameResolution } from './game-runner-host';
import { GameRunnerToolbar } from './game-runner-toolbar';
import { useGameEvents, useGames } from './use-games';

/**
 * The `game` popout window's content (Phase 107 Theme B Pop out): the same
 * toolbar, stage and console drawer as Media ▸ Games' centre column, for the
 * one game main says this window hosts. Main has already moved that game's
 * native view into this window before this mounts — the stage div here only
 * tells it where to sit. Closing the window (or its frame's Re-dock button)
 * docks the view back into Media ▸ Games.
 */
export function GamePopoutPane() {
  useGameEvents();
  const popped = useGameRunStore((s) => s.popped);
  const games = useGames();
  const [resolution, setResolution] = useState<GameResolution>('fit');
  const game = (games.data ?? []).find((entry) => entry.gameId === popped) ?? null;

  return (
    <div data-testid="game-popout" className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-border px-2 py-1">
        <GameRunnerToolbar gameId={popped} resolution={resolution} onResolution={setResolution} inPopout />
        <span className="min-w-0 flex-1 truncate text-center text-xs font-semibold" title={game?.name}>
          {game?.name ?? ''}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <GameRunnerHost gameId={popped} resolution={resolution} inPopout />
      </div>
      <GameConsoleDrawer gameId={popped} />
    </div>
  );
}
