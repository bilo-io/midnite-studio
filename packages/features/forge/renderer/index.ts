import type { ComponentType } from 'react';

import type { ForgeManifest } from '../manifest';

/**
 * The forge feature's renderer half (Phase 113 Theme O): the Reviews and
 * Actions views, the forge status vocabulary every forge surface draws with,
 * and the forge query hooks. Needs the frame (bridge, chrome port, resizable
 * panes) and its own {@link ForgeHost} for what sits on app state.
 *
 * `sideEffects: false` and lazy view loaders keep an app that imports only a
 * status pill or a query hook (the graph's CI column, the status bar) from
 * pulling either view into its entry chunk.
 */
export { forgeManifest, type ForgeManifest } from '../manifest';
export {
  ForgeHostProvider,
  useForgeHost,
  type ForgeAgentSkill,
  type ForgeCascadeReveal,
  type ForgeDiffKit,
  type ForgeDiffViewProps,
  type ForgeExternalLinkProps,
  type ForgeHost,
  type ForgeImageDiffSources,
  type ForgeImageTarget,
  type ForgeLayoutKey,
  type ForgeLinkEvent,
  type ForgeMultiSelectMenuProps,
  type ForgeMultiSelectOption,
  type ForgePaneSize,
  type ForgePopoverProps,
  type ForgeRefLinkProps,
  type ForgeThreadsByLine,
  type ForgeTooltipProps,
  type ForgeTreeSectionProps,
  type ForgeUserAvatarProps,
} from './host';

// A complete host for an app that is not Studio — plain chrome, a plain diff.
export { createStandaloneForgeHost, type StandaloneForgeHostOptions } from './standalone/standalone-host';

// The status vocabulary — one word, glyph and colour per forge state, wherever it is drawn.
export {
  checksStatus,
  issueStatus,
  jobStatus,
  outcomeStatus,
  pullStatus,
  RESOLVED_STATUS,
  reviewStatus,
  runStatus,
  StatusGlyph,
  StatusPill,
  type ForgeStatus,
  type ForgeTone,
} from './status/forge-status';

// The forge's data layer: query keys and hooks (the app re-exports them from `services/queries`).
export * from './queries/forge-queries';

// The run and review vocabulary the repos sidebar, the graph's CI modal and the dashboard reuse.
export { findRunPrNumber, getActionItemStyle, RunPrLink, type ActionItemStyle } from './actions/action-status-styles';
export { duration, groupRunsByPhase, relativeAge, sortRunsByPhase, type RunPhase, type RunPhaseGroup } from './actions/run-groups';
export { RunDetailPanel } from './actions/run-detail-panel';
export { RunPhaseSection } from './actions/run-phase-section';
export { REVIEW_GROUPS, type ReviewGroup } from './reviews/review-groups';

// Selection state other surfaces drive (a link to a PR or a run lands on it).
export { useActionsStore, type ActionsState } from './stores/actions-store';
export { useReviewsStore, type ReviewsState } from './stores/reviews-store';

type ViewIds = ForgeManifest['views'][number]['id'];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const forgeViews = {
  actions: () => import('./actions/actions-view').then((m) => m.ActionsView),
  reviews: () => import('./reviews/reviews-view').then((m) => m.ReviewsView),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;
