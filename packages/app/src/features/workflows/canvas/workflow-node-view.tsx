import { canConnect, portsForNode, type WorkflowNode, type WorkflowNodeStatus, type WorkflowPort } from '@midnite/studio-shared';
import { Handle, Position, useConnection, type ConnectionState, type NodeProps } from '@xyflow/react';
import {
  LuCircleCheck,
  LuCircleX,
  LuClock3,
  LuLoaderCircle,
  LuMinus,
  LuShieldCheck,
  LuShieldQuestion,
  LuTriangleAlert,
} from 'react-icons/lu';

import { activityStatusVar } from '../../activity/activity-status-color';
import { useActivityGlow, type ActivityGlowSessionInput } from '../../activity/use-activity-glow';
import { PORT_TYPE_COLOR_VAR } from './edge-style';
import { nodeSummary, NODE_KIND_META, type NodeCategory } from './node-kind-meta';
import { NODE_SHAPE } from './node-shape';
import { useWorkflowGraphContext } from './workflow-graph-context';

/** A stable empty array — `sessions` for every node kind before Theme J's `agent`/`script` ever bind one, and every non-`agent`/`script` node forever. */
const EMPTY_NODE_SESSIONS: readonly ActivityGlowSessionInput[] = [];

/** `data` this node type is mounted with — see `workflow-layout.ts`'s `toFlowGraph`. */
export type WorkflowNodeData = {
  node: WorkflowNode;
  invalid?: boolean;
  status?: WorkflowNodeStatus;
  error?: string;
  readOnly?: boolean;
  /** This node's own live `TerminalSession`(s) (Theme J's `agent`/`script` kinds) — see `use-workflow-run.ts`'s `useLiveWorkflowNodeSessions`. */
  sessions?: readonly ActivityGlowSessionInput[];
  /**
   * A run's own `settledPort` for this node (Theme E) — the same
   * `nodeSettledPorts` map `workflow-canvas.tsx` already threads to the
   * custom edge component (for taken/dead painting), now also read here so
   * the `check-badge` shape can show a `verify` node's actual `pass`/`fail`
   * verdict. A verify node's generic `status` is `succeeded` either way — a
   * `'fail'` verdict is not an executor failure — so `status` alone cannot
   * distinguish the two; this can.
   */
  settledPort?: string;
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
  // A gate `waiting` for approval reuses the existing `waiting` ActivityStatus
  // token — the same amber a session waiting on input already paints
  // (`use-activity-glow.ts`'s own priority table). No new colour logic, per
  // the phase doc's own bullet.
  waiting: 'waiting',
} as const;

const STATUS_ICON: Record<WorkflowNodeStatus, typeof LuCircleCheck> = {
  pending: LuClock3,
  running: LuLoaderCircle,
  succeeded: LuCircleCheck,
  failed: LuCircleX,
  timeout: LuCircleX,
  skipped: LuMinus,
  waiting: LuShieldQuestion,
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

/** Evenly distributes N handles down one side of the card — `(i+1)/(N+1)` keeps the first and last off the corners, unlike xyflow's own default single-handle centring. */
function portTopPercent(index: number, count: number): string {
  return `${((index + 1) / (count + 1)) * 100}%`;
}

/**
 * Whether an in-progress connect-drag should dim this port (Phase 97 Theme
 * J's "a connect drag dims incompatible handles live"). `connection` is
 * `useConnection()`'s own return — `inProgress: false` outside a drag, in
 * which case nothing ever dims. `graph` is `null` outside `WorkflowCanvas`
 * (a standalone test render, say), which also dims nothing rather than
 * throwing.
 *
 * Connections can start from either handle type under xyflow's default
 * `connectionMode: 'strict'` — dragging from an out-port (`fromHandle.type
 * === 'source'`) only ever proposes landing on one of THIS node's in-ports,
 * and dragging from an in-port backward only ever proposes one of THIS
 * node's out-ports, so the two directions call {@link canConnect} with
 * their arguments swapped rather than sharing one call shape.
 */
function isPortDimmed(
  port: WorkflowPort,
  thisNode: WorkflowNode,
  connection: ConnectionState,
  graph: ReturnType<typeof useWorkflowGraphContext>,
): boolean {
  if (!connection.inProgress || !graph) return false;
  if (connection.fromNode.id === thisNode.id) return false; // never dim the node the drag started from.
  const fromNode = (connection.fromNode.data as WorkflowNodeData).node;
  const fromPorts = portsForNode(fromNode, graph.edges);
  const draggingFromSource = connection.fromHandle.type === 'source';
  if (draggingFromSource) {
    if (port.direction !== 'in') return false;
    const fromPort = fromPorts.find((p) => p.id === connection.fromHandle.id && p.direction === 'out');
    if (!fromPort) return false;
    return !canConnect(fromNode, fromPort, thisNode, port, graph.edges).ok;
  }
  if (port.direction !== 'out') return false;
  const toPort = fromPorts.find((p) => p.id === connection.fromHandle.id && p.direction === 'in');
  if (!toPort) return false;
  return !canConnect(thisNode, port, fromNode, toPort, graph.edges).ok;
}

/** One labelled line in a `frame` node's own card — a slot's first line, or an em dash when it's blank. */
function FrameSlotLine({ label, value }: { label: string; value: string }) {
  const trimmed = value.trim();
  const firstLine = trimmed.split('\n')[0] ?? '';
  return (
    <p className="truncate">
      <span className="font-medium text-foreground/70">{label}: </span>
      {firstLine || '—'}
    </p>
  );
}

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
  const { node, invalid, status, error, readOnly, sessions, settledPort } = data as unknown as WorkflowNodeData;
  const meta = NODE_KIND_META[node.kind];
  const Icon = meta.icon;
  const StatusIcon = status ? STATUS_ICON[status] : null;
  const isRunning = status === 'running';
  const shape = NODE_SHAPE[node.kind];

  const connection = useConnection();
  const graphContext = useWorkflowGraphContext();

  // `graphContext?.edges` (Theme C) is what makes THIS node's own `exhausted`
  // out-port appear the moment an outgoing `loop` edge is drawn off it —
  // `portsForNode`'s `edges` param is optional precisely so a standalone
  // render (no `WorkflowCanvas` context, e.g. a test) still gets every OTHER
  // port right, just not that one. `frame` (Theme I) has none either — it's
  // canvas furniture, exactly like `note`.
  const ports = node.kind === 'note' || node.kind === 'frame' ? [] : portsForNode(node, graphContext?.edges);
  const inPorts = ports.filter((p) => p.direction === 'in');
  const outPorts = ports.filter((p) => p.direction === 'out');

  const ringClass = invalid ? 'ring-2 ring-destructive' : selected ? 'ring-2 ring-primary' : 'ring-1 ring-border';

  /*
    The shared activity glow (Phase 95 Theme A/C) rather than a one-off pulse
    class — Theme C's own `useActivityGlow` doc comment names workflow nodes
    as its Theme I hookup, deferring only the case where a real SESSION binds
    here, which Theme J's `agent`/`script` kinds now do. Precedence is
    `resolveActivityGlow`'s own, unmodified by this theme: an agent actively
    working (or a plain shell) in `sessions` outranks `fallbackStatus`, which
    is what makes a node glow the global activity palette while something is
    actually running in it and fall back to its own queued/running/done/
    failed run-state colour the moment nothing is. Every other node kind
    still passes `EMPTY_NODE_SESSIONS`, so nothing about their glow changes.
  */
  const glow = useActivityGlow({
    sessions: sessions ?? EMPTY_NODE_SESSIONS,
    fallbackStatus: status ? STATUS_TO_ACTIVITY[status] : undefined,
  });

  return (
    <div
      data-node-id={id}
      data-node-kind={node.kind}
      data-status={status}
      data-activity-status={glow.status}
      // `frame` (Theme I) is sized from its own config, not the fixed 200px
      // every other shape uses — it groups other node cards, so it needs
      // room to actually contain them.
      style={node.kind === 'frame' ? { width: node.config.width, height: node.config.height } : { width: 200 }}
      className={`wf-node activity-glow group overflow-hidden bg-card shadow-sm ${shape === 'pill' ? 'rounded-full' : shape === 'start-card' ? 'rounded-l-full rounded-r-lg' : 'rounded-lg'} ${ringClass} ${readOnly ? '' : 'cursor-move'}`}
    >
      {inPorts.map((port, i) => (
        <Handle
          key={port.id}
          id={port.id}
          type="target"
          position={Position.Left}
          title={`${port.label} (${port.type})`}
          style={{
            top: portTopPercent(i, inPorts.length),
            backgroundColor: PORT_TYPE_COLOR_VAR[port.type],
            opacity: isPortDimmed(port, node, connection, graphContext) ? 0.35 : 1,
          }}
          className="!h-2.5 !w-2.5 !border-background"
        />
      ))}

      {shape === 'frame' && node.kind === 'frame' ? (
        <div className="flex h-full flex-col gap-1.5 overflow-hidden p-2">
          <div className="flex shrink-0 items-center gap-1.5">
            <Icon aria-hidden className="h-3 w-3 shrink-0" style={{ color: CATEGORY_VAR[meta.category] }} />
            <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {node.label}
            </span>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-x-3 gap-y-1 overflow-hidden text-[10px] leading-tight text-muted-foreground">
            <div className="flex flex-col gap-1 overflow-hidden">
              <FrameSlotLine label="Contract" value={node.config.contract} />
              <FrameSlotLine label="Context" value={node.config.context} />
              <FrameSlotLine label="State" value={node.config.state} />
            </div>
            <div className="flex flex-col gap-1 overflow-hidden">
              <FrameSlotLine label="Tools" value={node.config.tools} />
              <FrameSlotLine label="Permissions" value={node.config.permissions} />
              <FrameSlotLine label="Evidence" value={node.config.evidence} />
            </div>
          </div>
        </div>
      ) : shape === 'pill' ? (
        <div className="flex items-center gap-1.5 px-3 py-1.5">
          <span
            aria-hidden
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
            style={{ background: `color-mix(in srgb, ${CATEGORY_VAR[meta.category]} 32%, transparent)` }}
          >
            <Icon aria-hidden className="h-2.5 w-2.5" style={{ color: CATEGORY_VAR[meta.category] }} />
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {node.label}
            <span className="ml-1 font-normal text-muted-foreground">· {nodeSummary(node)}</span>
          </span>
          {StatusIcon ? (
            <StatusIcon
              aria-hidden
              className={`h-3 w-3 shrink-0 ${isRunning ? 'animate-spin' : ''}`}
              style={{ color: activityStatusVar(STATUS_TO_ACTIVITY[status!]) }}
            />
          ) : null}
        </div>
      ) : (
        <>
          <div
            className="flex items-center gap-1.5 px-2 py-1"
            style={{ background: `color-mix(in srgb, ${CATEGORY_VAR[meta.category]} 16%, transparent)` }}
          >
            {shape === 'diamond-header' ? (
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rotate-45"
                style={{ background: CATEGORY_VAR[meta.category] }}
              />
            ) : null}
            {shape === 'shield' ? (
              <LuShieldCheck aria-hidden className="h-2.5 w-2.5 shrink-0" style={{ color: CATEGORY_VAR[meta.category] }} />
            ) : null}
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
            {shape === 'check-badge' && (settledPort === 'pass' || settledPort === 'fail') ? (
              <span
                aria-hidden
                className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                style={{
                  color: activityStatusVar(settledPort === 'pass' ? 'done' : 'failed'),
                  background: `color-mix(in srgb, ${activityStatusVar(settledPort === 'pass' ? 'done' : 'failed')} 18%, transparent)`,
                }}
              >
                {settledPort}
              </span>
            ) : null}
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
        </>
      )}

      {error ? (
        <div className="flex items-start gap-1 border-t border-destructive/30 bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
          <LuTriangleAlert aria-hidden className="mt-0.5 h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      ) : null}

      {outPorts.map((port, i) => (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={Position.Right}
          title={`${port.label} (${port.type})`}
          style={{
            top: portTopPercent(i, outPorts.length),
            backgroundColor: PORT_TYPE_COLOR_VAR[port.type],
            opacity: isPortDimmed(port, node, connection, graphContext) ? 0.35 : 1,
          }}
          className="!h-2.5 !w-2.5 !border-background"
        />
      ))}
    </div>
  );
}

export const WORKFLOW_NODE_TYPES = { workflowNode: WorkflowNodeView };
