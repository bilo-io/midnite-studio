import type { ViewId } from '../../store/ui-store';

/**
 * Where the quick-access FAB lives. On Media views its floating bottom-right
 * spot covers the composers' Send button, so it docks into the status bar
 * there; everywhere else it floats as before.
 */
export type FabPlacement = 'floating' | 'statusbar';

export function fabPlacementFor(view: ViewId): FabPlacement {
  return view === 'media' ? 'statusbar' : 'floating';
}
