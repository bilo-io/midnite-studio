import type { ViewId } from '../../store/ui-store';
import type { PillKey } from './screensaver-stage';

export type PillNavigationActions = {
  setActiveView: (view: ViewId) => void;
  setReposOpen: (open: boolean) => void;
  setTerminalOpen: (open: boolean) => void;
};

/**
 * Where each of the four count pills navigates, Phase 46 Theme C.
 *
 * `repos` and `agents` are panels, not routed views — there is no `'repos'`
 * `ViewId` (`ui-store.ts`'s union has none), so they reveal the existing
 * left-sidebar and terminal panels via their own open flags rather than
 * switching the active view.
 */
export function applyPillDestination(key: PillKey, actions: PillNavigationActions): void {
  switch (key) {
    case 'repos':
      actions.setReposOpen(true);
      return;
    case 'agents':
      actions.setTerminalOpen(true);
      return;
    case 'myPrs':
    case 'teamPrs':
      actions.setActiveView('reviews');
      return;
  }
}
