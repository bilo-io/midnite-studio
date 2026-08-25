import { useState } from 'react';

import { useUiStore, type ViewId } from '../../store/ui-store';

/**
 * Whether the sidebar shows only the checkouts that have uncommitted changes.
 *
 * Defaults from the active view — the Changes view is a question about work in
 * progress, so a tree listing every tag and remote branch beside it is answering
 * a different one — but it stays a user's decision, not the view's. Switching to
 * Changes and finding two thirds of the tree gone is only acceptable if you can
 * put it back, and if the control that does so is visible while it is on.
 *
 * The override resets when the view changes, so turning the filter off in
 * Changes does not silently arm it in Graph, and coming back to Changes starts
 * from the sensible default again.
 */
export type DirtyFilter = {
  active: boolean;
  toggle: () => void;
};

/** The views where hiding clean checkouts is the useful default. */
export const filtersByDefault = (view: ViewId): boolean => view === 'changes';

/**
 * Reset-on-change, computed DURING render rather than in an effect.
 *
 * An effect runs after render, so the first render that observes the new view
 * would still be holding the previous view's override — the tree would paint
 * once with the wrong set of rows and then correct itself, which reads as a
 * flicker rather than a default. Storing the key alongside the value is React's
 * documented "adjust state when a prop changes" pattern, and it is the same one
 * `useContextReset` uses in `features/diff/use-file-diff.ts`.
 */
export function useDirtyFilter(): DirtyFilter {
  const view = useUiStore((s) => s.activeView);
  const [state, setState] = useState<{ view: ViewId; override: boolean | null }>({
    view,
    override: null,
  });

  const override = state.view === view ? state.override : null;
  if (state.view !== view) setState({ view, override: null });

  const active = override ?? filtersByDefault(view);

  return {
    active,
    toggle: () =>
      setState((current) => {
        const base = current.view === view ? current.override : null;
        return { view, override: !(base ?? filtersByDefault(view)) };
      }),
  };
}
