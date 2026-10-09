import {
  GAME_CAMERA_IDS,
  normalizeGameOptions,
  renderGameOptionsPrompt,
  type GameDimension,
  type GameEngine,
  type GamePerspective,
} from '@midnite/studio-shared';
import { useReducer, useState } from 'react';

import { Spinner } from '../../../components/skeleton';
import { MediaPanelBody, MediaPanelFooter, MediaPanelLayout } from '../media-panel-layout';
import { PromptTextarea } from '../prompt-input';
import { useGameAgentStore } from './game-agent-store';
import { GameEngineFields, startGameAgentRun, useGameEngines } from './game-iterate-panel';
import { perspectivesOf } from './game-labels';
import { GameWizardBody, GameWizardNav, wizardKeyHandler } from './game-wizard';
import { deriveWizard, initialWizardState, wizardReducer } from './game-wizard-model';
import { useCreateGame, useGamesSettings } from './use-games';

/** The perspectives an engine can start from. */
export const perspectivesFor = (engine: GameEngine): readonly GamePerspective[] =>
  perspectivesOf(engine === 'phaser' ? '2d' : '3d');

/**
 * New-game form: a name, then a four-step wizard (dimension, perspective,
 * genre, fine-tune) in the scrolling body, with its Back / dots / Next row and
 * the first prompt pinned in the footer. The starter id carries the
 * perspective and genre; the engine follows the dimension. The fine-tune
 * options go into the manifest and, with a first prompt, into the agent's
 * "Requested features" list.
 */
export function GameCreatePanel({ onCreated }: { onCreated: (gameId: string) => void }) {
  const settings = useGamesSettings();
  const create = useCreateGame();
  const [name, setName] = useState('');
  const [state, dispatch] = useReducer(wizardReducer, undefined, initialWizardState);
  const [firstPrompt, setFirstPrompt] = useState('');
  const { choice } = useGameEngines();
  const passes = useGameAgentStore((s) => s.passes);

  const defaultDimension: GameDimension =
    settings.data?.settings.defaultEngine === 'three' ? '3d' : '2d';
  const derived = deriveWizard(state, defaultDimension);
  const wizard = { state, derived, dispatch };
  const engine: GameEngine = derived.dimension === '2d' ? 'phaser' : 'three';
  const valid = name.trim().length > 0;

  const submit = () => {
    if (!valid) return;
    const options = normalizeGameOptions(state.options, { genre: derived.genre, perspective: derived.perspective });
    create.mutate(
      {
        name: name.trim(),
        engine,
        perspective: derived.perspective,
        genre: derived.genre,
        starter: derived.starter,
        options,
        // All five on is the default, which the manifest stores as an empty list.
        ...(derived.thirdPerson && state.cameras.length < GAME_CAMERA_IDS.length ? { cameras: [...state.cameras] } : {}),
      },
      {
        onSuccess: (result) => {
          if (result.ok) {
            setName('');
            dispatch({ type: 'reset' });
            onCreated(result.value.gameId);
            // Create and iterate (Theme M): an optional first prompt starts an agent on the new repo.
            const text = firstPrompt.trim();
            if (text) {
              setFirstPrompt('');
              void startGameAgentRun(result.value.gameId, `${text}\n\n${renderGameOptionsPrompt(options)}`, choice, passes);
            }
          }
        },
      },
    );
  };

  return (
    <MediaPanelLayout
      as="form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={wizardKeyHandler(wizard)}
      data-testid="game-create-panel"
    >
      <MediaPanelBody className="flex flex-col gap-3 p-3">
        <div>
          <h2 className="text-sm font-semibold">New game</h2>
          <p className="text-[11px] text-muted-foreground">
            A game is its own git repository
            {settings.data ? ` in ${settings.data.resolvedRoot}` : ''}, written by an agent against{' '}
            {engine === 'phaser' ? 'Phaser' : 'three.js'}.
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
        <GameWizardBody wizard={wizard} />
      </MediaPanelBody>
      <MediaPanelFooter className="flex flex-col gap-3 border-t border-border/50 p-3">
        <GameWizardNav wizard={wizard} />
        <label className="flex flex-col gap-1 text-xs font-medium">
          First prompt (optional)
          <PromptTextarea
            aria-label="First prompt"
            rows={3}
            value={firstPrompt}
            onChange={(event) => setFirstPrompt(event.target.value)}
            placeholder="A rover that collects crystals on a moon, avoiding craters"
          />
        </label>
        {firstPrompt.trim() ? <GameEngineFields /> : null}
        <button
          type="submit"
          disabled={!valid || create.isPending}
          className="flex items-center justify-center gap-2 self-start rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {create.isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
          {firstPrompt.trim() ? 'Create and run' : 'Create game'}
        </button>
      </MediaPanelFooter>
    </MediaPanelLayout>
  );
}
