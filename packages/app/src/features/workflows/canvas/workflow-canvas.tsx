import { wouldCycle, type WorkflowEdge, type WorkflowNode, type WorkflowNodeStatus } from '@midnite/studio-shared';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { LuLayoutGrid, LuPlay, LuRedo2, LuUndo2 } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import { createNode } from '../workflow-io';
import { WORKFLOW_NODE_DND_MIME } from './node-palette';
import { WORKFLOW_NODE_TYPES, type WorkflowNodeData } from './workflow-node-view';
import { autoLayout, fromFlowPosition, toFlowGraph, WORKFLOW_NODE_HEIGHT, WORKFLOW_NODE_WIDTH } from './workflow-layout';

export type WorkflowGraph = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };

/** Ring-buffer cap for canvas-local, in-session undo/redo. Not persisted. */
const WORKFLOW_UNDO_LIMIT = 50;
const GRID_STEP = 16;

function snapToGrid(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * The workflow canvas (Phase 43 Theme E; ported onto `@xyflow/react` +
 * `@dagrejs/dagre` in Phase 95 Theme I, reversing Phase 43's own
 * no-graph-library decision per the phase doc's recorded rationale — parity
 * with midnite's editor at a fraction of the hand-rolled SVG canvas's
 * maintenance cost).
 *
 * **Fully controlled**, the same contract the SVG canvas kept: `graph` is
 * the single source of truth, and every structural edit — drag-end, add,
 * delete, connect — calls `onChange` with the next value. Internally this
 * wraps `@xyflow/react`'s own `nodes`/`edges` state (which the library
 * requires as local state for interaction to feel immediate) and re-derives
 * it from `graph` whenever the prop changes, so a label edited in the side
 * panel or a run's live status still round-trips onto the node card. Only a
 * *committed* change — a drag that has ended, not each frame of it — calls
 * `onChange`, exactly like the SVG canvas's own pointer-up commit.
 */
export function WorkflowCanvas(props: {
  graph: WorkflowGraph;
  /** Changing this clears undo/redo history and re-fits the viewport — used when switching to a different workflow. */
  resetKey: string;
  onSelectionChange?: (selected: ReadonlySet<string>) => void;
  onChange: (next: WorkflowGraph) => void;
  /** Node ids `validateWorkflow` (Theme F) flagged — drawn with a destructive ring. */
  invalidNodeIds?: ReadonlySet<string>;
  /** Absent hides the Run control entirely — Theme F wires it, the canvas doesn't invent it on its own. */
  onRun?: () => void;
  /** Set (to the first issue's message) to disable Run and explain why via `title`. */
  runDisabledReason?: string;
  isRunning?: boolean;
  /** Run view mode (Theme G): pan/zoom and click-to-select stay live; drag, edge creation, marquee, delete and undo/redo are inert. */
  readOnly?: boolean;
  /** A run's per-node status, keyed by node id (Theme I: now live during editing too, not only in the read-only run view). */
  nodeStatuses?: ReadonlyMap<string, WorkflowNodeStatus>;
  /** A run's per-node error, keyed by node id — shown inline on the node card. */
  nodeErrors?: ReadonlyMap<string, string>;
  /** Extra toolbar content (Theme G's History control, e.g.) — the canvas owns the bar, not what a caller puts in it. */
  toolbarExtra?: React.ReactNode;
}) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function WorkflowCanvasInner({
  graph,
  resetKey,
  onSelectionChange,
  onChange,
  invalidNodeIds,
  onRun,
  runDisabledReason,
  isRunning,
  readOnly,
  nodeStatuses,
  nodeErrors,
  toolbarExtra,
}: Parameters<typeof WorkflowCanvas>[0]) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const [nodes, setNodes] = useState<Node[]>(() => decorate(toFlowGraph(graph.nodes, graph.edges).nodes, invalidNodeIds, nodeStatuses, nodeErrors));
  const [edges, setEdges] = useState<Edge[]>(() => toFlowGraph(graph.nodes, graph.edges).edges);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());

  const undoStack = useRef<WorkflowGraph[]>([]);
  const redoStack = useRef<WorkflowGraph[]>([]);
  const graphRef = useRef(graph);
  graphRef.current = graph;

  // Structural resync — a new `graph` (from an undo, a side-panel edit, an
  // external save, or our own `onChange` round-tripping back down) always
  // wins over local RF state; only mid-drag position deltas are RF-local and
  // those have already been committed by the time a new `graph` prop lands.
  useEffect(() => {
    const flow = toFlowGraph(graph.nodes, graph.edges);
    setNodes((prev) => decorate(flow.nodes, invalidNodeIds, nodeStatuses, nodeErrors, prev));
    setEdges(flow.edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- decorate below re-applies on its own effect
  }, [graph]);

  // Overlay-only resync — run status/validity/error changes shouldn't rebuild positions.
  useEffect(() => {
    setNodes((prev) => decorate(prev, invalidNodeIds, nodeStatuses, nodeErrors));
  }, [invalidNodeIds, nodeStatuses, nodeErrors]);

  useEffect(() => {
    undoStack.current = [];
    redoStack.current = [];
    requestAnimationFrame(() => fitView({ padding: 0.2, duration: 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const commit = useCallback(
    (next: WorkflowGraph) => {
      undoStack.current = [...undoStack.current, graphRef.current].slice(-WORKFLOW_UNDO_LIMIT);
      redoStack.current = [];
      onChange(next);
    },
    [onChange],
  );

  const undo = useCallback(() => {
    const previous = undoStack.current.at(-1);
    if (!previous) return;
    undoStack.current = undoStack.current.slice(0, -1);
    redoStack.current = [...redoStack.current, graphRef.current].slice(-WORKFLOW_UNDO_LIMIT);
    onChange(previous);
  }, [onChange]);

  const redo = useCallback(() => {
    const next = redoStack.current.at(-1);
    if (!next) return;
    redoStack.current = redoStack.current.slice(0, -1);
    undoStack.current = [...undoStack.current, graphRef.current].slice(-WORKFLOW_UNDO_LIMIT);
    onChange(next);
  }, [onChange]);

  const emitSelection = useCallback(
    (next: Node[]) => {
      const ids = new Set(next.filter((n) => n.selected).map((n) => n.id));
      setSelection(ids);
      onSelectionChange?.(ids);
    },
    [onSelectionChange],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((prev) => {
        const next = applyNodeChanges(changes, prev);
        if (changes.some((c) => c.type === 'select')) emitSelection(next);
        return next;
      });

      const drag = changes.find((c): c is Extract<NodeChange, { type: 'position' }> => c.type === 'position');
      if (!readOnly && drag && drag.dragging === false && drag.position) {
        const snapped = { x: snapToGrid(drag.position.x, GRID_STEP), y: snapToGrid(drag.position.y, GRID_STEP) };
        const nextNodes = graphRef.current.nodes.map((node) =>
          node.id === drag.id ? { ...node, ...fromFlowPosition(snapped) } : node,
        );
        commit({ nodes: nextNodes, edges: graphRef.current.edges });
      }

      if (!readOnly && changes.some((c) => c.type === 'remove')) {
        const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
        commit({
          nodes: graphRef.current.nodes.filter((n) => !removed.has(n.id)),
          edges: graphRef.current.edges.filter((e) => !removed.has(e.from) && !removed.has(e.to)),
        });
      }
    },
    [commit, emitSelection, readOnly],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((prev) => applyEdgeChanges(changes, prev));
      if (!readOnly && changes.some((c) => c.type === 'remove')) {
        const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
        commit({ nodes: graphRef.current.nodes, edges: graphRef.current.edges.filter((e) => !removed.has(e.id)) });
      }
    },
    [commit, readOnly],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target || source === target) return;
      const targetNode = graphRef.current.nodes.find((n) => n.id === target);
      if (targetNode?.kind === 'note') return;
      const nodeIds = graphRef.current.nodes.map((n) => n.id);
      if (graphRef.current.edges.some((e) => e.from === source && e.to === target)) return;
      if (wouldCycle(graphRef.current.edges, nodeIds, { from: source, to: target })) return;
      commit({
        nodes: graphRef.current.nodes,
        edges: [...graphRef.current.edges, { id: crypto.randomUUID(), from: source, to: target }],
      });
    },
    [commit],
  );

  const addNodeAt = useCallback(
    (kind: WorkflowNode['kind'], clientX: number, clientY: number) => {
      const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
      const node = createNode(
        kind,
        snapToGrid(flowPos.x - WORKFLOW_NODE_WIDTH / 2, GRID_STEP),
        snapToGrid(flowPos.y - WORKFLOW_NODE_HEIGHT / 2, GRID_STEP),
      );
      commit({ nodes: [...graphRef.current.nodes, node], edges: graphRef.current.edges });
      emitSelection(toFlowGraph([node], []).nodes.map((n) => ({ ...n, selected: true })));
    },
    [commit, emitSelection, screenToFlowPosition],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (readOnly) return;
      const kind = event.dataTransfer.getData(WORKFLOW_NODE_DND_MIME) as WorkflowNode['kind'] | '';
      if (!kind) return;
      addNodeAt(kind, event.clientX, event.clientY);
    },
    [addNodeAt, readOnly],
  );

  const handleAutoLayout = useCallback(() => {
    const positions = autoLayout(graphRef.current.nodes, graphRef.current.edges);
    commit({
      nodes: graphRef.current.nodes.map((node) => ({ ...node, ...(positions.get(node.id) ?? { x: node.x, y: node.y }) })),
      edges: graphRef.current.edges,
    });
    requestAnimationFrame(() => fitView({ padding: 0.2, duration: 200 }));
  }, [commit, fitView]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (event.key === 'Escape') {
        event.stopPropagation();
        setNodes((prev) => prev.map((n) => ({ ...n, selected: false })));
        emitSelection([]);
        return;
      }
      if (readOnly) return;
      if (mod && key === 'z' && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (mod && key === 'z') {
        event.preventDefault();
        undo();
      } else if (mod && key === 'a') {
        event.preventDefault();
        setNodes((prev) => {
          const next = prev.map((n) => ({ ...n, selected: true }));
          emitSelection(next);
          return next;
        });
      }
    },
    [emitSelection, readOnly, redo, undo],
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="hide-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
        {readOnly ? (
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Viewing run</span>
        ) : (
          <>
            <IconButton icon={LuUndo2} label="Undo" size="sm" onClick={undo} disabled={undoStack.current.length === 0} />
            <IconButton icon={LuRedo2} label="Redo" size="sm" onClick={redo} disabled={redoStack.current.length === 0} />
            <IconButton
              icon={LuLayoutGrid}
              label="Auto layout"
              size="sm"
              onClick={handleAutoLayout}
              disabled={graph.nodes.length === 0}
            />
          </>
        )}
        {toolbarExtra}
        {selection.size > 0 ? <span className="ml-auto text-[11px] text-muted-foreground">{selection.size} selected</span> : null}
        {onRun ? (
          <button
            type="button"
            disabled={Boolean(runDisabledReason) || isRunning}
            title={runDisabledReason}
            onClick={onRun}
            className={`flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground transition-opacity disabled:opacity-40 ${selection.size > 0 ? '' : 'ml-auto'}`}
          >
            <LuPlay aria-hidden className="h-3 w-3" />
            {isRunning ? 'Running…' : 'Run'}
          </button>
        ) : null}
      </div>

      <div
        role="application"
        aria-label="Workflow canvas"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onDrop={handleDrop}
        onDragOver={(event) => {
          if (!readOnly) event.preventDefault();
        }}
        className="relative min-h-0 flex-1 outline-none"
      >
        {graph.nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Drag a node from the palette to get started.</p>
          </div>
        ) : null}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={WORKFLOW_NODE_TYPES}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={readOnly ? undefined : handleConnect}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable
          deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
          selectionKeyCode={null}
          multiSelectionKeyCode={['Shift']}
          panOnDrag={readOnly ? true : [1, 2]}
          selectionOnDrag={!readOnly}
          panOnScroll
          zoomActivationKeyCode={['Meta', 'Control']}
          minZoom={0.25}
          maxZoom={2}
          snapToGrid
          snapGrid={[GRID_STEP, GRID_STEP]}
          proOptions={{ hideAttribution: true }}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="!bg-background" />
          <Controls showInteractive={false} className="!bg-card !text-foreground [&_button]:!border-border [&_button]:!bg-card [&_button:hover]:!bg-accent" />
          <MiniMap
            pannable
            zoomable
            className="!bg-card"
            maskColor="rgba(0,0,0,0.15)"
            nodeColor="var(--border)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}

/** Merges run-derived overlay data (`status`/`invalid`/`error`) into a node list without touching positions. */
function decorate(
  nodes: Node[],
  invalidNodeIds: ReadonlySet<string> | undefined,
  nodeStatuses: ReadonlyMap<string, WorkflowNodeStatus> | undefined,
  nodeErrors: ReadonlyMap<string, string> | undefined,
  previous?: Node[],
): Node[] {
  const previousById = new Map((previous ?? []).map((n) => [n.id, n]));
  return nodes.map((node) => {
    const prior = previousById.get(node.id);
    const data = (node.data ?? prior?.data) as WorkflowNodeData;
    return {
      ...node,
      selected: prior?.selected ?? node.selected,
      data: {
        ...data,
        invalid: invalidNodeIds?.has(node.id) ?? false,
        status: nodeStatuses?.get(node.id),
        error: nodeErrors?.get(node.id),
      },
    };
  });
}
