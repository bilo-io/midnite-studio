import { useMemo } from 'react';

import type { AiPlanBlueprint, ForgeGraph, ForgeGraphNode } from '@midnite/studio-shared';

import { layoutForgeGraph, FORGE_GRAPH_GEOMETRY } from '../graph/graph-layout';

/**
 * The mini dependency preview (Phase 95 Theme F) — the review sheet's own
 * small rendering of a blueprint that does not exist on any forge yet, reusing
 * the project graph's own layout (`layoutForgeGraph`) rather than a second
 * ranking algorithm. `layoutForgeGraph` only cares about a `ForgeGraph`'s
 * shape, not where it came from, so each blueprint task becomes a synthetic
 * `'draft'` node keyed by its own local `key` (the same field `nodeKey()`
 * already reads for a real draft item) and each `blockedBy` edge becomes a
 * `'blocks'` edge — no board read, no IPC, purely derived from the sheet's
 * current (possibly edited) draft.
 *
 * Deliberately its own small SVG rather than `ProjectGraphNode` — that
 * component takes a live `item`/`fields`/`glow`/`onSelect` a not-yet-created
 * task has none of, and reusing it here would mean threading a pile of inert
 * props through a component built for a real, selectable board row.
 */
export function planBlueprintToForgeGraph(blueprint: AiPlanBlueprint): ForgeGraph {
  const blockerCountOf = new Map<string, number>();
  for (const task of blueprint.tasks) blockerCountOf.set(task.key, 0);
  for (const edge of blueprint.edges) {
    blockerCountOf.set(edge.from, (blockerCountOf.get(edge.from) ?? 0) + 1);
  }

  const nodes: ForgeGraphNode[] = blueprint.tasks.map((task) => {
    const unmetBlockerCount = blockerCountOf.get(task.key) ?? 0;
    return {
      itemId: task.key,
      number: null,
      repo: '',
      title: task.title,
      kind: 'draft',
      state: null,
      blocked: unmetBlockerCount > 0,
      ready: unmetBlockerCount === 0,
      unmetBlockerCount,
      foreign: false,
      truncated: false,
    };
  });

  return {
    nodes,
    edges: blueprint.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      kind: 'blocks',
      source: 'field',
    })),
    truncated: false,
    totalCount: nodes.length,
    kind: 'ok',
  };
}

const PREVIEW_GEOMETRY = { ...FORGE_GRAPH_GEOMETRY, width: 140, height: 44, rankGap: 48, nodeGap: 12 };

export function PlanGraphPreview({ blueprint }: { blueprint: AiPlanBlueprint }) {
  const layout = useMemo(
    () => layoutForgeGraph(planBlueprintToForgeGraph(blueprint), PREVIEW_GEOMETRY),
    [blueprint],
  );

  if (layout.nodes.length === 0) {
    return <p className="text-xs italic text-muted-foreground">No tasks yet.</p>;
  }

  const padding = 8;
  const width = layout.bounds.width + padding * 2;
  const height = layout.bounds.height + padding * 2;
  const positionOf = new Map(layout.nodes.map((node) => [node.key, node]));

  return (
    <svg
      role="img"
      aria-label="Task dependency preview"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ maxHeight: 220 }}
      className="rounded-md border border-border bg-muted/20"
    >
      <g transform={`translate(${padding}, ${padding})`}>
        {layout.edges.map((edge) => {
          const from = positionOf.get(edge.from);
          const to = positionOf.get(edge.to);
          if (!from || !to) return null;
          const x1 = from.x;
          const y1 = from.y + PREVIEW_GEOMETRY.height / 2;
          const x2 = to.x + PREVIEW_GEOMETRY.width;
          const y2 = to.y + PREVIEW_GEOMETRY.height / 2;
          return (
            <line
              key={`${edge.from}:${edge.to}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="hsl(var(--muted-foreground) / 0.5)"
              strokeWidth={1.5}
              markerEnd="url(#plan-preview-arrow)"
            />
          );
        })}
        {layout.nodes.map((node) => (
          <g key={node.key} transform={`translate(${node.x}, ${node.y})`}>
            <rect
              width={PREVIEW_GEOMETRY.width}
              height={PREVIEW_GEOMETRY.height}
              rx={6}
              fill={node.blocked ? 'hsl(var(--muted))' : 'hsl(var(--card))'}
              stroke="hsl(var(--border))"
            />
            <foreignObject width={PREVIEW_GEOMETRY.width} height={PREVIEW_GEOMETRY.height}>
              <div className="flex h-full items-center px-2 text-[10px] leading-tight text-foreground">
                <span className="line-clamp-2">{node.title}</span>
              </div>
            </foreignObject>
          </g>
        ))}
      </g>
      <defs>
        <marker
          id="plan-preview-arrow"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="hsl(var(--muted-foreground) / 0.5)" />
        </marker>
      </defs>
    </svg>
  );
}
