import type { ComponentType } from 'react';

import type { TasksManifest } from '../manifest';

/**
 * The Tasks feature's renderer half (Phase 113 Theme O): the forge's issues and ProjectV2 boards as
 * a table, a board and a dependency graph, with the issue detail and dialogs and Plan with AI. Needs
 * the frame (chrome port, resizable panes, panel stack, the activity glow) and its own
 * {@link TasksHost} — the forge hooks, the app's ui slice, and, optionally, the app's terminals.
 *
 * The state vocabulary a composing app's store persists is in `./state`; the issue detail Studio's
 * app-wide issue modal draws is in `./issue` (its own chunk: markdown).
 */
export { tasksManifest, type TasksManifest } from '../manifest';
export {
  TasksHostProvider,
  useOptionalTasksHost,
  useTasksHost,
  type TasksAutomateInput,
  type TasksCardComposerProps,
  type TasksCardHandoff,
  type TasksCardPlay,
  type TasksCardPlayInput,
  type TasksCascadeReveal,
  type TasksData,
  type TasksDismissableOptions,
  type TasksExternalLinkProps,
  type TasksForgeRefLinkProps,
  type TasksHost,
  type TasksIssueStatusPillProps,
  type TasksModalProps,
  type TasksMultiSelectMenuProps,
  type TasksMultiSelectOption,
  type TasksProjectItemsPage,
  type TasksProjectsMode,
  type TasksTerminalPort,
  type TasksTerminalState,
  type TasksToastApi,
  type TasksToastRequest,
  type TasksUiState,
  type TasksUserAvatarProps,
  type TasksWandFieldProps,
} from './host';
export { CardActivityLine } from './board/card-activity-line';

type ViewIds = TasksManifest['views'][number]['id'];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const tasksViews = {
  tasks: () => import('./tasks-view').then((m) => m.TasksView),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;
