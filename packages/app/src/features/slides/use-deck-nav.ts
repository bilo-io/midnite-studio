import { useReducer } from 'react';

/**
 * The reveal-state machine: which slide, how many of its steps are shown, and
 * whether arriving there should type the title out or show it instantly.
 *
 * Ported from midnite's `Deck` component's own `index`/`reveal`/`go` state,
 * minus the character-by-character step typewriter — steps are now real
 * `react-markdown` fragments (Theme A), not `innerHTML` being sliced, so a
 * step reveals as a whole unit. The title keeps its typewriter (Theme B's
 * resolved decision): `instant` tells the presenter whether the newly-current
 * slide's title should type out (`false`, advancing forward) or appear at
 * once (`true`, matching the crib's own rule for stepping backward and for
 * jumping to Home/End).
 */
export type DeckNavState = {
  index: number;
  reveal: number;
  instant: boolean;
};

type Action =
  | { type: 'next'; stepCount: number; slideCount: number }
  | { type: 'prev'; prevStepCount: number }
  | { type: 'home' }
  | { type: 'end'; lastIndex: number; lastStepCount: number }
  | { type: 'jump'; index: number };

function reduce(state: DeckNavState, action: Action): DeckNavState {
  switch (action.type) {
    case 'next':
      // Revealing another step on the SAME slide changes nothing about the
      // title, so `instant` is left untouched — flipping it here would just
      // be noise on `instant`'s own dependants, but the presenter's title
      // typewriter keys its restart on exactly `[title, instant]`, and title
      // is unchanged too. Toggling it anyway retriggers a real restart of an
      // already-finished typewriter for no reason.
      if (state.reveal < action.stepCount) {
        return { ...state, reveal: state.reveal + 1 };
      }
      if (state.index < action.slideCount - 1) {
        return { index: state.index + 1, reveal: 0, instant: false };
      }
      return state;
    case 'prev':
      if (state.reveal > 0) {
        return { ...state, reveal: state.reveal - 1 };
      }
      if (state.index > 0) {
        return { index: state.index - 1, reveal: action.prevStepCount, instant: true };
      }
      return state;
    case 'home':
      return { index: 0, reveal: 0, instant: true };
    case 'end':
      return { index: action.lastIndex, reveal: action.lastStepCount, instant: true };
    case 'jump':
      return { index: action.index, reveal: 0, instant: true };
    default:
      return state;
  }
}

const INITIAL: DeckNavState = { index: 0, reveal: 0, instant: true };

/**
 * `stepCounts[i]` is the number of reveal steps on slide `i`. `next`/`prev`
 * read the counts for the slide currently in play, so the caller never has to
 * pass the same number twice.
 */
export function useDeckNav(stepCounts: readonly number[]) {
  const [state, dispatch] = useReducer(reduce, INITIAL);
  const slideCount = stepCounts.length;
  const lastIndex = Math.max(0, slideCount - 1);

  return {
    ...state,
    next: () =>
      dispatch({ type: 'next', stepCount: stepCounts[state.index] ?? 0, slideCount }),
    prev: () => dispatch({ type: 'prev', prevStepCount: stepCounts[state.index - 1] ?? 0 }),
    home: () => dispatch({ type: 'home' }),
    end: () => dispatch({ type: 'end', lastIndex, lastStepCount: stepCounts[lastIndex] ?? 0 }),
    jump: (index: number) => {
      if (index >= 0 && index < slideCount) dispatch({ type: 'jump', index });
    },
  };
}
