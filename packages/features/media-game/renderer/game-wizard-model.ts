import {
  GAME_CAMERA_IDS,
  GAME_TEMPLATE_MATRIX,
  defaultGameOptions,
  emptyGameOptions,
  isStarterAvailable,
  isValidStarter,
  normalizeGameOptions,
  starterId,
  type GameCameraId,
  type GameDimension,
  type GameGenre,
  type GameOptions,
  type GamePerspective,
} from '@midnite/studio-shared';

import { genresOf, perspectivesOf } from './game-labels';

/**
 * The new-game wizard's state machine (pure, so the step flow is testable
 * without a DOM). Four steps: dimension, perspective, genre, fine-tune. Each
 * choice filters the next; changing an earlier choice clears whatever later
 * choice no longer fits.
 */

export const WIZARD_STEPS = [
  { id: 'dimension', label: 'Dimension' },
  { id: 'perspective', label: 'Perspective' },
  { id: 'genre', label: 'Genre' },
  { id: 'tune', label: 'Fine-tune' },
] as const;
export const WIZARD_LAST_STEP = WIZARD_STEPS.length - 1;

/** `'blank'` is the perspective's base with no genre module. */
export type WizardGenre = GameGenre | 'blank';

export type WizardState = {
  step: number;
  /** `null` until picked; the settings default stands in (see `deriveWizard`). */
  dimension: GameDimension | null;
  perspective: GamePerspective | null;
  genre: WizardGenre | null;
  options: GameOptions;
  cameras: readonly GameCameraId[];
};

export const initialWizardState = (): WizardState => ({
  step: 0,
  dimension: null,
  perspective: null,
  genre: null,
  options: emptyGameOptions(),
  cameras: GAME_CAMERA_IDS,
});

export type WizardAction =
  | { type: 'go'; step: number }
  | { type: 'dimension'; value: GameDimension; current: GameDimension }
  | { type: 'perspective'; value: GamePerspective }
  | { type: 'genre'; value: WizardGenre }
  | { type: 'options'; options: GameOptions }
  | { type: 'cameras'; cameras: readonly GameCameraId[] }
  | { type: 'reset' };

const asGenre = (g: WizardGenre | null): GameGenre | null => (g === null || g === 'blank' ? null : g);

/** Genres a perspective offers, in the catalogue's order. */
export function genresFor(dimension: GameDimension, perspective: GamePerspective): GameGenre[] {
  return genresOf(dimension).filter((g) => {
    const id = starterId(perspective, g);
    return isValidStarter(id).ok && isStarterAvailable(id).ok;
  });
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'go':
      return { ...state, step: Math.max(0, Math.min(WIZARD_LAST_STEP, action.step)) };
    case 'dimension': {
      if (action.value === action.current) return { ...state, dimension: action.value, step: 1 };
      return { ...initialWizardState(), dimension: action.value, step: 1 };
    }
    case 'perspective': {
      if (action.value === state.perspective) return { ...state, step: 2 };
      const keep =
        state.genre === 'blank' || (state.genre !== null && isValidStarter(starterId(action.value, asGenre(state.genre))).ok);
      const genre = keep ? state.genre : null;
      return {
        ...state,
        perspective: action.value,
        genre,
        options: keep
          ? normalizeGameOptions(state.options, { genre: asGenre(genre), perspective: action.value })
          : emptyGameOptions(),
        cameras: GAME_CAMERA_IDS,
        step: 2,
      };
    }
    case 'genre': {
      if (action.value === state.genre) return { ...state, step: 3 };
      const genre = asGenre(action.value);
      return {
        ...state,
        genre: action.value,
        options: normalizeGameOptions(defaultGameOptions(genre), {
          genre,
          perspective: state.perspective ?? 'platformer',
        }),
        cameras: GAME_CAMERA_IDS,
        step: 3,
      };
    }
    case 'options':
      return { ...state, options: action.options };
    case 'cameras':
      return { ...state, cameras: action.cameras };
    case 'reset':
      return initialWizardState();
  }
}

export type WizardDerived = {
  dimension: GameDimension;
  perspective: GamePerspective;
  /** The perspective the wizard will create from: the pick, else the dimension's first base. */
  perspectiveChosen: boolean;
  genre: GameGenre | null;
  genreChosen: boolean;
  starter: string;
  /** The furthest step the user may jump to (inclusive). */
  reached: number;
  versus: boolean;
  thirdPerson: boolean;
};

export function deriveWizard(state: WizardState, defaultDimension: GameDimension): WizardDerived {
  const dimension = state.dimension ?? defaultDimension;
  const perspectiveChosen = state.perspective !== null && perspectivesOf(dimension).includes(state.perspective);
  const perspective = perspectiveChosen ? state.perspective! : perspectivesOf(dimension)[0]!;
  const genreChosen = perspectiveChosen && state.genre !== null;
  const genre = genreChosen ? asGenre(state.genre) : null;
  const versus = genre !== null && GAME_TEMPLATE_MATRIX[genre].versus === true;
  return {
    dimension,
    perspective,
    perspectiveChosen,
    genre,
    genreChosen,
    starter: starterId(perspective, genre),
    reached: genreChosen ? 3 : perspectiveChosen ? 2 : 1,
    versus,
    thirdPerson: perspective === 'third-person' && !versus,
  };
}
