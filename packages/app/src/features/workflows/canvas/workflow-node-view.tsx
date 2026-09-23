import type { WorkflowNode, WorkflowNodeStatus } from '@midnite/studio-shared';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  LuCircleCheck,
  LuCircleX,
  LuClock3,
  LuLoaderCircle,
  LuMinus,
  LuTriangleAlert,
} from 'react-icons/lu';

import { activityStatusVar } from '../../activity/activity-status-color';
import { nodeSummary, NODE_KIND_META, type NodeCategory } from './node-kind-meta';

/** `data` this node type is mounted with — see `workflow-layout.ts`'s `toFlowGraph`. */
export type WorkflowNodeData = {
  node: WorkflowNode;
  invalid?: boolean;
  status?: WorkflowNodeStatus;
  error?: string;
  readOnly?: boolean;
};

/**
 * Maps a run's `WorkflowNodeStatus` onto the shared `ActivityStatus`
 * vocabulary — the same table `run-node-detail.tsx` already keeps (Phase 95
 * Theme A), duplicated rather than imported because that file lives in the
 * same feature but is itself a leaf consumer, not a shared module; both
 * exist for exactly this node/run-state boundary and would otherwise import
 * each other for one map.
 */
const STATUS_TO_ACTIVITY = {
  pending: 'queued',
  running: 'running',
  succeeded: 'done',
  failed: 'failed',
  timeout: 'failed',
  skipped: 'queued',
} as const;

const STATUS_ICON: Record<WorkflowNodeStatus, typeof LuCircleCheck> = {
  pending: LuClock3,
  running: LuLoaderCircle,
  succeeded: LuCircleCheck,
  failed: LuCircleX,
  timeout: LuCircleX,
  skipped: LuMinus,
};

/**
 * `--node-<category>` (`styles.css`) is a bare `<h> <s>% <l>%` triple, the
 * same convention `--dep-active`/`--health-warn` already use — every
 * consumer wraps it in `hsl(...)` at the usage site rather than baking the
 * function into the token, so the same custom property still composes with
 * `color-mix()` below. A bare `var(--node-action)` handed straight to a
 * `color`/`background` value is not a colour at all and silently fails to
 * apply (the declaration is invalid at computed-value time), which is what
 * this wrapping avoids.
 */
const CATEGORY_VAR: Record<NodeCategory, string> = {
  trigger: 'hsl(var(--node-trigger))',
  action: 'hsl(var(--node-action))',
  logic: 'hsl(var(--node-logic))',
  data: 'hsl(var(--node-data))',
  storage: 'hsl(var(--node-storage))',
};

/**
 * The workflow canvas's card-style node (Phase 95 Theme I, ported from
 * midnite's `nodes/workflow-node-view.tsx`): a category-tinted header strip,
 * an icon chip, a one-line summary of the node's own config, a status glyph
 * once a run has touched it, and its error inline rather than only in the
 * side/bottom panels — the phase doc's own "inline error" bullet.
 *
 * Selection and validation both draw as a ring rather than fighting over the
 * border, so a selected-and-invalid node still reads as invalid (destructive
 * wins) without losing the "this is the selected one" affordance entirely —
 * the ring width is what carries selection when the colour is already taken.
 */
export function WorkflowNodeView({ id, data, selected }: NodeProps) {
  const { node, invalid, status, error, readOnly } = data as unknown as WorkflowNodeData;
  const meta = NODE_KIND_META[node.kind];
  const Icon = meta.icon;
  const StatusIcon = status ? STATUS_ICON[status] : null;
  const isRunning = status === 'running';

  const ringClass = invalid ? 'ring-2 ring-destructive' : selected ? 'ring-2 ring-primary' : 'ring-1 ring-border';

  return (
    <div
      data-node-id={id}
      data-node-kind={node.kind}
      data-status={status}
      style={{ width: 200 }}
      className={`wf-node group overflow-hidden rounded-lg bg-card shadow-sm ${ringClass} ${isRunning ? 'wf-node-running' : ''} ${readOnly ? '' : 'cursor-move'}`}
    >
      {node.kind !== 'note' ? (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2.5 !w-2.5 !border-border !bg-background"
        />
      ) : null}

      <div
        className="flex items-center gap-1.5 px-2 py-1"
        style={{ background: `color-mix(in srgb, ${CATEGORY_VAR[meta.category]} 16%, transparent)` }}
      >
        <span
          aria-hidden
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
          style={{ background: `color-mix(in srgb, ${CATEGORY_VAR[meta.category]} 32%, transparent)` }}
        >
          <Icon aria-hidden className="h-2.5 w-2.5" style={{ color: CATEGORY_VAR[meta.category] }} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {meta.label}
        </span>
        {StatusIcon ? (
          <StatusIcon
            aria-hidden
            className={`h-3 w-3 shrink-0 ${isRunning ? 'animate-spin' : ''}`}
            style={{ color: activityStatusVar(STATUS_TO_ACTIVITY[status!]) }}
          />
        ) : null}
      </div>

      <div className="px-2 py-1.5">
        <p className="truncate text-xs font-medium text-foreground">{node.label}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{nodeSummary(node)}</p>
      </div>

      {error ? (
        <div className="flex items-start gap-1 border-t border-destructive/30 bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
          <LuTriangleAlert aria-hidden className="mt-0.5 h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      ) : null}

      {node.kind !== 'note' ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2.5 !w-2.5 !border-primary !bg-primary/80"
        />
      ) : null}
    </div>
  );
}

export const WORKFLOW_NODE_TYPES = { workflowNode: WorkflowNodeView };
