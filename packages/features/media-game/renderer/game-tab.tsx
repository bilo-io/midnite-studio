import { useEffect, useState } from 'react';
import { LuGamepad2 } from 'react-icons/lu';

import { EmptyState, useMediaKit } from '@midnite/studio-frame';

import { GameCenter } from './game-center';
import { GameCreatePanel } from './game-create-panel';
import { GameDetailPanel } from './game-detail-panel';
import { GameExportBar } from './game-export-bar';
import { GameExplorer } from './game-explorer';
import type { GameResolution } from './game-runner-host';
import { ScenePicker } from './level/scene-picker';
import { GameRunnerToolbar } from './game-runner-toolbar';
import { useGameMode } from './use-game-mode';
import { useAddGame, useGameEvents, useGames, useGamesSettings } from './use-games';
import { useGameHost } from './host';

/** The agent's event subscription when the app has no agent: nothing to hear. */
const noEvents = (): void => undefined;

/**
 * Media ▸ Games (Phase 107). Unlike Docs/Images/Audio/Models it is not
 * repo-scoped — a game is its own git repo under the games location — so it
 * renders with no repo open, like Video.
 *
 * - **Explorer**: game repos, with a **New game** button.
 * - **Centre**: a **Level editor** and a **Play mode** tab (Phase 132 Theme B). Play holds the sandboxed runner
 *   (a native view floats over the stage div) with its console drawer; the run controls sit in the middle of
 *   the top bar, between the game's name and the export bar.
 * - **Right**: the create form (with an optional first prompt), or the
 *   selected game's details over the create-and-iterate agent panel (Theme M).
 */
export function GameTab() {
  const { MediaLayout, useMediaOpenFor, clearMediaOpenRequest } = useMediaKit();
  const { agent } = useGameHost();
  useGameEvents();
  (agent?.useEvents ?? noEvents)();
  const games = useGames();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resolution, setResolution] = useState<GameResolution>('fit');
  const settings = useGamesSettings();
  const { modeOf, setMode, onPlay } = useGameMode(settings.data?.settings.pauseWhenEditing ?? true);
  // Phase 112 Theme E — an agent's `game_open` and a reveal both arrive as a request for a game id.
  const openRequest = useMediaOpenFor('game', null);
  useEffect(() => {
    if (!openRequest) return;
    setSelectedId(openRequest.project);
    setMode(openRequest.project, 'editor');
    setCreating(false);
    clearMediaOpenRequest();
    // `setMode` follows the mode map; the request is consumed once, here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest, clearMediaOpenRequest]);
  const selected = (games.data ?? []).find((game) => game.gameId === selectedId) ?? null;

  const select = (gameId: string) => {
    setSelectedId(gameId);
    setMode(gameId, 'editor');
    setCreating(false);
  };

  const addGame = useAddGame();
  const openGame = () =>
    addGame.mutate(undefined, {
      onSuccess: (result) => {
        if (result.ok && result.value.status !== 'cancelled') select(result.value.gameId);
      },
    });

  return (
    <MediaLayout
      tab="game"
      explorerLabel="Games"
      detailLabel="Game details"
      detailName="details"
      toolbar={
        <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <span className="min-w-0 truncate text-left text-xs font-semibold" title={selected?.name}>
            {selected?.name ?? ''}
          </span>
          <GameRunnerToolbar
            gameId={selected?.gameId ?? null}
            resolution={resolution}
            onResolution={setResolution}
            onPlay={(started) => selected && onPlay(selected.gameId, started)}
          />
          <div className="justify-self-end">
            <GameExportBar gameId={selected?.gameId ?? null} />
          </div>
        </div>
      }
      explorer={<GameExplorer selectedId={selectedId} onSelect={select} onNew={() => setCreating(true)} onOpen={openGame} opening={addGame.isPending} />}
      content={
        <GameCenter
          game={selected}
          mode={modeOf(selected?.gameId ?? null)}
          onMode={(next) => selected && setMode(selected.gameId, next)}
          resolution={resolution}
          sceneSlot={<ScenePicker gameId={selected?.gameId ?? null} />}
        />
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
