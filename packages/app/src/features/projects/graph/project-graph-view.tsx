import type { ForgeGraph, ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { LuChevronDown, LuChevronUp, LuGitFork } from 'react-icons/lu';

import { EmptyState } from '../../../components/empty-state';
import { useWindowFocusGate } from '../../../lib/use-window-focus-gate';
import type { Viewport } from '../../workflows/canvas/workflow-geometry';
import {
  edgePath,
  panBy,
  rectsIntersect,
  viewportRect,
  zoomAtPointer,
  type Rect,
} from '../../workflows/canvas/workflow-path';
import type { CardGlowState } from '../board/glow-state';
import { edgeAppearance } from './edge-appearance';
import { moveAlongEdge, moveWithinRank } from './graph-keyboard';
import { FORGE_GRAPH_GEOMETRY, layoutForgeGraph, topAlignedViewport, type PositionedNode } from './graph-layout';
import { ProjectGraphNode } from './project-graph-node';

/** How far outside the viewport a node's bounds may sit and still mount —
 *  one node width, the same margin `workflow-canvas.tsx` uses for its own
 *  culling. */
const GRAPH_CULL_MARGIN = FORGE_GRAPH_GEOMETRY.width;

/** Clear space around the graph's own bounds when fitting it to the canvas. */
const GRAPH_FIT_PADDING = 48;

/** Below this zoom a node drops its chips/avatars — illegible at that size,
 *  and a DOM subtree per node nobody can read. */
const LOD_THRESHOLD = 0.5;

/** A node's own right/left port, at `FORGE_GRAPH_GEOMETRY`'s dimensions —
 *  `workflow-path.ts`'s `outPort`/`inPort` bake in the *workflow* canvas's
 *  own (different) node size, so those two are not reused verbatim; the
 *  arithmetic they share (`edgePath`, `panBy`, `zoomAtPointer`,
 *  `clientToGraph`, `rectsIntersect`, `viewportRect`) is. */
function outPort(node: Pick<PositionedNode, 'x' | 'y'>): { x: number; y: number } {
  return { x: node.x + FORGE_GRAPH_GEOMETRY.width, y: node.y + FORGE_GRAPH_GEOMETRY.height / 2 };
}
function inPort(node: Pick<PositionedNode, 'x' | 'y'>): { x: number; y: number } {
  return { x: node.x, y: node.y + FORGE_GRAPH_GEOMETRY.height / 2 };
}
function nodeRect(node: Pick<PositionedNode, 'x' | 'y'>): Rect {
  return { x: node.x, y: node.y, width: FORGE_GRAPH_GEOMETRY.width, height: FORGE_GRAPH_GEOMETRY.height };
}

export interface ProjectGraphViewProps {
  graph: ForgeGraph;
  items: readonly ForgeProjectItem[];
  fields: readonly ForgeProjectField[];
  projectId: string;
  /** Controlled — the item whose detail pane is open, shared with board mode
   *  once Theme G lifts `BoardView`'s own local state to match this. */
  selectedItemId: string | null;
  /** `null` clears the selection (`Escape`). */
  onSelectItem: (itemId: string | null) => void;
  /** One `useGraphAgentStates(projectId)` map for the whole canvas (Theme F)
   *  — computed by the caller, not this component, so a store subscription
   *  never lives inside a canvas this deeply testable without one. */
  agentStates: ReadonlyMap<string, CardGlowState>;
}

/**
 * The dependency graph (Phase 75 Theme D): HTML nodes, absolutely positioned
 * inside a CSS-transformed container, over an SVG layer carrying only edges —
 * the hybrid the phase doc's own grounding audit calls for, since
 * `.agent-run-glow` is a `background-clip` border trick no SVG element can
 * wear.
 *
 * Pan/zoom/pointer↔graph conversion is `workflow-path.ts`'s own
 * `clientToGraph`/`panBy`/`zoomAtPointer`/`rectsIntersect`/`viewportRect`/
 * `edgePath`, reused unchanged — none of it knows about node geometry.
 * `outPort`/`inPort` are re-declared locally above because the workflow
 * canvas's own versions bake in *its* node size, not this graph's 200×64.
 */
export function ProjectGraphView({
  graph,
  items,
  fields,
  projectId,
  selectedItemId,
  onSelectItem,
  agentStates,
}: ProjectGraphViewProps) {
  // Same gate `BoardView` calls for its own card ring: a blurred window pays
  // for no edge animation either (Theme E's own rule; `.dep-edge-animated`'s
  // focus-gate selector in `styles.css` is what actually pauses it).
  useWindowFocusGate(true);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item] as const)), [items]);
  const layout = useMemo(() => layoutForgeGraph(graph), [graph]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [pan, setPan] = useState<{ lastClientX: number; lastClientY: number } | null>(null);
  const fittedRef = useRef(false);

  const refit = useCallback((currentLayout = layout, currentSize = size) => {
    setViewport(topAlignedViewport(currentLayout.bounds, currentSize.width || 1, 1, GRAPH_FIT_PADDING));
  }, [layout, size]);

  // Measure + fit exactly once, on mount — matching `workflow-canvas.tsx`'s
  // own "reset on mount, not on every data change" rule (Theme D's own
  // decision: the viewport is component-local and never persisted).
  // `layout`/`refit` are read from the closure captured at mount time.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const measure = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      setSize({ width, height });
      if (!fittedRef.current) {
        fittedRef.current = true;
        setViewport(topAlignedViewport(layout.bounds, width || 1, 1, GRAPH_FIT_PADDING));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React's `onWheel` is passive; `preventDefault` here needs a real listener
  // — the same reason `workflow-canvas.tsx` registers its own.
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

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('[data-graph-node]')) return; // the node handles its own click
    if (event.button !== 0 && event.button !== 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPan({ lastClientX: event.clientX, lastClientY: event.clientY });
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pan) return;
    const dx = event.clientX - pan.lastClientX;
    const dy = event.clientY - pan.lastClientY;
    setViewport((v) => panBy(v, -dx, -dy));
    setPan({ lastClientX: event.clientX, lastClientY: event.clientY });
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pan) event.currentTarget.releasePointerCapture(event.pointerId);
    setPan(null);
  };

  const moveFocusTo = (key: string): void => {
    setFocusedKey(key);
    containerRef.current?.querySelector<HTMLElement>(`[data-node-key="${CSS.escape(key)}"]`)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onSelectItem(null);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      refit();
      return;
    }
    if (!focusedKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const next = moveAlongEdge(layout.nodes, layout.edges, focusedKey, event.key === 'ArrowLeft' ? 'left' : 'right');
      if (next) moveFocusTo(next);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const next = moveWithinRank(layout.nodes, focusedKey, event.key === 'ArrowDown' ? 1 : -1);
      if (next) moveFocusTo(next);
    }
  };

  const visibleRect = viewportRect(viewport, size.width || 1, size.height || 1, GRAPH_CULL_MARGIN);
  const visibleNodes = layout.nodes.filter((node) => rectsIntersect(nodeRect(node), visibleRect));
  const nodesByKey = useMemo(() => new Map(layout.nodes.map((node) => [node.key, node] as const)), [layout.nodes]);
  const visibleEdges = layout.edges.filter((edge) => {
    const from = nodesByKey.get(edge.from);
    const to = nodesByKey.get(edge.to);
    if (!from || !to) return false;
    const box: Rect = {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      width: Math.abs(to.x - from.x) + FORGE_GRAPH_GEOMETRY.width,
      height: Math.abs(to.y - from.y) + FORGE_GRAPH_GEOMETRY.height,
    };
    return rectsIntersect(box, visibleRect);
  });

  const detailed = viewport.scale >= LOD_THRESHOLD;

  // The roving tab stop: the focused node if it's still around, else the
  // first node in board order — a canvas with nodes always has one Tab stop.
  const rovingKey = (focusedKey && nodesByKey.has(focusedKey) ? focusedKey : layout.nodes[0]?.key) ?? null;

  const allNonIssue = items.length > 0 && items.every((item) => item.content.type !== 'issue');
  const zeroEdges = !allNonIssue && graph.edges.length === 0;
  const hasBlockedByField = fields.some((f) => f.name.trim().toLowerCase() === 'blocked by');

  if (allNonIssue) {
    return (
      <EmptyState
        icon={LuGitFork}
        title="No dependencies to show"
        body="Dependencies live on issues. This board has none."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" data-testid="project-graph-view">
      {graph.truncated ? (
        <div className="shrink-0 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
          Showing the first {graph.nodes.length} of {graph.totalCount} items.
        </div>
      ) : null}

      {zeroEdges ? (
        <div className="shrink-0 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
          {`No dependencies found. Checked GitHub's blocked-by field, a project field named "Blocked by"${
            hasBlockedByField ? '' : ' (not on this board)'
          }, and issue descriptions.`}
        </div>
      ) : null}

      <GraphLegend projectId={projectId} />

      <div
        ref={containerRef}
        tabIndex={0}
        role="application"
        aria-label="Dependency graph"
        onKeyDown={onKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative min-h-0 flex-1 overflow-hidden bg-background outline-none"
        style={{ cursor: pan ? 'grabbing' : 'default' }}
      >
        <div
          className="absolute left-0 top-0"
          style={{ transform: `scale(${viewport.scale}) translate(${-viewport.x}px, ${-viewport.y}px)`, transformOrigin: '0 0' }}
        >
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
            {visibleEdges.map((edge) => {
              const from = nodesByKey.get(edge.from)!; // the dependent, for a 'blocks' edge
              const to = nodesByKey.get(edge.to)!; // the blocker, for a 'blocks' edge
              const start = outPort(from);
              const end = inPort(to);
              // `edgeAppearance`'s own `source`/`target` naming is the
              // blocker/dependent pair, the reverse of this edge's own
              // `to`/`from` — see that module's doc comment.
              const sourceGlow = to.itemId ? agentStates.get(to.itemId) ?? 'idle' : 'idle';
              const appearance = edgeAppearance(edge, to, from, sourceGlow);
              return (
                <path
                  key={`${edge.kind}|${edge.from}|${edge.to}`}
                  data-edge-kind={edge.kind}
                  data-edge-source={edge.source}
                  d={edgePath(start.x, start.y, end.x, end.y)}
                  className={appearance.className}
                  strokeWidth={appearance.strokeWidth}
                />
              );
            })}
          </svg>

          {visibleNodes.map((node) => (
            <ProjectGraphNode
              key={node.key}
              node={node}
              item={itemById.get(node.itemId)}
              fields={fields}
              glow={node.itemId ? agentStates.get(node.itemId) ?? 'idle' : 'idle'}
              selected={node.itemId !== '' && node.itemId === selectedItemId}
              tabIndex={node.key === rovingKey ? 0 : -1}
              detailed={detailed}
              onSelect={() => {
                setFocusedKey(node.key);
                if (node.itemId) onSelectItem(node.itemId);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Collapsible legend (Theme D's own checklist item): expanded on first
 *  open, then remembered per project — a board someone reads daily should
 *  not re-teach the vocabulary every time, but a first-time board should
 *  explain it rather than hide it behind a click. */
function GraphLegend({ projectId }: { projectId: string }) {
  const [expanded, setExpanded] = useState(() => readLegendExpanded(projectId));

  useEffect(() => {
    setExpanded(readLegendExpanded(projectId));
  }, [projectId]);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    writeLegendExpanded(projectId, next);
  };

  return (
    <div className="shrink-0 border-b border-border">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent"
      >
        {expanded ? <LuChevronUp aria-hidden className="h-3 w-3" /> : <LuChevronDown aria-hidden className="h-3 w-3" />}
        Legend
      </button>
      {expanded ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 pb-2 text-[11px] text-muted-foreground">
          <LegendRow swatch="border-solid" style={{ borderColor: 'hsl(var(--dep-done))' }} label="Done — this blocker is closed" />
          <LegendRow swatch="border-dashed" style={{ borderColor: 'hsl(var(--dep-active))' }} label="Active — an agent is working the blocker" />
          <LegendRow swatch="border-dashed" style={{ borderColor: 'hsl(var(--dep-idle))' }} label="Idle — not yet started" />
          <LegendRow swatch="border-dashed border-muted-foreground/60" label="Foreign — referenced, not on this board" />
          <LegendRow swatch="border-dashed border-border opacity-40" label="Contains — a parent's sub-issue, not a blocker" />
          <LegendRow
            swatch="border-dotted border-border opacity-70"
            label="Inferred from the issue description — may be incomplete"
          />
        </div>
      ) : null}
    </div>
  );
}

function LegendRow({
  swatch,
  style,
  label,
}: {
  swatch: string;
  /** A dep-state swatch borrows its border colour from the same CSS custom
   *  property the edge itself uses (`edge-appearance.ts`'s classes), rather
   *  than a hard-coded Tailwind colour that would drift from it. */
  style?: React.CSSProperties;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-4 rounded-sm border ${swatch}`} style={style} aria-hidden />
      {label}
    </span>
  );
}

const LEGEND_KEY_PREFIX = 'midnite-studio.project-graph-legend.';

function readLegendExpanded(projectId: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return true;
    const raw = localStorage.getItem(`${LEGEND_KEY_PREFIX}${projectId}`);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

function writeLegendExpanded(projectId: string, expanded: boolean): void {
  try {
    localStorage.setItem(`${LEGEND_KEY_PREFIX}${projectId}`, expanded ? '1' : '0');
  } catch {
    // Best-effort — a private window or a storage quota failure loses only
    // the remembered legend state, nothing the graph itself needs.
  }
}
