import type { ComponentType } from 'react';

import type { CouncilsManifest } from '../manifest';

/**
 * The councils feature's renderer half (Phase 113 Theme N). Needs the frame
 * (bridge, panel stack, resizable panes, chrome port) and its own
 * {@link CouncilsHost} for what sits on app state: the persisted pane widths
 * and the occluder count.
 *
 * `sideEffects: false` keeps an app that imports only the view loader from
 * pulling the stores into its entry chunk.
 */
export { councilsManifest, type CouncilsManifest } from '../manifest';
export {
  CouncilsHostProvider,
  useCouncilsHost,
  type CouncilsHost,
  type CouncilsLayout,
  type CouncilsPaneWidth,
} from './host';

export {
  councilIdOf,
  isSameCouncilEntry,
  pushCouncilEntry,
  useCouncilsHistory,
  useCouncilsHistoryStore,
  type CouncilEntry,
} from './councils-history-store';
export {
  useCouncil,
  useCouncils,
  useCreateCouncil,
  useRemoveCouncil,
  useUpdateCouncilMembers,
} from './use-council';
export {
  useCouncilRun,
  useCouncilRuns,
  useRetryCouncilMember,
  useSkipCouncilMember,
  useStartCouncilRun,
} from './use-council-run';

type ViewIds = CouncilsManifest['views'][number]['id'];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const councilsViews = {
  councils: () => import('./councils-view').then((m) => m.CouncilsView),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;
