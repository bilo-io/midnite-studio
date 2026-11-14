import type { ComponentType } from 'react';

import type { CouncilsManifest } from '../manifest';

/**
 * The councils feature's renderer half (Phase 113 Theme N). Needs the frame
 * (bridge, panel stack, resizable panes, chrome port, the AI-thread kit) and its
 * own {@link CouncilsHost} for what sits on app state: the persisted pane widths,
 * the occluder count, and Chats' composer, picker, markdown and agent roster.
 *
 * `sideEffects: false` keeps an app that imports only the view loader from
 * pulling the stores into its entry chunk.
 */
export { councilsManifest, type CouncilsManifest } from '../manifest';
export {
  CouncilsHostProvider,
  useCouncilsHost,
  type CouncilsAiComposerProps,
  type CouncilsHost,
  type CouncilsLayout,
  type CouncilsPaneWidth,
  type CouncilsPickerModel,
  type CouncilsPickerProvider,
  type CouncilsProviderModelPickerProps,
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
  useRecommendCouncil,
  useRemoveCouncil,
  useUpdateCouncilMembers,
} from './use-council';
export {
  useCancelCouncilRun,
  useContinueCouncilRun,
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
