import {
  GAME_PERSPECTIVES,
  type GameEngine,
  type GamePerspective,
} from '@midnite/studio-shared';
import { useState } from 'react';

import { SelectField } from '../../../components/form/select-field';
import { Spinner } from '../../../components/skeleton';
import { useCreateGame, useGamesSettings } from './use-games';

const ENGINE_OPTIONS: readonly { value: GameEngine; label: string }[] = [
  { value: 'phaser', label: 'Phaser (2D)' },
  { value: 'three', label: 'three.js + Rapier (3D)' },
];

const PERSPECTIVE_LABEL: Record<GamePerspective, string> = {
  platformer: 'Platformer',
  'top-down': 'Top-down',
  isometric: 'Isometric',
  raycaster: '2.5D raycaster',
  'first-person': 'First person',
  'third-person': 'Third person',
};

const TWO_D: readonly GamePerspective[] = ['platformer', 'top-down', 'isometric', 'raycaster'];

/** The perspectives an engine can start from. */
export const perspectivesFor = (engine: GameEngine): readonly GamePerspective[] =>
  engine === 'phaser' ? TWO_D : GAME_PERSPECTIVES.filter((p) => !TWO_D.includes(p));

/**
 * New-game form (Phase 107 Theme A). Creates a repo from the blank scaffold —
 * the genre starters and the perspective × genre gallery arrive with the later
 * themes and replace this panel's body, not its place in the tab.
 */
export function GameCreatePanel({ onCreated }: { onCreated: (gameId: string) => void }) {
  const settings = useGamesSettings();
  const create = useCreateGame();
  const [name, setName] = useState('');
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [perspective, setPerspective] = useState<GamePerspective | null>(null);

  const chosenEngine = engine ?? settings.data?.settings.defaultEngine ?? 'phaser';
  const options = perspectivesFor(chosenEngine);
  const chosenPerspective = perspective && options.includes(perspective) ? perspective : options[0]!;
  const valid = name.trim().length > 0;

  const submit = () => {
    if (!valid) return;
    create.mutate(
      { name: name.trim(), engine: chosenEngine, perspective: chosenPerspective },
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
          {settings.data ? ` in ${settings.data.resolvedRoot}` : ''}, written by an agent against {chosenEngine === 'phaser' ? 'Phaser' : 'three.js'}.
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
      <div className="flex flex-col gap-1 text-xs font-medium">
        Engine
        <SelectField<GameEngine> label="Engine" value={chosenEngine} onChange={setEngine} options={ENGINE_OPTIONS} />
      </div>
      <div className="flex flex-col gap-1 text-xs font-medium">
        Perspective
        <SelectField<GamePerspective>
          label="Perspective"
          value={chosenPerspective}
          onChange={setPerspective}
          options={options.map((value) => ({ value, label: PERSPECTIVE_LABEL[value] }))}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Starts from a blank scaffold. Genre starters arrive in a later update.
      </p>
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
