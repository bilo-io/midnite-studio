import {
  wouldCycle,
  WORKFLOW_NODE_KINDS,
  type WorkflowEdge,
  type WorkflowNode,
  type WorkflowNodeKind,
} from '@midnite/studio-shared';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { LuRedo2, LuUndo2 } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import { createNode } from '../workflow-io';
import { NODE_KIND_META } from './node-kind-meta';
import {
  WORKFLOW_CULL_MARGIN,
  WORKFLOW_DEFAULT_VIEWPORT,
  WORKFLOW_GRID_STEP,
  WORKFLOW_NODE_GEOMETRY,
  WORKFLOW_UNDO_LIMIT,
  type Viewport,
} from './workflow-geometry';
import {
  clientToGraph,
  dragDeltaToGraph,
  edgePath,
  inPort,
  nodeBounds,
  outPort,
  panBy,
  rectsIntersect,
  snapToGrid,
  viewportRect,
  zoomAtPointer,
  type Rect,
} from './workflow-path';

export type WorkflowGraph = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };

const ARROW_MARKER_ID = 'mstudio-workflow-arrow';

/**
 * The workflow canvas (Phase 43 Theme E) — a hand-rolled SVG, per the phase's
 * own guardrail (no graph library; the same call Phase 5 and Phase 18 made).
 *
 * **Fully controlled.** `graph` is the single source of truth and every
 * structural edit — drag-end, add, delete, connect — calls `onChange` with
 * the next value; there is no local shadow copy to drift out of sync with
 * it. Undo/redo is a ring buffer of the graphs `onChange` has been called
 * with, kept in refs (not state — nothing here needs to *re-render* off the
 * stacks themselves, only off `graph`, which a commit already changes).
 *
 * Pan/zoom, selection and any in-flight drag are canvas-local view state,
 * not part of the workflow's own data and not undo-able.
 */
export function WorkflowCanvas({
  graph,
  resetKey,
  onSelectionChange,
  onChange,
}: {
  graph: WorkflowGraph;
  /** Changing this clears undo/redo history and re-centres the viewport — used when switching to a different workflow. */
  resetKey: string;
  onSelectionChange?: (selected: ReadonlySet<string>) => void;
  onChange: (next: WorkflowGraph) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<Viewport>(WORKFLOW_DEFAULT_VIEWPORT);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [interaction, setInteraction] = useState<Interaction | null>(null);

  const undoStack = useRef<WorkflowGraph[]>([]);
  const redoStack = useRef<WorkflowGraph[]>([]);
  const spaceHeldRef = useRef(false);
  const hoveringRef = useRef(false);

  useEffect(() => {
    undoStack.current = [];
    redoStack.current = [];
    setViewport(WORKFLOW_DEFAULT_VIEWPORT);
    setSelection(new Set());
  }, [resetKey]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // React's `onWheel` is passive; `preventDefault` here needs a real listener.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      if (event.ctrlKey || event.metaKey) {
        setViewport((v) => zoomAtPointer(v, localX, localY, v.scale * Math.exp(-event.deltaY * 0.01)));
      } else {
        setViewport((v) => panBy(v, event.deltaX, event.deltaY));
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Space-drag pans, matching a middle-drag. Gated on hover so it never
  // steals the spacebar from a text field elsewhere in the app, and skipped
  // outright while something is actually being typed into.
  useEffect(() => {
    const isTyping = () => {
      const active = document.activeElement;
      return active instanceof HTMLElement && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !hoveringRef.current || isTyping()) return;
      event.preventDefault();
      spaceHeldRef.current = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') spaceHeldRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const setSelectionAnd = useCallback(
    (next: ReadonlySet<string>) => {
      setSelection(next);
      onSelectionChange?.(next);
    },
    [onSelectionChange],
  );

  const commit = useCallback(
    (next: WorkflowGraph) => {
      undoStack.current = [...undoStack.current, graph].slice(-WORKFLOW_UNDO_LIMIT);
      redoStack.current = [];
      onChange(next);
    },
    [graph, onChange],
  );

  const undo = useCallback(() => {
    const previous = undoStack.current.at(-1);
    if (!previous) return;
    undoStack.current = undoStack.current.slice(0, -1);
    redoStack.current = [...redoStack.current, graph].slice(-WORKFLOW_UNDO_LIMIT);
    onChange(previous);
  }, [graph, onChange]);

  const redo = useCallback(() => {
    const next = redoStack.current.at(-1);
    if (!next) return;
    redoStack.current = redoStack.current.slice(0, -1);
    undoStack.current = [...undoStack.current, graph].slice(-WORKFLOW_UNDO_LIMIT);
    onChange(next);
  }, [graph, onChange]);

  const deleteSelection = useCallback(() => {
    if (selection.size === 0) return;
    commit({
      nodes: graph.nodes.filter((node) => !selection.has(node.id)),
      edges: graph.edges.filter((edge) => !selection.has(edge.from) && !selection.has(edge.to)),
    });
    setSelectionAnd(new Set());
  }, [commit, graph, selection, setSelectionAnd]);

  const addNode = useCallback(
    (kind: WorkflowNodeKind) => {
      const centre = clientToGraph(viewport, size.width / 2, size.height / 2);
      const node = createNode(
        kind,
        snapToGrid(centre.x - WORKFLOW_NODE_GEOMETRY.width / 2, WORKFLOW_GRID_STEP),
        snapToGrid(centre.y - WORKFLOW_NODE_GEOMETRY.height / 2, WORKFLOW_GRID_STEP),
      );
      commit({ nodes: [...graph.nodes, node], edges: graph.edges });
      setSelectionAnd(new Set([node.id]));
    },
    [commit, graph, setSelectionAnd, size, viewport],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === 'z' && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (mod && key === 'z') {
        event.preventDefault();
        undo();
      } else if (mod && key === 'a') {
        event.preventDefault();
        setSelectionAnd(new Set(graph.nodes.map((node) => node.id)));
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelection();
      } else if (event.key === 'Escape') {
        setSelectionAnd(new Set());
      }
    },
    [deleteSelection, graph, redo, setSelectionAnd, undo],
  );

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  const positionFor = (node: WorkflowNode): { x: number; y: number } => {
    if (interaction?.type === 'node-drag' && interaction.ids.includes(node.id)) {
      return { x: node.x + interaction.dx, y: node.y + interaction.dy };
    }
    return { x: node.x, y: node.y };
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    if (event.button === 1 || spaceHeldRef.current) {
      event.preventDefault();
      svg.setPointerCapture(event.pointerId);
      setInteraction({ type: 'pan', lastClientX: event.clientX, lastClientY: event.clientY });
      return;
    }
    if (event.button !== 0) return;

    const target = event.target as Element;
    const portEl = target.closest('[data-port]');
    if (portEl) {
      const nodeId = portEl.closest('[data-node-id]')?.getAttribute('data-node-id');
      if (portEl.getAttribute('data-port') === 'out' && nodeId) {
        svg.setPointerCapture(event.pointerId);
        const g = clientToGraph(viewport, localX, localY);
        setInteraction({ type: 'connect', from: nodeId, toX: g.x, toY: g.y, targetId: null });
      }
      return;
    }

    const nodeEl = target.closest('[data-node-id]');
    if (nodeEl) {
      const nodeId = nodeEl.getAttribute('data-node-id')!;
      let next: ReadonlySet<string>;
      if (event.shiftKey) {
        const copy = new Set(selection);
        if (copy.has(nodeId)) copy.delete(nodeId);
        else copy.add(nodeId);
        next = copy;
      } else if (selection.has(nodeId)) {
        next = selection; // dragging an already-selected node moves the whole selection
      } else {
        next = new Set([nodeId]);
      }
      setSelectionAnd(next);

      svg.setPointerCapture(event.pointerId);
      setInteraction({
        type: 'node-drag',
        ids: next.has(nodeId) ? Array.from(next) : [nodeId],
        startClientX: event.clientX,
        startClientY: event.clientY,
        dx: 0,
        dy: 0,
      });
      return;
    }

    // Empty background: marquee-select.
    svg.setPointerCapture(event.pointerId);
    const g = clientToGraph(viewport, localX, localY);
    if (!event.shiftKey) setSelectionAnd(new Set());
    setInteraction({ type: 'marquee', additive: event.shiftKey, startX: g.x, startY: g.y, currentX: g.x, currentY: g.y });
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!interaction) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    if (interaction.type === 'pan') {
      const dx = event.clientX - interaction.lastClientX;
      const dy = event.clientY - interaction.lastClientY;
      setViewport((v) => panBy(v, -dx, -dy));
      setInteraction({ ...interaction, lastClientX: event.clientX, lastClientY: event.clientY });
      return;
    }

    if (interaction.type === 'node-drag') {
      const { dx, dy } = dragDeltaToGraph(
        viewport,
        event.clientX - interaction.startClientX,
        event.clientY - interaction.startClientY,
      );
      setInteraction({ ...interaction, dx, dy });
      return;
    }

    if (interaction.type === 'marquee') {
      const g = clientToGraph(viewport, localX, localY);
      setInteraction({ ...interaction, currentX: g.x, currentY: g.y });
      return;
    }

    if (interaction.type === 'connect') {
      const g = clientToGraph(viewport, localX, localY);
      const target = nodeAt(graph.nodes, g.x, g.y);
      const targetId =
        target && target.id !== interaction.from && target.kind !== 'note' ? target.id : null;
      setInteraction({ ...interaction, toX: g.x, toY: g.y, targetId });
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!interaction) return;
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (interaction.type === 'node-drag') {
      const { ids, dx, dy } = interaction;
      if (dx !== 0 || dy !== 0) {
        commit({
          nodes: graph.nodes.map((node) =>
            ids.includes(node.id)
              ? { ...node, x: snapToGrid(node.x + dx, WORKFLOW_GRID_STEP), y: snapToGrid(node.y + dy, WORKFLOW_GRID_STEP) }
              : node,
          ),
          edges: graph.edges,
        });
      }
    } else if (interaction.type === 'marquee') {
      const marqueeRect: Rect = {
        x: Math.min(interaction.startX, interaction.currentX),
        y: Math.min(interaction.startY, interaction.currentY),
        width: Math.abs(interaction.currentX - interaction.startX),
        height: Math.abs(interaction.currentY - interaction.startY),
      };
      const hit = graph.nodes.filter((node) => rectsIntersect(nodeBounds(node), marqueeRect));
      const next = interaction.additive ? new Set(selection) : new Set<string>();
      for (const node of hit) next.add(node.id);
      setSelectionAnd(next);
    } else if (interaction.type === 'connect') {
      const { from, targetId } = interaction;
      const nodeIds = graph.nodes.map((node) => node.id);
      if (
        targetId &&
        !graph.edges.some((edge) => edge.from === from && edge.to === targetId) &&
        !wouldCycle(graph.edges, nodeIds, { from, to: targetId })
      ) {
        commit({ nodes: graph.nodes, edges: [...graph.edges, { id: crypto.randomUUID(), from, to: targetId }] });
      }
    }

    setInteraction(null);
  };

  const visibleRect = viewportRect(viewport, size.width || 1, size.height || 1, WORKFLOW_CULL_MARGIN);
  const visibleNodes = graph.nodes.filter((node) => rectsIntersect(nodeBounds(node), visibleRect));
  const visibleEdges = graph.edges.filter((edge) => {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (!from || !to) return false;
    const box: Rect = {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      width: Math.abs(to.x - from.x) + WORKFLOW_NODE_GEOMETRY.width,
      height: Math.abs(to.y - from.y) + WORKFLOW_NODE_GEOMETRY.height,
    };
    return rectsIntersect(box, visibleRect);
  });

  const viewBoxWidth = (size.width || 1) / viewport.scale;
  const viewBoxHeight = (size.height || 1) / viewport.scale;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
        {WORKFLOW_NODE_KINDS.map((kind) => {
          const meta = NODE_KIND_META[kind];
          return (
            <IconButton key={kind} icon={meta.icon} label={`Add ${meta.label} node`} size="sm" onClick={() => addNode(kind)} />
          );
        })}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <IconButton icon={LuUndo2} label="Undo" size="sm" onClick={undo} disabled={undoStack.current.length === 0} />
        <IconButton icon={LuRedo2} label="Redo" size="sm" onClick={redo} disabled={redoStack.current.length === 0} />
        {selection.size > 0 ? (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {selection.size} selected
          </span>
        ) : null}
      </div>

      <div
        ref={containerRef}
        tabIndex={0}
        role="application"
        aria-label="Workflow canvas"
        onKeyDown={onKeyDown}
        onPointerEnter={() => (hoveringRef.current = true)}
        onPointerLeave={() => (hoveringRef.current = false)}
        className="relative min-h-0 flex-1 overflow-hidden bg-background outline-none"
        style={{ cursor: interaction?.type === 'pan' ? 'grabbing' : spaceHeldRef.current ? 'grab' : 'default' }}
      >
        {graph.nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Add a node above to get started.</p>
          </div>
        ) : null}

        <svg
          className="h-full w-full touch-none select-none"
          viewBox={`${viewport.x} ${viewport.y} ${viewBoxWidth} ${viewBoxHeight}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <defs>
            <marker id={ARROW_MARKER_ID} viewBox="0 0 8 8" refX={7} refY={4} markerWidth={6} markerHeight={6} orient="auto-start-reverse" markerUnits="userSpaceOnUse">
              <path d="M 0 0 L 8 4 L 0 8 z" className="fill-border" />
            </marker>
          </defs>

          {visibleEdges.map((edge) => {
            const from = positionFor(nodesById.get(edge.from)!);
            const to = positionFor(nodesById.get(edge.to)!);
            const start = outPort(from);
            const end = inPort(to);
            return (
              <path
                key={edge.id}
                data-edge-id={edge.id}
                d={edgePath(start.x, start.y, end.x, end.y)}
                className="fill-none stroke-border"
                strokeWidth={1.5}
                markerEnd={`url(#${ARROW_MARKER_ID})`}
              />
            );
          })}

          {interaction?.type === 'connect'
            ? (() => {
                const start = outPort(positionFor(nodesById.get(interaction.from)!));
                return (
                  <path
                    d={edgePath(start.x, start.y, interaction.toX, interaction.toY)}
                    className={interaction.targetId ? 'fill-none stroke-primary' : 'fill-none stroke-muted-foreground'}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                );
              })()
            : null}

          {visibleNodes.map((node) => {
            const pos = positionFor(node);
            const meta = NODE_KIND_META[node.kind];
            const selected = selection.has(node.id);
            return (
              <g key={node.id} data-node-id={node.id} transform={`translate(${pos.x}, ${pos.y})`} className="cursor-move">
                <rect
                  width={WORKFLOW_NODE_GEOMETRY.width}
                  height={WORKFLOW_NODE_GEOMETRY.height}
                  rx={8}
                  className={selected ? 'fill-card stroke-primary' : 'fill-card stroke-border'}
                  strokeWidth={selected ? 2 : 1}
                />
                <text x={10} y={18} className="fill-muted-foreground text-[9px] font-medium uppercase tracking-wide">
                  {meta.label}
                </text>
                <text x={10} y={36} className="fill-foreground text-[12px]">
                  {truncateLabel(node.label)}
                </text>
                {node.kind !== 'note' ? (
                  <>
                    <circle
                      data-port="in"
                      cx={0}
                      cy={WORKFLOW_NODE_GEOMETRY.height / 2}
                      r={WORKFLOW_NODE_GEOMETRY.portRadius + 2}
                      className="fill-background stroke-border"
                    />
                    <circle
                      data-port="out"
                      cx={WORKFLOW_NODE_GEOMETRY.width}
                      cy={WORKFLOW_NODE_GEOMETRY.height / 2}
                      r={WORKFLOW_NODE_GEOMETRY.portRadius + 2}
                      className="cursor-crosshair fill-primary/80 stroke-primary"
                    />
                  </>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

type Interaction =
  | { type: 'pan'; lastClientX: number; lastClientY: number }
  | { type: 'node-drag'; ids: string[]; startClientX: number; startClientY: number; dx: number; dy: number }
  | { type: 'marquee'; additive: boolean; startX: number; startY: number; currentX: number; currentY: number }
  | { type: 'connect'; from: string; toX: number; toY: number; targetId: string | null };

/** Topmost node whose bounds contain the graph point, or none. */
function nodeAt(nodes: readonly WorkflowNode[], x: number, y: number): WorkflowNode | undefined {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i]!;
    const bounds = nodeBounds(node);
    if (x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height) {
      return node;
    }
  }
  return undefined;
}

function truncateLabel(label: string, max = 22): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}
