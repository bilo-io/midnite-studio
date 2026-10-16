import type { ComponentType } from 'react';

import type { WorkflowsManifest } from '../manifest';

/**
 * The workflows feature's renderer half (Phase 113 Theme N). Needs the frame
 * (bridge, panel stack, resizable panes, form controls, chrome port) and its
 * own {@link WorkflowsHost} for what sits on app state: the persisted layout,
 * the dismiss stack, occluder-aware modal/popover chrome and a run's terminal
 * sessions.
 *
 * `sideEffects: false` keeps an app that imports only the view loader from
 * pulling the canvas into its entry chunk.
 */
export { workflowsManifest, type WorkflowsManifest } from '../manifest';
export {
  WorkflowsHostProvider,
  useWorkflowsHost,
  type WorkflowsDismissOptions,
  type WorkflowsHost,
  type WorkflowsLayout,
  type WorkflowsModalProps,
  type WorkflowsMultiSelectMenuProps,
  type WorkflowsMultiSelectOption,
  type WorkflowsPaneSize,
  type WorkflowsPopoverProps,
  type WorkflowsTreeSectionProps,
} from './host';

export { useWorkflowRevealStore, type WorkflowRevealRequest } from './workflow-reveal-store';
export { useWorkflowRunCommandStore, type WorkflowRunHandle } from './workflow-run-command-store';
export { useWorkflows } from './use-workflow';
export { useWaitingGateToasts } from './use-waiting-gate-toasts';

type ViewIds = WorkflowsManifest['views'][number]['id'];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const workflowsViews = {
  workflows: () => import('./workflows-view').then((m) => m.WorkflowsView),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;
