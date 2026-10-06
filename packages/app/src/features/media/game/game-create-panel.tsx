import {
  GAME_CAMERA_IDS,
  GAME_TEMPLATE_MATRIX,
  parseStarterId,
  starterId,
  type GameCameraId,
  type GameDimension,
  type GameEngine,
  type GamePerspective,
} from '@midnite/studio-shared';
import { useState } from 'react';

import { Spinner } from '../../../components/skeleton';
import { GameGallery, perspectivesOf } from './game-gallery';
import { useCreateGame, useGamesSettings } from './use-games';

/** The perspectives an engine can start from. */
export const perspectivesFor = (engine: GameEngine): readonly GamePerspective[] =>
  perspectivesOf(engine === 'phaser' ? '2d' : '3d');

/**
 * New-game form: a name, then the perspective × genre gallery (Phase 107
 * Theme K). The starter id carries both choices; the engine follows the
 * dimension. Genre cells whose module has not landed are shown, disabled.
 */
export function GameCreatePanel({ onCreated }: { onCreated: (gameId: string) => void }) {
  const settings = useGamesSettings();
  const create = useCreateGame();
  const [name, setName] = useState('');
  const [dimension, setDimension] = useState<GameDimension | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [cameras, setCameras] = useState<readonly GameCameraId[]>(GAME_CAMERA_IDS);

  const defaultDimension: GameDimension = settings.data?.settings.defaultEngine === 'three' ? '3d' : '2d';
  const chosenDimension = dimension ?? defaultDimension;
  const firstBase = perspectivesOf(chosenDimension)[0]!;
  const parsedPick = picked === null ? null : parseStarterId(picked);
  const pickFits = parsedPick !== null && perspectivesOf(chosenDimension).includes(parsedPick.perspective);
  const starter = pickFits ? picked! : starterId(firstBase);
  const { perspective, genre } = pickFits ? parsedPick : { perspective: firstBase, genre: null };
  const engine: GameEngine = chosenDimension === '2d' ? 'phaser' : 'three';
  const valid = name.trim().length > 0;

  const submit = () => {
    if (!valid) return;
    create.mutate(
      {
        name: name.trim(),
        engine,
        perspective,
        genre,
        starter,
        // All five on is the default, which the manifest stores as an empty list.
        ...(perspective === 'third-person' && !(genre !== null && GAME_TEMPLATE_MATRIX[genre].versus) && cameras.length < GAME_CAMERA_IDS.length
          ? { cameras: [...cameras] }
          : {}),
      },
      {
        onSuccess: (result) => {
          if (result.ok) {
            setName('');
            onCreated(result.value.gameId);
          }
        },
      },
    );
  };

  return (
    <form
      className="flex flex-col gap-3 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      data-testid="game-create-panel"
    >
      <div>
        <h2 className="text-sm font-semibold">New game</h2>
        <p className="text-[11px] text-muted-foreground">
          A game is its own git repository
          {settings.data ? ` in ${settings.data.resolvedRoot}` : ''}, written by an agent against {engine === 'phaser' ? 'Phaser' : 'three.js'}.
        </p>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Moon Rover"
          maxLength={80}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs font-normal outline-none focus:ring-1 focus:ring-ring"
        />
      </label>
      <GameGallery
        dimension={chosenDimension}
        onDimension={setDimension}
        value={starter}
        onChange={setPicked}
        cameras={cameras}
        onCameras={setCameras}
      />
      <button
        type="submit"
        disabled={!valid || create.isPending}
        className="flex items-center justify-center gap-2 self-start rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {create.isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
        Create game
      </button>
    </form>
  );
}
